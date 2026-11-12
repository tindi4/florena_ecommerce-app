'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { pool } = require('../config/db');
const { unauthorized, forbidden } = require('../utils/errors');
const { STAFF_ROLES } = require('../config/permissions');
const { permissionsFor } = require('../services/roleService');
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
    // audience « staff » : un jeton client (audience « customer ») recopié dans ce cookie est refusé.
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], audience: 'staff' });
  } catch (_) {
    throw unauthorized('Session expirée. Veuillez vous reconnecter.');
  }
  const [rows] = await pool.query(
    'SELECT u.id, u.name, u.email, u.role, u.role_id, u.is_active, r.name AS role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?',
    [payload.sub]);
  const user = rows[0];
  if (!user || !user.is_active) throw unauthorized();
  if (!STAFF_ROLES.includes(user.role)) throw forbidden();
  req.user = await staffProfile(user);
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

/**
 * Exige AU MOINS UNE des permissions données (relues en base à chaque requête : un changement de rôle
 * prend effet immédiatement, sans attendre la fin de la session).
 */
const requirePermission = (...permissions) => (req, res, next) =>
  (req.user && permissions.some((p) => req.user.permissions.includes(p))
    ? next()
    : next(forbidden('Votre rôle ne permet pas cette action.')));

/** Profil renvoyé au frontend et utilisé par les contrôles d'accès. */
async function staffProfile(user) {
  return {
    id: user.id, name: user.name, email: user.email, role: user.role, roleId: user.role_id, isMain: user.role === 'ADMIN',
    roleName: user.role === 'ADMIN' ? 'Administrateur principal' : user.role_name || 'Aucun rôle',
    permissions: await permissionsFor(user),
  };
}

module.exports = { requireAdmin, requirePermission, csrfProtect, staffProfile, COOKIE_NAME, cookieOptions };
