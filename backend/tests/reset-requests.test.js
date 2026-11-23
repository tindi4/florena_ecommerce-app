'use strict';
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
// helpers EN PREMIER : il fixe NODE_ENV=test et la base boutique_test avant que la configuration soit lue.
const { app, request, pool, resetDb, adminAgent } = require('./helpers');

const PASS = 'Mon-Mot-De-Passe-1';
const STAFF_PASS = 'Mot-De-Passe-Equipe-12';
let admin;

before(async () => { await resetDb(); admin = await adminAgent(); });
after(async () => { await pool.end(); });

async function customerAgent(path, body) {
  const agent = request.agent(app);
  const res = await agent.post(path).send(body);
  const w = (m) => (u) => agent[m](u).set('X-CSRF-Token', res.body.csrfToken || '');
  return { res, agent, get: w('get'), post: w('post'), patch: w('patch') };
}
const forgot = (identifier) => request(app).post('/api/customer/password/forgot').send({ identifier });
const pending = async () => (await admin.get('/api/admin/reset-requests?status=EN_ATTENTE')).body;
/** Fait « vieillir » la dernière demande : la répétition dans la minute n'est pas recomptée. */
/** Étape 1 (message « cette demande vient-elle de vous ? ») puis étape 2 (lien). */
async function contactThenLink(id) {
  assert.equal((await admin.post(`/api/admin/reset-requests/${id}/contacted`)).status, 200);
  return admin.post(`/api/admin/reset-requests/${id}/link`);
}
const age = (customerId) => pool.query('UPDATE customer_reset_requests SET last_requested_at = DATE_SUB(NOW(), INTERVAL 2 MINUTE) WHERE customer_id = ?', [customerId]);

