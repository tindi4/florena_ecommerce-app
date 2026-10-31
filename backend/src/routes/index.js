'use strict';
const express = require('express');
const multer = require('multer');
const pub = require('../controllers/publicController');
const authC = require('../controllers/authController');
const admin = require('../controllers/adminController');
const { requireAdmin, csrfProtect } = require('../middleware/auth');
const { loginLimiter, orderLimiter, trackLimiter, messageLimiter } = require('../middleware/rateLimit');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const router = express.Router();

/* Public */
router.get('/settings', pub.settings);
router.get('/categories', pub.categories);
router.get('/products', pub.products);
router.get('/products/:slug', pub.product);
router.post('/cart/check', pub.cartCheck);
router.post('/orders', orderLimiter, pub.createOrder);
router.post('/orders/track', trackLimiter, pub.trackOrder);
router.post('/messages', messageLimiter, pub.contact);

/* Auth */
router.post('/auth/login', loginLimiter, authC.login);
router.post('/auth/logout', authC.logout);
router.get('/auth/me', requireAdmin, authC.me);

/* Admin : authentification + CSRF sur toutes les routes */
const a = express.Router();
a.use(requireAdmin, csrfProtect);
a.get('/dashboard', admin.dashboard);
a.get('/counters', admin.counters);

a.get('/orders', admin.listOrders);
a.get('/orders/:id', admin.getOrder);
a.patch('/orders/:id/status', admin.changeStatus);
a.patch('/orders/:id/payment', admin.setPayment);

a.get('/notifications', admin.listNotifications);
a.post('/notifications/read-all', admin.markAllRead);
a.patch('/notifications/:id/read', admin.markRead);
a.get('/messages', admin.listMessages);
a.patch('/messages/:id/status', admin.setMessageStatus);

a.get('/products', admin.listProducts);
a.post('/products', admin.createProduct);
a.get('/products/:id', admin.getProduct);
a.put('/products/:id', admin.updateProduct);
a.patch('/products/:id/active', admin.setProductActive);
a.post('/products/:id/images', upload.single('image'), admin.addImage);
a.delete('/images/:id', admin.deleteImage);

a.get('/categories', admin.listCategories);
a.post('/categories', admin.createCategory);
a.put('/categories/:id', admin.updateCategory);
a.patch('/categories/:id/active', admin.setCategoryActive);

a.get('/stock', admin.listStock);
a.post('/variants/:id/stock', admin.adjustStock);
a.get('/variants/:id/stock-history', admin.stockHistory);

router.use('/admin', a);
module.exports = router;
