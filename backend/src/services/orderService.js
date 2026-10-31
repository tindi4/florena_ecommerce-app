'use strict';
const config = require('../config/env');
const { pool, withTransaction } = require('../config/db');
const { toCents, fromCents } = require('../utils/money');
const { generateOrderNumber, phoneDigits, parseJson, paginate } = require('../utils/helpers');
const { conflict, notFound, badRequest } = require('../utils/errors');

const TODO_STATUSES = ['EN_ATTENTE', 'CONFIRMEE', 'EN_PREPARATION'];

// Transitions autorisées (TERMINEE et ANNULEE sont définitifs).
const TRANSITIONS = {
  EN_ATTENTE: ['CONFIRMEE', 'ANNULEE'],
  CONFIRMEE: ['EN_PREPARATION', 'TERMINEE', 'ANNULEE'],
  EN_PREPARATION: ['TERMINEE', 'ANNULEE'],
  TERMINEE: [],
  ANNULEE: [],
};

/* ------------------------------------------------------------------ */
/* Création d'une commande (publique)                                  */
/* ------------------------------------------------------------------ */

async function findByIdempotencyKey(key) {
  if (!key) return null;
  const [rows] = await pool.query('SELECT order_number, status, total_amount, currency, created_at FROM orders WHERE idempotency_key = ?', [key]);
  return rows[0] ? formatCreated(rows[0]) : null;
}

const formatCreated = (o) => ({
  orderNumber: o.order_number, status: o.status, total: Number(o.total_amount), currency: o.currency, createdAt: o.created_at,
});

