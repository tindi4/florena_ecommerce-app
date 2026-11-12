'use strict';
const config = require('../config/env');
const catalog = require('../services/catalogService');
const orders = require('../services/orderService');
const inbox = require('../services/inboxService');
const invoices = require('../services/invoiceService');
const s = require('../validators/schemas');
const { asyncHandler } = require('../utils/helpers');

const settingsService = require('../services/settingsService');

exports.settings = asyncHandler(async (req, res) => res.json({
  ...(await settingsService.getPublic()),   // shopName, primaryColor, logoUrl (réglés dans l'administration)
  currency: config.shop.currency, delivery: config.delivery, shopWhatsapp: config.shop.whatsapp,
}));
exports.categories = asyncHandler(async (req, res) => res.json({ items: await catalog.listCategories() }));
exports.products = asyncHandler(async (req, res) => res.json(await catalog.listProducts(req.query)));
exports.product = asyncHandler(async (req, res) => res.json(await catalog.getProductBySlug(String(req.params.slug))));
exports.cartCheck = asyncHandler(async (req, res) => {
  const { items } = s.cartCheck.parse(req.body);
  res.json({ items: await catalog.checkCart(items) });
});
exports.createOrder = asyncHandler(async (req, res) => {
  const input = s.createOrder.parse(req.body);
  const result = await orders.createOrder(input, req.get('idempotency-key'), req.customer ? req.customer.id : null);
  res.status(result.duplicate ? 200 : 201).json(result);
});
exports.trackOrder = asyncHandler(async (req, res) => {
  res.json(await orders.trackOrder(s.trackOrder.parse(req.body)));
});
exports.contact = asyncHandler(async (req, res) => {
  const input = s.contactMessage.parse(req.body);
  await inbox.createMessage(input);
  res.status(201).json({ ok: true });
});
exports.invoice = asyncHandler(async (req, res) => {
  const { buffer, filename } = await invoices.forCustomer(s.trackOrder.parse(req.body));
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' }).send(buffer);
});
exports.editOrder = asyncHandler(async (req, res) => {
  const { access, changes } = s.customerEdit.parse(req.body);
  res.json(await orders.editByCustomer(access, changes));
});
