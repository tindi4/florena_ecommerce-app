'use strict';
const rateLimit = require('express-rate-limit');
const config = require('../config/env');

const make = (windowMs, max, message) =>
  rateLimit({
    windowMs, limit: config.isTest ? 10000 : max,
    standardHeaders: true, legacyHeaders: false,
    message: { error: { code: 'TOO_MANY_REQUESTS', message } },
  });

module.exports = {
  loginLimiter: make(15 * 60 * 1000, 10, 'Trop de tentatives de connexion. Réessayez dans quelques minutes.'),
  customerLoginLimiter: make(15 * 60 * 1000, 10, 'Trop de tentatives de connexion. Réessayez dans quelques minutes.'),
  // Mot de passe oublié : une demande par minute et cinq par heure depuis une même connexion.
  forgotMinuteLimiter: make(60 * 1000, 1, 'Une demande vient déjà d’être envoyée. Patientez une minute.'),
  resetLimiter: make(60 * 60 * 1000, 5, 'Trop de demandes de réinitialisation. Réessayez plus tard.'),
  registerLimiter: make(60 * 60 * 1000, 5, 'Trop de comptes créés depuis cette connexion. Réessayez plus tard.'),
  apiLimiter: make(60 * 1000, 300, 'Trop de requêtes. Réessayez dans un instant.'),
  orderLimiter: make(10 * 60 * 1000, 30, 'Trop de commandes envoyées. Réessayez plus tard.'),
  trackLimiter: make(10 * 60 * 1000, 60, 'Trop de recherches. Réessayez plus tard.'),
  messageLimiter: make(60 * 60 * 1000, 10, 'Trop de messages envoyés. Réessayez plus tard.'),
  reviewLimiter: make(60 * 60 * 1000, 10, 'Trop d’avis envoyés. Réessayez plus tard.'),
};
