'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const config = require('./config/env');
const routes = require('./routes');
const { apiLimiter } = require('./middleware/rateLimit');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();
if (config.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin(origin, cb) {
    if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Idempotency-Key'],
}));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

if (!config.isTest) {
  app.use((req, res, next) => {
    res.on('finish', () => { if (res.statusCode >= 500) logger.error('HTTP 5xx', { method: req.method, path: req.path, status: res.statusCode }); });
    next();
  });
}

fs.mkdirSync(config.uploadDir, { recursive: true });
// Fichiers envoyés (photos, logo) : CSP très stricte. Même si un SVG piégé passait le filtre,
// le navigateur refuserait d'y exécuter un script (sandbox) ou de charger quoi que ce soit.
app.use('/uploads', (req, res, next) => {
  res.set('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  next();
}, express.static(config.uploadDir, { maxAge: '7d', index: false, dotfiles: 'deny' }));

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api', apiLimiter, routes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
