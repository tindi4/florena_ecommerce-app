'use strict';
const config = require('../config/env');
const { pool, withTransaction } = require('../config/db');
const { toCents, fromCents } = require('../utils/money');
const { generateOrderNumber, generateTrackingCode, TRACKING_CODE_RE, phoneDigits, samePhone, parseJson, paginate } = require('../utils/helpers');
const { conflict, notFound, badRequest } = require('../utils/errors');
const notify = require('./notifyService');
const settings = require('./settingsService');

const TODO_STATUSES = ['EN_ATTENTE', 'CONFIRMEE', 'EN_PREPARATION'];
// Le client peut modifier sa commande tant qu'elle n'est pas en préparation.
const EDITABLE_STATUSES = ['EN_ATTENTE', 'CONFIRMEE'];

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
  const [rows] = await pool.query('SELECT order_number, tracking_code, status, total_amount, currency, created_at FROM orders WHERE idempotency_key = ?', [key]);
  return rows[0] ? formatCreated(rows[0]) : null;
}

const formatCreated = (o) => ({
  orderNumber: o.order_number, trackingCode: o.tracking_code, status: o.status, total: Number(o.total_amount), currency: o.currency, createdAt: o.created_at,
});

/** customerId : compte client connecté (null = commande en invité). */
async function createOrder(input, idempotencyKey, customerId = null) {
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

      // La livraison est demandée par le client ; les frais seront fixés ensuite par l'administrateur
      // (le total de départ ne contient donc que les articles).
      const subtotalCents = totalCents;
      const feeStatus = input.deliveryRequested && input.deliveryFeeAccepted ? 'PENDING' : 'NONE';

      // Numéro unique non prévisible (réessaie en cas de collision très improbable).
      let orderId;
      let orderNumber;
      let trackingCode;
      for (let attempt = 0; attempt < 5 && !orderId; attempt += 1) {
        orderNumber = generateOrderNumber();
        trackingCode = generateTrackingCode(orderNumber);
        try {
          const [res] = await conn.query(
            `INSERT INTO orders (order_number, tracking_code, customer_id, idempotency_key, customer_name, customer_gender, customer_phone, customer_phone_digits,
                                 delivery_address, city, customer_comment, latitude, longitude, location_label,
                                 status, payment_status, currency, subtotal_amount, delivery_requested, delivery_fee_accepted,
                                 delivery_fee_status, delivery_fee, total_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EN_ATTENTE', 'NON_PAYE', ?, ?, ?, ?, ?, 0, ?)`,
            [orderNumber, trackingCode, customerId, idempotencyKey || null, input.customerName, input.customerGender || null, input.customerPhone,
              phoneDigits(input.customerPhone), input.deliveryAddress || 'Retrait sur place', null, input.comment || null,
              input.latitude ?? null, input.longitude ?? null, input.locationLabel || null,
              config.shop.currency, fromCents(subtotalCents), input.deliveryRequested ? 1 : 0, input.deliveryFeeAccepted ? 1 : 0,
              feeStatus, fromCents(totalCents)]);
          orderId = res.insertId;
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY' && /uq_orders_(number|tracking)/.test(err.message)) continue;
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

      return { orderNumber, trackingCode, status: 'EN_ATTENTE', total: totalCents / 100, currency: config.shop.currency, createdAt: new Date().toISOString() };
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

const ACCESS_DENIED = 'Aucune commande trouvée avec ces informations.';

/** Les commandes créées avant la migration 006 reçoivent leur code de suivi à la première consultation. */
async function ensureTrackingCode(o) {
  if (o.tracking_code) return o.tracking_code;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateTrackingCode(o.order_number);
    try {
      // « AND tracking_code IS NULL » : si deux requêtes arrivent en même temps, une seule écrit son code.
      await pool.query('UPDATE orders SET tracking_code = ? WHERE id = ? AND tracking_code IS NULL', [code, o.id]);
      const [[row]] = await pool.query('SELECT tracking_code FROM orders WHERE id = ?', [o.id]);
      o.tracking_code = row.tracking_code;
      return o.tracking_code;
    } catch (err) { if (err.code !== 'ER_DUP_ENTRY') throw err; }
  }
  throw new Error('Impossible de générer un code de suivi.');
}

/**
 * Accès à une commande SANS compte. Deux possibilités seulement :
 *   1. le code complet (long et aléatoire) seul ;
 *   2. le numéro de commande ET le téléphone.
 * Le téléphone seul ne donne jamais accès (le schéma de validation l'interdit aussi).
 * Le message d'erreur est identique dans tous les cas : impossible de savoir si un numéro existe.
 */
async function resolveAccess({ code, orderNumber, phone }) {
  let o;
  if (code) {
    if (!TRACKING_CODE_RE.test(code)) throw notFound(ACCESS_DENIED);
    [[o]] = await pool.query('SELECT * FROM orders WHERE tracking_code = ?', [code]);
  } else if (orderNumber && phone) {
    [[o]] = await pool.query('SELECT * FROM orders WHERE order_number = ?', [orderNumber]);
    if (o && !samePhone(o.customer_phone_digits, phone)) o = undefined;
  }
  if (!o) throw notFound(ACCESS_DENIED);
  await ensureTrackingCode(o);
  return o;
}

async function trackOrder(access) {
  return formatTracked(await resolveAccess(access));
}

async function formatTracked(o) {
  const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [o.id]);
  const [history] = await pool.query(
    'SELECT event_type, new_status, created_at FROM order_status_history WHERE order_id = ? ORDER BY created_at, id', [o.id]);
  return {
    orderNumber: o.order_number, trackingCode: o.tracking_code, hasAccount: o.customer_id != null,
    status: o.status, paymentStatus: o.payment_status, paidAt: o.paid_at,
    createdAt: o.created_at, updatedAt: o.updated_at, total: Number(o.total_amount), currency: o.currency,
    subtotal: Number(o.subtotal_amount), deliveryFee: Number(o.delivery_fee), deliveryFeeStatus: o.delivery_fee_status,
    deliveryRequested: !!o.delivery_requested, deliveryFeeAccepted: !!o.delivery_fee_accepted,
    canEdit: EDITABLE_STATUSES.includes(o.status), customerGender: o.customer_gender, comment: o.customer_comment,
    latitude: o.latitude == null ? null : Number(o.latitude), longitude: o.longitude == null ? null : Number(o.longitude), locationLabel: o.location_label,
    customerName: o.customer_name, deliveryAddress: o.delivery_address, city: o.city,
    items: items.map(mapItem),
    timeline: history.map((h) => ({ type: h.event_type, value: h.new_status, at: h.created_at })),
  };
}

const mapItem = (i) => ({
  id: i.id, variantId: i.product_variant_id, name: i.product_name_snapshot, sku: i.sku_snapshot, attributes: parseJson(i.variant_snapshot),
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
            (SELECT COUNT(*) FROM notifications n WHERE n.order_id = o.id AND n.is_read = 0 AND n.type = 'NEW_ORDER') AS unread,
            (SELECT COUNT(*) FROM notifications n WHERE n.order_id = o.id AND n.is_read = 0 AND n.type = 'ORDER_UPDATED') AS updates
       FROM orders o ${whereSql}
      ORDER BY (o.status IN ('EN_ATTENTE')) DESC, o.created_at DESC, o.id DESC
      LIMIT ? OFFSET ?`, [...params, limit, offset]);
  return {
    items: rows.map((o) => ({
      id: o.id, orderNumber: o.order_number, customerName: o.customer_name, customerPhone: o.customer_phone,
      status: o.status, paymentStatus: o.payment_status, total: Number(o.total_amount), currency: o.currency,
      createdAt: o.created_at, itemCount: Number(o.item_count), isNew: Number(o.unread) > 0, isUpdated: Number(o.updates) > 0,
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
  const { shop_name: shopName } = await settings.getAll();
  await ensureTrackingCode(o);
  // Ouvrir la commande = notification lue.
  await pool.query('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE order_id = ? AND is_read = 0', [id]);
  return {
    id: o.id, orderNumber: o.order_number, trackingCode: o.tracking_code, hasAccount: o.customer_id != null,
    status: o.status, paymentStatus: o.payment_status, paidAt: o.paid_at,
    paidBy: o.paid_by_name, paymentNote: o.payment_note, customerName: o.customer_name, customerPhone: o.customer_phone,
    customerGender: o.customer_gender, deliveryAddress: o.delivery_address, city: o.city, comment: o.customer_comment,
    latitude: o.latitude == null ? null : Number(o.latitude), longitude: o.longitude == null ? null : Number(o.longitude),
    locationLabel: o.location_label,
    mapsUrl: o.latitude == null ? null : `https://www.google.com/maps?q=${Number(o.latitude)},${Number(o.longitude)}`,
    currency: o.currency, total: Number(o.total_amount), subtotal: Number(o.subtotal_amount), deliveryFee: Number(o.delivery_fee),
    deliveryRequested: !!o.delivery_requested, deliveryFeeAccepted: !!o.delivery_fee_accepted, deliveryFeeStatus: o.delivery_fee_status,
    suggestedFee: config.delivery.suggestedFee, customerEditedAt: o.customer_edited_at,
    confirmation: { channel: o.confirmation_channel, sentAt: o.confirmation_sent_at, defaultMessage: notify.defaultConfirmationMessage(o, shopName) },
    createdAt: o.created_at, updatedAt: o.updated_at, stockRestored: !!o.stock_restored,
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

/** L'administrateur choisit WhatsApp ou SMS : on prépare le lien et on garde la trace de l'envoi. */
async function prepareConfirmation(orderId, channel, message, adminId) {
  const { shop_name: shopName } = await settings.getAll();
  const out = await withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    const o = rows[0];
    if (!o) throw notFound('Commande introuvable.');
    if (o.status === 'ANNULEE') throw conflict('Impossible de prévenir le client d\'une commande annulée.', undefined, 'INVALID_NOTIFY');
    await ensureTrackingCode(o);
    const text = message || notify.defaultConfirmationMessage(o, shopName);
    await conn.query('UPDATE orders SET confirmation_channel = ?, confirmation_sent_at = NOW(), confirmation_sent_by_user_id = ? WHERE id = ?', [channel, adminId, orderId]);
    await conn.query(
      `INSERT INTO order_status_history (order_id, event_type, changed_by_user_id, old_status, new_status, comment)
       VALUES (?, 'NOTIFY', ?, NULL, ?, 'Confirmation envoyée au client')`, [orderId, adminId, channel]);
    return { channel, message: text, url: notify.buildLink(channel, o.customer_phone, text) };
  });
  return out;
}

/** L'administrateur fixe les frais de livraison (1000 ou tout autre montant, 0 = offerts). */
async function setDeliveryFee(orderId, fee, adminId) {
  await withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT id, status, subtotal_amount, delivery_fee, delivery_fee_status FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    const o = rows[0];
    if (!o) throw notFound('Commande introuvable.');
    if (o.status === 'TERMINEE' || o.status === 'ANNULEE') throw conflict('Les frais ne sont plus modifiables pour cette commande.', undefined, 'INVALID_FEE');
    const total = toCents(o.subtotal_amount) + toCents(fee);
    await conn.query("UPDATE orders SET delivery_fee = ?, delivery_fee_status = 'SET', delivery_requested = 1, total_amount = ? WHERE id = ?",
      [fromCents(toCents(fee)), fromCents(total), orderId]);
    await conn.query(
      `INSERT INTO order_status_history (order_id, event_type, changed_by_user_id, old_status, new_status, comment)
       VALUES (?, 'FEE', ?, ?, ?, 'Frais de livraison fixés par la boutique')`,
      [orderId, adminId, o.delivery_fee_status === 'SET' ? String(Number(o.delivery_fee)) : '—', String(fee)]);
  });
  return getOrder(orderId);
}

