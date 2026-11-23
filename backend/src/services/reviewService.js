'use strict';
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../config/env');
const { pool } = require('../config/db');
const { notFound, forbidden, badRequest } = require('../utils/errors');
const { paginate } = require('../utils/helpers');
const { SIGNATURES } = require('./adminCatalogService');

/*
 * Avis clients.
 * - Donner un avis : client connecté qui a reçu l'article (commande TERMINEE rattachée à son compte).
 * - Un avis par article et par client ; le modifier le renvoie en validation.
 * - Rien n'est visible tant que la boutique n'a pas publié l'avis.
 */

/** « Aïcha Kouassi » → « Aïcha K. » : on ne publie jamais le nom complet ni le téléphone. */
function displayName(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'Client de la boutique';
  const first = words[0].slice(0, 30);
  return words.length > 1 ? `${first} ${words[words.length - 1].charAt(0).toUpperCase()}.` : first;
}

const publicReview = (r) => ({
  id: r.id, rating: r.rating, comment: r.comment, photoUrl: r.photo_url, author: r.author_name,
  createdAt: r.created_at, reply: r.shop_reply || null, verified: true,
});

async function productIdBySlug(slug) {
  const [rows] = await pool.query('SELECT id, name FROM products WHERE slug = ? AND is_active = 1', [String(slug).slice(0, 200)]);
  if (!rows.length) throw notFound('Article introuvable.');
  return rows[0];
}

/** Moyenne, nombre et répartition des avis publiés + la page demandée. */
async function listForProduct(slug, q = {}) {
  const product = await productIdBySlug(slug);
  const { page, limit, offset } = paginate(q, 6, 20);
  const [dist] = await pool.query(
    "SELECT rating, COUNT(*) AS n FROM product_reviews WHERE product_id = ? AND status = 'PUBLIE' GROUP BY rating", [product.id]);
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let count = 0; let sum = 0;
  for (const d of dist) { distribution[d.rating] = Number(d.n); count += Number(d.n); sum += d.rating * Number(d.n); }
  const order = q.sort === 'best' ? 'rating DESC, created_at DESC' : q.sort === 'worst' ? 'rating ASC, created_at DESC' : 'created_at DESC';
  const [rows] = await pool.query(
    `SELECT id, rating, comment, photo_url, author_name, shop_reply, created_at FROM product_reviews
      WHERE product_id = ? AND status = 'PUBLIE' ORDER BY ${order}, id DESC LIMIT ? OFFSET ?`, [product.id, limit, offset]);
  return {
    average: count ? Math.round((sum / count) * 10) / 10 : null, count, distribution,
    items: rows.map(publicReview), page, limit, totalPages: Math.max(1, Math.ceil(count / limit)),
  };
}

/** Dernière commande TERMINEE du client contenant cet article (preuve d'achat). */
async function purchaseProof(customerId, productId) {
  const [rows] = await pool.query(
    `SELECT o.id FROM orders o
       JOIN order_items i ON i.order_id = o.id
       JOIN product_variants v ON v.id = i.product_variant_id
      WHERE o.customer_id = ? AND o.status = 'TERMINEE' AND v.product_id = ?
      ORDER BY o.created_at DESC LIMIT 1`, [customerId, productId]);
  return rows[0] ? rows[0].id : null;
}

/** Ce que voit le client connecté sur la fiche : peut-il donner son avis ? a-t-il déjà écrit ? */
async function myReview(customer, slug) {
  const product = await productIdBySlug(slug);
  const [rows] = await pool.query(
    'SELECT id, rating, comment, photo_url, status, shop_reply, created_at, updated_at FROM product_reviews WHERE product_id = ? AND customer_id = ?',
    [product.id, customer.id]);
  const orderId = await purchaseProof(customer.id, product.id);
  const r = rows[0];
  return {
    canReview: !!orderId,
    reason: orderId ? null : 'Vous pourrez donner votre avis une fois cet article reçu (commande terminée).',
    review: r ? { id: r.id, rating: r.rating, comment: r.comment, photoUrl: r.photo_url, status: r.status, reply: r.shop_reply, updatedAt: r.updated_at } : null,
  };
}

async function savePhoto(file) {
  const sig = SIGNATURES.find((s) => s.test(file.buffer));
  if (!sig) throw badRequest('Photo non prise en charge : JPEG, PNG ou WebP.');
  await fs.mkdir(config.uploadDir, { recursive: true });
  const name = `avis-${crypto.randomBytes(16).toString('hex')}${sig.ext}`;
  await fs.writeFile(path.join(config.uploadDir, name), file.buffer, { flag: 'wx' });
  return `/uploads/${name}`;
}
async function dropPhoto(url) {
  if (url && url.startsWith('/uploads/avis-')) await fs.unlink(path.join(config.uploadDir, path.basename(url))).catch(() => {});
}

