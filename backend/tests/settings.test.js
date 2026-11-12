'use strict';
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, pool, resetDb, adminAgent, createProduct } = require('./helpers');

// Vrai PNG de 1 x 1 pixel (pdfkit doit pouvoir le lire pour la facture).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const SVG_OK = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"/></defs><rect width="10" height="10" fill="url(#g)"/></svg>';
let admin;

before(async () => { await resetDb(); admin = await adminAgent(); });
after(async () => { await pool.end(); });

const uploadLogo = (buffer, filename) => admin.post('/api/admin/settings/logo').attach('logo', buffer, filename);

describe('Réglages de la boutique', () => {
  test('valeurs par défaut publiques : nom du .env, couleur par défaut, pas de logo', async () => {
    const r = await request(app).get('/api/settings');
    assert.equal(r.status, 200);
    assert.equal(r.body.primaryColor, '#0d4f4c');
    assert.equal(r.body.logoUrl, null);
    assert.ok(r.body.shopName);
  });
  test('l\'admin modifie le nom et la couleur : visibles immédiatement sur le site public', async () => {
    const r = await admin.put('/api/admin/settings').send({ shopName: 'Florena Store', primaryColor: '#AA3366' });
    assert.equal(r.status, 200);
    const pub = (await request(app).get('/api/settings')).body;
    assert.equal(pub.shopName, 'Florena Store');
    assert.equal(pub.primaryColor, '#aa3366');
  });
  test('couleur ou nom invalides refusés avec un message en français', async () => {
    const r = await admin.put('/api/admin/settings').send({ primaryColor: 'red' });
    assert.equal(r.status, 400);
    assert.match(r.body.error.details[0].message, /Couleur invalide/);
    assert.equal((await admin.put('/api/admin/settings').send({ shopName: 'A' })).status, 400);
    assert.equal((await admin.put('/api/admin/settings').send({})).status, 400);
  });
  test('logo PNG accepté, servi avec une CSP stricte', async () => {
    const r = await uploadLogo(PNG, 'logo.png');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.match(r.body.logoUrl, /^\/uploads\/logo-[a-f0-9]{24}\.png$/);
    const f = await request(app).get(r.body.logoUrl);
    assert.equal(f.status, 200);
    assert.match(f.headers['content-security-policy'], /sandbox/);
    assert.equal((await request(app).get('/api/settings')).body.logoUrl, r.body.logoUrl);
  });
  test('le type RÉEL est contrôlé : un texte renommé en .png est refusé', async () => {
    const r = await uploadLogo(Buffer.from('ceci n\'est pas une image'), 'faux.png');
    assert.equal(r.status, 400);
    assert.match(r.body.error.message, /PNG, JPG, WebP ou SVG/);
  });
  test('SVG propre accepté ; SVG avec script, gestionnaire on… ou lien externe refusé', async () => {
    const ok = await uploadLogo(Buffer.from(SVG_OK), 'logo.svg');
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.match(ok.body.logoUrl, /\.svg$/);
    const bad = [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="https://evil.example/x.png"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div/></foreignObject></svg>',
    ];
    for (const svg of bad) {
      const r = await uploadLogo(Buffer.from(svg), 'logo.svg');
      assert.equal(r.status, 400, svg);
    }
  });
  test('fichier de plus de 2 Mo refusé', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    const r = await uploadLogo(big, 'gros.png');
    assert.equal(r.status, 400);
    assert.match(r.body.error.message, /2 Mo/);
  });
  test('la facture PDF est générée avec le logo PNG', async () => {
    await uploadLogo(PNG, 'logo.png');
    const p = await createProduct(admin, [{ attributes: {}, price: 1000, stockQuantity: 5 }], 'Produit facture');
    const o = await request(app).post('/api/orders').send({ customerName: 'Ama', customerPhone: '90 00 00 00', items: [{ variantId: p.variants[0].id, quantity: 1 }] });
    const [[row]] = await pool.query('SELECT id FROM orders WHERE order_number = ?', [o.body.orderNumber]);
    const pdf = await admin.get(`/api/admin/orders/${row.id}/invoice`).buffer(true).parse((res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    assert.equal(pdf.status, 200);
    assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
    assert.ok(pdf.body.includes(Buffer.from('/Subtype /Image')), 'image du logo absente du PDF');
  });
  test('suppression du logo', async () => {
    const r = await admin.delete('/api/admin/settings/logo');
    assert.equal(r.status, 200);
    assert.equal(r.body.logoUrl, null);
  });
  test('sécurité : sans session 401, sans CSRF 403, rôle sans « settings » 403', async () => {
    assert.equal((await request(app).get('/api/admin/settings')).status, 401);
    assert.equal((await admin.agent.put('/api/admin/settings').send({ shopName: 'Pirate' })).status, 403);
    await admin.post('/api/admin/users').send({ name: 'Gérant', email: 'g@example.test', password: 'Mot-De-Passe-Equipe-12', role: 'MANAGER' });
    const agent = request.agent(app);
    const l = await agent.post('/api/auth/login').send({ email: 'g@example.test', password: 'Mot-De-Passe-Equipe-12' });
    assert.ok(!l.body.user.permissions.includes('settings'));
    assert.equal((await agent.get('/api/admin/settings')).status, 403);
    assert.equal((await agent.put('/api/admin/settings').set('X-CSRF-Token', l.body.csrfToken).send({ shopName: 'Pirate' })).status, 403);
  });
});
