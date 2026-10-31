'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/env');
const { pool } = require('../config/db');
const { unauthorized } = require('../utils/errors');

// Hash factice pour garder un temps de réponse constant si l'e-mail n'existe pas.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

async function login(email, password) {
  const [rows] = await pool.query('SELECT id, name, email, password_hash, role, is_active FROM users WHERE email = ?', [email]);
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok || !user.is_active || user.role !== 'ADMIN') {
    throw unauthorized('E-mail ou mot de passe incorrect.');
  }
  const csrf = crypto.randomBytes(24).toString('hex');
  const token = jwt.sign({ sub: user.id, role: user.role, csrf }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: `${config.jwtTtlHours}h`,
  });
  return { token, csrfToken: csrf, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}

const hashPassword = (password) => bcrypt.hash(password, 12);

module.exports = { login, hashPassword };
