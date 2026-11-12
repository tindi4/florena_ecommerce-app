'use strict';
const PDFDocument = require('pdfkit');
const config = require('../config/env');
const { pool } = require('../config/db');
const { formatMoney } = require('../utils/money');
const { parseJson } = require('../utils/helpers');
const { notFound } = require('../utils/errors');
const settings = require('./settingsService');

const fmtDate = (d) => {
  const x = new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(x.getUTCDate())}/${p(x.getUTCMonth() + 1)}/${x.getUTCFullYear()} ${p(x.getUTCHours())}:${p(x.getUTCMinutes())}`;
};

async function loadOrder(where, params) {
  const [rows] = await pool.query(`SELECT * FROM orders WHERE ${where}`, params);
  const order = rows[0];
  if (!order) return null;
  const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [order.id]);
  return { order, items };
}

/** Facture pour le client : code complet, ou numéro + téléphone (même contrôle que le suivi). */
async function forCustomer(access) {
  const { resolveAccess } = require('./orderService');   // require ici : évite une dépendance circulaire au chargement
  const order = await resolveAccess(access);
  return render(await loadOrder('id = ?', [order.id]));
}
/** Facture d'une commande appartenant au compte client connecté. */
async function forAccount(customerId, orderNumber) {
  const data = await loadOrder('order_number = ? AND customer_id = ?', [orderNumber, customerId]);
  if (!data) throw notFound('Commande introuvable.');
  return render(data);
}
async function forAdmin(orderId) {
  const data = await loadOrder('id = ?', [orderId]);
  if (!data) throw notFound('Commande introuvable.');
  return render(data);
}

/** Nom, couleur et logo réglés dans l'administration (le logo n'apparaît que s'il est en PNG ou JPG). */
async function render(data) {
  const s = await settings.getAll();
  return draw(data, { name: s.shop_name, color: s.primary_color, logo: await settings.logoForPdf() });
}

function draw({ order, items }, shop) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `${order.order_number}`, Author: shop.name } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), filename: `${order.order_number}.pdf` }));
    doc.on('error', reject);

    const money = (v) => formatMoney(v, order.currency);
    const paid = order.payment_status === 'PAYE';
    const left = 48; const right = 547; const brand = shop.color; const muted = '#566372';

    // En-tête
    // Logo (PNG/JPG) dans un cadre de 150 x 48 points, sinon le nom de la boutique en couleur principale.
    let logoDrawn = false;
    if (shop.logo) {
      try { doc.image(shop.logo, left, 40, { fit: [150, 48] }); logoDrawn = true; } catch (_) { /* image illisible : on écrit le nom */ }
    }
    if (logoDrawn) doc.fillColor(brand).font('Helvetica-Bold').fontSize(11).text(shop.name, left, 92, { width: 260 });
    else doc.fillColor(brand).font('Helvetica-Bold').fontSize(22).text(shop.name, left, 48, { width: 260 });
    doc.fillColor(muted).font('Helvetica').fontSize(9);
    if (config.shop.address) doc.text(config.shop.address);
    if (config.shop.phone) doc.text(`Tél. ${config.shop.phone}`);
    const leftBottom = doc.y;
    doc.fillColor('#13202b').font('Helvetica-Bold').fontSize(18).text(paid ? 'FACTURE' : 'BON DE COMMANDE', left, 48, { width: right - left, align: 'right' });
    doc.font('Helvetica').fontSize(10).fillColor(muted)
      .text(`N° ${order.order_number}`, left, 74, { width: right - left, align: 'right' })
      .text(`Date : ${fmtDate(order.created_at)}`, { width: right - left, align: 'right' });
    const sepY = Math.max(112, leftBottom + 6, doc.y + 6);
    doc.moveTo(left, sepY).lineTo(right, sepY).strokeColor(brand).stroke();

    // Client
    doc.fillColor(muted).fontSize(9).text('CLIENT', left, sepY + 14);
    doc.fillColor('#13202b').fontSize(11).font('Helvetica-Bold').text(order.customer_name || 'Client', left, sepY + 28);
    doc.font('Helvetica').fontSize(10).text(order.customer_phone);
    doc.text(`${order.delivery_address}${order.city ? `, ${order.city}` : ''}`, { width: 300 });
    doc.fillColor(muted).text(order.delivery_requested ? 'Livraison demandée' : 'Retrait sur place');

    // Tableau des articles
    let y = Math.max(doc.y + 24, 230);
    const col = { name: left, qty: 330, unit: 380, total: 470 };
    const header = () => {
      doc.rect(left, y - 4, right - left, 22).fill('#eef1f4');
      doc.fillColor('#13202b').font('Helvetica-Bold').fontSize(9);
      doc.text('Article', col.name + 6, y + 2); doc.text('Qté', col.qty, y + 2, { width: 40, align: 'right' });
      doc.text('Prix unitaire', col.unit, y + 2, { width: 80, align: 'right' }); doc.text('Total', col.total, y + 2, { width: right - col.total - 6, align: 'right' });
      y += 26;
    };
    header();
    for (const it of items) {
      const attrs = Object.entries(parseJson(it.variant_snapshot)).map(([k, v]) => `${k} : ${v}`).join(' · ');
      const h = attrs ? 32 : 20;
      if (y + h > 740) { doc.addPage(); y = 60; header(); }
      doc.fillColor('#13202b').font('Helvetica').fontSize(10).text(it.product_name_snapshot, col.name + 6, y, { width: 270 });
      if (attrs) doc.fillColor(muted).fontSize(8.5).text(attrs, col.name + 6, y + 13, { width: 270 });
      doc.fillColor('#13202b').fontSize(10);
      doc.text(String(it.quantity), col.qty, y, { width: 40, align: 'right' });
      doc.text(money(it.unit_price), col.unit, y, { width: 80, align: 'right' });
      doc.text(money(it.line_total), col.total, y, { width: right - col.total - 6, align: 'right' });
      y += h;
      doc.moveTo(left, y - 4).lineTo(right, y - 4).strokeColor('#eef1f4').stroke();
    }

    // Totaux
    if (y > 680) { doc.addPage(); y = 60; }
    y += 10;
    const line = (label, value, bold) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10).fillColor('#13202b');
      doc.text(label, 330, y, { width: 130 }); doc.text(value, col.total, y, { width: right - col.total - 6, align: 'right' }); y += bold ? 22 : 18;
    };
    line('Sous-total', money(order.subtotal_amount));
    if (order.delivery_requested) line('Livraison', order.delivery_fee_status === 'SET' ? money(order.delivery_fee) : 'à confirmer');
    doc.moveTo(330, y).lineTo(right, y).strokeColor('#13202b').stroke(); y += 6;
    line('TOTAL', money(order.total_amount), true);

    y += 8;
    doc.roundedRect(left, y, right - left, 34, 6).fill(paid ? '#e1f4e8' : '#fdf0d8');
    doc.fillColor(paid ? '#135a31' : '#8a5300').font('Helvetica-Bold').fontSize(11)
      .text(paid ? `Payée${order.paid_at ? ` le ${fmtDate(order.paid_at).slice(0, 10)}` : ''} - Merci pour votre confiance.` : `Reste à régler : ${money(order.total_amount)}`, left + 12, y + 11);

    doc.fillColor(muted).font('Helvetica').fontSize(8)
      .text(`${shop.name} - Document généré le ${fmtDate(new Date())}`, left, 790, { width: right - left, align: 'center' });
    doc.end();
  });
}

module.exports = { forCustomer, forAccount, forAdmin };
