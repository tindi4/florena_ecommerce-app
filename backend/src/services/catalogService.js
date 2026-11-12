'use strict';
const { pool } = require('../config/db');
const { notFound } = require('../utils/errors');
const { parseJson, paginate } = require('../utils/helpers');

const short = (text) => {
  if (!text) return '';
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > 140 ? `${clean.slice(0, 137)}…` : clean;
};

async function listCategories() {
  const [rows] = await pool.query(
    `SELECT c.id, c.name, c.slug, c.description,
            (SELECT COUNT(DISTINCT p.id) FROM products p
               JOIN product_variants v ON v.product_id = p.id AND v.is_active = 1
              WHERE p.category_id = c.id AND p.is_active = 1) AS product_count
       FROM categories c WHERE c.is_active = 1 ORDER BY c.name`);
  return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, description: r.description, productCount: Number(r.product_count) }));
}

async function listProducts(q) {
  const { page, limit, offset } = paginate(q, 12, 48);
  const where = ['p.is_active = 1', '(c.id IS NULL OR c.is_active = 1)'];
  const params = [];
  if (q.search) { where.push('p.name LIKE ?'); params.push(`%${String(q.search).slice(0, 80)}%`); }
  if (q.category) { where.push('c.slug = ?'); params.push(String(q.category)); }
  const whereSql = where.join(' AND ');

  const orders = {
    price_asc: 'price_min ASC, p.id DESC',
    price_desc: 'price_min DESC, p.id DESC',
    newest: 'p.created_at DESC, p.id DESC',
  };
  const orderSql = orders[q.sort] || orders.newest;

  const [countRows] = await pool.query(
    `SELECT COUNT(DISTINCT p.id) AS total FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       JOIN product_variants v ON v.product_id = p.id AND v.is_active = 1
      WHERE ${whereSql}`, params);
  const total = Number(countRows[0].total);

  const [rows] = await pool.query(
    `SELECT p.id, p.name, p.slug, p.description, c.name AS category_name, c.slug AS category_slug,
            MIN(v.price) AS price_min, MAX(v.price) AS price_max, SUM(v.stock_quantity) AS total_stock,
            (SELECT image_url FROM product_images i WHERE i.product_id = p.id ORDER BY i.position, i.id LIMIT 1) AS image_url
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       JOIN product_variants v ON v.product_id = p.id AND v.is_active = 1
      WHERE ${whereSql}
      GROUP BY p.id, p.name, p.slug, p.description, p.created_at, c.name, c.slug
      ORDER BY ${orderSql}
      LIMIT ? OFFSET ?`, [...params, limit, offset]);

  return {
    items: rows.map((r) => ({
      id: r.id, name: r.name, slug: r.slug, shortDescription: short(r.description),
      category: r.category_name ? { name: r.category_name, slug: r.category_slug } : null,
      priceMin: Number(r.price_min), priceMax: Number(r.price_max),
      inStock: Number(r.total_stock) > 0, imageUrl: r.image_url,
    })),
    page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

async function getProductBySlug(slug) {
  const [rows] = await pool.query(
    `SELECT p.id, p.name, p.slug, p.description, c.name AS category_name, c.slug AS category_slug
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.slug = ? AND p.is_active = 1 AND (c.id IS NULL OR c.is_active = 1)`, [slug]);
  const p = rows[0];
  if (!p) throw notFound('Produit introuvable.');
  const [images] = await pool.query('SELECT id, image_url, alt_text FROM product_images WHERE product_id = ? ORDER BY position, id', [p.id]);
  const [variants] = await pool.query(
    `SELECT id, sku, attributes_json, price, stock_quantity FROM product_variants
      WHERE product_id = ? AND is_active = 1 ORDER BY position, id`, [p.id]);
  if (!variants.length) throw notFound('Produit introuvable.');
  return {
    id: p.id, name: p.name, slug: p.slug, description: p.description,
    category: p.category_name ? { name: p.category_name, slug: p.category_slug } : null,
    images: images.map((i) => ({ id: i.id, url: i.image_url, alt: i.alt_text || p.name })),
    variants: variants.map((v) => ({
      id: v.id, sku: v.sku, attributes: parseJson(v.attributes_json), price: Number(v.price), stock: Number(v.stock_quantity),
    })),
  };
}

/** Vérifie le panier avec les données réelles (prix, stock, disponibilité). */
async function checkCart(items) {
  const merged = new Map();
  for (const it of items) merged.set(it.variantId, (merged.get(it.variantId) || 0) + it.quantity);
  const ids = [...merged.keys()];
  const [rows] = await pool.query(
    `SELECT v.id, v.sku, v.attributes_json, v.price, v.stock_quantity, v.is_active AS v_active,
            p.id AS product_id, p.name, p.slug, p.is_active AS p_active,
            (SELECT image_url FROM product_images i WHERE i.product_id = p.id ORDER BY i.position, i.id LIMIT 1) AS image_url
       FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id IN (?)`, [ids]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((variantId) => {
    const r = byId.get(variantId);
    if (!r) return { variantId, available: false, reason: 'UNAVAILABLE' };
    const available = !!r.v_active && !!r.p_active && r.stock_quantity > 0;
    return {
      variantId, productName: r.name, slug: r.slug, imageUrl: r.image_url, sku: r.sku,
      attributes: parseJson(r.attributes_json), price: Number(r.price), stock: Number(r.stock_quantity),
      available, reason: available ? null : 'OUT_OF_STOCK',
    };
  });
}

module.exports = { listCategories, listProducts, getProductBySlug, checkCart };