async function createOrder(input, idempotencyKey) {
  if (idempotencyKey && !/^[A-Za-z0-9-]{8,64}$/.test(idempotencyKey)) throw badRequest('Clé d\'idempotence invalide.');
  const existing = await findByIdempotencyKey(idempotencyKey);
  if (existing) return { ...existing, duplicate: true };

  // Fusionne les lignes identiques.
  const wanted = new Map();
  const expected = new Map();
  for (const it of input.items) {
    wanted.set(it.variantId, (wanted.get(it.variantId) || 0) + it.quantity);
    if (it.expectedPrice != null) expected.set(it.variantId, it.expectedPrice);
  }
  const ids = [...wanted.keys()].sort((a, b) => a - b);

  try {
    return await withTransaction(async (conn) => {
      // Verrouille les variantes (ordre stable => pas d'interblocage) pour gérer les achats simultanés.
      const [variants] = await conn.query(
        `SELECT v.id, v.sku, v.attributes_json, v.price, v.stock_quantity, v.is_active AS v_active,
                p.id AS product_id, p.name, p.is_active AS p_active,
                (SELECT image_url FROM product_images i WHERE i.product_id = p.id ORDER BY i.position, i.id LIMIT 1) AS image_url
           FROM product_variants v JOIN products p ON p.id = v.product_id
          WHERE v.id IN (?) ORDER BY v.id FOR UPDATE`, [ids]);
      const byId = new Map(variants.map((v) => [v.id, v]));

      const problems = [];
      let totalCents = 0;
      const lines = [];
      for (const id of ids) {
        const qty = wanted.get(id);
        const v = byId.get(id);
        if (!v || !v.v_active || !v.p_active) {
          problems.push({ variantId: id, reason: 'UNAVAILABLE', message: 'Article indisponible.' });
          continue;
        }
        const unit = toCents(v.price);
        if (expected.has(id) && toCents(expected.get(id)) !== unit) {
          problems.push({ variantId: id, reason: 'PRICE_CHANGED', message: `Le prix de « ${v.name} » a changé.`, currentPrice: Number(v.price) });
        }
        if (v.stock_quantity < qty) {
          problems.push({ variantId: id, reason: 'INSUFFICIENT_STOCK', message: `Stock insuffisant pour « ${v.name} ».`, available: Number(v.stock_quantity) });
        }
        const lineCents = unit * qty;
        totalCents += lineCents;
        lines.push({ v, qty, unit, lineCents });
      }
      if (problems.length) {
        throw conflict('Votre panier a changé. Vérifiez les articles avant de confirmer.', problems, 'CART_CHANGED');
      }

      // Numéro unique non prévisible (réessaie en cas de collision très improbable).
      let orderId;
      let orderNumber;
      for (let attempt = 0; attempt < 5 && !orderId; attempt += 1) {
        orderNumber = generateOrderNumber();
        try {
          const [res] = await conn.query(
            `INSERT INTO orders (order_number, idempotency_key, customer_name, customer_phone, customer_phone_digits,
                                 delivery_address, city, customer_comment, status, payment_status, currency, total_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'EN_ATTENTE', 'NON_PAYE', ?, ?)`,
            [orderNumber, idempotencyKey || null, input.customerName, input.customerPhone, phoneDigits(input.customerPhone),
              input.deliveryAddress, input.city || null, input.comment || null, config.shop.currency, fromCents(totalCents)]);
          orderId = res.insertId;
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY' && /uq_orders_number/.test(err.message)) continue;
          throw err;
        }
      }
      if (!orderId) throw new Error('Impossible de générer un numéro de commande unique.');

      for (const { v, qty, unit, lineCents } of lines) {
        await conn.query(
          `INSERT INTO order_items (order_id, product_variant_id, product_name_snapshot, sku_snapshot, variant_snapshot,
                                    image_snapshot, quantity, unit_price, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [orderId, v.id, v.name, v.sku, JSON.stringify(parseJson(v.attributes_json)), v.image_url, qty, fromCents(unit), fromCents(lineCents)]);
        // Mise à jour conditionnelle : ne descend jamais sous zéro.
        const [upd] = await conn.query(
          'UPDATE product_variants SET stock_quantity = stock_quantity - ? WHERE id = ? AND stock_quantity >= ?', [qty, v.id, qty]);
        if (upd.affectedRows !== 1) {
          throw conflict('Stock insuffisant.', [{ variantId: v.id, reason: 'INSUFFICIENT_STOCK' }], 'CART_CHANGED');
        }
        await conn.query(
          `INSERT INTO stock_movements (product_variant_id, order_id, movement_type, quantity_before, quantity_after, quantity_delta, reason)
           VALUES (?, ?, 'ORDER', ?, ?, ?, ?)`,
          [v.id, orderId, v.stock_quantity, v.stock_quantity - qty, -qty, `Commande ${orderNumber}`]);
      }

      await conn.query(
        `INSERT INTO order_status_history (order_id, event_type, changed_by_user_id, old_status, new_status, comment)
         VALUES (?, 'STATUS', NULL, NULL, 'EN_ATTENTE', 'Commande créée')`, [orderId]);

      const itemCount = lines.reduce((s, l) => s + l.qty, 0);
      await conn.query(
        `INSERT INTO notifications (type, title, body, order_id) VALUES ('NEW_ORDER', ?, ?, ?)`,
        [`Nouvelle commande ${orderNumber}`,
          `${input.customerName} · ${itemCount} article${itemCount > 1 ? 's' : ''} · ${fromCents(totalCents)} ${config.shop.currency}`, orderId]);

      return { orderNumber, status: 'EN_ATTENTE', total: totalCents / 100, currency: config.shop.currency, createdAt: new Date().toISOString() };
    });
  } catch (err) {
    // Double soumission simultanée avec la même clé : on renvoie la commande déjà créée.
    if (err.code === 'ER_DUP_ENTRY' && /uq_orders_idem/.test(err.message)) {
      const again = await findByIdempotencyKey(idempotencyKey);
      if (again) return { ...again, duplicate: true };
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Suivi côté client                                                    */
/* ------------------------------------------------------------------ */

async function trackOrder(orderNumber, phone) {
  const [rows] = await pool.query('SELECT * FROM orders WHERE order_number = ?', [orderNumber]);
  const o = rows[0];
  if (!o || o.customer_phone_digits !== phoneDigits(phone)) throw notFound('Aucune commande trouvée avec ces informations.');
  const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [o.id]);
  const [history] = await pool.query(
    'SELECT event_type, new_status, created_at FROM order_status_history WHERE order_id = ? ORDER BY created_at, id', [o.id]);
  return {
    orderNumber: o.order_number, status: o.status, paymentStatus: o.payment_status, paidAt: o.paid_at,
    createdAt: o.created_at, updatedAt: o.updated_at, total: Number(o.total_amount), currency: o.currency,
    customerName: o.customer_name, deliveryAddress: o.delivery_address, city: o.city,
    items: items.map(mapItem),
    timeline: history.map((h) => ({ type: h.event_type, value: h.new_status, at: h.created_at })),
  };
}

const mapItem = (i) => ({
  id: i.id, name: i.product_name_snapshot, sku: i.sku_snapshot, attributes: parseJson(i.variant_snapshot),
  imageUrl: i.image_snapshot, quantity: Number(i.quantity), unitPrice: Number(i.unit_price), lineTotal: Number(i.line_total),
});

/* ------------------------------------------------------------------ */
/* Administration                                                       */
/* ------------------------------------------------------------------ */

async function listOrders(q) {
  const { page, limit, offset } = paginate(q, 20, 100);
  const where = [];
  const params = [];
  const view = q.view || 'todo';
  if (view === 'todo') { where.push('o.status IN (?)'); params.push(TODO_STATUSES); }
  else if (view === 'done') where.push("o.status = 'TERMINEE'");
  else if (view === 'cancelled') where.push("o.status = 'ANNULEE'");
  if (q.status) { where.push('o.status = ?'); params.push(String(q.status)); }
  if (q.payment === 'unpaid') where.push("o.payment_status = 'NON_PAYE' AND o.status <> 'ANNULEE'");
  if (q.payment === 'paid') where.push("o.payment_status = 'PAYE'");
  if (q.search) {
    where.push('(o.order_number LIKE ? OR o.customer_name LIKE ? OR o.customer_phone LIKE ?)');
    const s = `%${String(q.search).slice(0, 60)}%`;
    params.push(s, s, s);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM orders o ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT o.id, o.order_number, o.customer_name, o.customer_phone, o.status, o.payment_status, o.total_amount, o.currency, o.created_at,
            (SELECT COALESCE(SUM(quantity),0) FROM order_items WHERE order_id = o.id) AS item_count,
            (SELECT COUNT(*) FROM notifications n WHERE n.order_id = o.id AND n.is_read = 0) AS unread
       FROM orders o ${whereSql}
      ORDER BY (o.status IN ('EN_ATTENTE')) DESC, o.created_at DESC, o.id DESC
      LIMIT ? OFFSET ?`, [...params, limit, offset]);
  return {
    items: rows.map((o) => ({
      id: o.id, orderNumber: o.order_number, customerName: o.customer_name, customerPhone: o.customer_phone,
      status: o.status, paymentStatus: o.payment_status, total: Number(o.total_amount), currency: o.currency,
      createdAt: o.created_at, itemCount: Number(o.item_count), isNew: Number(o.unread) > 0,
    })),
    page, limit, total: Number(total), totalPages: Math.max(1, Math.ceil(Number(total) / limit)),
  };
}

async function getOrder(id) {
  const [rows] = await pool.query(
    `SELECT o.*, pu.name AS paid_by_name FROM orders o LEFT JOIN users pu ON pu.id = o.paid_by_user_id WHERE o.id = ?`, [id]);
  const o = rows[0];
  if (!o) throw notFound('Commande introuvable.');
  const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [id]);
  const [history] = await pool.query(
    `SELECT h.id, h.event_type, h.old_status, h.new_status, h.comment, h.created_at, u.name AS admin_name
       FROM order_status_history h LEFT JOIN users u ON u.id = h.changed_by_user_id
      WHERE h.order_id = ? ORDER BY h.created_at, h.id`, [id]);
  // Ouvrir la commande = notification lue.
  await pool.query('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE order_id = ? AND is_read = 0', [id]);
  return {
    id: o.id, orderNumber: o.order_number, status: o.status, paymentStatus: o.payment_status, paidAt: o.paid_at,
    paidBy: o.paid_by_name, paymentNote: o.payment_note, customerName: o.customer_name, customerPhone: o.customer_phone,
    deliveryAddress: o.delivery_address, city: o.city, comment: o.customer_comment, currency: o.currency,
    total: Number(o.total_amount), createdAt: o.created_at, updatedAt: o.updated_at, stockRestored: !!o.stock_restored,
    allowedStatuses: TRANSITIONS[o.status],
    items: items.map(mapItem),
    history: history.map((h) => ({
      id: h.id, type: h.event_type, from: h.old_status, to: h.new_status, comment: h.comment, admin: h.admin_name, at: h.created_at,
    })),
  };
}

async function changeStatus(orderId, newStatus, comment, adminId) {
  await withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT id, order_number, status, stock_restored FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    const o = rows[0];
    if (!o) throw notFound('Commande introuvable.');
    if (!TRANSITIONS[o.status].includes(newStatus)) {
      throw conflict(`Impossible de passer de « ${o.status} » à « ${newStatus} ».`, undefined, 'INVALID_TRANSITION');
    }
    if (newStatus === 'ANNULEE' && !o.stock_restored) {
      // Le stock est restitué une seule fois (verrou de ligne + drapeau stock_restored).
      const [items] = await conn.query(
        'SELECT product_variant_id, quantity FROM order_items WHERE order_id = ? AND product_variant_id IS NOT NULL ORDER BY product_variant_id', [orderId]);
      for (const it of items) {
        const [[v]] = await conn.query('SELECT stock_quantity FROM product_variants WHERE id = ? FOR UPDATE', [it.product_variant_id]);
        if (!v) continue;
        await conn.query('UPDATE product_variants SET stock_quantity = stock_quantity + ? WHERE id = ?', [it.quantity, it.product_variant_id]);
        await conn.query(
          `INSERT INTO stock_movements (product_variant_id, order_id, movement_type, quantity_before, quantity_after, quantity_delta, reason, created_by_user_id)
           VALUES (?, ?, 'CANCEL_RESTORE', ?, ?, ?, ?, ?)`,
          [it.product_variant_id, orderId, v.stock_quantity, v.stock_quantity + it.quantity, it.quantity, `Annulation ${o.order_number}`, adminId]);
      }
      await conn.query('UPDATE orders SET stock_restored = 1 WHERE id = ?', [orderId]);
    }
    await conn.query('UPDATE orders SET status = ? WHERE id = ?', [newStatus, orderId]);
    await conn.query(
      `INSERT INTO order_status_history (order_id, event_type, changed_by_user_id, old_status, new_status, comment)
       VALUES (?, 'STATUS', ?, ?, ?, ?)`, [orderId, adminId, o.status, newStatus, comment || null]);
    await conn.query('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE order_id = ? AND is_read = 0', [orderId]);
  });
  return getOrder(orderId);
}

async function setPayment(orderId, paid, note, adminId) {
  await withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT id, status, payment_status FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    const o = rows[0];
    if (!o) throw notFound('Commande introuvable.');
    if (o.status === 'ANNULEE') throw conflict('Une commande annulée ne peut pas être marquée payée.', undefined, 'INVALID_PAYMENT');
    const target = paid ? 'PAYE' : 'NON_PAYE';
    if (o.payment_status === target) return;
    await conn.query(
      'UPDATE orders SET payment_status = ?, paid_at = ?, paid_by_user_id = ?, payment_note = ? WHERE id = ?',
      [target, paid ? new Date() : null, paid ? adminId : null, paid ? note || null : null, orderId]);
    await conn.query(
      `INSERT INTO order_status_history (order_id, event_type, changed_by_user_id, old_status, new_status, comment)
       VALUES (?, 'PAYMENT', ?, ?, ?, ?)`, [orderId, adminId, o.payment_status, target, note || null]);
  });
  return getOrder(orderId);
}

module.exports = { createOrder, trackOrder, listOrders, getOrder, changeStatus, setPayment, TRANSITIONS, TODO_STATUSES };
