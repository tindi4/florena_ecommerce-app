'use strict';
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, pool, resetDb, adminAgent, createProduct, ADMIN } = require('./helpers');

const BASE = { customerName: 'Client Test', customerPhone: '90 12 34 56', deliveryAddress: '12 rue des Fleurs, Lomé' };
let admin; let shirt;
const order = (extra = {}, qty = 1) => request(app).post('/api/orders').send({ ...BASE, items: [{ variantId: shirt.variants[0].id, quantity: qty }], ...extra });
const findId = async (n) => (await admin.get('/api/admin/orders?view=all&search=' + n)).body.items[0].id;

before(async () => {
  await resetDb();
  admin = await adminAgent();
  shirt = await createProduct(admin, [{ attributes: { Taille: 'M' }, price: 20, stockQuantity: 100 }]);
});
after(async () => { await pool.end(); });

describe('Commande : nom, civilité, localisation, livraison', () => {
  test('nom obligatoire, téléphone obligatoire', async () => {
    assert.equal((await order({ customerName: '' })).status, 400);
    assert.equal((await order({ customerName: undefined })).status, 400);
    assert.equal((await order({ customerPhone: '' })).status, 400);
  });
  test('civilité (Monsieur/Madame) vide par défaut, enregistrée seulement si choisie', async () => {
    const none = await order();
    assert.equal((await admin.get(`/api/admin/orders/${await findId(none.body.orderNumber)}`)).body.customerGender, null);
    const ok = await order({ customerGender: 'FEMME' });
    assert.equal((await admin.get(`/api/admin/orders/${await findId(ok.body.orderNumber)}`)).body.customerGender, 'FEMME');
    assert.equal((await order({ customerGender: 'AUTRE' })).status, 400);
  });
  test('position GPS enregistrée + lien Google Maps ; position incomplète refusée', async () => {
    const res = await order({ latitude: 6.1725, longitude: 1.2314, locationLabel: 'Lomé, Togo' });
    const d = (await admin.get(`/api/admin/orders/${await findId(res.body.orderNumber)}`)).body;
    assert.equal(d.latitude, 6.1725);
    assert.match(d.mapsUrl, /google\.com\/maps\?q=6\.1725,1\.2314/);
    assert.equal((await order({ latitude: 6.1 })).status, 400);
    assert.equal((await order({ latitude: 120, longitude: 1 })).status, 400);
  });
  test('sans livraison : adresse facultative (retrait sur place), total = articles', async () => {
    const res = await order({ deliveryAddress: undefined }, 2);
    assert.equal(res.body.total, 40);
    const d = (await admin.get(`/api/admin/orders/${await findId(res.body.orderNumber)}`)).body;
    assert.equal(d.deliveryRequested, false); assert.equal(d.deliveryFeeStatus, 'NONE'); assert.equal(d.deliveryAddress, 'Retrait sur place');
  });
  test('« Me faire livrer » exige une adresse ou un quartier', async () => {
    assert.equal((await order({ deliveryRequested: true, deliveryAddress: undefined })).status, 400);
  });
  test('livraison + frais cochés : frais « à confirmer », total sans frais tant que l\'admin n\'a rien fixé', async () => {
    const res = await order({ deliveryRequested: true, deliveryFeeAccepted: true }, 2);
    assert.equal(res.body.total, 40);
    const d = (await admin.get(`/api/admin/orders/${await findId(res.body.orderNumber)}`)).body;
    assert.equal(d.deliveryFeeStatus, 'PENDING'); assert.equal(d.deliveryFee, 0); assert.equal(d.suggestedFee, 1000);
  });
  test('l\'admin fixe librement les frais (1000 ou autre montant) ; total recalculé et tracé', async () => {
    const res = await order({ deliveryRequested: true, deliveryFeeAccepted: true });
    const id = await findId(res.body.orderNumber);
    const r1 = await admin.patch(`/api/admin/orders/${id}/delivery-fee`).send({ fee: 1000 });
    assert.equal(r1.body.total, 1020); assert.equal(r1.body.deliveryFeeStatus, 'SET');
    const r2 = await admin.patch(`/api/admin/orders/${id}/delivery-fee`).send({ fee: 2750 });
    assert.equal(r2.body.total, 2770);
    assert.ok(r2.body.history.some((h) => h.type === 'FEE' && h.to === '2750'));
    assert.equal((await admin.patch(`/api/admin/orders/${id}/delivery-fee`).send({ fee: -5 })).status, 400);
    const t = (await request(app).post('/api/orders/track').send({ orderNumber: res.body.orderNumber, phone: '90123456' })).body;
    assert.equal(t.deliveryFee, 2750); assert.equal(t.total, 2770);
  });
  test('frais non modifiables une fois la commande annulée', async () => {
    const res = await order({ deliveryRequested: true });
    const id = await findId(res.body.orderNumber);
    await admin.patch(`/api/admin/orders/${id}/status`).send({ status: 'ANNULEE' });
    assert.equal((await admin.patch(`/api/admin/orders/${id}/delivery-fee`).send({ fee: 1000 })).status, 409);
  });
  test('réglages publics : montant suggéré et WhatsApp boutique', async () => {
    const s = (await request(app).get('/api/settings')).body;
    assert.equal(s.delivery.suggestedFee, 1000); assert.ok('shopWhatsapp' in s);
  });
});

