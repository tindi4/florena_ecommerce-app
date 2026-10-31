'use strict';
const { pool, withTransaction } = require('../config/db');
const { notFound } = require('../utils/errors');
const { paginate } = require('../utils/helpers');
const { TODO_STATUSES } = require('./orderService');

/* Messages clients */
async function createMessage(input) {
  return withTransaction(async (conn) => {
    const [res] = await conn.query(
      'INSERT INTO customer_messages (name, phone, email, order_number, message) VALUES (?, ?, ?, ?, ?)',
      [input.name, input.phone || null, input.email || null, input.orderNumber || null, input.message]);
    const preview = input.message.length > 120 ? `${input.message.slice(0, 117)}…` : input.message;
    await conn.query(
      "INSERT INTO notifications (type, title, body, message_id) VALUES ('NEW_MESSAGE', ?, ?, ?)",
      [`Nouveau message de ${input.name}`, preview, res.insertId]);
    return { id: res.insertId };
  });
}

async function listMessages(q) {
  const { page, limit, offset } = paginate(q, 20, 100);
  const where = []; const params = [];
  if (q.status === 'NOUVEAU' || q.status === 'TRAITE') { where.push('m.status = ?'); params.push(q.status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM customer_messages m ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT m.*, u.name AS handled_by FROM customer_messages m LEFT JOIN users u ON u.id = m.handled_by_user_id
      ${whereSql} ORDER BY m.status = 'NOUVEAU' DESC, m.created_at DESC, m.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  return {
    items: rows.map((m) => ({
      id: m.id, name: m.name, phone: m.phone, email: m.email, orderNumber: m.order_number, message: m.message,
      status: m.status, handledBy: m.handled_by, handledAt: m.handled_at, createdAt: m.created_at,
    })),
    page, limit, total: Number(total), totalPages: Math.max(1, Math.ceil(Number(total) / limit)),
  };
}

async function setMessageStatus(id, status, adminId) {
  const treated = status === 'TRAITE';
  const [res] = await pool.query(
    'UPDATE customer_messages SET status = ?, handled_by_user_id = ?, handled_at = ? WHERE id = ?',
    [status, treated ? adminId : null, treated ? new Date() : null, id]);
  if (!res.affectedRows) throw notFound('Message introuvable.');
  await pool.query('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE message_id = ? AND is_read = 0', [id]);
  return { id, status };
}

/* Notifications */
async function listNotifications(q) {
  const { page, limit, offset } = paginate(q, 20, 100);
  const where = []; const params = [];
  if (q.filter === 'unread') where.push('n.is_read = 0');
  if (q.filter === 'read') where.push('n.is_read = 1');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM notifications n ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT n.* FROM notifications n ${whereSql} ORDER BY n.created_at DESC, n.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  return {
    items: rows.map((n) => ({
      id: n.id, type: n.type, title: n.title, body: n.body, orderId: n.order_id, messageId: n.message_id,
      isRead: !!n.is_read, createdAt: n.created_at,
    })),
    page, limit, total: Number(total), totalPages: Math.max(1, Math.ceil(Number(total) / limit)),
  };
}

async function counters() {
  const [[c]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM notifications WHERE is_read = 0) AS unread_notifications,
       (SELECT COUNT(*) FROM customer_messages WHERE status = 'NOUVEAU') AS new_messages,
       (SELECT COUNT(*) FROM orders WHERE status IN (?)) AS todo_orders,
       (SELECT COUNT(*) FROM orders WHERE payment_status = 'NON_PAYE' AND status <> 'ANNULEE') AS unpaid_orders`, [TODO_STATUSES]);
  return {
    unreadNotifications: Number(c.unread_notifications), newMessages: Number(c.new_messages),
    todoOrders: Number(c.todo_orders), unpaidOrders: Number(c.unpaid_orders),
  };
}

async function markRead(id) {
  const [res] = await pool.query('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ?', [id]);
  if (!res.affectedRows) throw notFound('Notification introuvable.');
  return { id, isRead: true };
}
async function markAllRead() {
  const [res] = await pool.query('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE is_read = 0');
  return { updated: res.affectedRows };
}

/* Tableau de bord */
async function dashboard() {
  const [statusRows] = await pool.query('SELECT status, COUNT(*) AS n FROM orders GROUP BY status');
  const by = Object.fromEntries(statusRows.map((r) => [r.status, Number(r.n)]));
  const [[stock]] = await pool.query(
    `SELECT COUNT(*) AS n FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE v.is_active = 1 AND p.is_active = 1 AND v.stock_quantity = 0`);
  const [latest] = await pool.query(
    `SELECT o.id, o.order_number, o.customer_name, o.status, o.payment_status, o.total_amount, o.currency, o.created_at
       FROM orders o ORDER BY o.created_at DESC, o.id DESC LIMIT 8`);
  return {
    counts: {
      enAttente: by.EN_ATTENTE || 0, confirmee: by.CONFIRMEE || 0, enPreparation: by.EN_PREPARATION || 0,
      terminee: by.TERMINEE || 0, annulee: by.ANNULEE || 0, outOfStock: Number(stock.n),
    },
    ...(await counters()),
    latestOrders: latest.map((o) => ({
      id: o.id, orderNumber: o.order_number, customerName: o.customer_name, status: o.status,
      paymentStatus: o.payment_status, total: Number(o.total_amount), currency: o.currency, createdAt: o.created_at,
    })),
  };
}

module.exports = { createMessage, listMessages, setMessageStatus, listNotifications, counters, markRead, markAllRead, dashboard };
