'use strict';
// Données de démonstration FACULTATIVES (ne pas lancer en production réelle).
// Crée 2 catégories et 2 produits : un T-shirt (tailles en lettres) et des baskets (pointures numériques).
const { pool } = require('../src/config/db');

async function main() {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM products');
  if (n > 0) { console.log('Des produits existent déjà : seed ignoré.'); return pool.end(); }
  const [c1] = await pool.query("INSERT INTO categories (name, slug) VALUES ('Vêtements', 'vetements')");
  const [c2] = await pool.query("INSERT INTO categories (name, slug) VALUES ('Chaussures', 'chaussures')");
  const [p1] = await pool.query("INSERT INTO products (category_id, name, slug, description) VALUES (?, 'T-shirt classique', 't-shirt-classique', 'T-shirt en coton, coupe droite.')", [c1.insertId]);
  const [p2] = await pool.query("INSERT INTO products (category_id, name, slug, description) VALUES (?, 'Baskets urbaines', 'baskets-urbaines', 'Baskets confortables pour tous les jours.')", [c2.insertId]);
  const add = (pid, attrs, price, stock, pos) => pool.query(
    'INSERT INTO product_variants (product_id, attributes_json, price, stock_quantity, position) VALUES (?, ?, ?, ?, ?)',
    [pid, JSON.stringify(attrs), price, stock, pos]);
  let pos = 0;
  for (const [color, size, stock] of [['Noir', 'M', 8], ['Noir', 'L', 3], ['Blanc', 'M', 0], ['Blanc', 'XL', 5]]) await add(p1.insertId, { Couleur: color, Taille: size }, '19.90', stock, pos += 1);
  pos = 0;
  for (const size of ['40', '41', '42', '43', '45']) await add(p2.insertId, { Pointure: size }, '59.00', size === '45' ? 0 : 6, pos += 1);
  console.log('Données de démonstration créées.');
  await pool.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
