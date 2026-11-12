'use strict';
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
// helpers EN PREMIER : il fixe NODE_ENV=test et la base boutique_test avant que la configuration soit lue.
const { app, request, pool, resetDb, adminAgent, createProduct, ADMIN } = require('./helpers');
const config = require('../src/config/env');

const PASS = 'Mot-De-Passe-Equipe-12';
let admin; let shirt;

async function staffLogin(email) {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/login').send({ email, password: PASS });
  const w = (m) => (u) => agent[m](u).set('X-CSRF-Token', r.body.csrfToken || '');
  return { status: r.status, user: r.body.user, get: w('get'), post: w('post'), put: w('put'), patch: w('patch'), delete: w('delete') };
}
async function roleId(name) { return (await admin.get('/api/admin/roles')).body.items.find((r) => r.name === name || r.code === name).id; }
async function makeRole(name, permissions, by = admin) { return by.post('/api/admin/roles').send({ name, permissions }); }
async function makeUser(email, rid, by = admin) { return by.post('/api/admin/users').send({ name: 'Equipe', email, password: PASS, roleId: rid }); }
const newOrder = async () => {
  const r = await request(app).post('/api/orders').send({ customerName: 'Ama', customerPhone: '90 00 00 00', deliveryRequested: true, deliveryAddress: 'Bè, Lomé', items: [{ variantId: shirt.variants[0].id, quantity: 1 }] });
  const [[row]] = await pool.query('SELECT id FROM orders WHERE order_number = ?', [r.body.orderNumber]);
  return row.id;
};

before(async () => {
  await resetDb();
  admin = await adminAgent();
  shirt = await createProduct(admin, [{ attributes: { Taille: 'M' }, price: 1000, stockQuantity: 500 }]);
});
after(async () => { await pool.end(); });

describe('Rôles personnalisables', () => {
  test('catalogue des permissions et 4 modèles par défaut', async () => {
    const r = (await admin.get('/api/admin/roles')).body;
    assert.equal(r.permissions.length, 13);
    assert.deepEqual(r.items.filter((x) => x.isTemplate).map((x) => x.code).sort(), ['ADMIN', 'CATALOG_CLERK', 'MANAGER', 'ORDER_CLERK']);
    assert.ok(r.items.find((x) => x.code === 'ADMIN').isSystem);
  });
  test('rôle « Caissier » : voir + marquer payé, rien d\'autre', async () => {
    const r = await makeRole('Caissier', ['orders.payment']);
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.permissions, ['orders.view', 'orders.payment']);   // « voir » ajouté automatiquement
    await makeUser('caisse@example.test', r.body.id);
    const u = await staffLogin('caisse@example.test');
    assert.equal(u.status, 200);
    const id = await newOrder();
    assert.equal((await u.get(`/api/admin/orders/${id}`)).status, 200);
    assert.equal((await u.patch(`/api/admin/orders/${id}/payment`).send({ paid: true })).status, 200);
    assert.equal((await u.patch(`/api/admin/orders/${id}/status`).send({ status: 'CONFIRMEE' })).status, 403);
    assert.equal((await u.patch(`/api/admin/orders/${id}/status`).send({ status: 'ANNULEE' })).status, 403);
    assert.equal((await u.patch(`/api/admin/orders/${id}/delivery-fee`).send({ fee: 1000 })).status, 403);
    assert.equal((await u.put(`/api/admin/orders/${id}`).send({ details: { customerName: 'Pirate' } })).status, 403);
    assert.equal((await u.post(`/api/admin/orders/${id}/notify`).send({ channel: 'SMS' })).status, 403);
    assert.equal((await u.get('/api/admin/messages')).status, 403);
    assert.equal((await u.get('/api/admin/products')).status, 403);
  });
  test('« faire avancer » sans « annuler » : confirmer oui, annuler non', async () => {
    const r = await makeRole('Préparateur', ['orders.status', 'orders.fee']);
    await makeUser('prep@example.test', r.body.id);
    const u = await staffLogin('prep@example.test');
    const id = await newOrder();
    assert.equal((await u.patch(`/api/admin/orders/${id}/status`).send({ status: 'CONFIRMEE' })).status, 200);
    assert.equal((await u.patch(`/api/admin/orders/${id}/delivery-fee`).send({ fee: 1500 })).status, 200);
    const c = await u.patch(`/api/admin/orders/${id}/status`).send({ status: 'ANNULEE' });
    assert.equal(c.status, 403); assert.match(c.body.error.message, /annuler/);
  });
  test('modifier les permissions d\'un rôle : effet immédiat', async () => {
    const u = await staffLogin('prep@example.test');
    assert.equal((await u.get('/api/admin/stock')).status, 403);
    await admin.patch(`/api/admin/roles/${await roleId('Préparateur')}`).send({ permissions: ['orders.status', 'stock'] });
    assert.equal((await u.get('/api/admin/stock')).status, 200);
    assert.equal((await u.get('/api/admin/auth-check-inexistant')).status, 404);
  });
  test('validation : permission inconnue, nom en double, nom vide', async () => {
    assert.equal((await makeRole('Bizarre', ['orders.view', 'pirater'])).status, 400);
    assert.equal((await makeRole('Caissier', [])).status, 409);
    assert.equal((await makeRole('', [])).status, 400);
  });
  test('rôle verrouillé « Administrateur principal » : ni modifiable, ni supprimable, ni attribuable', async () => {
    const id = await roleId('ADMIN');
    assert.equal((await admin.patch(`/api/admin/roles/${id}`).send({ permissions: [] })).status, 400);
    assert.equal((await admin.delete(`/api/admin/roles/${id}`)).status, 400);
    assert.equal((await makeUser('x@example.test', id)).status, 400);
  });
  test('suppression : refusée si le rôle est attribué, acceptée sinon', async () => {
    const del = await admin.delete(`/api/admin/roles/${await roleId('Caissier')}`);
    assert.equal(del.status, 409); assert.match(del.body.error.message, /attribué/);
    const tmp = await makeRole('Temporaire', ['stats']);
    assert.equal((await admin.delete(`/api/admin/roles/${tmp.body.id}`)).status, 200);
  });
  test('le compte principal garde TOUS les droits, même si son rôle est vidé en base', async () => {
    await pool.query("DELETE rp FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.code = 'ADMIN'");
    const me = await admin.get('/api/auth/me');
    assert.equal(me.body.user.permissions.length, 13);
    assert.equal((await admin.get('/api/admin/settings')).status, 200);
  });
  test('ancien format accepté : rôle par code de modèle', async () => {
    assert.equal((await admin.post('/api/admin/users').send({ name: 'Yao', email: 'yao2@example.test', password: PASS, role: 'CATALOG_CLERK' })).status, 201);
    const u = await staffLogin('yao2@example.test');
    assert.deepEqual(u.user.permissions, ['products', 'stock']);
  });
});

