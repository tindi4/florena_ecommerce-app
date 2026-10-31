'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { pool } = require('../config/db');
const { unauthorized, forbidden } = require('../utils/errors');
const { asyncHandler } = require('../utils/helpers');

const COOKIE_NAME = 'admin_token';

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: config.cookieSameSite,
  maxAge: config.jwtTtlHours * 3600 * 1000,
  path: '/',
});

/** Vérifie le cookie JWT et recharge l'utilisateur en base à CHAQUE requête. */
const requireAdmin = asyncHandler(async (req, res, next) => {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch (_) {
    throw unauthorized('Session expirée. Veuillez vous reconnecter.');
  }
  const [rows] = await pool.query('SELECT id, name, email, role, is_active FROM users WHERE id = ?', [payload.sub]);
  const user = rows[0];
  if (!user || !user.is_active) throw unauthorized();
  if (user.role !== 'ADMIN') throw forbidden();
  req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  req.csrfToken = payload.csrf;
  next();
});

/** CSRF : le jeton (porté par le JWT) doit être renvoyé dans l'en-tête X-CSRF-Token. */
function csrfProtect(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const header = req.get('x-csrf-token');
  if (!header || !req.csrfToken || header !== req.csrfToken) {
    return next(forbidden('Jeton CSRF invalide.'));
  }
  return next();
}

module.exports = { requireAdmin, csrfProtect, COOKIE_NAME, cookieOptions };
