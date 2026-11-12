'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/env');
const { pool, withTransaction } = require('../config/db');
const { unauthorized, conflict, badRequest, notFound } = require('../utils/errors');
const { phoneKey, samePhone, TRACKING_CODE_RE } = require('../utils/helpers');
const { hashPassword } = require('./authService');
const orders = require('./orderService');

/*
 * Comptes clients. Ils vivent dans une table à part (`customers`) et leur jeton porte l'audience « customer » :
 * un jeton client n'est jamais accepté par l'administration (qui exige l'audience « staff »), et inversement.
 */
const AUDIENCE = 'customer';
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

const publicCustomer = (c) => ({ id: c.id, name: c.name, username: c.username, phone: c.phone, theme: c.theme });

function issueToken(c) {
  const csrf = crypto.randomBytes(24).toString('hex');
  const token = jwt.sign({ sub: c.id, ver: c.session_version, csrf }, config.jwtSecret, {
    algorithm: 'HS256', audience: AUDIENCE, expiresIn: `${config.customerTtlDays}d`,
  });
  return { token, csrfToken: csrf, customer: publicCustomer(c) };
}

/** Vérifie un jeton client et relit le compte (actif ? mot de passe changé depuis ?). Renvoie null si invalide. */
async function verifyToken(token) {
  let payload;
  try { payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], audience: AUDIENCE }); } catch (_) { return null; }
  const [[c]] = await pool.query('SELECT * FROM customers WHERE id = ?', [payload.sub]);
  if (!c || !c.is_active || c.session_version !== payload.ver) return null;
  return { customer: c, csrf: payload.csrf };
}

async function register(input) {
  const key = phoneKey(input.phone);
  try {
    const [res] = await pool.query(
      'INSERT INTO customers (name, username, phone, phone_key, password_hash) VALUES (?, ?, ?, ?, ?)',
      [input.name || null, input.username || null, input.phone, key, await hashPassword(input.password)]);
    const [[c]] = await pool.query('SELECT * FROM customers WHERE id = ?', [res.insertId]);
    return issueToken(c);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' && /uq_customers_phone/.test(err.message)) throw conflict('Un compte existe déjà avec ce numéro de téléphone. Connectez-vous.');
    if (err.code === 'ER_DUP_ENTRY' && /uq_customers_username/.test(err.message)) throw conflict('Ce nom d\'utilisateur est déjà pris.');
    throw err;
  }
}

/** Identifiant = téléphone (que des chiffres et + ( ) - .) ou nom d'utilisateur (contient au moins une lettre). */
async function login(identifier, password) {
  const id = identifier.trim();
  const byUsername = /[a-z]/i.test(id);
  const [[c]] = byUsername
    ? await pool.query('SELECT * FROM customers WHERE username = ?', [id.toLowerCase()])
    : await pool.query('SELECT * FROM customers WHERE phone_key = ?', [phoneKey(id)]);
  // Même temps de réponse et même message que le compte existe ou non (on ne révèle pas qui est inscrit).
  const ok = await bcrypt.compare(password, c ? c.password_hash : DUMMY_HASH);
  if (!c || !ok || !c.is_active) throw unauthorized('Identifiant ou mot de passe incorrect.');
  return issueToken(c);
}

