'use strict';
const crypto = require('crypto');
const config = require('../config/env');
const { pool, withTransaction } = require('../config/db');
const { notFound, conflict } = require('../utils/errors');
const { phoneKey, paginate } = require('../utils/helpers');
const { buildLink } = require('./notifyService');
const logger = require('../utils/logger');

/*
 * Mot de passe oublié, traité par la boutique (aucun e-mail), en 2 étapes :
 * - le client demande (téléphone ou nom d'utilisateur) : réponse identique que le compte existe ou non ;
 * - étape 1 : l'équipe écrit au client sur WhatsApp pour lui demander si la demande vient bien de lui ;
 * - étape 2 : quand il répond oui, l'équipe crée un lien à usage unique (30 min) et le lui envoie : il l'utilise aussitôt ;
 * - le client choisit son nouveau mot de passe (customerService.resetPassword) : lien grillé, sessions fermées.
 * Personne dans l'équipe ne voit ni ne choisit jamais le mot de passe.
 */
const LINK_TTL_MINUTES = 30;
const REPEAT_WINDOW_SECONDS = 60;       // une même demande répétée dans la minute n'est pas recomptée
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

async function log(conn, { customerId, requestId = null, userId = null, action }) {
  await conn.query('INSERT INTO customer_reset_log (customer_id, request_id, user_id, action) VALUES (?,?,?,?)',
    [customerId, requestId, userId, action]);
}

function findCustomer(identifier) {
  const id = String(identifier).trim();
  return /[a-z]/i.test(id)
    ? pool.query('SELECT id, name, phone FROM customers WHERE username = ? AND is_active = 1', [id.toLowerCase()])
    : pool.query('SELECT id, name, phone FROM customers WHERE phone_key = ? AND is_active = 1', [phoneKey(id)]);
}

/**
 * Demande du client. Toujours la même réponse : on ne révèle jamais si un compte existe.
 * Les demandes répétées d'un même compte sont regroupées sur la demande en attente.
 */
async function request(identifier) {
  const [[c]] = await findCustomer(identifier);
  if (c) {
    await withTransaction(async (conn) => {
      const [[pending]] = await conn.query(
        "SELECT id, TIMESTAMPDIFF(SECOND, last_requested_at, NOW()) AS age FROM customer_reset_requests WHERE customer_id = ? AND status = 'EN_ATTENTE' FOR UPDATE", [c.id]);
      if (pending) {
        if (pending.age < REPEAT_WINDOW_SECONDS) return;   // double clic ou impatience : rien de neuf
        await conn.query('UPDATE customer_reset_requests SET request_count = request_count + 1, last_requested_at = NOW() WHERE id = ?', [pending.id]);
        await log(conn, { customerId: c.id, requestId: pending.id, action: 'DEMANDE' });
        return;
      }
      const [res] = await conn.query("INSERT INTO customer_reset_requests (customer_id, last_requested_at) VALUES (?, NOW())", [c.id]);
      await log(conn, { customerId: c.id, requestId: res.insertId, action: 'DEMANDE' });
      await conn.query("INSERT INTO notifications (type, title, body) VALUES ('RESET_REQUEST', ?, ?)",
        ['Mot de passe oublié', `${c.name || 'Un client'} (${c.phone}) demande à réinitialiser son mot de passe.`.slice(0, 500)]);
    });
  }
  return { ok: true, message: 'Demande envoyée. La boutique va vous écrire sur WhatsApp pour vérifier que la demande vient bien de vous.' };
}

