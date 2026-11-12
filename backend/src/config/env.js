'use strict';
const path = require('path');
// Le fichier .env se trouve à la racine du projet (voir .env.example).
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name} (voir .env.example)`);
  return value;
}

const jwtSecret = required('JWT_SECRET');
if (!isTest && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET doit contenir au moins 32 caractères.');
}

module.exports = {
  isProd,
  isTest,
  port: Number(process.env.PORT || 3000),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: required('DB_USER'),
    password: process.env.DB_PASSWORD || '',
    database: required('DB_NAME'),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  },
  jwtSecret,
  jwtTtlHours: Number(process.env.JWT_TTL_HOURS || 8),
  customerTtlDays: Number(process.env.CUSTOMER_TTL_DAYS || 30),   // durée de la session d'un client
  // Origines autorisées (frontend), séparées par des virgules.
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:4200').split(',').map((s) => s.trim()).filter(Boolean),
  // SameSite=None est nécessaire si frontend et API sont sur des domaines différents (HTTPS obligatoire).
  cookieSameSite: process.env.COOKIE_SAMESITE || 'lax',
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProd,
  trustProxy: process.env.TRUST_PROXY === 'true',
  uploadDir: path.resolve(__dirname, '../../', process.env.UPLOAD_DIR || 'uploads'),
  publicApiUrl: process.env.PUBLIC_API_URL || '',
  shop: {
    name: process.env.SHOP_NAME || 'Ma Boutique',
    currency: (process.env.SHOP_CURRENCY || 'EUR').toUpperCase(),
    address: process.env.SHOP_ADDRESS || '',
    phone: process.env.SHOP_PHONE || '',
    // Numéro WhatsApp de la boutique (format international sans +), pour « Continuer sur WhatsApp ».
    whatsapp: (process.env.SHOP_WHATSAPP || '').replace(/\D/g, ''),
  },
  // Livraison : le client la demande ; l'administrateur fixe ensuite le montant (suggestion : 1000).
  delivery: { suggestedFee: Number(process.env.DELIVERY_FEE_SUGGESTED || 1000) },
  // Messages WhatsApp / SMS : indicatif pays ajouté aux numéros locaux (228 = Togo) et adresse publique du site.
  notify: {
    countryCode: (process.env.PHONE_COUNTRY_CODE || '228').replace(/\D/g, ''),
    siteUrl: (process.env.SITE_URL || '').replace(/\/$/, ''),
  },
};
