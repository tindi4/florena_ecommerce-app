'use strict';
const orders = require('../services/orderService');
const inbox = require('../services/inboxService');
const catalog = require('../services/adminCatalogService');
const s = require('../validators/schemas');
const { asyncHandler } = require('../utils/helpers');
const { badRequest } = require('../utils/errors');

const idParam = (req) => s.id.parse(req.params.id);
const wrap = asyncHandler;

exports.dashboard = wrap(async (req, res) => res.json(await inbox.dashboard()));
exports.counters = wrap(async (req, res) => res.json(await inbox.counters()));

exports.listOrders = wrap(async (req, res) => res.json(await orders.listOrders(req.query)));
exports.getOrder = wrap(async (req, res) => res.json(await orders.getOrder(idParam(req))));
exports.changeStatus = wrap(async (req, res) => {
  const { status, comment } = s.orderStatus.parse(req.body);
  res.json(await orders.changeStatus(idParam(req), status, comment, req.user.id));
});
exports.setPayment = wrap(async (req, res) => {
  const { paid, note } = s.orderPayment.parse(req.body);
  res.json(await orders.setPayment(idParam(req), paid, note, req.user.id));
});

exports.listNotifications = wrap(async (req, res) => res.json(await inbox.listNotifications(req.query)));
exports.markRead = wrap(async (req, res) => res.json(await inbox.markRead(idParam(req))));
exports.markAllRead = wrap(async (req, res) => res.json(await inbox.markAllRead()));
exports.listMessages = wrap(async (req, res) => res.json(await inbox.listMessages(req.query)));
exports.setMessageStatus = wrap(async (req, res) => {
  const { status } = s.messageStatus.parse(req.body);
  res.json(await inbox.setMessageStatus(idParam(req), status, req.user.id));
});

exports.listProducts = wrap(async (req, res) => res.json(await catalog.listProducts(req.query)));
exports.getProduct = wrap(async (req, res) => res.json(await catalog.getProduct(idParam(req))));
exports.createProduct = wrap(async (req, res) => {
  const out = await catalog.saveProduct(s.product.parse(req.body), null, req.user.id);
  res.status(201).json(await catalog.getProduct(out.id));
});
exports.updateProduct = wrap(async (req, res) => {
  const id = idParam(req);
  await catalog.saveProduct(s.product.parse(req.body), id, req.user.id);
  res.json(await catalog.getProduct(id));
});
exports.setProductActive = wrap(async (req, res) => res.json(await catalog.setProductActive(idParam(req), s.activeFlag.parse(req.body).isActive)));
exports.addImage = wrap(async (req, res) => {
  if (!req.file) throw badRequest('Aucun fichier reçu.');
  res.status(201).json(await catalog.addImage(idParam(req), req.file, req.body.alt));
});
exports.deleteImage = wrap(async (req, res) => res.json(await catalog.deleteImage(idParam(req))));

exports.listCategories = wrap(async (req, res) => res.json({ items: await catalog.listCategories() }));
exports.createCategory = wrap(async (req, res) => res.status(201).json(await catalog.saveCategory(s.category.parse(req.body))));
exports.updateCategory = wrap(async (req, res) => res.json(await catalog.saveCategory(s.category.parse(req.body), idParam(req))));
exports.setCategoryActive = wrap(async (req, res) => res.json(await catalog.setCategoryActive(idParam(req), s.activeFlag.parse(req.body).isActive)));

exports.listStock = wrap(async (req, res) => res.json(await catalog.listStock(req.query)));
exports.adjustStock = wrap(async (req, res) => {
  const { quantity, reason } = s.stockAdjust.parse(req.body);
  res.json(await catalog.adjustStock(idParam(req), quantity, reason, req.user.id));
});
exports.stockHistory = wrap(async (req, res) => res.json({ items: await catalog.stockHistory(idParam(req)) }));