describe('Anti-escalade : on ne donne pas des droits qu\'on n\'a pas', () => {
  let rh;
  before(async () => {
    const r = await makeRole('Responsable équipe', ['team', 'orders.view']);
    await makeUser('rh@example.test', r.body.id);
    rh = await staffLogin('rh@example.test');
  });
  test('créer un rôle avec plus de droits que soi : refusé ; avec les siens : accepté', async () => {
    const bad = await makeRole('Super', ['orders.view', 'products'], rh);
    assert.equal(bad.status, 403); assert.match(bad.body.error.message, /produits/);
    assert.equal((await makeRole('Lecteur', ['orders.view'], rh)).status, 201);
  });
  test('attribuer un modèle plus puissant (Gérant) : refusé ; un rôle à sa mesure : accepté', async () => {
    assert.equal((await makeUser('g1@example.test', await roleId('MANAGER'), rh)).status, 403);
    assert.equal((await makeUser('l1@example.test', await roleId('Lecteur'), rh)).status, 201);
  });
  test('modifier son propre rôle, ou un compte plus puissant : refusé', async () => {
    assert.equal((await rh.patch(`/api/admin/roles/${await roleId('Responsable équipe')}`).send({ permissions: ['team', 'orders.view', 'settings'] })).status, 403);
    const [[caisse]] = await pool.query("SELECT id FROM users WHERE email = 'caisse@example.test'");
    assert.equal((await rh.patch(`/api/admin/users/${caisse.id}`).send({ isActive: false })).status, 403);
    assert.equal((await rh.post(`/api/admin/users/${caisse.id}/password`).send({ password: 'Un-Autre-Mot-De-Passe-1' })).status, 403);
    const [[main]] = await pool.query('SELECT id FROM users WHERE email = ?', [ADMIN.email]);
    assert.equal((await rh.patch(`/api/admin/users/${main.id}`).send({ name: 'Pirate' })).status, 400);
  });
});