describe('Mot de passe oublié traité par la boutique', () => {
  let awa;
  before(async () => {
    awa = await customerAgent('/api/customer/register', { phone: '90 55 66 77', username: 'awa.reset', name: 'Awa Reset', password: PASS });
    assert.equal(awa.res.status, 201);
  });

  test('réponse identique, que le compte existe ou non', async () => {
    const known = await forgot('90 55 66 77');
    const unknown = await forgot('99 99 99 99');
    const unknownUser = await forgot('personne.inconnue');
    assert.equal(known.status, 202);
    assert.equal(unknown.status, 202);
    assert.equal(unknownUser.status, 202);
    assert.deepEqual(known.body, unknown.body);
    assert.deepEqual(known.body, unknownUser.body);
    assert.ok(!JSON.stringify(known.body).includes('reinitialiser'), 'aucun lien dans la réponse au demandeur');
    // Seul le compte existant crée une demande.
    const p = await pending();
    assert.equal(p.items.length, 1);
    assert.equal(p.items[0].customer.username, 'awa.reset');
  });

  test('recherche par nom d\'utilisateur ou téléphone, jamais par le nom affiché', async () => {
    await forgot('Awa Reset');                       // nom d'affichage : ignoré (traité comme un identifiant inconnu)
    assert.equal((await pending()).items[0].requestCount, 1);
    await age(awa.res.body.customer.id);
    await forgot('AWA.RESET');                       // nom d'utilisateur, casse indifférente
    assert.equal((await pending()).items[0].requestCount, 2);
    await age(awa.res.body.customer.id);
    await forgot('+228 90 55 66 77');                // même téléphone, autre format
    assert.equal((await pending()).items[0].requestCount, 3);
  });

  test('les doublons sont regroupés et une seule notification est créée', async () => {
    await forgot('90 55 66 77');                     // répétition dans la minute : pas recomptée
    const p = await pending();
    assert.equal(p.items.length, 1);
    assert.equal(p.items[0].requestCount, 3);
    assert.equal(p.counts.pending, 1);
    const [[n]] = await pool.query("SELECT COUNT(*) AS n FROM notifications WHERE type = 'RESET_REQUEST'");
    assert.equal(Number(n.n), 1);
    const counters = (await admin.get('/api/admin/counters')).body;
    assert.equal(counters.pendingResets, 1);
  });

  test('un membre sans la permission dédiée ne voit rien et ne peut rien faire', async () => {
    const role = await admin.post('/api/admin/roles').send({ name: 'Vendeuse', permissions: ['orders.view', 'messages'] });
    assert.equal(role.status, 201);
    const u = await admin.post('/api/admin/users').send({ name: 'Equipe', email: 'vendeuse@example.test', password: STAFF_PASS, roleId: role.body.id });
    assert.equal(u.status, 201);
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email: 'vendeuse@example.test', password: STAFF_PASS });
    const id = (await pending()).items[0].id;
    assert.equal((await agent.get('/api/admin/reset-requests')).status, 403);
    assert.equal((await agent.post(`/api/admin/reset-requests/${id}/link`).set('X-CSRF-Token', login.body.csrfToken)).status, 403);
    assert.equal((await agent.get(`/api/admin/reset-requests/${id}/confirmation`)).status, 403);
    assert.equal((await agent.post(`/api/admin/reset-requests/${id}/contacted`).set('X-CSRF-Token', login.body.csrfToken)).status, 403);
  });

  test('étape 1 : message de vérification au numéro du compte, sans lien ; pas de lien avant', async () => {
    const id = (await pending()).items[0].id;
    assert.equal((await admin.post(`/api/admin/reset-requests/${id}/link`)).status, 409);       // pas de lien sans vérification
    const m = await admin.get(`/api/admin/reset-requests/${id}/confirmation`);
    assert.equal(m.status, 200);
    assert.equal(m.body.phone, '90 55 66 77');
    assert.match(m.body.message, /Awa Reset/);
    assert.match(m.body.message, /vient-elle bien de vous/);
    assert.ok(!/reinitialiser|30 min/.test(m.body.message), 'aucun lien ni délai à cette étape');
    assert.match(m.body.whatsappUrl, /^https:\/\/wa\.me\/22890556677\?text=/);
    assert.equal((await pending()).items[0].contactedAt, null);                                // la prévisualisation ne change rien
    assert.equal((await admin.post(`/api/admin/reset-requests/${id}/contacted`)).status, 200);
    const p = (await pending()).items[0];
    assert.ok(p.contactedAt);
    assert.equal(p.contactedBy, 'Admin Test');
    assert.equal(p.status, 'EN_ATTENTE');                                                     // attend la réponse du client
  });

  let link; let requestId;
  test('étape 2 : le client a répondu oui, l\'admin crée un lien à usage unique de 30 min ; seul le haché est stocké', async () => {
    const p = await pending();
    requestId = p.items[0].id;
    const r = await admin.post(`/api/admin/reset-requests/${requestId}/link`);
    assert.equal(r.status, 200);
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.match(r.body.link, /\/reinitialiser\/[a-f0-9]{64}$/);
    assert.equal(r.body.ttlMinutes, 30);
    assert.equal(r.body.phone, '90 55 66 77');                         // numéro du compte, affiché avant l'envoi
    assert.match(r.body.whatsappUrl, /^https:\/\/wa\.me\/22890556677\?text=/);
    assert.match(r.body.message, /30 minutes/);                                                // le délai est annoncé avec le lien
    link = r.body.link;
    const token = link.split('/').pop();
    const [rows] = await pool.query('SELECT token_hash, created_by, request_id, TIMESTAMPDIFF(MINUTE, NOW(), expires_at) AS mins FROM customer_password_resets');
    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].token_hash, token);                         // jamais en clair
    assert.equal(rows[0].request_id, requestId);
    assert.ok(rows[0].mins >= 29 && rows[0].mins <= 30);
    // La demande est traitée ; on ne peut pas recréer un lien dessus.
    assert.equal((await pending()).items.length, 0);
    assert.equal((await admin.post(`/api/admin/reset-requests/${requestId}/link`)).status, 409);
    const done = (await admin.get('/api/admin/reset-requests?status=TRAITEE')).body.items[0];
    assert.equal(done.handledBy, 'Admin Test');
  });

  test('le client choisit un nouveau mot de passe : lien grillé, sessions fermées', async () => {
    const other = await customerAgent('/api/customer/login', { identifier: 'awa.reset', password: PASS });   // autre appareil
    assert.equal((await other.get('/api/customer/me')).status, 200);
    const token = link.split('/').pop();
    const r = await request(app).post('/api/customer/password/reset').send({ token, newPassword: 'Nouveau-Pass-2026' });
    assert.equal(r.status, 200);
    assert.equal((await other.get('/api/customer/me')).status, 401);                          // ancienne session fermée
    assert.equal((await awa.get('/api/customer/me')).status, 401);
    assert.equal((await request(app).post('/api/customer/password/reset').send({ token, newPassword: 'Encore-Autre-99' })).status, 400);   // usage unique
    assert.equal((await request(app).post('/api/customer/login').send({ identifier: 'awa.reset', password: PASS })).status, 401);
    assert.equal((await request(app).post('/api/customer/login').send({ identifier: 'awa.reset', password: 'Nouveau-Pass-2026' })).status, 200);
  });

  test('lien expiré refusé', async () => {
    await age(awa.res.body.customer.id);
    await forgot('awa.reset');
    const id = (await pending()).items[0].id;
    const token = (await contactThenLink(id)).body.link.split('/').pop();
    await pool.query('UPDATE customer_password_resets SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE used_at IS NULL');
    assert.equal((await request(app).post('/api/customer/password/reset').send({ token, newPassword: 'Encore-Autre-99' })).status, 400);
  });

  test('un nouveau lien annule le précédent', async () => {
    await age(awa.res.body.customer.id);
    await forgot('awa.reset');
    const first = (await contactThenLink((await pending()).items[0].id)).body.link.split('/').pop();
    await age(awa.res.body.customer.id);
    await forgot('awa.reset');
    const second = (await contactThenLink((await pending()).items[0].id)).body.link.split('/').pop();
    assert.equal((await request(app).post('/api/customer/password/reset').send({ token: first, newPassword: 'Encore-Autre-99' })).status, 400);
    assert.equal((await request(app).post('/api/customer/password/reset').send({ token: second, newPassword: 'Encore-Autre-99' })).status, 200);
  });

  test('ignorer une demande, puis journal complet (qui, quand), sans mot de passe ni jeton', async () => {
    await age(awa.res.body.customer.id);
    await forgot('awa.reset');
    const id = (await pending()).items[0].id;
    assert.equal((await admin.post(`/api/admin/reset-requests/${id}/ignore`)).status, 200);
    assert.equal((await admin.post(`/api/admin/reset-requests/${id}/link`)).status, 409);
    const [log] = await pool.query('SELECT action, user_id FROM customer_reset_log WHERE request_id = ? ORDER BY id', [requestId]);
    assert.deepEqual(log.map((l) => l.action), ['DEMANDE', 'DEMANDE', 'DEMANDE', 'CLIENT_CONTACTE', 'LIEN_CREE', 'MOT_DE_PASSE_CHANGE']);
    assert.ok(log.find((l) => l.action === 'LIEN_CREE').user_id);
    const [ignored] = await pool.query("SELECT user_id FROM customer_reset_log WHERE request_id = ? AND action = 'DEMANDE_IGNOREE'", [id]);
    assert.equal(ignored.length, 1);
    const [cols] = await pool.query('SHOW COLUMNS FROM customer_reset_log');
    assert.ok(!cols.some((c) => /pass|token/i.test(c.Field)));
    const list = (await admin.get('/api/admin/reset-requests?status=TRAITEE')).body;
    assert.ok(!JSON.stringify(list).match(/[a-f0-9]{64}/), 'la liste ne renvoie jamais de jeton');
    assert.ok(list.items.find((x) => x.id === requestId).history.some((h) => h.action === 'LIEN_CREE' && h.by === 'Admin Test'));
  });
});
