'use strict';
const rateLimit = require('express-rate-limit');
const config = require('../config/env');

const make = (windowMs, max, message) =>
  rateLimit({
    windowMs, max: config.isTest ? 10000 : max,
    standardHeaders: true, legacyHeaders: false,
    message: { error: { code: 'TOO_MANY_REQUESTS', message } },
  });

module.exports = {
  loginLimiter: make(15 * 60 * 1000, 10, 'Trop de tentatives de connexion. Réessayez dans quelques minutes.'),
  apiLimiter: make(60 * 1000, 300, 'Trop de requêtes. Réessayez dans un instant.'),
  orderLimiter: make(10 * 60 * 1000, 30, 'Trop de commandes envoyées. Réessayez plus tard.'),
  trackLimiter: make(10 * 60 * 1000, 60, 'Trop de recherches. Réessayez plus tard.'),
  messageLimiter: make(60 * 60 * 1000, 10, 'Trop de messages envoyés. Réessayez plus tard.'),
};
