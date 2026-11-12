'use strict';
const config = require('../config/env');
const customers = require('../services/customerService');
const { unauthorized } = require('../utils/errors');
const { asyncHandler } = require('../utils/helpers');

// Cookie DIFFÉRENT de celui de l'administration (admin_token) : les deux sessions sont indépendantes.
const CUSTOMER_COOKIE = 'customer_token';

const customerCookieOptions = () => ({
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: config.cookieSameSite,
  maxAge: config.customerTtlDays * 24 * 3600 * 1000,
  path: '/',
});

/** Exige un client connecté ; recharge le compte en base à chaque requête. */
const requireCustomer = asyncHandler(async (req, res, next) => {
  const token = req.cookies && req.cookies[CUSTOMER_COOKIE];
  if (!token) throw unauthorized('Connectez-vous à votre compte.');
  const session = await customers.verifyToken(token);
  if (!session) throw unauthorized('Session expirée. Veuillez vous reconnecter.');
  req.customer = session.customer;
  req.csrfToken = session.csrf;
  next();
});

/**
 * Client connecté facultatif (passer commande). La commande n'est rattachée au compte que si
 * le jeton CSRF est présent et correct : un autre site ne peut donc pas commander « au nom » du client.
 */
const optionalCustomer = asyncHandler(async (req, res, next) => {
  const token = req.cookies && req.cookies[CUSTOMER_COOKIE];
  if (token) {
    const session = await customers.verifyToken(token);
    if (session && req.get('x-csrf-token') === session.csrf) req.customer = session.customer;
  }
  next();
});

module.exports = { requireCustomer, optionalCustomer, CUSTOMER_COOKIE, customerCookieOptions };
