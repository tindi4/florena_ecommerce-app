'use strict';
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'boutique_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-123456';
process.env.COOKIE_SECURE = 'false';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const request = require('supertest');
const config = require('../src/config/env');
const app = require('../src/app');
const { pool } = require('../src/config/db');
const { hashPassword } = require('../src/services/authService');

const MIGRATIONS = fs.readdirSync(path.resolve(__dirname, '../migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => fs.readFileSync(path.resolve(__dirname, '../migrations', f), 'utf8')).join('\n');
const ADMIN = { email: 'admin@example.test', password: 'Un-Mot-De-Passe-Solide-1' };

async function resetDb() {
  const conn = await mysql.createConnection({ ...config.db, multipleStatements: true });
  const [tables] = await conn.query('SHOW TABLES');
  await conn.query('SET FOREIGN_KEY_CHECKS=0');
  for (const row of tables) await conn.query(`DROP TABLE IF EXISTS \`${Object.values(row)[0]}\``);
  await conn.query('SET FOREIGN_KEY_CHECKS=1');
  await conn.query(MIGRATIONS);
  await conn.end();
  await pool.query("INSERT INTO users (name, email, password_hash, role) VALUES ('Admin Test', ?, ?, 'ADMIN')", [ADMIN.email, await hashPassword(ADMIN.password)]);
  await pool.query("INSERT INTO users (name, email, password_hash, role) VALUES ('Client', 'client@example.test', ?, 'CUSTOMER')", [await hashPassword('Client-Password-123')]);
}

async function adminAgent() {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send(ADMIN);
  if (res.status !== 200) throw new Error(`Login admin impossible : ${res.status}`);
  agent.csrf = res.body.csrfToken;
  const wrap = (method) => (url) => agent[method](url).set('X-CSRF-Token', agent.csrf);
  return { agent, get: wrap('get'), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), delete: wrap('delete') };
}

/** Crée une catégorie + un produit avec variantes ; retourne les ids. */
async function createProduct(admin, variants, name = 'T-shirt test') {
  const res = await admin.post('/api/admin/products').send({ name, description: 'Desc', isActive: true, variants });
  if (res.status !== 201) throw new Error(`createProduct: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

module.exports = { app, request, pool, resetDb, adminAgent, createProduct, ADMIN };