describe('Chaque route admin est protégée par une permission', () => {
  test('un compte dont le rôle n\'a AUCUNE permission est refusé partout (sauf les pastilles du menu)', async () => {
    const r = await makeRole('Aucun droit', []);
    await makeUser('rien@example.test', r.body.id);
    const u = await staffLogin('rien@example.test');
    assert.deepEqual(u.user.permissions, []);
    const id = await newOrder();
    const routes = [
      ['get', '/api/admin/dashboard'], ['get', '/api/admin/orders'], ['get', `/api/admin/orders/${id}`], ['get', `/api/admin/orders/${id}/invoice`],
      ['put', `/api/admin/orders/${id}`], ['get', '/api/admin/order-variants'], ['patch', `/api/admin/orders/${id}/status`],
      ['patch', `/api/admin/orders/${id}/payment`], ['patch', `/api/admin/orders/${id}/delivery-fee`], ['post', `/api/admin/orders/${id}/notify`],
      ['get', '/api/admin/notifications'], ['post', '/api/admin/notifications/read-all'], ['patch', '/api/admin/notifications/1/read'],
      ['get', '/api/admin/messages'], ['patch', '/api/admin/messages/1/status'],
      ['get', '/api/admin/products'], ['post', '/api/admin/products'], ['get', '/api/admin/products/1'], ['put', '/api/admin/products/1'],
      ['patch', '/api/admin/products/1/active'], ['post', '/api/admin/products/1/images'], ['delete', '/api/admin/images/1'],
      ['get', '/api/admin/categories'], ['post', '/api/admin/categories'], ['put', '/api/admin/categories/1'], ['patch', '/api/admin/categories/1/active'],
      ['get', '/api/admin/stock'], ['post', '/api/admin/variants/1/stock'], ['get', '/api/admin/variants/1/stock-history'],
      ['get', '/api/admin/stats'], ['get', '/api/admin/users'], ['post', '/api/admin/users'], ['patch', '/api/admin/users/1'],
      ['post', '/api/admin/users/1/password'], ['get', '/api/admin/roles'], ['post', '/api/admin/roles'], ['patch', '/api/admin/roles/1'],
      ['delete', '/api/admin/roles/1'], ['get', '/api/admin/settings'], ['put', '/api/admin/settings'], ['post', '/api/admin/settings/logo'],
      ['delete', '/api/admin/settings/logo'],
    ];
    for (const [m, url] of routes) assert.equal((await u[m](url).send({})).status, 403, `${m.toUpperCase()} ${url}`);
    assert.equal((await u.get('/api/admin/counters')).status, 200);
  });
  test('permission « messages » seule : messages oui, commandes non', async () => {
    const r = await makeRole('Accueil', ['messages']);
    await makeUser('accueil@example.test', r.body.id);
    const u = await staffLogin('accueil@example.test');
    assert.equal((await u.get('/api/admin/messages')).status, 200);
    assert.equal((await u.get('/api/admin/notifications')).status, 200);
    assert.equal((await u.get('/api/admin/orders')).status, 403);
  });
});

describe('Migration 007 : les comptes existants gardent exactement leurs droits', () => {
  test('rejouée sur une base en version 006 avec des comptes MANAGER / ORDER_CLERK / CATALOG_CLERK', async () => {
    const dir = path.resolve(__dirname, '../migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    // Dans boutique_test (aucun droit CREATE DATABASE nécessaire) : ce test est le DERNIER du fichier.
    const conn = await mysql.createConnection({ ...config.db, multipleStatements: true });
    const [tables] = await conn.query('SHOW TABLES');
    await conn.query('SET FOREIGN_KEY_CHECKS=0');
    for (const row of tables) await conn.query(`DROP TABLE IF EXISTS \`${Object.values(row)[0]}\``);
    await conn.query('SET FOREIGN_KEY_CHECKS=1');
    for (const f of files.filter((x) => x < '007')) await conn.query(fs.readFileSync(path.join(dir, f), 'utf8'));
    await conn.query(`INSERT INTO users (name, email, password_hash, role) VALUES
      ('A', 'a@x.test', 'h', 'ADMIN'), ('M', 'm@x.test', 'h', 'MANAGER'), ('O', 'o@x.test', 'h', 'ORDER_CLERK'),
      ('C', 'c@x.test', 'h', 'CATALOG_CLERK'), ('K', 'k@x.test', 'h', 'CUSTOMER')`);
    await conn.query(fs.readFileSync(path.join(dir, '007_custom_roles.sql'), 'utf8'));
    const [rows] = await conn.query(`SELECT u.email, u.role, r.code, GROUP_CONCAT(p.permission ORDER BY p.permission) AS perms
      FROM users u LEFT JOIN roles r ON r.id = u.role_id LEFT JOIN role_permissions p ON p.role_id = r.id GROUP BY u.id ORDER BY u.id`);
    await conn.end();
    const by = Object.fromEntries(rows.map((r) => [r.email, r]));
    assert.equal(by['m@x.test'].role, 'MANAGER');           // type de compte inchangé
    assert.equal(by['m@x.test'].code, 'MANAGER');
    assert.equal(by['m@x.test'].perms, 'messages,orders.cancel,orders.edit,orders.fee,orders.notify,orders.payment,orders.status,orders.view,products,stats,stock');
    assert.equal(by['o@x.test'].perms, 'messages,orders.cancel,orders.edit,orders.fee,orders.notify,orders.payment,orders.status,orders.view');
    assert.equal(by['c@x.test'].perms, 'products,stock');
    assert.equal(by['a@x.test'].code, 'ADMIN');
    assert.equal(by['k@x.test'].code, null);                // un ancien CUSTOMER ne reçoit aucun rôle
  });
});