/** Crée ou met à jour l'avis du client (repasse « en attente »). */
async function submit(customer, { productSlug, rating, comment, removePhoto }, file) {
  const product = await productIdBySlug(productSlug);
  const orderId = await purchaseProof(customer.id, product.id);
  if (!orderId) throw forbidden('Seuls les clients ayant reçu cet article peuvent donner leur avis.');
  const [existing] = await pool.query('SELECT id, photo_url FROM product_reviews WHERE product_id = ? AND customer_id = ?', [product.id, customer.id]);
  const old = existing[0];
  const photoUrl = file ? await savePhoto(file) : (removePhoto ? null : (old ? old.photo_url : null));
  const author = displayName(customer.name || customer.username);
  let id;
  if (old) {
    await pool.query(
      `UPDATE product_reviews SET rating=?, comment=?, photo_url=?, author_name=?, order_id=?, status='EN_ATTENTE',
              shop_reply=NULL, moderated_by=NULL, moderated_at=NULL WHERE id=?`,
      [rating, comment, photoUrl, author, orderId, old.id]);
    id = old.id;
    if (old.photo_url && old.photo_url !== photoUrl) await dropPhoto(old.photo_url);
  } else {
    const [res] = await pool.query(
      'INSERT INTO product_reviews (product_id, customer_id, order_id, rating, comment, photo_url, author_name) VALUES (?,?,?,?,?,?,?)',
      [product.id, customer.id, orderId, rating, comment, photoUrl, author]);
    id = res.insertId;
  }
  await pool.query("INSERT INTO notifications (type, title, body) VALUES ('NEW_REVIEW', ?, ?)",
    [`Nouvel avis à valider (${rating}/5)`, `${author} sur « ${product.name} »`.slice(0, 500)]);
  return { id, status: 'EN_ATTENTE' };
}

async function removeMine(customer, slug) {
  const product = await productIdBySlug(slug);
  const [rows] = await pool.query('SELECT id, photo_url FROM product_reviews WHERE product_id = ? AND customer_id = ?', [product.id, customer.id]);
  if (!rows.length) throw notFound('Avis introuvable.');
  await pool.query('DELETE FROM product_reviews WHERE id = ?', [rows[0].id]);
  await dropPhoto(rows[0].photo_url);
  return { ok: true };
}

/* ------------------------------ Administration ------------------------------ */
async function adminList(q = {}) {
  const { page, limit, offset } = paginate(q, 20, 100);
  const where = []; const params = [];
  if (['EN_ATTENTE', 'PUBLIE', 'REFUSE'].includes(q.status)) { where.push('r.status = ?'); params.push(q.status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM product_reviews r ${whereSql}`, params);
  const [counts] = await pool.query('SELECT status, COUNT(*) AS n FROM product_reviews GROUP BY status');
  const [rows] = await pool.query(
    `SELECT r.*, p.name AS product_name, p.slug AS product_slug, c.phone AS customer_phone, c.name AS customer_name,
            (SELECT image_url FROM product_images i WHERE i.product_id = p.id ORDER BY i.position, i.id LIMIT 1) AS product_image
       FROM product_reviews r JOIN products p ON p.id = r.product_id JOIN customers c ON c.id = r.customer_id
       ${whereSql} ORDER BY (r.status = 'EN_ATTENTE') DESC, r.updated_at DESC, r.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const by = Object.fromEntries(counts.map((c) => [c.status, Number(c.n)]));
  return {
    counts: { pending: by.EN_ATTENTE || 0, published: by.PUBLIE || 0, refused: by.REFUSE || 0 },
    items: rows.map((r) => ({
      ...publicReview(r), status: r.status, updatedAt: r.updated_at, moderatedAt: r.moderated_at,
      product: { name: r.product_name, slug: r.product_slug, imageUrl: r.product_image },
      customer: { name: r.customer_name, phone: r.customer_phone },
    })),
    page, limit, total: Number(total), totalPages: Math.max(1, Math.ceil(Number(total) / limit)),
  };
}

async function moderate(id, { status, reply }, userId) {
  const sets = []; const params = [];
  if (status) { sets.push('status = ?', 'moderated_by = ?', 'moderated_at = NOW()'); params.push(status, userId); }
  if (reply !== undefined) { sets.push('shop_reply = ?'); params.push(reply || null); }
  const [res] = await pool.query(`UPDATE product_reviews SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  if (!res.affectedRows) throw notFound('Avis introuvable.');
  return { id, status: status || undefined };
}

async function adminRemove(id) {
  const [rows] = await pool.query('SELECT photo_url FROM product_reviews WHERE id = ?', [id]);
  if (!rows.length) throw notFound('Avis introuvable.');
  await pool.query('DELETE FROM product_reviews WHERE id = ?', [id]);
  await dropPhoto(rows[0].photo_url);
  return { id };
}

module.exports = { listForProduct, myReview, submit, removeMine, adminList, moderate, adminRemove, displayName };
