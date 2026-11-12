'use strict';
// Exécute les fichiers de migrations/ dans l'ordre. Chaque fichier n'est joué qu'une fois.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config/env');

async function main() {
  const conn = await mysql.createConnection({ ...config.db, multipleStatements: true, charset: 'utf8mb4' });
  await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(190) NOT NULL PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  const [done] = await conn.query('SELECT name FROM schema_migrations');
  const applied = new Set(done.map((r) => r.name));
  const dir = path.resolve(__dirname, '../migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    console.log(`→ Migration ${file}`);
    await conn.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
    count += 1;
  }
  console.log(count ? `${count} migration(s) appliquée(s).` : 'Base déjà à jour.');
  await conn.end();
}
main().catch((e) => { console.error('Échec de la migration :', e.message); process.exit(1); });
