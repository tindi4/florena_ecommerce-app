'use strict';
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../config/env');
const { pool, withTransaction } = require('../config/db');
const { toCents, fromCents } = require('../utils/money');
const { slugify, parseJson, paginate } = require('../utils/helpers');
const { notFound, conflict, badRequest } = require('../utils/errors');

/* ---------------------------- Catégories ---------------------------- */
async function uniqueSlug(conn, table, base, excludeId) {
  let slug = slugify(base); let n = 1;
  for (;;) {
    const [rows] = await conn.query(`SELECT id FROM ${table} WHERE slug = ? ${excludeId ? 'AND id <> ?' : ''}`, excludeId ? [slug, excludeId] : [slug]);
    if (!rows.length) return slug;
    n += 1; slug = `${slugify(base)}-${n}`;
  }
}

async function listCategories() {
  const [rows] = await pool.query(
    `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count FROM categories c ORDER BY c.name`);
  return rows.map((c) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, isActive: !!c.is_active, productCount: Number(c.product_count) }));
}

async function saveCategory(input, id) {
  try {
    return await withTransaction(async (conn) => {
      if (id) {
        const [rows] = await conn.query('SELECT id FROM categories WHERE id = ?', [id]);
        if (!rows.length) throw notFound('Catégorie introuvable.');
        const slug = await uniqueSlug(conn, 'categories', input.name, id);
        await conn.query('UPDATE categories SET name=?, slug=?, description=?, is_active=? WHERE id=?',
          [input.name, slug, input.description || null, input.isActive ? 1 : 0, id]);
        return { id };
      }
      const slug = await uniqueSlug(conn, 'categories', input.name);
      const [res] = await conn.query('INSERT INTO categories (name, slug, description, is_active) VALUES (?,?,?,?)',
        [input.name, slug, input.description || null, input.isActive ? 1 : 0]);
      return { id: res.insertId };
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw conflict('Une catégorie porte déjà ce nom.');
    throw err;
  }
}

async function setCategoryActive(id, isActive) {
  const [res] = await pool.query('UPDATE categories SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
  if (!res.affectedRows) throw notFound('Catégorie introuvable.');
  return { id, isActive };
}

/* ----------------------------- Produits ----------------------------- */
async function listProducts(q) {
  const { page, limit, offset } = paginate(q, 20, 100);
  const where = []; const params = [];
  if (q.search) { where.push('(p.name LIKE ? OR EXISTS (SELECT 1 FROM product_variants sv WHERE sv.product_id = p.id AND sv.sku LIKE ?))'); params.push(`%${String(q.search).slice(0, 80)}%`, `%${String(q.search).slice(0, 80)}%`); }
  if (q.categoryId) { where.push('p.category_id = ?'); params.push(Number(q.categoryId)); }
  if (q.active === 'true') where.push('p.is_active = 1');
  if (q.active === 'false') where.push('p.is_active = 0');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM products p ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT p.id, p.name, p.slug, p.is_active, c.name AS category_name,
            (SELECT image_url FROM product_images i WHERE i.product_id = p.id ORDER BY i.position, i.id LIMIT 1) AS image_url,
            (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id) AS variant_count,
            (SELECT COALESCE(SUM(stock_quantity),0) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS total_stock,
            (SELECT MIN(price) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS price_min
       FROM products p LEFT JOIN categories c ON c.id = p.category_id ${whereSql}
      ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  return {
    items: rows.map((p) => ({
      id: p.id, name: p.name, slug: p.slug, isActive: !!p.is_active, category: p.category_name, imageUrl: p.image_url,
      variantCount: Number(p.variant_count), totalStock: Number(p.total_stock), priceMin: p.price_min == null ? null : Number(p.price_min),
    })),
    page, limit, total: Number(total), totalPages: Math.max(1, Math.ceil(Number(total) / limit)),
  };
}

async function getProduct(id) {
  const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
  const p = rows[0];
  if (!p) throw notFound('Produit introuvable.');
  const [images] = await pool.query('SELECT id, image_url, alt_text, position FROM product_images WHERE product_id = ? ORDER BY position, id', [id]);
  const [variants] = await pool.query('SELECT * FROM product_variants WHERE product_id = ? ORDER BY position, id', [id]);
  return {
    id: p.id, name: p.name, slug: p.slug, description: p.description, categoryId: p.category_id, isActive: !!p.is_active,
    images: images.map((i) => ({ id: i.id, url: i.image_url, alt: i.alt_text, position: i.position })),
    variants: variants.map((v) => ({
      id: v.id, sku: v.sku, attributes: parseJson(v.attributes_json), price: Number(v.price), stockQuantity: Number(v.stock_quantity), isActive: !!v.is_active,
    })),
  };
}

const attrKey = (attrs) => JSON.stringify(Object.keys(attrs).sort().map((k) => [k.toLowerCase(), String(attrs[k]).toLowerCase()]));

async function saveProduct(input, id, adminId) {
  const seen = new Set();
  for (const v of input.variants) {
    const k = attrKey(v.attributes);
    if (seen.has(k)) throw badRequest('Deux variantes ont exactement les mêmes options.');
    seen.add(k);
  }
  if (input.categoryId) {
    const [c] = await pool.query('SELECT id FROM categories WHERE id = ?', [input.categoryId]);
    if (!c.length) throw badRequest('Catégorie inconnue.');
  }
  try {
    return await withTransaction(async (conn) => {
      let productId = id;
      if (id) {
        const [rows] = await conn.query('SELECT id FROM products WHERE id = ? FOR UPDATE', [id]);
        if (!rows.length) throw notFound('Produit introuvable.');
        await conn.query('UPDATE products SET name=?, category_id=?, description=?, is_active=? WHERE id=?',
          [input.name, input.categoryId || null, input.description || null, input.isActive ? 1 : 0, id]);
      } else {
        const slug = await uniqueSlug(conn, 'products', input.name);
        const [res] = await conn.query('INSERT INTO products (name, slug, category_id, description, is_active) VALUES (?,?,?,?,?)',
          [input.name, slug, input.categoryId || null, input.description || null, input.isActive ? 1 : 0]);
        productId = res.insertId;
      }

      const [existing] = await conn.query('SELECT id, stock_quantity FROM product_variants WHERE product_id = ? FOR UPDATE', [productId]);
      const existingMap = new Map(existing.map((v) => [v.id, v]));
      const keepIds = new Set();
      let position = 0;
      for (const v of input.variants) {
        position += 1;
        const price = fromCents(toCents(v.price));
        const attrs = JSON.stringify(v.attributes);
        if (v.id) {
          const cur = existingMap.get(v.id);
          if (!cur) throw badRequest('Variante inconnue pour ce produit.');
          keepIds.add(v.id);
          await conn.query('UPDATE product_variants SET sku=?, attributes_json=?, price=?, stock_quantity=?, position=?, is_active=? WHERE id=?',
            [v.sku || null, attrs, price, v.stockQuantity, position, v.isActive ? 1 : 0, v.id]);
          if (cur.stock_quantity !== v.stockQuantity) {
            await conn.query(
              `INSERT INTO stock_movements (product_variant_id, movement_type, quantity_before, quantity_after, quantity_delta, reason, created_by_user_id)
               VALUES (?, 'ADJUSTMENT', ?, ?, ?, 'Modification de la fiche produit', ?)`,
              [v.id, cur.stock_quantity, v.stockQuantity, v.stockQuantity - cur.stock_quantity, adminId]);
          }
        } else {
          const [res] = await conn.query(
            'INSERT INTO product_variants (product_id, sku, attributes_json, price, stock_quantity, position, is_active) VALUES (?,?,?,?,?,?,?)',
            [productId, v.sku || null, attrs, price, v.stockQuantity, position, v.isActive ? 1 : 0]);
          keepIds.add(res.insertId);
          await conn.query(
            `INSERT INTO stock_movements (product_variant_id, movement_type, quantity_before, quantity_after, quantity_delta, reason, created_by_user_id)
             VALUES (?, 'INITIAL', 0, ?, ?, 'Création de la variante', ?)`, [res.insertId, v.stockQuantity, v.stockQuantity, adminId]);
        }
      }
      // Variantes retirées : désactivées si déjà commandées, supprimées sinon.
      for (const old of existing) {
        if (keepIds.has(old.id)) continue;
        const [[used]] = await conn.query('SELECT COUNT(*) AS n FROM order_items WHERE product_variant_id = ?', [old.id]);
        if (Number(used.n) > 0) await conn.query('UPDATE product_variants SET is_active = 0 WHERE id = ?', [old.id]);
        else await conn.query('DELETE FROM product_variants WHERE id = ?', [old.id]);
      }
      return { id: productId };
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' && /sku/i.test(err.message)) throw conflict('Ce SKU est déjà utilisé par une autre variante.');
    throw err;
  }
}

async function setProductActive(id, isActive) {
  const [res] = await pool.query('UPDATE products SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
  if (!res.affectedRows) throw notFound('Produit introuvable.');
  return { id, isActive };
}

/* ------------------------------ Images ------------------------------ */
const SIGNATURES = [
  { ext: '.jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.png', test: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: '.webp', test: (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' },
];

async function addImage(productId, file, alt) {
  const [p] = await pool.query('SELECT id FROM products WHERE id = ?', [productId]);
  if (!p.length) throw notFound('Produit introuvable.');
  const sig = SIGNATURES.find((s) => s.test(file.buffer));
  if (!sig) throw badRequest('Format d\'image non supporté (JPEG, PNG ou WebP).');
  await fs.mkdir(config.uploadDir, { recursive: true });
  const name = `${crypto.randomBytes(16).toString('hex')}${sig.ext}`;
  await fs.writeFile(path.join(config.uploadDir, name), file.buffer, { flag: 'wx' });
  const [[{ next }]] = await pool.query('SELECT COALESCE(MAX(position),0)+1 AS next FROM product_images WHERE product_id = ?', [productId]);
  const url = `/uploads/${name}`;
  const [res] = await pool.query('INSERT INTO product_images (product_id, image_url, alt_text, position) VALUES (?,?,?,?)',
    [productId, url, alt || null, next]);
  return { id: res.insertId, url, alt: alt || null, position: next };
}

async function deleteImage(imageId) {
  const [rows] = await pool.query('SELECT image_url FROM product_images WHERE id = ?', [imageId]);
  if (!rows.length) throw notFound('Image introuvable.');
  await pool.query('DELETE FROM product_images WHERE id = ?', [imageId]);
  const url = rows[0].image_url;
  if (url.startsWith('/uploads/')) {
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM order_items WHERE image_snapshot = ?', [url]);
    // Le fichier est conservé s'il illustre encore une commande historique.
    if (Number(n) === 0) await fs.unlink(path.join(config.uploadDir, path.basename(url))).catch(() => {});
  }
  return { id: imageId };
}

/* ------------------------------- Stock ------------------------------ */
async function listStock(q) {
  const { page, limit, offset } = paginate(q, 30, 100);
  const where = ['1=1']; const params = [];
  if (q.search) { where.push('(p.name LIKE ? OR v.sku LIKE ?)'); params.push(`%${String(q.search).slice(0, 80)}%`, `%${String(q.search).slice(0, 80)}%`); }
  if (q.filter === 'out') where.push('v.stock_quantity = 0 AND v.is_active = 1 AND p.is_active = 1');
  if (q.filter === 'low') where.push('v.stock_quantity BETWEEN 1 AND 5 AND v.is_active = 1 AND p.is_active = 1');
  const whereSql = where.join(' AND ');
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM product_variants v JOIN products p ON p.id = v.product_id WHERE ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT v.id, v.sku, v.attributes_json, v.stock_quantity, v.is_active, p.id AS product_id, p.name
       FROM product_variants v JOIN products p ON p.id = v.product_id WHERE ${whereSql}
      ORDER BY v.stock_quantity ASC, p.name, v.id LIMIT ? OFFSET ?`, [...params, limit, offset]);
  return {
    items: rows.map((v) => ({ variantId: v.id, productId: v.product_id, productName: v.name, sku: v.sku, attributes: parseJson(v.attributes_json), stock: Number(v.stock_quantity), isActive: !!v.is_active })),
    page, limit, total: Number(total), totalPages: Math.max(1, Math.ceil(Number(total) / limit)),
  };
}

async function adjustStock(variantId, quantity, reason, adminId) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT stock_quantity FROM product_variants WHERE id = ? FOR UPDATE', [variantId]);
    if (!rows.length) throw notFound('Variante introuvable.');
    const before = rows[0].stock_quantity;
    await conn.query('UPDATE product_variants SET stock_quantity = ? WHERE id = ?', [quantity, variantId]);
    await conn.query(
      `INSERT INTO stock_movements (product_variant_id, movement_type, quantity_before, quantity_after, quantity_delta, reason, created_by_user_id)
       VALUES (?, 'ADJUSTMENT', ?, ?, ?, ?, ?)`, [variantId, before, quantity, quantity - before, reason, adminId]);
    return { variantId, stock: quantity };
  });
}

async function stockHistory(variantId) {
  const [rows] = await pool.query(
    `SELECT m.*, u.name AS admin_name FROM stock_movements m LEFT JOIN users u ON u.id = m.created_by_user_id
      WHERE m.product_variant_id = ? ORDER BY m.created_at DESC, m.id DESC LIMIT 50`, [variantId]);
  return rows.map((m) => ({ id: m.id, type: m.movement_type, before: m.quantity_before, after: m.quantity_after, delta: m.quantity_delta, reason: m.reason, admin: m.admin_name, orderId: m.order_id, at: m.created_at }));
}

module.exports = {
  listCategories, saveCategory, setCategoryActive, listProducts, getProduct, saveProduct, setProductActive,
  addImage, deleteImage, listStock, adjustStock, stockHistory,
};
