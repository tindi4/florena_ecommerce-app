'use strict';
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, pool, resetDb, adminAgent, createProduct, ADMIN } = require('./helpers');

let admin; let shirt;
const PASS = 'Mon-Mot-De-Passe-1';

before(async () => {
  await resetDb();
  admin = await adminAgent();
  shirt = await createProduct(admin, [{ attributes: { Taille: 'M' }, price: 2500, stockQuantity: 200 }]);
});
after(async () => { await pool.end(); });

/** Agent « client » : garde le cookie et ajoute le jeton CSRF aux écritures. */
async function customerAgent(path, body) {
  const agent = request.agent(app);
  const res = await agent.post(path).send(body);
  const w = (m) => (u) => agent[m](u).set('X-CSRF-Token', res.body.csrfToken || '');
  return { res, agent, csrf: res.body.csrfToken, get: w('get'), post: w('post'), patch: w('patch') };
}
const register = (body) => customerAgent('/api/customer/register', body);
const login = (identifier, password = PASS) => customerAgent('/api/customer/login', { identifier, password });
const guestOrder = (phone, extra = {}) => request(app).post('/api/orders')
  .send({ customerName: 'Client Invité', customerPhone: phone, items: [{ variantId: shirt.variants[0].id, quantity: 1 }], ...extra });
const track = (body) => request(app).post('/api/orders/track').send(body);

describe('Inscription et connexion client', () => {
  let awa;
  test('inscription avec téléphone + nom d\'utilisateur : cookie HttpOnly séparé + jeton CSRF', async () => {
    awa = await register({ phone: '90 11 22 33', username: 'Awa.K', name: 'Awa Koffi', password: PASS });
    assert.equal(awa.res.status, 201, JSON.stringify(awa.res.body));
    assert.equal(awa.res.body.customer.username, 'awa.k');
    assert.ok(awa.csrf);
    const cookie = awa.res.headers['set-cookie'].join(';');
    assert.match(cookie, /customer_token=/);
    assert.match(cookie, /HttpOnly/i);
    assert.doesNotMatch(cookie, /admin_token=/);
  });
  test('doublons et données invalides refusés, messages en français', async () => {
    let r = (await register({ phone: '+228 90 11 22 33', password: PASS })).res;   // même numéro, autre format
    assert.equal(r.status, 409); assert.match(r.body.error.message, /existe déjà/);
    r = (await register({ phone: '91 00 00 00', username: 'awa.k', password: PASS })).res;
    assert.equal(r.status, 409); assert.match(r.body.error.message, /déjà pris/);
    r = (await register({ phone: '91 00 00 01', password: 'court' })).res;
    assert.equal(r.status, 400); assert.match(r.body.error.details[0].message, /8 caractères/);
    r = (await register({ phone: '91 00 00 02', username: '12345', password: PASS })).res;
    assert.equal(r.status, 400); assert.match(r.body.error.details[0].message, /au moins une lettre/);
  });
  test('connexion par téléphone (tout format) ou par nom d\'utilisateur', async () => {
    assert.equal((await login('0022890112233')).res.status, 200);
    assert.equal((await login('AWA.K')).res.status, 200);
  });
  test('mauvais mot de passe et compte inconnu : même réponse 401', async () => {
    const a = (await login('awa.k', 'faux-mot-de-passe')).res;
    const b = (await login('inconnu', 'faux-mot-de-passe')).res;
    assert.equal(a.status, 401); assert.equal(b.status, 401);
    assert.equal(a.body.error.message, b.body.error.message);
  });
  test('un jeton client n\'ouvre JAMAIS l\'administration (et inversement)', async () => {
    const token = /customer_token=([^;]+)/.exec(awa.res.headers['set-cookie'].join(';'))[1];
    assert.equal((await request(app).get('/api/admin/orders').set('Cookie', `admin_token=${token}`)).status, 401);
    const a = await request(app).post('/api/auth/login').send(ADMIN);
    const adminToken = /admin_token=([^;]+)/.exec(a.headers['set-cookie'].join(';'))[1];
    assert.equal((await request(app).get('/api/customer/me').set('Cookie', `customer_token=${adminToken}`)).status, 401);
  });
  test('sessions admin et client indépendantes dans le même navigateur', async () => {
    const agent = request.agent(app);
    const a = await agent.post('/api/auth/login').send(ADMIN);
    await agent.post('/api/customer/login').send({ identifier: 'awa.k', password: PASS });
    await agent.post('/api/customer/logout');
    assert.equal((await agent.get('/api/customer/me')).status, 401);
    assert.equal((await agent.get('/api/admin/orders').set('X-CSRF-Token', a.body.csrfToken)).status, 200);
  });
  test('écriture du compte sans jeton CSRF : refusée', async () => {
    assert.equal((await awa.agent.patch('/api/account/preferences').send({ theme: 'dark' })).status, 403);
    assert.equal((await awa.patch('/api/account/preferences').send({ theme: 'dark' })).status, 200);
    assert.equal((await awa.get('/api/customer/me')).body.customer.theme, 'dark');
    assert.equal((await awa.patch('/api/account/preferences').send({ theme: 'violet' })).status, 400);
  });
});

