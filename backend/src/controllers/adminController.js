'use strict';
const orders = require('../services/orderService');
const inbox = require('../services/inboxService');
const catalog = require('../services/adminCatalogService');
const invoices = require('../services/invoiceService');
const stats = require('../services/statsService');
const users = require('../services/userService');
const settings = require('../services/settingsService');
const roles = require('../services/roleService');
const s = require('../validators/schemas');
const { asyncHandler } = require('../utils/helpers');
const { badRequest, forbidden } = require('../utils/errors');

const idParam = (req) => s.id.parse(req.params.id);
const wrap = asyncHandler;

exports.dashboard = wrap(async (req, res) => res.json(await inbox.dashboard()));
exports.counters = wrap(async (req, res) => res.json(await inbox.counters()));

exports.listOrders = wrap(async (req, res) => res.json(await orders.listOrders(req.query)));
exports.getOrder = wrap(async (req, res) => res.json(await orders.getOrder(idParam(req))));
exports.changeStatus = wrap(async (req, res) => {
  const { status, comment } = s.orderStatus.parse(req.body);
  // Annuler et faire avancer une commande sont deux droits distincts.
  const needed = status === 'ANNULEE' ? 'orders.cancel' : 'orders.status';
  if (!req.user.permissions.includes(needed)) {
    throw forbidden(status === 'ANNULEE' ? 'Votre rôle ne permet pas d\'annuler une commande.' : 'Votre rôle ne permet pas de changer le statut d\'une commande.');
  }
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

exports.notifyCustomer = wrap(async (req, res) => {
  const { channel, message } = s.notifyCustomer.parse(req.body);
  res.json(await orders.prepareConfirmation(idParam(req), channel, message, req.user.id));
});
exports.setDeliveryFee = wrap(async (req, res) => {
  const { fee } = s.deliveryFeeUpdate.parse(req.body);
  res.json(await orders.setDeliveryFee(idParam(req), fee, req.user.id));
});
exports.invoice = wrap(async (req, res) => {
  const { buffer, filename } = await invoices.forAdmin(idParam(req));
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename}"`, 'Cache-Control': 'no-store' }).send(buffer);
});
exports.stats = wrap(async (req, res) => res.json(await stats.getStats(s.statsQuery.parse(req.query))));

exports.listUsers = wrap(async (req, res) => res.json(await users.listStaff()));
exports.createUser = wrap(async (req, res) => res.status(201).json(await users.createStaff(s.staffUser.parse(req.body), req.user)));
exports.updateUser = wrap(async (req, res) => res.json(await users.updateStaff(idParam(req), s.staffUserUpdate.parse(req.body), req.user)));
exports.resetUserPassword = wrap(async (req, res) => res.json(await users.resetPassword(idParam(req), s.passwordReset.parse(req.body).password, req.user)));

exports.listRoles = wrap(async (req, res) => res.json(await roles.listRoles()));
exports.createRole = wrap(async (req, res) => res.status(201).json(await roles.createRole(s.roleInput.parse(req.body), req.user)));
exports.updateRole = wrap(async (req, res) => res.json(await roles.updateRole(idParam(req), s.roleUpdate.parse(req.body), req.user)));
exports.deleteRole = wrap(async (req, res) => res.json(await roles.deleteRole(idParam(req), req.user)));

exports.editOrder = wrap(async (req, res) => {
  res.json(await orders.adminEditOrder(idParam(req), s.adminOrderEdit.parse(req.body), req.user.id, req.user.name));
});
exports.searchVariants = wrap(async (req, res) => res.json({ items: await orders.searchSellableVariants(req.query.search) }));

/* Réglages de la boutique (nom, couleur principale, logo) */
exports.getSettings = wrap(async (req, res) => res.json(await settings.getPublic()));
exports.updateSettings = wrap(async (req, res) => res.json(await settings.update(s.shopSettings.parse(req.body), req.user.id)));
exports.uploadLogo = wrap(async (req, res) => res.json(await settings.setLogo(req.file, req.user.id)));
exports.deleteLogo = wrap(async (req, res) => res.json(await settings.removeLogo(req.user.id)));