describe('Modification de la commande par le client', () => {
  let number; let id;
  const edit = (changes, phone = '90 12 34 56') => request(app).patch('/api/orders/edit').send({ orderNumber: number, phone, changes });
  before(async () => { number = (await order({ customerName: 'Ama' })).body.orderNumber; id = await findId(number); });

  test('toute modification notifie l\'admin (notification + badge « Modifiée » + historique)', async () => {
    await admin.post('/api/admin/notifications/read-all').send({});
    const r = await edit({ deliveryRequested: true, deliveryFeeAccepted: true, deliveryAddress: 'Agoè, rue 12', comment: 'Appelez avant' });
    assert.equal(r.status, 200);
    assert.equal(r.body.deliveryRequested, true); assert.equal(r.body.deliveryFeeStatus, 'PENDING');
    const n = (await admin.get('/api/admin/notifications?filter=unread')).body.items;
    assert.ok(n.some((x) => x.type === 'ORDER_UPDATED' && x.orderId === id));
    const list = (await admin.get('/api/admin/orders?view=all&search=' + number)).body.items[0];
    assert.equal(list.isUpdated, true);
    const d = (await admin.get(`/api/admin/orders/${id}`)).body; // ouvrir la commande = notification lue
    assert.ok(d.history.some((h) => h.type === 'EDIT' && /adresse/.test(h.comment)));
    assert.equal((await admin.get('/api/admin/orders?view=all&search=' + number)).body.items[0].isUpdated, false);
  });
  test('aucune notification si rien n\'a changé', async () => {
    await admin.post('/api/admin/notifications/read-all').send({});
    await edit({ comment: 'Appelez avant' });
    assert.equal((await admin.get('/api/admin/counters')).body.unreadNotifications, 0);
  });
  test('annuler la livraison supprime les frais', async () => {
    await admin.patch(`/api/admin/orders/${id}/delivery-fee`).send({ fee: 1000 });
    const r = await edit({ deliveryRequested: false });
    assert.equal(r.body.deliveryFee, 0); assert.equal(r.body.total, 20);
  });
  test('mauvais téléphone refusé ; nom trop court refusé', async () => {
    assert.equal((await edit({ comment: 'x' }, '0000000000')).status, 404);
    assert.equal((await edit({ customerName: 'A' })).status, 400);
  });
  test('plus modifiable une fois en préparation', async () => {
    await admin.patch(`/api/admin/orders/${id}/status`).send({ status: 'CONFIRMEE' });
    assert.equal((await edit({ comment: 'ok' })).status, 200);
    await admin.patch(`/api/admin/orders/${id}/status`).send({ status: 'EN_PREPARATION' });
    const r = await edit({ comment: 'trop tard' });
    assert.equal(r.status, 409); assert.equal(r.body.error.code, 'NOT_EDITABLE');
  });
});

