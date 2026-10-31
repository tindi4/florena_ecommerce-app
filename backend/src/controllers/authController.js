'use strict';
const auth = require('../services/authService');
const s = require('../validators/schemas');
const { asyncHandler } = require('../utils/helpers');
const { COOKIE_NAME, cookieOptions } = require('../middleware/auth');

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = s.login.parse(req.body);
  const { token, csrfToken, user } = await auth.login(email, password);
  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.json({ user, csrfToken });
});
exports.logout = (req, res) => {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(COOKIE_NAME, opts);
  res.json({ ok: true });
};
exports.me = (req, res) => res.json({ user: req.user, csrfToken: req.csrfToken });
