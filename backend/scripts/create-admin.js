'use strict';
// Crée (ou met à jour le mot de passe d') un administrateur.
// Usage interactif :  npm run create-admin
// Usage scripté    :  ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... npm run create-admin
const readline = require('readline');
const { pool } = require('../src/config/db');
const { hashPassword } = require('../src/services/authService');

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); else rl.output.write(''); };
    }
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer); });
  });
}

async function main() {
  const email = (process.env.ADMIN_EMAIL || await ask('E-mail administrateur : ')).trim().toLowerCase();
  const name = (process.env.ADMIN_NAME || await ask('Nom affiché : ')).trim() || 'Administrateur';
  const password = process.env.ADMIN_PASSWORD || await ask('Mot de passe (12 caractères min.) : ', true);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail invalide.');
  if (password.length < 12) throw new Error('Le mot de passe doit contenir au moins 12 caractères.');
  const hash = await hashPassword(password);
  const [[adminRole]] = await pool.query("SELECT id FROM roles WHERE code = 'ADMIN'").catch(() => [[null]]);
  const roleId = adminRole ? adminRole.id : null;
  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) {
    await pool.query("UPDATE users SET name = ?, password_hash = ?, role = 'ADMIN', role_id = ?, is_active = 1 WHERE id = ?", [name, hash, roleId, existing[0].id]);
    console.log(`Administrateur « ${email} » mis à jour.`);
  } else {
    await pool.query("INSERT INTO users (name, email, password_hash, role, role_id) VALUES (?, ?, ?, 'ADMIN', ?)", [name, email, hash, roleId]);
    console.log(`Administrateur « ${email} » créé.`);
  }
  await pool.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
