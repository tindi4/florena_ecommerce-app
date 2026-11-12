'use strict';
const express = require('express');
const multer = require('multer');
const pub = require('../controllers/publicController');
const authC = require('../controllers/authController');
const admin = require('../controllers/adminController');
const cust = require('../controllers/customerController');
const { requireAdmin, requirePermission, csrfProtect } = require('../middleware/auth');
const { requireCustomer, optionalCustomer } = require('../middleware/customerAuth');
const { loginLimiter, customerLoginLimiter, registerLimiter, orderLimiter, trackLimiter, messageLimiter } = require('../middleware/rateLimit');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
// Logo : 2 Mo maximum (le type réel du fichier est contrôlé ensuite par settingsService).
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
const uploadLimit = (label) => (req, res, next) => { req.uploadLimitLabel = label; next(); };
const router = express.Router();

/* Public */
router.get('/settings', pub.settings);
router.get('/categories', pub.categories);
router.get('/products', pub.products);
router.get('/products/:slug', pub.product);
router.post('/cart/check', pub.cartCheck);
router.post('/orders', orderLimiter, optionalCustomer, pub.createOrder);   // rattachée au compte si le client est connecté
router.post('/orders/track', trackLimiter, pub.trackOrder);
router.post('/orders/invoice', trackLimiter, pub.invoice);
router.patch('/orders/edit', trackLimiter, pub.editOrder);
router.post('/messages', messageLimiter, pub.contact);

/* Comptes clients (cookie customer_token, distinct de la session admin) */
router.post('/customer/register', registerLimiter, cust.register);
router.post('/customer/login', customerLoginLimiter, cust.login);
router.post('/customer/logout', cust.logout);
router.get('/customer/me', requireCustomer, cust.me);

const acc = express.Router();
acc.use(requireCustomer, csrfProtect);           // client connecté + jeton CSRF pour toute écriture
acc.get('/orders', cust.orders);
acc.get('/orders/:number', cust.order);
acc.get('/orders/:number/invoice', cust.invoice);
acc.post('/orders/claim', trackLimiter, cust.claim);
acc.patch('/profile', cust.updateProfile);
acc.post('/password', customerLoginLimiter, cust.changePassword);
acc.patch('/preferences', cust.preferences);
router.use('/account', acc);

/* Auth */
router.post('/auth/login', loginLimiter, authC.login);
router.post('/auth/logout', authC.logout);
router.get('/auth/me', requireAdmin, authC.me);

/* Admin : authentification + CSRF sur toutes les routes */
const a = express.Router();
a.use(requireAdmin, csrfProtect);
// Chaque route exige une permission précise (voir src/config/permissions.js), relue en base à chaque requête.
// requirePermission('a', 'b') = il suffit d'avoir l'une des deux.
const P = requirePermission;

a.get('/counters', admin.counters);                                    // pastilles du menu : tout membre de l'équipe
a.get('/dashboard', P('orders.view'), admin.dashboard);

a.get('/orders', P('orders.view'), admin.listOrders);
a.get('/orders/:id', P('orders.view'), admin.getOrder);
a.get('/orders/:id/invoice', P('orders.view'), admin.invoice);
a.put('/orders/:id', P('orders.edit'), admin.editOrder);              // téléphone, coordonnées, livraison, articles
a.get('/order-variants', P('orders.edit'), admin.searchVariants);      // articles à ajouter à une commande
a.patch('/orders/:id/status', P('orders.status', 'orders.cancel'), admin.changeStatus);   // ANNULEE exige orders.cancel (contrôleur)
a.patch('/orders/:id/payment', P('orders.payment'), admin.setPayment);
a.patch('/orders/:id/delivery-fee', P('orders.fee'), admin.setDeliveryFee);
a.post('/orders/:id/notify', P('orders.notify'), admin.notifyCustomer);

a.get('/notifications', P('orders.view', 'messages'), admin.listNotifications);
a.post('/notifications/read-all', P('orders.view', 'messages'), admin.markAllRead);
a.patch('/notifications/:id/read', P('orders.view', 'messages'), admin.markRead);
a.get('/messages', P('messages'), admin.listMessages);
a.patch('/messages/:id/status', P('messages'), admin.setMessageStatus);

a.get('/products', P('products'), admin.listProducts);
a.post('/products', P('products'), admin.createProduct);
a.get('/products/:id', P('products'), admin.getProduct);
a.put('/products/:id', P('products'), admin.updateProduct);
a.patch('/products/:id/active', P('products'), admin.setProductActive);
a.post('/products/:id/images', P('products'), upload.single('image'), admin.addImage);
a.delete('/images/:id', P('products'), admin.deleteImage);

a.get('/categories', P('products', 'stock'), admin.listCategories);
a.post('/categories', P('products'), admin.createCategory);
a.put('/categories/:id', P('products'), admin.updateCategory);
a.patch('/categories/:id/active', P('products'), admin.setCategoryActive);

a.get('/stock', P('stock'), admin.listStock);
a.post('/variants/:id/stock', P('stock'), admin.adjustStock);
a.get('/variants/:id/stock-history', P('stock'), admin.stockHistory);

a.get('/stats', P('stats'), admin.stats);

a.get('/users', P('team'), admin.listUsers);
a.post('/users', P('team'), admin.createUser);
a.patch('/users/:id', P('team'), admin.updateUser);
a.post('/users/:id/password', P('team'), admin.resetUserPassword);
a.get('/roles', P('team'), admin.listRoles);
a.post('/roles', P('team'), admin.createRole);
a.patch('/roles/:id', P('team'), admin.updateRole);
a.delete('/roles/:id', P('team'), admin.deleteRole);

const settingsPerm = requirePermission('settings');
a.get('/settings', settingsPerm, admin.getSettings);
a.put('/settings', settingsPerm, admin.updateSettings);
a.post('/settings/logo', settingsPerm, uploadLimit('2 Mo'), logoUpload.single('logo'), admin.uploadLogo);
a.delete('/settings/logo', settingsPerm, admin.deleteLogo);

router.use('/admin', a);
module.exports = router;
