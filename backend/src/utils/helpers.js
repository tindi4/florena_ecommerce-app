'use strict';
const crypto = require('crypto');
const config = require('../config/env');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I, O, 0, 1

/** Numéro de commande aléatoire, non prévisible : CMD-XXXXXXXXXX */
function generateOrderNumber() {
  const bytes = crypto.randomBytes(10);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `CMD-${out}`;
}

function randomCode(length) {
  // Rejet des octets >= 224 : 224 = 7 x 32, chaque lettre a ainsi exactement la même probabilité.
  let out = '';
  while (out.length < length) {
    for (const b of crypto.randomBytes(length * 2)) {
      if (b < 224 && out.length < length) out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}

/**
 * Code de suivi complet : CMD-XXXXXXXXXX-YYYYYYYYYYYYYYYYYYYY.
 * Les 20 caractères ajoutés (≈ 100 bits de hasard) le rendent impossible à deviner : il suffit seul pour suivre la commande.
 */
const generateTrackingCode = (orderNumber) => `${orderNumber}-${randomCode(20)}`;
const TRACKING_CODE_RE = /^CMD-[A-Z2-9]{10}-[A-Z2-9]{20}$/;

/**
 * Forme canonique d'un numéro : chiffres seuls, sans « 00 » ni indicatif pays.
 * « +228 90 12 34 56 », « 0022890123456 » et « 90 12 34 56 » donnent tous « 90123456 ».
 */
function phoneKey(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  const cc = config.notify.countryCode;
  if (cc && d.startsWith(cc) && d.length > cc.length + 6) d = d.slice(cc.length);
  return d;
}
const samePhone = (a, b) => { const ka = phoneKey(a); return ka.length >= 6 && ka === phoneKey(b); };

function slugify(text) {
  return String(text)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'item';
}

const phoneDigits = (phone) => String(phone).replace(/\D/g, '');

/** MySQL renvoie du JSON déjà parsé, MariaDB une chaîne. */
function parseJson(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }
  return value;
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function paginate(query, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

module.exports = { generateOrderNumber, generateTrackingCode, TRACKING_CODE_RE, phoneKey, samePhone, slugify, phoneDigits, parseJson, asyncHandler, paginate };