const FIELD_LABELS = {
  customerName: 'nom', customerGender: 'civilité', deliveryAddress: 'adresse', comment: 'message', deliveryRequested: 'livraison',
  deliveryFeeAccepted: 'frais de livraison', location: 'position sur la carte',
};

/** Modification par le client (numéro + téléphone) ; toute modification notifie l'administrateur. */
async function editByCustomer(access, changes) {
  const orderId = (await resolveAccess(access)).id;

  await withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    const o = rows[0];
    if (!EDITABLE_STATUSES.includes(o.status)) throw conflict('Cette commande est déjà en préparation ou terminée : contactez la boutique pour la modifier.', undefined, 'NOT_EDITABLE');

    const set = {}; const changed = new Set();
    const apply = (field, column, value, label = field) => {
      const current = o[column];
      const norm = (v) => (v == null ? null : typeof v === 'number' ? Number(v) : v);
      if (norm(current) !== norm(value)) { set[column] = value; changed.add(FIELD_LABELS[label]); }
    };
    if (changes.customerName !== undefined) apply('customerName', 'customer_name', changes.customerName);
    if (changes.customerGender !== undefined) apply('customerGender', 'customer_gender', changes.customerGender);
    if (changes.comment !== undefined) apply('comment', 'customer_comment', changes.comment || null);
    if (changes.deliveryAddress !== undefined) apply('deliveryAddress', 'delivery_address', changes.deliveryAddress || 'Retrait sur place');
    if (changes.latitude !== undefined || changes.longitude !== undefined || changes.locationLabel !== undefined) {
      const lat = changes.latitude === undefined ? (o.latitude == null ? null : Number(o.latitude)) : changes.latitude;
      const lng = changes.longitude === undefined ? (o.longitude == null ? null : Number(o.longitude)) : changes.longitude;
      if ((lat === null) !== (lng === null)) throw badRequest('Position incomplète.');
      const label = changes.locationLabel === undefined ? o.location_label : changes.locationLabel;
      const before = [o.latitude == null ? null : Number(o.latitude), o.longitude == null ? null : Number(o.longitude), o.location_label];
      if (before[0] !== lat || before[1] !== lng || before[2] !== label) { set.latitude = lat; set.longitude = lng; set.location_label = label; changed.add(FIELD_LABELS.location); }
    }
    const requested = changes.deliveryRequested === undefined ? !!o.delivery_requested : changes.deliveryRequested;
    const accepted = changes.deliveryFeeAccepted === undefined ? !!o.delivery_fee_accepted : changes.deliveryFeeAccepted;
    const addressAfter = set.delivery_address ?? o.delivery_address;
    if (requested && (!addressAfter || addressAfter === 'Retrait sur place' || addressAfter.length < 5)) throw badRequest('Indiquez votre adresse ou quartier pour la livraison.');
    if (requested !== !!o.delivery_requested) { set.delivery_requested = requested ? 1 : 0; changed.add(FIELD_LABELS.deliveryRequested); }
    if (accepted !== !!o.delivery_fee_accepted) { set.delivery_fee_accepted = accepted ? 1 : 0; changed.add(FIELD_LABELS.deliveryFeeAccepted); }
    if (!requested && o.delivery_fee_status !== 'NONE') {
      // Livraison annulée : plus de frais.
      set.delivery_fee_status = 'NONE'; set.delivery_fee = '0.00'; set.total_amount = o.subtotal_amount;
    } else if (requested && accepted && o.delivery_fee_status === 'NONE') set.delivery_fee_status = 'PENDING';
    else if (requested && !accepted && o.delivery_fee_status === 'PENDING') set.delivery_fee_status = 'NONE';

    if (!changed.size) return;
    set.customer_edited_at = new Date();
    const cols = Object.keys(set);
    await conn.query(`UPDATE orders SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => set[c]), orderId]);
    const list = [...changed].join(', ');
    await conn.query(
      `INSERT INTO order_status_history (order_id, event_type, changed_by_user_id, old_status, new_status, comment)
       VALUES (?, 'EDIT', NULL, NULL, 'MODIFIEE', ?)`, [orderId, `Modifié par le client : ${list}`]);
    await conn.query("INSERT INTO notifications (type, title, body, order_id) VALUES ('ORDER_UPDATED', ?, ?, ?)",
      [`Commande ${o.order_number} modifiée par le client`, `${o.customer_name} a modifié : ${list}`, orderId]);
  });
  const [[fresh]] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  return formatTracked(fresh);
}


const ADMIN_LABELS = {
  customerName: 'nom', customerGender: 'civilité', customerPhone: 'téléphone', deliveryAddress: 'adresse', comment: 'message',
  deliveryRequested: 'livraison', deliveryFeeAccepted: 'frais de livraison', location: 'position', items: 'articles',
};
const ITEMS_EDITABLE = ['EN_ATTENTE', 'CONFIRMEE', 'EN_PREPARATION'];

/**
 * Modification complète d'une commande par la boutique (admin, gérant, gestionnaire de commandes) :
 * coordonnées, téléphone, livraison et articles. Une seule transaction : stock, lignes, totaux et historique restent cohérents.
 */
async function adminEditOrder(orderId, payload, adminId, adminName) {
  await withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    const o = rows[0];
    if (!o) throw notFound('Commande introuvable.');
    const set = {}; const changed = new Set();
    const norm = (v) => (v == null ? null : typeof v === 'number' ? Number(v) : v);
    const apply = (column, value, label) => { if (norm(o[column]) !== norm(value)) { set[column] = value; changed.add(ADMIN_LABELS[label]); } };

    const d = payload.details;
    if (d) {
      if (d.customerName !== undefined) apply('customer_name', d.customerName, 'customerName');
      if (d.customerGender !== undefined) apply('customer_gender', d.customerGender, 'customerGender');
      if (d.comment !== undefined) apply('customer_comment', d.comment || null, 'comment');
      if (d.customerPhone !== undefined && d.customerPhone !== o.customer_phone) {
        set.customer_phone = d.customerPhone; set.customer_phone_digits = phoneDigits(d.customerPhone); changed.add(ADMIN_LABELS.customerPhone);
      }
      if (d.deliveryAddress !== undefined) apply('delivery_address', d.deliveryAddress || 'Retrait sur place', 'deliveryAddress');
      if (d.latitude !== undefined || d.longitude !== undefined || d.locationLabel !== undefined) {
        const lat = d.latitude === undefined ? (o.latitude == null ? null : Number(o.latitude)) : d.latitude;
        const lng = d.longitude === undefined ? (o.longitude == null ? null : Number(o.longitude)) : d.longitude;
        if ((lat === null) !== (lng === null)) throw badRequest('Position incomplète.');
        const label = d.locationLabel === undefined ? o.location_label : d.locationLabel;
        const before = [o.latitude == null ? null : Number(o.latitude), o.longitude == null ? null : Number(o.longitude), o.location_label];
        if (before[0] !== lat || before[1] !== lng || before[2] !== label) { set.latitude = lat; set.longitude = lng; set.location_label = label; changed.add(ADMIN_LABELS.location); }
      }
      const requested = d.deliveryRequested === undefined ? !!o.delivery_requested : d.deliveryRequested;
      const accepted = d.deliveryFeeAccepted === undefined ? !!o.delivery_fee_accepted : d.deliveryFeeAccepted;
      const addressAfter = set.delivery_address ?? o.delivery_address;
      if (requested && (!addressAfter || addressAfter === 'Retrait sur place' || addressAfter.length < 5)) throw badRequest('Indiquez une adresse ou un quartier pour la livraison.');
      if (requested !== !!o.delivery_requested) { set.delivery_requested = requested ? 1 : 0; changed.add(ADMIN_LABELS.deliveryRequested); }
      if (accepted !== !!o.delivery_fee_accepted) { set.delivery_fee_accepted = accepted ? 1 : 0; changed.add(ADMIN_LABELS.deliveryFeeAccepted); }
      if (!requested && o.delivery_fee_status !== 'NONE') { set.delivery_fee_status = 'NONE'; set.delivery_fee = '0.00'; }
      else if (requested && accepted && o.delivery_fee_status === 'NONE') set.delivery_fee_status = 'PENDING';
      else if (requested && !accepted && o.delivery_fee_status === 'PENDING') set.delivery_fee_status = 'NONE';
    }

    let subtotalCents = toCents(o.subtotal_amount);
    if (payload.items) {
      if (!ITEMS_EDITABLE.includes(o.status)) throw conflict('Les articles ne sont plus modifiables : la commande est terminée ou annulée.', undefined, 'NOT_EDITABLE');
      const [lines] = await conn.query('SELECT * FROM order_items WHERE order_id = ? ORDER BY id FOR UPDATE', [orderId]);
      const byLine = new Map(lines.map((l) => [l.id, l]));
      const kept = new Set(); const plan = []; const delta = new Map(); const newIds = new Set(); const keptVariants = new Set();
      const take = (variantId, n) => delta.set(variantId, (delta.get(variantId) || 0) + n);

      for (const it of payload.items) {
        if (it.lineId) {
          const l = byLine.get(it.lineId);
          if (!l) throw badRequest('Ligne de commande inconnue.');
          if (kept.has(l.id)) throw badRequest('Ligne en double.');
          kept.add(l.id);
          const unit = it.unitPrice !== undefined ? toCents(it.unitPrice) : toCents(l.unit_price);
          if (l.product_variant_id) { take(l.product_variant_id, it.quantity - l.quantity); keptVariants.add(l.product_variant_id); }
          else if (it.quantity !== l.quantity) throw badRequest('Cet article a été retiré du catalogue : sa quantité ne peut plus être modifiée.');
          plan.push({ kind: 'update', line: l, qty: it.quantity, unit, changed: it.quantity !== l.quantity || unit !== toCents(l.unit_price) });
        } else {
          if (newIds.has(it.variantId) || keptVariants.has(it.variantId)) throw badRequest('Cet article est déjà dans la commande : modifiez sa quantité.');
          newIds.add(it.variantId); take(it.variantId, it.quantity);
          plan.push({ kind: 'add', variantId: it.variantId, qty: it.quantity, unitInput: it.unitPrice });
        }
      }
      for (const l of lines) {
        if (kept.has(l.id)) continue;
        plan.push({ kind: 'remove', line: l });
        if (l.product_variant_id) take(l.product_variant_id, -l.quantity);
      }
      // Variantes verrouillées dans un ordre stable (pas d'interblocage).
      const ids = [...delta.keys()].sort((a, b) => a - b);
      const variants = new Map();
      if (ids.length) {
        const [vrows] = await conn.query(
          `SELECT v.id, v.sku, v.attributes_json, v.price, v.stock_quantity, v.is_active AS v_active, p.name, p.is_active AS p_active,
                  (SELECT image_url FROM product_images i WHERE i.product_id = p.id ORDER BY i.position, i.id LIMIT 1) AS image_url
             FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id IN (?) ORDER BY v.id FOR UPDATE`, [ids]);
        vrows.forEach((v) => variants.set(v.id, v));
      }
      const problems = [];
      for (const [vid, n] of delta) {
        const v = variants.get(vid);
        if (!v) { problems.push({ variantId: vid, reason: 'UNAVAILABLE', message: 'Article introuvable.' }); continue; }
        if (n > 0 && (!v.v_active || !v.p_active)) problems.push({ variantId: vid, reason: 'UNAVAILABLE', message: `« ${v.name} » n'est plus disponible.` });
        else if (n > 0 && v.stock_quantity < n) problems.push({ variantId: vid, reason: 'INSUFFICIENT_STOCK', message: `Stock insuffisant pour « ${v.name} » (disponible : ${v.stock_quantity}).`, available: Number(v.stock_quantity) });
      }
      if (problems.length) throw conflict('Modification impossible : ' + problems.map((p) => p.message).join(' '), problems, 'STOCK_CHANGED');

      let itemsChanged = false;
      subtotalCents = 0;
      for (const step of plan) {
        if (step.kind === 'remove') {
          await conn.query('DELETE FROM order_items WHERE id = ?', [step.line.id]); itemsChanged = true;
        } else if (step.kind === 'update') {
          subtotalCents += step.unit * step.qty;
          if (step.changed) {
            await conn.query('UPDATE order_items SET quantity = ?, unit_price = ?, line_total = ? WHERE id = ?', [step.qty, fromCents(step.unit), fromCents(step.unit * step.qty), step.line.id]);
            itemsChanged = true;
          }
        } else {
          const v = variants.get(step.variantId);
          const unit = step.unitInput !== undefined ? toCents(step.unitInput) : toCents(v.price);
          subtotalCents += unit * step.qty;
          await conn.query(
            `INSERT INTO order_items (order_id, product_variant_id, product_name_snapshot, sku_snapshot, variant_snapshot, image_snapshot, quantity, unit_price, line_total)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [orderId, v.id, v.name, v.sku, JSON.stringify(parseJson(v.attributes_json)), v.image_url, step.qty, fromCents(unit), fromCents(unit * step.qty)]);
          itemsChanged = true;
        }
      }
      for (const [vid, n] of delta) {
        if (n === 0) continue;
        const v = variants.get(vid);
        await conn.query('UPDATE product_variants SET stock_quantity = stock_quantity - ? WHERE id = ?', [n, vid]);
        await conn.query(
          `INSERT INTO stock_movements (product_variant_id, order_id, movement_type, quantity_before, quantity_after, quantity_delta, reason, created_by_user_id)
           VALUES (?, ?, 'ADJUSTMENT', ?, ?, ?, ?, ?)`, [vid, orderId, v.stock_quantity, v.stock_quantity - n, -n, `Modification ${o.order_number}`, adminId]);
      }
      if (itemsChanged) { changed.add(ADMIN_LABELS.items); set.subtotal_amount = fromCents(subtotalCents); }
    }

    if (!changed.size) return;
    const feeStatus = set.delivery_fee_status ?? o.delivery_fee_status;
    const feeCents = feeStatus === 'SET' ? toCents(set.delivery_fee ?? o.delivery_fee) : 0;
    const newTotal = fromCents(subtotalCents + feeCents);
    const totalChanged = Number(newTotal) !== Number(o.total_amount);
    if (totalChanged) set.total_amount = newTotal;
    const cols = Object.keys(set);
    await conn.query(`UPDATE orders SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => set[c]), orderId]);
    const note = `Modifié par ${adminName} : ${[...changed].join(', ')}${totalChanged && o.payment_status === 'PAYE' ? ' (commande déjà payée : total modifié)' : ''}`;
    await conn.query(
      `INSERT INTO order_status_history (order_id, event_type, changed_by_user_id, old_status, new_status, comment)
       VALUES (?, 'EDIT', ?, NULL, 'MODIFIEE', ?)`, [orderId, adminId, note.slice(0, 255)]);
  });
  return getOrder(orderId);
}

/** Recherche d'articles à ajouter à une commande (réservée à ceux qui peuvent modifier les commandes). */
async function searchSellableVariants(q) {
  const like = `%${String(q || '').slice(0, 60)}%`;
  const [rows] = await pool.query(
    `SELECT v.id, v.sku, v.attributes_json, v.price, v.stock_quantity, p.name
       FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE v.is_active = 1 AND p.is_active = 1 AND (p.name LIKE ? OR v.sku LIKE ?)
      ORDER BY p.name, v.position, v.id LIMIT 30`, [like, like]);
  return rows.map((v) => ({ variantId: v.id, productName: v.name, sku: v.sku, attributes: parseJson(v.attributes_json), price: Number(v.price), stock: Number(v.stock_quantity) }));
}

module.exports = { resolveAccess, ensureTrackingCode, formatTracked, ACCESS_DENIED, adminEditOrder, searchSellableVariants, editByCustomer, prepareConfirmation, setDeliveryFee, createOrder, trackOrder, listOrders, getOrder, changeStatus, setPayment, TRANSITIONS, TODO_STATUSES };