describe('Mon compte : commandes, profil, mot de passe', () => {
  let kofi;
  before(async () => { kofi = await register({ phone: '92 00 00 00', username: 'kofi', password: PASS }); });

  test('commande passée connecté (avec CSRF) : rattachée au compte et listée avec son statut', async () => {
    const o = await kofi.post('/api/orders').send({ customerName: 'Kofi', customerPhone: '92 00 00 00', items: [{ variantId: shirt.variants[0].id, quantity: 2 }] });
    assert.equal(o.status, 201);
    const list = (await kofi.get('/api/account/orders')).body.items;
    assert.equal(list.length, 1);
    assert.equal(list[0].orderNumber, o.body.orderNumber);
    assert.equal(list[0].status, 'EN_ATTENTE');
    assert.equal(list[0].itemCount, 2);
    const [[row]] = await pool.query('SELECT id FROM orders WHERE order_number = ?', [o.body.orderNumber]);
    await admin.patch(`/api/admin/orders/${row.id}/status`).send({ status: 'CONFIRMEE' });
    assert.equal((await kofi.get('/api/account/orders')).body.items[0].status, 'CONFIRMEE');
    assert.equal((await kofi.get(`/api/account/orders/${o.body.orderNumber}`)).body.status, 'CONFIRMEE');
    const pdf = await kofi.get(`/api/account/orders/${o.body.orderNumber}/invoice`);
    assert.equal(pdf.status, 200);
  });
  test('commande sans jeton CSRF : enregistrée en invité (pas rattachée)', async () => {
    const o = await kofi.agent.post('/api/orders').send({ customerName: 'Kofi', customerPhone: '92 00 00 00', items: [{ variantId: shirt.variants[0].id, quantity: 1 }] });
    assert.equal(o.status, 201);
    const [[row]] = await pool.query('SELECT customer_id FROM orders WHERE order_number = ?', [o.body.orderNumber]);
    assert.equal(row.customer_id, null);
  });
  test('commande invité : rattachable avec son numéro si le téléphone est le même', async () => {
    const guest = (await guestOrder('+228 92 00 00 00')).body;
    assert.ok(!(await kofi.get('/api/account/orders')).body.items.some((o) => o.orderNumber === guest.orderNumber));
    const other = (await guestOrder('93 00 00 00')).body;
    const r = await kofi.post('/api/account/orders/claim').send({ orders: [guest.orderNumber, other.trackingCode, 'CMD-INCONNUE'] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.claimed, [guest.orderNumber]);
    assert.equal(r.body.refused.length, 2);
    assert.ok((await kofi.get('/api/account/orders')).body.items.some((o) => o.orderNumber === guest.orderNumber));
    // La commande reste accessible sans compte (code ou numéro + téléphone).
    assert.equal((await track({ code: guest.trackingCode })).status, 200);
  });
  test('commande d\'un autre compte : non rattachable, détail et facture introuvables', async () => {
    const mine = (await kofi.get('/api/account/orders')).body.items[0];
    const other = await register({ phone: '94 00 00 00', password: PASS });
    assert.equal((await other.get(`/api/account/orders/${mine.orderNumber}`)).status, 404);
    assert.equal((await other.get(`/api/account/orders/${mine.orderNumber}/invoice`)).status, 404);
    const r = await other.post('/api/account/orders/claim').send({ orders: [mine.trackingCode] });
    assert.deepEqual(r.body.claimed, []);
  });
  test('s\'inscrire avec le téléphone d\'un autre ne montre AUCUNE de ses commandes', async () => {
    const victim = (await guestOrder('95 00 00 00')).body;
    const intruder = await register({ phone: '95 00 00 00', password: PASS });
    assert.equal(intruder.res.status, 201);
    assert.deepEqual((await intruder.get('/api/account/orders')).body.items, []);
    assert.ok(victim.orderNumber);
  });
  test('changer le nom d\'utilisateur (unicité vérifiée)', async () => {
    assert.equal((await kofi.patch('/api/account/profile').send({ username: 'kofi.mensah' })).body.customer.username, 'kofi.mensah');
    assert.equal((await kofi.patch('/api/account/profile').send({ username: 'awa.k' })).status, 409);
    assert.equal((await login('kofi.mensah')).res.status, 200);
  });
  test('changer le mot de passe : ancien exigé, autres sessions fermées, celle-ci continue', async () => {
    const otherDevice = await login('kofi.mensah');
    let r = await kofi.post('/api/account/password').send({ currentPassword: 'mauvais', newPassword: 'Nouveau-Pass-22' });
    assert.equal(r.status, 400); assert.match(r.body.error.message, /actuel incorrect/);
    r = await kofi.post('/api/account/password').send({ currentPassword: PASS, newPassword: 'Nouveau-Pass-22' });
    assert.equal(r.status, 200);
    kofi.csrf = r.body.csrfToken;
    assert.equal((await kofi.agent.get('/api/account/orders')).status, 200);
    assert.equal((await otherDevice.get('/api/account/orders')).status, 401);
    assert.equal((await login('kofi.mensah')).res.status, 401);
    assert.equal((await login('kofi.mensah', 'Nouveau-Pass-22')).res.status, 200);
  });
  test('routes du compte refusées sans session', async () => {
    assert.equal((await request(app).get('/api/account/orders')).status, 401);
  });
});

describe('Suivi sans compte : code complet, ou numéro + téléphone', () => {
  let o;
  before(async () => { o = (await guestOrder('96 12 34 56')).body; });

  test('le code est long et aléatoire (numéro + 20 caractères)', () => {
    assert.match(o.trackingCode, /^CMD-[A-Z2-9]{10}-[A-Z2-9]{20}$/);
    assert.ok(o.trackingCode.startsWith(o.orderNumber));
  });
  test('code complet seul : accès accordé (y compris collé dans le champ « numéro », en minuscules)', async () => {
    assert.equal((await track({ code: o.trackingCode })).body.orderNumber, o.orderNumber);
    assert.equal((await track({ orderNumber: o.trackingCode.toLowerCase() })).status, 200);
  });
  test('numéro + téléphone (même avec l\'indicatif) : accès accordé', async () => {
    assert.equal((await track({ orderNumber: o.orderNumber, phone: '+228 96 12 34 56' })).status, 200);
  });
  test('LE TÉLÉPHONE SEUL NE DONNE JAMAIS ACCÈS', async () => {
    const r = await track({ phone: '96 12 34 56' });
    assert.equal(r.status, 400);
    assert.match(r.body.error.details[0].message, /code complet/);
    assert.equal((await request(app).post('/api/orders/invoice').send({ phone: '96 12 34 56' })).status, 400);
    assert.equal((await request(app).patch('/api/orders/edit').send({ phone: '96 12 34 56', changes: { comment: 'x' } })).status, 400);
  });
  test('numéro seul, mauvais téléphone ou code modifié : refusés', async () => {
    assert.equal((await track({ orderNumber: o.orderNumber })).status, 400);
    assert.equal((await track({ orderNumber: o.orderNumber, phone: '90 00 00 00' })).status, 404);
    const tampered = o.trackingCode.slice(0, -1) + (o.trackingCode.endsWith('A') ? 'B' : 'A');
    assert.equal((await track({ code: tampered })).status, 404);
    assert.equal((await track({ code: 'CMD-123' })).status, 404);
  });
  test('facture et modification possibles avec le code seul', async () => {
    assert.equal((await request(app).post('/api/orders/invoice').send({ code: o.trackingCode })).status, 200);
    const e = await request(app).patch('/api/orders/edit').send({ code: o.trackingCode, changes: { comment: 'Sonnez deux fois' } });
    assert.equal(e.status, 200); assert.equal(e.body.comment, 'Sonnez deux fois');
  });
  test('ancienne commande sans code : code créé à la première consultation, puis utilisable', async () => {
    const old = (await guestOrder('97 00 00 00')).body;
    await pool.query('UPDATE orders SET tracking_code = NULL WHERE order_number = ?', [old.orderNumber]);
    const t = await track({ orderNumber: old.orderNumber, phone: '97 00 00 00' });
    assert.match(t.body.trackingCode, /^CMD-[A-Z2-9]{10}-[A-Z2-9]{20}$/);
    assert.equal((await track({ code: t.body.trackingCode })).status, 200);
  });
  test('le message WhatsApp contient le lien de suivi avec le code après « # »', async () => {
    const [[row]] = await pool.query('SELECT id FROM orders WHERE order_number = ?', [o.orderNumber]);
    const d = (await admin.get(`/api/admin/orders/${row.id}`)).body;
    assert.equal(d.trackingCode, o.trackingCode);
    assert.ok(d.confirmation.defaultMessage.includes(`/suivi#${o.trackingCode}`) || !process.env.SITE_URL);
  });
});
