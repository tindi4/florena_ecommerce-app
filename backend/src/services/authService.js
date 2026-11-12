'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/env');
const { pool } = require('../config/db');
const { unauthorized } = require('../utils/errors');
const { STAFF_ROLES } = require('../config/permissions');

// Hash factice pour garder un temps de réponse constant si l'e-mail n'existe pas.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

async function login(email, password) {
  const [rows] = await pool.query(
    'SELECT u.id, u.name, u.email, u.password_hash, u.role, u.role_id, u.is_active, r.name AS role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.email = ?',
    [email]);
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok || !user.is_active || !STAFF_ROLES.includes(user.role)) {
    throw unauthorized('E-mail ou mot de passe incorrect.');
  }
  const csrf = crypto.randomBytes(24).toString('hex');
  const token = jwt.sign({ sub: user.id, role: user.role, csrf }, config.jwtSecret, {
    algorithm: 'HS256',
    audience: 'staff',
    expiresIn: `${config.jwtTtlHours}h`,
  });
  const { staffProfile } = require('../middleware/auth');   // require ici : évite une dépendance circulaire
  return { token, csrfToken: csrf, user: await staffProfile(user) };
}

const hashPassword = (password) => bcrypt.hash(password, 12);

module.exports = { login, hashPassword };
