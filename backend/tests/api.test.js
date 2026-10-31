'use strict';
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, pool, resetDb, adminAgent, createProduct, ADMIN } = require('./helpers');

const CUSTOMER = { customerName: 'Awa Koffi', customerPhone: '+228 90 12 34 56', deliveryAddress: '12 rue des Fleurs, Lomé', city: 'Lomé' };
let admin; let shirt; let shoes;

before(async () => {
  await resetDb();
  admin = await adminAgent();
  shirt = await createProduct(admin, [
    { attributes: { Couleur: 'Noir', Taille: 'M' }, price: 19.9, stockQuantity: 8 },
    { attributes: { Couleur: 'Noir', Taille: 'L' }, price: 19.9, stockQuantity: 3 },
    { attributes: { Couleur: 'Blanc', Taille: 'M' }, price: 19.9, stockQuantity: 0 },
  ]);
  shoes = await createProduct(admin, [
    { attributes: { Pointure: '42' }, price: 59, stockQuantity: 5 },
    { attributes: { Pointure: '45' }, price: 59, stockQuantity: 2 },
  ], 'Baskets test');
});
after(async () => { await pool.end(); });

const order = (items, extra = {}) => request(app).post('/api/orders').send({ ...CUSTOMER, items, ...extra });
const stockOf = async (id) => Number((await pool.query('SELECT stock_quantity FROM product_variants WHERE id=?', [id]))[0][0].stock_quantity);

describe('Catalogue public', () => {
  test('liste les produits actifs avec prix et disponibilité', async () => {
    const res = await request(app).get('/api/products');
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 2);
    assert.ok(res.body.items.every((p) => typeof p.priceMin === 'number'));
  });
  test('fiche produit : variantes dynamiques (lettres ET pointures numériques)', async () => {
    const a = await request(app).get(`/api/products/${shirt.slug}`);
    assert.equal(a.body.variants.length, 3);
    assert.equal(a.body.variants[2].stock, 0);
    const b = await request(app).get(`/api/products/${shoes.slug}`);
    assert.deepEqual(b.body.variants.map((v) => v.attributes.Pointure), ['42', '45']);
  });
  test('produit désactivé invisible', async () => {
    const p = await createProduct(admin, [{ attributes: {}, price: 5, stockQuantity: 1 }], 'Caché');
    await admin.patch(`/api/admin/products/${p.id}/active`).send({ isActive: false });
    assert.equal((await request(app).get(`/api/products/${p.slug}`)).status, 404);
  });
});

describe('Commandes', () => {
  test('création : prix recalculé côté serveur, stock déduit, notification créée', async () => {
    const v = shirt.variants[0];
    const res = await order([{ variantId: v.id, quantity: 2, expectedPrice: 19.9 }]);
    assert.equal(res.status, 201);
    assert.match(res.body.orderNumber, /^CMD-[A-Z2-9]{10}$/);
    assert.equal(res.body.total, 39.8);
    assert.equal(await stockOf(v.id), 6);
    const n = await admin.get('/api/admin/counters');
    assert.ok(n.body.unreadNotifications >= 1);
  });
  test('rejette quantité > stock, nulle ou négative', async () => {
    const v = shirt.variants[1];
    assert.equal((await order([{ variantId: v.id, quantity: 4 }])).status, 409);
    assert.equal((await order([{ variantId: v.id, quantity: 0 }])).status, 400);
    assert.equal((await order([{ variantId: v.id, quantity: -1 }])).status, 400);
    assert.equal(await stockOf(v.id), 3);
  });
  test('rejette une variante épuisée', async () => {
    assert.equal((await order([{ variantId: shirt.variants[2].id, quantity: 1 }])).status, 409);
  });
  test('prix envoyé par le client ignoré / changement de prix signalé', async () => {
    const v = shoes.variants[0];
    const res = await order([{ variantId: v.id, quantity: 1, expectedPrice: 1 }]);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CART_CHANGED');
    assert.equal(res.body.error.details[0].reason, 'PRICE_CHANGED');
  });
  test('achats simultanés des dernières unités : jamais de stock négatif', async () => {
    const v = shoes.variants[1]; // stock 2
    const results = await Promise.all(Array.from({ length: 6 }, () => order([{ variantId: v.id, quantity: 1 }])));
    assert.equal(results.filter((r) => r.status === 201).length, 2);
    assert.equal(await stockOf(v.id), 0);
  });
  test('double soumission avec la même clé d\'idempotence = une seule commande', async () => {
    const v = shirt.variants[0];
    const key = 'idem-key-12345678';
    const [a, b] = await Promise.all([1, 2].map(() => request(app).post('/api/orders').set('Idempotency-Key', key).send({ ...CUSTOMER, items: [{ variantId: v.id, quantity: 1 }] })));
    assert.equal(a.body.orderNumber, b.body.orderNumber);
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM orders WHERE idempotency_key = ?', [key]);
    assert.equal(Number(n), 1);
  });
  test('transaction : aucune commande partielle si une ligne échoue', async () => {
    const [[{ before }]] = await pool.query('SELECT COUNT(*) AS `before` FROM orders');
    const res = await order([{ variantId: shirt.variants[0].id, quantity: 1 }, { variantId: shirt.variants[2].id, quantity: 1 }]);
    assert.equal(res.status, 409);
    const [[{ after }]] = await pool.query('SELECT COUNT(*) AS `after` FROM orders');
    assert.equal(Number(before), Number(after));
  });
});

