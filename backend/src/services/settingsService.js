'use strict';
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../config/env');
const { pool } = require('../config/db');
const { badRequest } = require('../utils/errors');

/*
 * Réglages de la boutique (table `settings`, clé / valeur).
 * Lus à chaque page publique : on garde une copie en mémoire, vidée à chaque modification.
 * (Avec plusieurs processus Node, chacun a sa copie : elle expire donc aussi au bout de 60 s.)
 */
const DEFAULT_COLOR = '#0d4f4c';
const CACHE_MS = 60 * 1000;
let cache = null;
let cacheAt = 0;

const defaults = () => ({ shop_name: config.shop.name, primary_color: DEFAULT_COLOR, logo_url: null });

async function getAll() {
  if (cache && Date.now() - cacheAt < CACHE_MS) return cache;
  const [rows] = await pool.query('SELECT setting_key, setting_value FROM settings');
  const values = defaults();
  for (const r of rows) if (r.setting_value !== null && r.setting_key in values) values[r.setting_key] = r.setting_value;
  cache = values; cacheAt = Date.now();
  return values;
}
const clearCache = () => { cache = null; };

/** Réglages au format de l'API (identiques pour le site public, l'admin et la page de connexion). */
async function getPublic() {
  const s = await getAll();
  return { shopName: s.shop_name, primaryColor: s.primary_color, logoUrl: s.logo_url };
}

async function put(key, value, userId) {
  await pool.query(
    `INSERT INTO settings (setting_key, setting_value, updated_by_user_id) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by_user_id = VALUES(updated_by_user_id)`,
    [key, value, userId]);
}

async function update({ shopName, primaryColor }, userId) {
  if (shopName !== undefined) await put('shop_name', shopName, userId);
  if (primaryColor !== undefined) await put('primary_color', primaryColor.toLowerCase(), userId);
  clearCache();
  return getPublic();
}

/* ------------------------------ Logo ------------------------------ */
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

// On ne croit JAMAIS l'extension ni le type annoncé par le navigateur : on lit les premiers octets du fichier.
const BINARY_SIGNATURES = [
  { ext: '.png', test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: '.jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.webp', test: (b) => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

// Un SVG est du texte qui peut contenir du JavaScript : on refuse tout ce qui peut exécuter du code
// ou charger une ressource externe. (Le serveur ajoute en plus une CSP stricte sur /uploads, voir app.js.)
const SVG_FORBIDDEN = [
  /<script/i, /\son[a-z]+\s*=/i, /javascript:/i, /<foreignObject/i, /<iframe/i, /<embed/i, /<object/i,
  /<!ENTITY/i, /@import/i, /url\(\s*['"]?(?!#)/i, /[\s:]href\s*=\s*['"]?(?!#|data:image\/(png|jpeg|webp);)/i,
  /data:text\/html/i,
];

function detectLogo(buffer) {
  const bin = BINARY_SIGNATURES.find((s) => s.test(buffer));
  if (bin) return { ext: bin.ext };
  const text = buffer.toString('utf8').replace(/^﻿/, '');
  // Début attendu : <?xml …?> facultatif, commentaires / DOCTYPE facultatifs, puis <svg
  const looksSvg = /^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE\s+svg[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text);
  if (!looksSvg || !/<\/svg>\s*$/i.test(text)) return null;
  if (SVG_FORBIDDEN.some((re) => re.test(text))) throw badRequest('Ce fichier SVG contient du code ou des liens externes : il a été refusé pour des raisons de sécurité.');
  return { ext: '.svg' };
}

async function removeFile(url) {
  if (url && url.startsWith('/uploads/')) await fs.unlink(path.join(config.uploadDir, path.basename(url))).catch(() => {});
}

async function setLogo(file, userId) {
  if (!file || !file.buffer || !file.buffer.length) throw badRequest('Aucun fichier reçu.');
  if (file.buffer.length > LOGO_MAX_BYTES) throw badRequest('Logo trop lourd : 2 Mo maximum.');
  const kind = detectLogo(file.buffer);
  if (!kind) throw badRequest('Format non pris en charge : envoyez un logo PNG, JPG, WebP ou SVG.');
  await fs.mkdir(config.uploadDir, { recursive: true });
  // Nom aléatoire : impossible de deviner ou d'écraser un autre fichier.
  const name = `logo-${crypto.randomBytes(12).toString('hex')}${kind.ext}`;
  await fs.writeFile(path.join(config.uploadDir, name), file.buffer, { flag: 'wx' });
  const before = (await getAll()).logo_url;
  await put('logo_url', `/uploads/${name}`, userId);
  clearCache();
  await removeFile(before);
  return getPublic();
}

async function removeLogo(userId) {
  const before = (await getAll()).logo_url;
  await put('logo_url', null, userId);
  clearCache();
  await removeFile(before);
  return getPublic();
}

/** Fichier du logo sur le disque (pour la facture PDF : pdfkit sait lire PNG et JPEG seulement). */
async function logoForPdf() {
  const { logo_url: url } = await getAll();
  if (!url || !/\.(png|jpg)$/.test(url)) return null;
  try { return await fs.readFile(path.join(config.uploadDir, path.basename(url))); } catch (_) { return null; }
}

module.exports = { getAll, getPublic, update, setLogo, removeLogo, logoForPdf, detectLogo, clearCache, DEFAULT_COLOR, LOGO_MAX_BYTES };
