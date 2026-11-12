'use strict';
const mysql = require('mysql2/promise');
const config = require('./env');

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  // DECIMAL renvoyé en chaîne : on convertit en centimes côté serveur (pas de flottants pour l'argent).
  decimalNumbers: false,
  timezone: 'Z',
});

// Toutes les connexions travaillent en UTC (Lomé = UTC+0) : les « jours » des statistiques sont donc cohérents.
pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));

/** Exécute un callback dans une transaction. Rollback automatique en cas d'erreur. */
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, withTransaction };
