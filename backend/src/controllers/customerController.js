'use strict';
const customers = require('../services/customerService');
const invoices = require('../services/invoiceService');
const s = require('../validators/schemas');
const { asyncHandler } = require('../utils/helpers');
const { CUSTOMER_COOKIE, customerCookieOptions } = require('../middleware/customerAuth');

const startSession = (res, { token, csrfToken, customer }, status = 200) => {
  res.cookie(CUSTOMER_COOKIE, token, customerCookieOptions());
  res.status(status).json({ customer, csrfToken });
};

exports.register = asyncHandler(async (req, res) => startSession(res, await customers.register(s.customerRegister.parse(req.body)), 201));
exports.login = asyncHandler(async (req, res) => {
  const { identifier, password } = s.customerLogin.parse(req.body);
  startSession(res, await customers.login(identifier, password));
});
exports.logout = (req, res) => {
  const { maxAge, ...opts } = customerCookieOptions();
  res.clearCookie(CUSTOMER_COOKIE, opts);
  res.json({ ok: true });
};
exports.me = (req, res) => res.json({ customer: customers.publicCustomer(req.customer), csrfToken: req.csrfToken });

exports.orders = asyncHandler(async (req, res) => res.json(await customers.listOrders(req.customer.id)));
exports.order = asyncHandler(async (req, res) => res.json(await customers.getOrder(req.customer.id, String(req.params.number).toUpperCase().slice(0, 24))));
exports.invoice = asyncHandler(async (req, res) => {
  const { buffer, filename } = await invoices.forAccount(req.customer.id, String(req.params.number).toUpperCase().slice(0, 24));
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' }).send(buffer);
});
exports.claim = asyncHandler(async (req, res) => res.json(await customers.claimOrders(req.customer, s.claimOrders.parse(req.body).orders)));
exports.updateProfile = asyncHandler(async (req, res) => res.json({ customer: await customers.updateProfile(req.customer, s.customerProfile.parse(req.body)) }));
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = s.customerPasswordChange.parse(req.body);
  // Nouveau jeton : cette session reste ouverte, les autres appareils sont déconnectés.
  startSession(res, await customers.changePassword(req.customer, currentPassword, newPassword));
});
exports.preferences = asyncHandler(async (req, res) => res.json(await customers.setTheme(req.customer, s.customerPreferences.parse(req.body).theme)));