describe('Administration : sécurité', () => {
  test('routes admin refusées sans session', async () => {
    for (const url of ['/api/admin/dashboard', '/api/admin/orders', '/api/admin/products', '/api/admin/notifications']) {
      assert.equal((await request(app).get(url)).status, 401);
    }
  });
  test('mauvais mot de passe refusé, CUSTOMER refusé', async () => {
    assert.equal((await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: 'mauvais' })).status, 401);
    assert.equal((await request(app).post('/api/auth/login').send({ email: 'client@example.test', password: 'Client-Password-123' })).status, 401);
  });
  test('CSRF : écriture sans jeton refusée', async () => {
    const res = await admin.agent.patch('/api/admin/orders/1/status').send({ status: 'CONFIRMEE' });
    assert.equal(res.status, 403);
  });
  test('cookie de session HttpOnly', async () => {
    const res = await request(app).post('/api/auth/login').send(ADMIN);
    assert.match(res.headers['set-cookie'][0], /HttpOnly/);
  });
});

describe('Cycle de vie d\'une commande', () => {
  let created; let id;
  before(async () => {
    created = (await order([{ variantId: shoes.variants[0].id, quantity: 2 }])).body;
    id = (await admin.get('/api/admin/orders?view=todo&search=' + created.orderNumber)).body.items[0].id;
  });

  test('statut initial EN_ATTENTE, non payée, listée dans « à traiter »', async () => {
    const d = (await admin.get(`/api/admin/orders/${id}`)).body;
    assert.equal(d.status, 'EN_ATTENTE');
    assert.equal(d.paymentStatus, 'NON_PAYE');
    assert.equal(d.items[0].quantity, 2);
  });
  test('le client voit « confirmée » après confirmation par l\'admin', async () => {
    const track = (body) => request(app).post('/api/orders/track').send(body);
    assert.equal((await track({ orderNumber: created.orderNumber, phone: CUSTOMER.customerPhone })).body.status, 'EN_ATTENTE');
    const r = await admin.patch(`/api/admin/orders/${id}/status`).send({ status: 'CONFIRMEE' });
    assert.equal(r.status, 200);
    const t = await track({ orderNumber: created.orderNumber, phone: '22890123456' });
    assert.equal(t.body.status, 'CONFIRMEE');
    assert.ok(t.body.timeline.some((e) => e.value === 'CONFIRMEE'));
  });
  test('suivi refusé avec un mauvais téléphone', async () => {
    assert.equal((await request(app).post('/api/orders/track').send({ orderNumber: created.orderNumber, phone: '0000000000' })).status, 404);
  });
  test('marquer payé puis visible côté client', async () => {
    const r = await admin.patch(`/api/admin/orders/${id}/payment`).send({ paid: true, note: 'Espèces à la livraison' });
    assert.equal(r.body.paymentStatus, 'PAYE');
    const t = await request(app).post('/api/orders/track').send({ orderNumber: created.orderNumber, phone: CUSTOMER.customerPhone });
    assert.equal(t.body.paymentStatus, 'PAYE');
  });
  test('transition invalide refusée', async () => {
    assert.equal((await admin.patch(`/api/admin/orders/${id}/status`).send({ status: 'EN_ATTENTE' })).status, 409);
  });
  test('historique conservé (statut + paiement + admin)', async () => {
    const d = (await admin.get(`/api/admin/orders/${id}`)).body;
    assert.deepEqual(d.history.map((h) => `${h.type}:${h.to}`), ['STATUS:EN_ATTENTE', 'STATUS:CONFIRMEE', 'PAYMENT:PAYE']);
    assert.equal(d.history[1].admin, 'Admin Test');
  });
  test('annulation : stock restitué une seule fois, paiement bloqué', async () => {
    const v = shoes.variants[0];
    const before = await stockOf(v.id);
    assert.equal((await admin.patch(`/api/admin/orders/${id}/status`).send({ status: 'ANNULEE' })).status, 200);
    assert.equal(await stockOf(v.id), before + 2);
    assert.equal((await admin.patch(`/api/admin/orders/${id}/status`).send({ status: 'ANNULEE' })).status, 409);
    assert.equal(await stockOf(v.id), before + 2);
    assert.equal((await admin.patch(`/api/admin/orders/${id}/payment`).send({ paid: false })).status, 409);
  });
  test('terminer une commande ne touche pas au stock', async () => {
    const v = shirt.variants[0];
    const c = (await order([{ variantId: v.id, quantity: 1 }])).body;
    const oid = (await admin.get('/api/admin/orders?search=' + c.orderNumber)).body.items[0].id;
    const before = await stockOf(v.id);
    await admin.patch(`/api/admin/orders/${oid}/status`).send({ status: 'CONFIRMEE' });
    await admin.patch(`/api/admin/orders/${oid}/status`).send({ status: 'TERMINEE' });
    assert.equal(await stockOf(v.id), before);
    assert.equal((await admin.get('/api/admin/orders?view=done')).body.items.some((o) => o.id === oid), true);
  });
});