describe('Confirmation WhatsApp / SMS choisie par l\'admin', () => {
  let id; let number;
  before(async () => { const r = await order({ customerName: 'Kofi', customerGender: 'HOMME', customerPhone: '+228 90 12 34 56' }); number = r.body.orderNumber; id = await findId(number); });
  test('message par défaut proposé dans le détail', async () => {
    const d = (await admin.get(`/api/admin/orders/${id}`)).body;
    assert.match(d.confirmation.defaultMessage, new RegExp(`Monsieur Kofi.*${number}.*confirmée`));
    assert.equal(d.confirmation.channel, null);
  });
  test('WhatsApp : lien wa.me avec numéro international', async () => {
    const r = await admin.post(`/api/admin/orders/${id}/notify`).send({ channel: 'WHATSAPP' });
    assert.equal(r.status, 200);
    assert.match(r.body.url, /^https:\/\/wa\.me\/22890123456\?text=/);
  });
  test('SMS : numéro local complété avec l\'indicatif, message modifiable', async () => {
    const other = await order({ customerPhone: '90 99 88 77' });
    const oid = await findId(other.body.orderNumber);
    const r = await admin.post(`/api/admin/orders/${oid}/notify`).send({ channel: 'SMS', message: 'Bonjour, votre colis arrive.' });
    assert.match(r.body.url, /^sms:\+22890998877\?&body=Bonjour/);
  });
  test('envoi tracé (canal, date, historique) ; canal invalide refusé', async () => {
    const d = (await admin.get(`/api/admin/orders/${id}`)).body;
    assert.equal(d.confirmation.channel, 'WHATSAPP'); assert.ok(d.confirmation.sentAt);
    assert.ok(d.history.some((h) => h.type === 'NOTIFY' && h.to === 'WHATSAPP'));
    assert.equal((await admin.post(`/api/admin/orders/${id}/notify`).send({ channel: 'EMAIL' })).status, 400);
  });
  test('commande annulée : envoi refusé', async () => {
    await admin.patch(`/api/admin/orders/${id}/status`).send({ status: 'ANNULEE' });
    assert.equal((await admin.post(`/api/admin/orders/${id}/notify`).send({ channel: 'SMS' })).status, 409);
  });
});

describe('Statistiques et suivi financier', () => {
  test('chiffre d\'affaires, caisse du jour, produits les plus vendus', async () => {
    const a = (await order({}, 3)).body; // 60
    const b = (await order({}, 1)).body; // 20
    const idA = await findId(a.orderNumber);
    await admin.patch(`/api/admin/orders/${idA}/payment`).send({ paid: true });
    const idB = await findId(b.orderNumber);
    await admin.patch(`/api/admin/orders/${idB}/status`).send({ status: 'CONFIRMEE' });
    await admin.patch(`/api/admin/orders/${idB}/status`).send({ status: 'ANNULEE' });
    const st = (await admin.get('/api/admin/stats')).body;
    const today = st.daily[st.daily.length - 1];
    assert.ok(st.today.cash >= 60);                      // la commande A est encaissée
    assert.ok(today.revenue >= 60);
    assert.ok(st.totals.cancelledCount >= 1);              // B annulée : hors chiffre d'affaires
    assert.equal(st.topProducts[0].name, 'T-shirt test');
    assert.ok(st.totals.unpaidCount >= 1);
    assert.equal(st.daily.length, 30);
  });
  test('période personnalisée et période invalide', async () => {
    const t = new Date().toISOString().slice(0, 10);
    assert.equal((await admin.get(`/api/admin/stats?from=${t}&to=${t}`)).body.daily.length, 1);
    assert.equal((await admin.get('/api/admin/stats?from=2030-01-02&to=2030-01-01')).status, 400);
  });
});