async function updateProfile(customer, patch) {
  try {
    await pool.query('UPDATE customers SET username = ?, name = ? WHERE id = ?', [
      patch.username === undefined ? customer.username : patch.username,
      patch.name === undefined ? customer.name : patch.name, customer.id]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw conflict('Ce nom d\'utilisateur est déjà pris.');
    throw err;
  }
  const [[c]] = await pool.query('SELECT * FROM customers WHERE id = ?', [customer.id]);
  return publicCustomer(c);
}

/** Change le mot de passe et ferme toutes les autres sessions (session_version + 1). Renvoie un nouveau jeton. */
async function changePassword(customer, currentPassword, newPassword) {
  if (!(await bcrypt.compare(currentPassword, customer.password_hash))) throw badRequest('Mot de passe actuel incorrect.');
  if (currentPassword === newPassword) throw badRequest('Le nouveau mot de passe doit être différent de l\'ancien.');
  await pool.query('UPDATE customers SET password_hash = ?, session_version = session_version + 1 WHERE id = ?',
    [await hashPassword(newPassword), customer.id]);
  const [[c]] = await pool.query('SELECT * FROM customers WHERE id = ?', [customer.id]);
  return issueToken(c);
}

async function setTheme(customer, theme) {
  await pool.query('UPDATE customers SET theme = ? WHERE id = ?', [theme, customer.id]);
  return { theme };
}

/** Toutes les commandes du compte, des plus récentes aux plus anciennes. */
async function listOrders(customerId) {
  const [rows] = await pool.query(
    `SELECT o.*, (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = o.id) AS item_count
       FROM orders o WHERE o.customer_id = ? ORDER BY o.created_at DESC, o.id DESC LIMIT 200`, [customerId]);
  for (const o of rows) await orders.ensureTrackingCode(o);
  // Articles de chaque commande (nom, photo au moment de l'achat) pour illustrer « Mes commandes ».
  const byOrder = new Map();
  if (rows.length) {
    const [lines] = await pool.query(
      'SELECT order_id, product_name_snapshot AS name, image_snapshot AS image, quantity FROM order_items WHERE order_id IN (?) ORDER BY id', [rows.map((o) => o.id)]);
    for (const l of lines) {
      if (!byOrder.has(l.order_id)) byOrder.set(l.order_id, []);
      byOrder.get(l.order_id).push({ name: l.name, imageUrl: l.image || null, quantity: Number(l.quantity) });
    }
  }
  return {
    items: rows.map((o) => ({
      items: (byOrder.get(o.id) || []).slice(0, 6),
      orderNumber: o.order_number, trackingCode: o.tracking_code, status: o.status, paymentStatus: o.payment_status,
      total: Number(o.total_amount), currency: o.currency, itemCount: Number(o.item_count), createdAt: o.created_at,
    })),
  };
}

/** Détail d'une commande du compte (même format que le suivi public). */
async function getOrder(customerId, orderNumber) {
  const [[o]] = await pool.query('SELECT * FROM orders WHERE order_number = ? AND customer_id = ?', [orderNumber, customerId]);
  if (!o) throw notFound('Commande introuvable.');
  await orders.ensureTrackingCode(o);
  return orders.formatTracked(o);
}

/**
 * Rattache au compte des commandes passées en invité.
 * Conditions : connaître la commande (code complet OU numéro) ET que son téléphone soit celui du compte.
 * Le téléphone du compte n'est pas vérifié par SMS : sans la première condition, n'importe qui pourrait
 * s'inscrire avec le numéro d'un autre et voir ses commandes. Le téléphone seul ne suffit donc jamais.
 */
async function claimOrders(customer, refs) {
  const result = { claimed: [], alreadyMine: [], refused: [] };
  await withTransaction(async (conn) => {
    for (const ref of [...new Set(refs)]) {
      const column = TRACKING_CODE_RE.test(ref) ? 'tracking_code' : 'order_number';
      const [[o]] = await conn.query(`SELECT id, order_number, customer_id, customer_phone_digits FROM orders WHERE ${column} = ? FOR UPDATE`, [ref]);
      if (o && o.customer_id === customer.id) { result.alreadyMine.push(o.order_number); continue; }
      if (!o || o.customer_id !== null || !samePhone(o.customer_phone_digits, customer.phone_key)) { result.refused.push(ref); continue; }
      await conn.query('UPDATE orders SET customer_id = ? WHERE id = ? AND customer_id IS NULL', [customer.id, o.id]);
      result.claimed.push(o.order_number);
    }
  });
  return result;
}

module.exports = { register, login, verifyToken, updateProfile, changePassword, setTheme, listOrders, getOrder, claimOrders, publicCustomer, AUDIENCE };
