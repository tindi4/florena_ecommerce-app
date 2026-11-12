'use strict';
const { pool } = require('../config/db');
const config = require('../config/env');
const { badRequest } = require('../utils/errors');

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (dateStr, n) => { const d = new Date(`${dateStr}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const day = (v) => (v instanceof Date ? iso(v) : String(v).slice(0, 10));

/**
 * Suivi financier.
 * - Chiffre d'affaires = commandes non annulées, au jour de la commande (livraison incluse).
 * - Encaissé (caisse) = commandes marquées « payées », au jour du paiement.
 */
async function getStats({ from, to, all }) {
  const end = to || iso(new Date());
  let start = from || addDays(end, -29);
  if (all) {
    // « Toute la période » : depuis la toute première commande (aucune limite de durée).
    const [[first]] = await pool.query('SELECT MIN(created_at) AS d FROM orders');
    start = first && first.d ? day(first.d) : end;
    if (start > end) start = end;
  }
  if (start > end) throw badRequest('La date de début doit précéder la date de fin.');
  if (!all && addDays(start, 366) < end) throw badRequest('Période maximale : 366 jours.');
  const endExclusive = addDays(end, 1);

  const [revRows] = await pool.query(
    `SELECT DATE(created_at) AS d, COUNT(*) AS orders, SUM(total_amount) AS revenue, SUM(subtotal_amount) AS goods, SUM(delivery_fee) AS delivery
       FROM orders WHERE status <> 'ANNULEE' AND created_at >= ? AND created_at < ? GROUP BY DATE(created_at)`, [start, endExclusive]);
  const [cashRows] = await pool.query(
    `SELECT DATE(paid_at) AS d, COUNT(*) AS n, SUM(total_amount) AS cash
       FROM orders WHERE payment_status = 'PAYE' AND status <> 'ANNULEE' AND paid_at >= ? AND paid_at < ? GROUP BY DATE(paid_at)`, [start, endExclusive]);
  const rev = new Map(revRows.map((r) => [day(r.d), r]));
  const cash = new Map(cashRows.map((r) => [day(r.d), r]));

  const daily = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const r = rev.get(d); const c = cash.get(d);
    daily.push({
      date: d, orders: r ? Number(r.orders) : 0, revenue: r ? Number(r.revenue) : 0,
      goods: r ? Number(r.goods) : 0, delivery: r ? Number(r.delivery) : 0,
      paidOrders: c ? Number(c.n) : 0, cash: c ? Number(c.cash) : 0,
    });
  }
  const sum = (k) => daily.reduce((s, x) => s + x[k], 0);
  const orders = sum('orders'); const revenue = sum('revenue');

  const [[unpaid]] = await pool.query(
    "SELECT COUNT(*) AS n, COALESCE(SUM(total_amount),0) AS amount FROM orders WHERE payment_status = 'NON_PAYE' AND status <> 'ANNULEE'");
  const [[cancelled]] = await pool.query(
    "SELECT COUNT(*) AS n, COALESCE(SUM(total_amount),0) AS amount FROM orders WHERE status = 'ANNULEE' AND created_at >= ? AND created_at < ?", [start, endExclusive]);

  const [top] = await pool.query(
    `SELECT oi.product_name_snapshot AS name, SUM(oi.quantity) AS qty, SUM(oi.line_total) AS revenue
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.status <> 'ANNULEE' AND o.created_at >= ? AND o.created_at < ?
      GROUP BY oi.product_name_snapshot ORDER BY qty DESC, revenue DESC LIMIT 10`, [start, endExclusive]);

  const [[today]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM orders WHERE status <> 'ANNULEE' AND DATE(created_at) = CURDATE()) AS orders,
       (SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE status <> 'ANNULEE' AND DATE(created_at) = CURDATE()) AS revenue,
       (SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE payment_status = 'PAYE' AND status <> 'ANNULEE' AND DATE(paid_at) = CURDATE()) AS cash`);

  return {
    currency: config.shop.currency, range: { from: start, to: end },
    today: { orders: Number(today.orders), revenue: Number(today.revenue), cash: Number(today.cash) },
    totals: {
      orders, revenue, cash: sum('cash'), goods: sum('goods'), delivery: sum('delivery'),
      averageBasket: orders ? Math.round((revenue / orders) * 100) / 100 : 0,
      unpaidCount: Number(unpaid.n), unpaidAmount: Number(unpaid.amount),
      cancelledCount: Number(cancelled.n), cancelledAmount: Number(cancelled.amount),
    },
    daily,
    topProducts: top.map((t) => ({ name: t.name, quantity: Number(t.qty), revenue: Number(t.revenue) })),
  };
}

module.exports = { getStats };