async function list(q = {}) {
  const { page, limit, offset } = paginate(q, 20, 100);
  const status = ['EN_ATTENTE', 'TRAITEE', 'IGNOREE'].includes(q.status) ? q.status : 'EN_ATTENTE';
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM customer_reset_requests WHERE status = ?', [status]);
  const [counts] = await pool.query('SELECT status, COUNT(*) AS n FROM customer_reset_requests GROUP BY status');
  const [rows] = await pool.query(
    `SELECT r.*, c.name, c.username, c.phone, u.name AS handled_by_name, k.name AS contacted_by_name
       FROM customer_reset_requests r JOIN customers c ON c.id = r.customer_id LEFT JOIN users u ON u.id = r.handled_by
       LEFT JOIN users k ON k.id = r.contacted_by
      WHERE r.status = ? ORDER BY r.last_requested_at DESC, r.id DESC LIMIT ? OFFSET ?`, [status, limit, offset]);
  const ids = rows.map((r) => r.id);
  const history = new Map();
  if (ids.length) {
    const [logs] = await pool.query(
      `SELECT l.request_id, l.action, l.created_at, u.name AS user_name FROM customer_reset_log l LEFT JOIN users u ON u.id = l.user_id
        WHERE l.request_id IN (?) ORDER BY l.created_at, l.id`, [ids]);
    for (const l of logs) {
      if (!history.has(l.request_id)) history.set(l.request_id, []);
      history.get(l.request_id).push({ action: l.action, at: l.created_at, by: l.user_name || null });
    }
  }
  const by = Object.fromEntries(counts.map((c) => [c.status, Number(c.n)]));
  return {
    counts: { pending: by.EN_ATTENTE || 0, done: by.TRAITEE || 0, ignored: by.IGNOREE || 0 },
    items: rows.map((r) => ({
      id: r.id, status: r.status, requestCount: r.request_count, createdAt: r.created_at, lastRequestedAt: r.last_requested_at,
      contactedAt: r.contacted_at, contactedBy: r.contacted_by_name || null,
      handledAt: r.handled_at, handledBy: r.handled_by_name || null,
      customer: { id: r.customer_id, name: r.name, username: r.username, phone: r.phone },
      history: history.get(r.id) || [],
    })),
    page, limit, total: Number(total), totalPages: Math.max(1, Math.ceil(Number(total) / limit)),
  };
}

/** « Chère cliente Awa », « Cher client Koffi » (d'après sa dernière commande), sinon « Cher client, chère cliente ». */
async function greeting(customerId, name) {
  const [[o]] = await pool.query(
    'SELECT customer_gender AS g FROM orders WHERE customer_id = ? AND customer_gender IS NOT NULL ORDER BY created_at DESC LIMIT 1', [customerId]);
  const who = o?.g === 'FEMME' ? 'Chère cliente' : o?.g === 'HOMME' ? 'Cher client' : 'Cher client, chère cliente';
  return name ? `${who} ${name},` : `${who},`;
}

async function pendingRow(conn, requestId, lock = false) {
  const [[row]] = await conn.query(
    `SELECT r.id, r.status, r.customer_id, r.contacted_at, c.name, c.phone, c.is_active
       FROM customer_reset_requests r JOIN customers c ON c.id = r.customer_id WHERE r.id = ?${lock ? ' FOR UPDATE' : ''}`, [requestId]);
  if (!row) throw notFound('Demande introuvable.');
  if (row.status !== 'EN_ATTENTE') throw conflict('Cette demande a déjà été traitée.');
  if (!row.is_active) throw conflict('Ce compte client est désactivé.');
  return row;
}

/**
 * Étape 1 — message à envoyer au client pour vérifier que la demande vient de lui. Aucun lien, aucun jeton.
 * Ne modifie rien : l'envoi est enregistré par markContacted quand l'admin ouvre WhatsApp.
 */
async function confirmationMessage(requestId) {
  const row = await pendingRow(pool, requestId);
  const message = `${await greeting(row.customer_id, row.name)}\n`
    + `Sur le site de ${config.shop.name}, vous avez demandé à réinitialiser votre mot de passe. Cette demande vient-elle bien de vous ?\n`
    + `Répondez « Oui » à ce message : nous vous enverrons alors un lien pour choisir votre nouveau mot de passe.\n`
    + `Si ce n'est pas vous, répondez « Non » : votre compte reste protégé et rien ne change.`;
  return { phone: row.phone, message, whatsappUrl: buildLink('WHATSAPP', row.phone, message), contactedAt: row.contacted_at };
}