describe('Facture / bon de commande PDF', () => {
  let number; let id;
  before(async () => { number = (await order({ customerName: 'Ama' })).body.orderNumber; id = await findId(number); });
  const pdf = (req) => req.buffer(true).parse((res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
  test('le client télécharge son PDF (numéro + téléphone)', async () => {
    const res = await pdf(request(app).post('/api/orders/invoice').send({ orderNumber: number, phone: '90123456' }));
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /application\/pdf/);
    assert.equal(res.body.slice(0, 5).toString(), '%PDF-');
  });
  test('mauvais téléphone : refusé', async () => {
    assert.equal((await request(app).post('/api/orders/invoice').send({ orderNumber: number, phone: '0000000000' })).status, 404);
  });
  test('l\'admin télécharge aussi le PDF', async () => {
    const res = await pdf(admin.get(`/api/admin/orders/${id}/invoice`));
    assert.equal(res.body.slice(0, 5).toString(), '%PDF-');
  });
  test('route admin protégée', async () => {
    assert.equal((await request(app).get(`/api/admin/orders/${id}/invoice`)).status, 401);
  });
});

describe('Comptes de l\'équipe et rôles', () => {
  const login = async (email, password) => {
    const agent = request.agent(app);
    const r = await agent.post('/api/auth/login').send({ email, password });
    if (r.status !== 200) return { status: r.status };
    const w = (m) => (u) => agent[m](u).set('X-CSRF-Token', r.body.csrfToken);
    return { status: 200, user: r.body.user, get: w('get'), post: w('post'), patch: w('patch') };
  };
  const PASS = 'Mot-De-Passe-Equipe-12';
  let clerkId; let catId;

  test('l\'admin principal crée un compte avec le rôle de son choix', async () => {
    const c = await admin.post('/api/admin/users').send({ name: 'Awa', email: 'awa@example.test', password: PASS, role: 'ORDER_CLERK' });
    assert.equal(c.status, 201); clerkId = c.body.id;
    const k = await admin.post('/api/admin/users').send({ name: 'Yao', email: 'yao@example.test', password: PASS, role: 'CATALOG_CLERK' });
    catId = k.body.id;
    const list = (await admin.get('/api/admin/users')).body;
    assert.ok(list.items.some((u) => u.email === 'awa@example.test' && u.roleName === 'Gestionnaire de commandes'));
    assert.equal(list.roles.length, 4);   // les 4 anciens rôles sont devenus des modèles
    assert.ok(list.roles.some((r) => r.code === 'ORDER_CLERK' && r.isTemplate));
  });
  test('rôle ADMIN non attribuable, mot de passe trop court et e-mail en double refusés', async () => {
    assert.equal((await admin.post('/api/admin/users').send({ name: 'X Y', email: 'x@example.test', password: PASS, role: 'ADMIN' })).status, 400);
    assert.equal((await admin.post('/api/admin/users').send({ name: 'X Y', email: 'x@example.test', password: 'court', role: 'MANAGER' })).status, 400);
    assert.equal((await admin.post('/api/admin/users').send({ name: 'Awa 2', email: 'awa@example.test', password: PASS, role: 'MANAGER' })).status, 409);
  });
  test('gestionnaire de commandes : commandes oui, catalogue / stats / équipe non', async () => {
    const u = await login('awa@example.test', PASS);
    assert.equal(u.status, 200); assert.deepEqual(u.user.permissions, ['orders.view', 'orders.edit', 'orders.status', 'orders.fee', 'orders.cancel', 'orders.payment', 'orders.notify', 'messages']);
    assert.equal((await u.get('/api/admin/orders')).status, 200);
    assert.equal((await u.get('/api/admin/dashboard')).status, 200);
    for (const url of ['/api/admin/products', '/api/admin/stock', '/api/admin/categories', '/api/admin/stats', '/api/admin/users']) {
      assert.equal((await u.get(url)).status, 403, url);
    }
    assert.equal((await u.post('/api/admin/users').send({ name: 'Z Z', email: 'z@example.test', password: PASS, role: 'MANAGER' })).status, 403);
  });
  test('gestionnaire de catalogue : produits oui, commandes non', async () => {
    const u = await login('yao@example.test', PASS);
    assert.equal((await u.get('/api/admin/products')).status, 200);
    assert.equal((await u.get('/api/admin/orders')).status, 403);
    assert.equal((await u.get('/api/admin/stats')).status, 403);
  });
  test('gérant : commandes, catalogue et stats, mais pas l\'équipe', async () => {
    await admin.post('/api/admin/users').send({ name: 'Gérant', email: 'gerant@example.test', password: PASS, role: 'MANAGER' });
    const u = await login('gerant@example.test', PASS);
    assert.equal((await u.get('/api/admin/stats')).status, 200);
    assert.equal((await u.get('/api/admin/products')).status, 200);
    assert.equal((await u.get('/api/admin/users')).status, 403);
  });
  test('changer le rôle prend effet immédiatement', async () => {
    const u = await login('awa@example.test', PASS);
    await admin.patch(`/api/admin/users/${clerkId}`).send({ role: 'CATALOG_CLERK' });
    assert.equal((await u.get('/api/admin/orders')).status, 403);
    assert.equal((await u.get('/api/admin/products')).status, 200);
  });
  test('compte désactivé : session et connexion refusées', async () => {
    const u = await login('yao@example.test', PASS);
    await admin.patch(`/api/admin/users/${catId}`).send({ isActive: false });
    assert.equal((await u.get('/api/admin/products')).status, 401);
    assert.equal((await login('yao@example.test', PASS)).status, 401);
  });
  test('réinitialisation du mot de passe', async () => {
    await admin.post(`/api/admin/users/${catId}/password`).send({ password: 'Nouveau-Mot-De-Passe-99' });
    await admin.patch(`/api/admin/users/${catId}`).send({ isActive: true });
    assert.equal((await login('yao@example.test', PASS)).status, 401);
    assert.equal((await login('yao@example.test', 'Nouveau-Mot-De-Passe-99')).status, 200);
  });
  test('le compte principal est protégé', async () => {
    const [[main]] = await pool.query('SELECT id FROM users WHERE email = ?', [ADMIN.email]);
    assert.equal((await admin.patch(`/api/admin/users/${main.id}`).send({ isActive: false })).status, 400);
  });
});

describe('Modification complète d\'une commande par la boutique', () => {
  let shoes; let id; let number; let lineId;
  const stockOf = async (vid) => Number((await pool.query('SELECT stock_quantity FROM product_variants WHERE id=?', [vid]))[0][0].stock_quantity);
  const edit = (body, who = admin) => who.put(`/api/admin/orders/${id}`).send(body);
  before(async () => {
    shoes = await createProduct(admin, [
      { attributes: { Pointure: '42' }, price: 50, stockQuantity: 5 },
      { attributes: { Pointure: '45' }, price: 60, stockQuantity: 2 },
    ], 'Baskets édition');
    const r = await order({ customerName: 'Edem', customerPhone: '90 11 22 33' }, 2); // 2 × T-shirt (20)
    number = r.body.orderNumber; id = await findId(number);
    lineId = (await admin.get(`/api/admin/orders/${id}`)).body.items[0].id;
  });

  test('changer le numéro de téléphone : le client suit avec le nouveau numéro ; tracé avec le nom de l\'admin', async () => {
    const r = await edit({ details: { customerPhone: '+228 99 88 77 66' } });
    assert.equal(r.status, 200); assert.equal(r.body.customerPhone, '+228 99 88 77 66');
    const track = (phone) => request(app).post('/api/orders/track').send({ orderNumber: number, phone });
    assert.equal((await track('90112233')).status, 404);
    assert.equal((await track('22899887766')).status, 200);
    assert.ok(r.body.history.some((h) => h.type === 'EDIT' && /téléphone/.test(h.comment) && h.admin === 'Admin Test'));
  });
  test('coordonnées de livraison, position, nom, civilité, message', async () => {
    const r = await edit({ details: { customerName: 'Edem K.', customerGender: 'HOMME', deliveryRequested: true, deliveryFeeAccepted: true,
      deliveryAddress: 'Agbalépédogan, rue 5', comment: 'Portail bleu', latitude: 6.19, longitude: 1.21, locationLabel: 'Agbalépédogan' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.deliveryAddress, 'Agbalépédogan, rue 5'); assert.equal(r.body.deliveryFeeStatus, 'PENDING');
    assert.equal(r.body.latitude, 6.19); assert.equal(r.body.customerGender, 'HOMME');
  });
  test('livraison sans adresse refusée ; rien de modifié = aucun historique en plus', async () => {
    assert.equal((await edit({ details: { deliveryAddress: '' } })).status, 400);
    const before = (await admin.get(`/api/admin/orders/${id}`)).body.history.length;
    await edit({ details: { customerName: 'Edem K.' } });
    assert.equal((await admin.get(`/api/admin/orders/${id}`)).body.history.length, before);
  });
  test('augmenter la quantité retire du stock, la diminuer le restitue ; total recalculé', async () => {
    const v = shirt.variants[0]; const s0 = await stockOf(v.id);
    let r = await edit({ items: [{ lineId, quantity: 5 }] });
    assert.equal(r.status, 200); assert.equal(r.body.subtotal, 100); assert.equal(r.body.total, 100);
    assert.equal(await stockOf(v.id), s0 - 3);
    r = await edit({ items: [{ lineId, quantity: 1 }] });
    assert.equal(r.body.subtotal, 20); assert.equal(await stockOf(v.id), s0 + 1);
  });
  test('ajouter un article, prix personnalisé, frais de livraison conservés dans le total', async () => {
    await admin.patch(`/api/admin/orders/${id}/delivery-fee`).send({ fee: 1000 });
    const v = shoes.variants[0]; const s0 = await stockOf(v.id);
    const r = await edit({ items: [{ lineId, quantity: 1 }, { variantId: v.id, quantity: 2, unitPrice: 45 }] });
    assert.equal(r.status, 200);
    assert.equal(r.body.subtotal, 110);                  // 20 + 2 × 45
    assert.equal(r.body.total, 1110);                    // + 1000 de livraison
    assert.equal(await stockOf(v.id), s0 - 2);
    const added = r.body.items.find((i) => i.variantId === v.id);
    assert.equal(added.unitPrice, 45); assert.equal(added.attributes.Pointure, '42');
  });
  test('stock insuffisant : refusé, rien n\'est modifié (transaction)', async () => {
    const v = shoes.variants[1]; const s0 = await stockOf(v.id);
    const before = (await admin.get(`/api/admin/orders/${id}`)).body;
    const r = await edit({ items: [...before.items.map((i) => ({ lineId: i.id, quantity: i.quantity })), { variantId: v.id, quantity: 9 }] });
    assert.equal(r.status, 409); assert.equal(r.body.error.code, 'STOCK_CHANGED');
    assert.equal(await stockOf(v.id), s0);
    assert.equal((await admin.get(`/api/admin/orders/${id}`)).body.items.length, before.items.length);
  });
  test('article en double, ligne inconnue ou commande vide : refusés', async () => {
    const v = shoes.variants[0];
    const cur = (await admin.get(`/api/admin/orders/${id}`)).body.items.map((i) => ({ lineId: i.id, quantity: i.quantity }));
    assert.equal((await edit({ items: [...cur, { variantId: v.id, quantity: 1 }] })).status, 400);   // déjà dans la commande
    assert.equal((await edit({ items: [{ lineId: 999999, quantity: 1 }] })).status, 400);
    assert.equal((await edit({ items: [] })).status, 400);
  });
  test('retirer un article restitue son stock ; annuler ensuite ne restitue que ce qui reste', async () => {
    const t = shirt.variants[0]; const s = shoes.variants[0];
    const cur = (await admin.get(`/api/admin/orders/${id}`)).body;
    const shoeLine = cur.items.find((i) => i.variantId === s.id);
    const sShoes = await stockOf(s.id);
    await edit({ items: [{ lineId, quantity: 1 }] });                          // retire les baskets
    assert.equal(await stockOf(s.id), sShoes + 2);
    const sShirt = await stockOf(t.id);
    await admin.patch(`/api/admin/orders/${id}/status`).send({ status: 'ANNULEE' });
    assert.equal(await stockOf(t.id), sShirt + 1);                              // 1 seul T-shirt à restituer
    assert.equal(await stockOf(s.id), sShoes + 2);
    assert.ok(shoeLine);
  });
  test('commande annulée : coordonnées modifiables, articles non', async () => {
    assert.equal((await edit({ details: { customerName: 'Edem Corrigé' } })).status, 200);
    assert.equal((await edit({ items: [{ lineId, quantity: 2 }] })).status, 409);
  });
  test('recherche d\'articles à ajouter', async () => {
    const r = await admin.get('/api/admin/order-variants?search=Baskets');
    assert.equal(r.status, 200); assert.ok(r.body.items.length >= 2); assert.equal(r.body.items[0].productName, 'Baskets édition');
  });
  test('droits : gestionnaire de commandes et gérant peuvent, gestionnaire de catalogue non', async () => {
    const login = async (email) => {
      const agent = request.agent(app);
      const r = await agent.post('/api/auth/login').send({ email, password: 'Mot-De-Passe-Equipe-12' });
      const w = (m) => (u) => agent[m](u).set('X-CSRF-Token', r.body.csrfToken);
      return { status: r.status, put: w('put'), get: w('get') };
    };
    for (const [email, role] of [['clerk-edit@example.test', 'ORDER_CLERK'], ['mgr-edit@example.test', 'MANAGER'], ['cat-edit@example.test', 'CATALOG_CLERK']]) {
      await admin.post('/api/admin/users').send({ name: 'Equipe', email, password: 'Mot-De-Passe-Equipe-12', role });
    }
    const fresh = (await order({ customerName: 'Ama' })).body.orderNumber; const fid = await findId(fresh);
    const body = { details: { customerPhone: '90 00 00 01' } };
    assert.equal((await (await login('clerk-edit@example.test')).put(`/api/admin/orders/${fid}`).send(body)).status, 200);
    assert.equal((await (await login('mgr-edit@example.test')).put(`/api/admin/orders/${fid}`).send({ details: { customerName: 'Ama Z' } })).status, 200);
    const cat = await login('cat-edit@example.test');
    assert.equal((await cat.put(`/api/admin/orders/${fid}`).send(body)).status, 403);
    assert.equal((await cat.get('/api/admin/order-variants?search=a')).status, 403);
  });
});
