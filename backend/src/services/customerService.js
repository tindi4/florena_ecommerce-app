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
const mailer = require('../utils/mailer');
const logger = require('../utils/logger');

/*
 * Comptes clients. Ils vivent dans une table à part (`customers`) et leur jeton porte l'audience « customer » :
 * un jeton client n'est jamais accepté par l'administration (qui exige l'audience « staff »), et inversement.
 */
const AUDIENCE = 'customer';
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

const publicCustomer = (c) => ({ id: c.id, name: c.name, username: c.username, phone: c.phone, email: c.email || null, theme: c.theme });

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
      'INSERT INTO customers (name, username, phone, phone_key, email, password_hash) VALUES (?, ?, ?, ?, ?, ?)',
      [input.name || null, input.username || null, input.phone, key, input.email || null, await hashPassword(input.password)]);
    const [[c]] = await pool.query('SELECT * FROM customers WHERE id = ?', [res.insertId]);
    return issueToken(c);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' && /uq_customers_phone/.test(err.message)) throw conflict('Un compte existe déjà avec ce numéro de téléphone. Connectez-vous.');
    if (err.code === 'ER_DUP_ENTRY' && /uq_customers_username/.test(err.message)) throw conflict('Ce nom d\'utilisateur est déjà pris.');
    if (err.code === 'ER_DUP_ENTRY' && /uq_customers_email/.test(err.message)) throw conflict('Un compte utilise déjà cette adresse e-mail.');
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
    await pool.query('UPDATE customers SET username = ?, name = ?, email = ? WHERE id = ?', [
      patch.username === undefined ? customer.username : patch.username,
      patch.name === undefined ? customer.name : patch.name,
      patch.email === undefined ? customer.email : patch.email, customer.id]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' && /uq_customers_email/.test(err.message)) throw conflict('Un compte utilise déjà cette adresse e-mail.');
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

/* ------------------------- Mot de passe oublié ------------------------- */
const RESET_TTL_MINUTES = 60;
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const esc = (v) => String(v).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/**
 * Envoie un lien de réinitialisation à l'adresse indiquée, si un compte actif la porte.
 * La réponse est toujours la même : on ne révèle jamais si une adresse est inscrite.
 */
async function requestPasswordReset(email) {
  const [[c]] = await pool.query('SELECT id, name, email FROM customers WHERE email = ? AND is_active = 1', [email]);
  if (!c) return { ok: true };
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query('DELETE FROM customer_password_resets WHERE customer_id = ?', [c.id]);   // un seul lien valable à la fois
  await pool.query(
    'INSERT INTO customer_password_resets (customer_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
    [c.id, sha256(token), RESET_TTL_MINUTES]);
  // Le jeton est placé après « # » : il reste dans le navigateur et n'apparaît pas dans les journaux du serveur web.
  const site = config.notify.siteUrl || config.corsOrigins[0];
  const link = `${site}/reinitialiser#${token}`;
  const shop = config.shop.name;
  const hello = c.name ? `Bonjour ${c.name},` : 'Bonjour,';
  const sent = await mailer.send({
    to: c.email,
    subject: `${shop} : réinitialiser votre mot de passe`,
    text: `${hello}\n\nVous avez demandé à changer le mot de passe de votre compte ${shop}.\nOuvrez ce lien (valable ${RESET_TTL_MINUTES} minutes) pour en choisir un nouveau :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.\n\n${shop}`,
    html: `<p>${esc(hello)}</p><p>Vous avez demandé à changer le mot de passe de votre compte <strong>${esc(shop)}</strong>.</p>
<p><a href="${esc(link)}" style="display:inline-block;padding:12px 22px;background:#1f4a38;color:#ffffff;text-decoration:none;border-radius:6px">Choisir un nouveau mot de passe</a></p>
<p style="color:#6b7672;font-size:13px">Ce lien est valable ${RESET_TTL_MINUTES} minutes et ne sert qu'une fois. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.</p>`,
  });
  // En développement, sans SMTP, le lien est écrit dans la console du serveur pour pouvoir tester le parcours.
  if (!sent && !config.isProd) logger.info('Lien de réinitialisation (développement uniquement)', { link });
  return { ok: true };
}

/** Applique le nouveau mot de passe si le lien est valable, ferme les autres sessions et connecte le client. */
async function resetPassword(token, newPassword) {
  const invalid = () => badRequest('Ce lien n\'est plus valable. Demandez-en un nouveau.');
  const id = await withTransaction(async (conn) => {
    const [[r]] = await conn.query(
      'SELECT id, customer_id FROM customer_password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() FOR UPDATE', [sha256(token)]);
    if (!r) throw invalid();
    const [[c]] = await conn.query('SELECT id, is_active FROM customers WHERE id = ?', [r.customer_id]);
    if (!c || !c.is_active) throw invalid();
    await conn.query('UPDATE customers SET password_hash = ?, session_version = session_version + 1 WHERE id = ?', [await hashPassword(newPassword), c.id]);
    await conn.query('UPDATE customer_password_resets SET used_at = NOW() WHERE id = ?', [r.id]);
    return c.id;
  });
  const [[c]] = await pool.query('SELECT * FROM customers WHERE id = ?', [id]);
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

module.exports = { register, login, verifyToken, updateProfile, changePassword, setTheme, listOrders, getOrder, claimOrders, publicCustomer, AUDIENCE, requestPasswordReset, resetPassword };