/** Étape 1 (suite) — l'admin a ouvert WhatsApp avec le message de vérification : on note qui et quand. */
async function markContacted(requestId, userId) {
  return withTransaction(async (conn) => {
    const row = await pendingRow(conn, requestId, true);
    await conn.query('UPDATE customer_reset_requests SET contacted_at = NOW(), contacted_by = ? WHERE id = ?', [userId, row.id]);
    await log(conn, { customerId: row.customer_id, requestId: row.id, userId, action: 'CLIENT_CONTACTE' });
    return { id: row.id, contacted: true };
  });
}

/**
 * Étape 2 — le client a confirmé : crée le lien à usage unique (30 min) pour une demande en attente.
 * Le jeton n'est renvoyé qu'une fois, ici : en base on ne garde que son empreinte SHA-256.
 */
async function createLink(requestId, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const r = await withTransaction(async (conn) => {
    const row = await pendingRow(conn, requestId, true);
    if (!row.contacted_at) throw conflict('Écrivez d’abord au client pour vérifier que la demande vient bien de lui.');
    // Un seul lien valable à la fois pour ce compte.
    await conn.query('DELETE FROM customer_password_resets WHERE customer_id = ? AND used_at IS NULL', [row.customer_id]);
    await conn.query(
      'INSERT INTO customer_password_resets (customer_id, created_by, request_id, token_hash, expires_at) VALUES (?,?,?,?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
      [row.customer_id, userId, row.id, sha256(token), LINK_TTL_MINUTES]);
    await conn.query("UPDATE customer_reset_requests SET status = 'TRAITEE', handled_by = ?, handled_at = NOW() WHERE id = ?", [userId, row.id]);
    await log(conn, { customerId: row.customer_id, requestId: row.id, userId, action: 'LIEN_CREE' });
    const [[{ expires }]] = await conn.query('SELECT DATE_ADD(NOW(), INTERVAL ? MINUTE) AS expires', [LINK_TTL_MINUTES]);
    return { ...row, expires };
  });
  logger.info('Lien de réinitialisation client créé', { requestId, customerId: r.customer_id, userId });
  const site = config.notify.siteUrl || config.corsOrigins[0];
  const link = `${site}/reinitialiser/${token}`;
  const hello = r.name ? `Merci ${r.name} !` : 'Merci !';
  const message = `${hello} Voici votre lien pour choisir un nouveau mot de passe sur ${config.shop.name} :\n${link}\n`
    + `Ouvrez-le dans les ${LINK_TTL_MINUTES} minutes qui suivent : passé ce délai, il ne fonctionnera plus. Il ne sert qu'une fois.`;
  return { link, expiresAt: r.expires, ttlMinutes: LINK_TTL_MINUTES, phone: r.phone, message, whatsappUrl: buildLink('WHATSAPP', r.phone, message) };
}

async function ignore(requestId, userId) {
  await withTransaction(async (conn) => {
    const [[row]] = await conn.query('SELECT id, status, customer_id FROM customer_reset_requests WHERE id = ? FOR UPDATE', [requestId]);
    if (!row) throw notFound('Demande introuvable.');
    if (row.status !== 'EN_ATTENTE') throw conflict('Cette demande a déjà été traitée.');
    await conn.query("UPDATE customer_reset_requests SET status = 'IGNOREE', handled_by = ?, handled_at = NOW() WHERE id = ?", [userId, row.id]);
    await log(conn, { customerId: row.customer_id, requestId: row.id, userId, action: 'DEMANDE_IGNOREE' });
  });
  return { id: requestId, status: 'IGNOREE' };
}

module.exports = { request, list, confirmationMessage, markContacted, createLink, ignore, log, LINK_TTL_MINUTES, sha256 };