describe('Historique des prix et des produits', () => {
  test('modifier le prix / supprimer une variante ne change pas les commandes passées', async () => {
    const p = await createProduct(admin, [{ attributes: { Taille: 'M' }, price: 10, stockQuantity: 5 }, { attributes: { Taille: 'L' }, price: 10, stockQuantity: 5 }], 'Produit historique');
    const c = (await order([{ variantId: p.variants[0].id, quantity: 1 }])).body;
    await admin.put(`/api/admin/products/${p.id}`).send({
      name: 'Produit historique renommé', isActive: true,
      variants: [{ id: p.variants[0].id, attributes: { Taille: 'M' }, price: 99, stockQuantity: 4 }],
    });
    const oid = (await admin.get('/api/admin/orders?search=' + c.orderNumber)).body.items[0].id;
    const d = (await admin.get(`/api/admin/orders/${oid}`)).body;
    assert.equal(d.items[0].unitPrice, 10);
    assert.equal(d.items[0].name, 'Produit historique');
    // variante L (jamais commandée) supprimée, M conservée
    const after = (await admin.get(`/api/admin/products/${p.id}`)).body;
    assert.equal(after.variants.length, 1);
  });
  test('variante déjà commandée et retirée : désactivée, pas supprimée', async () => {
    const p = await createProduct(admin, [{ attributes: { Taille: 'S' }, price: 10, stockQuantity: 5 }, { attributes: { Taille: 'M' }, price: 10, stockQuantity: 5 }], 'Produit retrait');
    await order([{ variantId: p.variants[0].id, quantity: 1 }]);
    await admin.put(`/api/admin/products/${p.id}`).send({ name: 'Produit retrait', isActive: true, variants: [{ id: p.variants[1].id, attributes: { Taille: 'M' }, price: 10, stockQuantity: 5 }] });
    const [[row]] = await pool.query('SELECT is_active FROM product_variants WHERE id = ?', [p.variants[0].id]);
    assert.equal(row.is_active, 0);
  });
});

describe('Messages, notifications et stock admin', () => {
  test('message client → notification + boîte de réception + marquer traité', async () => {
    const res = await request(app).post('/api/messages').send({ name: 'Kofi', phone: '90112233', message: 'Avez-vous la pointure 46 ?' });
    assert.equal(res.status, 201);
    const c = (await admin.get('/api/admin/counters')).body;
    assert.ok(c.newMessages >= 1);
    const list = (await admin.get('/api/admin/messages?status=NOUVEAU')).body.items;
    const done = await admin.patch(`/api/admin/messages/${list[0].id}/status`).send({ status: 'TRAITE' });
    assert.equal(done.body.status, 'TRAITE');
  });
  test('message sans moyen de contact rejeté', async () => {
    assert.equal((await request(app).post('/api/messages').send({ name: 'X Y', message: 'Bonjour toi' })).status, 400);
  });
  test('notifications : lecture individuelle et globale', async () => {
    const list = (await admin.get('/api/admin/notifications?filter=unread')).body;
    assert.ok(list.total > 0);
    await admin.patch(`/api/admin/notifications/${list.items[0].id}/read`).send({});
    await admin.post('/api/admin/notifications/read-all').send({});
    assert.equal((await admin.get('/api/admin/counters')).body.unreadNotifications, 0);
  });
  test('ajustement de stock validé côté serveur + historique', async () => {
    const v = shoes.variants[1];
    assert.equal((await admin.post(`/api/admin/variants/${v.id}/stock`).send({ quantity: -3, reason: 'Erreur' })).status, 400);
    assert.equal((await admin.post(`/api/admin/variants/${v.id}/stock`).send({ quantity: 7, reason: 'Réception' })).status, 200);
    const h = (await admin.get(`/api/admin/variants/${v.id}/stock-history`)).body.items;
    assert.equal(h[0].after, 7);
    assert.equal(h[0].admin, 'Admin Test');
  });
  test('tableau de bord alimenté par MySQL', async () => {
    const d = (await admin.get('/api/admin/dashboard')).body;
    assert.ok(d.counts.annulee >= 1 && d.counts.terminee >= 1);
    assert.ok(Array.isArray(d.latestOrders));
  });
});
