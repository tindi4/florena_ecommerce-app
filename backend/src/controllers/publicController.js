'use strict';
const config = require('../config/env');
const catalog = require('../services/catalogService');
const orders = require('../services/orderService');
const inbox = require('../services/inboxService');
const s = require('../validators/schemas');
const { asyncHandler } = require('../utils/helpers');

exports.settings = (req, res) => res.json({ shopName: config.shop.name, currency: config.shop.currency });
exports.categories = asyncHandler(async (req, res) => res.json({ items: await catalog.listCategories() }));
exports.products = asyncHandler(async (req, res) => res.json(await catalog.listProducts(req.query)));
exports.product = asyncHandler(async (req, res) => res.json(await catalog.getProductBySlug(String(req.params.slug))));
exports.cartCheck = asyncHandler(async (req, res) => {
  const { items } = s.cartCheck.parse(req.body);
  res.json({ items: await catalog.checkCart(items) });
});
exports.createOrder = asyncHandler(async (req, res) => {
  const input = s.createOrder.parse(req.body);
  const result = await orders.createOrder(input, req.get('idempotency-key'));
  res.status(result.duplicate ? 200 : 201).json(result);
});
exports.trackOrder = asyncHandler(async (req, res) => {
  const { orderNumber, phone } = s.trackOrder.parse(req.body);
  res.json(await orders.trackOrder(orderNumber, phone));
});
exports.contact = asyncHandler(async (req, res) => {
  const input = s.contactMessage.parse(req.body);
  await inbox.createMessage(input);
  res.status(201).json({ ok: true });
});
