'use strict';
const { pool, withTransaction } = require('../config/db');
const { hashPassword } = require('./authService');
const roles = require('./roleService');
const { conflict, notFound, badRequest, forbidden } = require('../utils/errors');
const { STAFF_ROLES } = require('../config/permissions');

async function listStaff() {
  const [rows] = await pool.query(
    `SELECT u.*, c.name AS created_by_name, r.name AS role_name FROM users u
       LEFT JOIN users c ON c.id = u.created_by_user_id LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.role IN (?) ORDER BY u.role <> 'ADMIN', u.created_at, u.id`, [STAFF_ROLES]);
  const items = [];
  for (const u of rows) {
    items.push({
      id: u.id, name: u.name, email: u.email, isMain: u.role === 'ADMIN', roleId: u.role_id,
      roleName: u.role === 'ADMIN' ? 'Administrateur principal' : u.role_name || 'Aucun rôle',
      isActive: !!u.is_active, permissions: await roles.permissionsFor(u), createdAt: u.created_at, createdBy: u.created_by_name || null,
    });
  }
  const r = await roles.listRoles();
  return { items, roles: r.items, permissions: r.permissions };
}

async function createStaff(input, actor) {
  try {
    return await withTransaction(async (conn) => {
      const role = await roles.resolveAssignable(conn, input, actor);
      const [res] = await conn.query(
        "INSERT INTO users (name, email, password_hash, role, role_id, created_by_user_id) VALUES (?, ?, ?, 'STAFF', ?, ?)",
        [input.name, input.email, await hashPassword(input.password), role.id, actor.id]);
      return { id: res.insertId };
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw conflict('Un compte existe déjà avec cet e-mail.');
    throw err;
  }
}

/** Vérifie qu'on peut agir sur ce compte : pas le compte principal, pas un compte plus puissant que soi. */
async function lockTarget(conn, id, actor) {
  const [[u]] = await conn.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [id]);
  if (!u || !STAFF_ROLES.includes(u.role)) throw notFound('Compte introuvable.');
  if (u.role === 'ADMIN') throw badRequest('Le compte administrateur principal ne peut pas être modifié ici.');
  if (!actor.isMain) {
    const theirs = await roles.permissionsFor(u);
    if (theirs.some((p) => !actor.permissions.includes(p))) throw forbidden('Ce compte a des droits que vous n\'avez pas : seul l\'administrateur principal peut le modifier.');
  }
  return u;
}

/** Personne ne modifie son propre rôle ni ne se désactive. */
async function updateStaff(id, patch, actor) {
  await withTransaction(async (conn) => {
    const u = await lockTarget(conn, id, actor);
    const changesRole = patch.roleId !== undefined || patch.role !== undefined;
    if (u.id === actor.id && (changesRole || patch.isActive === false)) throw badRequest('Vous ne pouvez pas modifier votre propre rôle ou vous désactiver.');
    const roleId = changesRole ? (await roles.resolveAssignable(conn, patch, actor)).id : u.role_id;
    await conn.query("UPDATE users SET name = ?, role = 'STAFF', role_id = ?, is_active = ? WHERE id = ?", [
      patch.name ?? u.name, roleId, patch.isActive === undefined ? u.is_active : (patch.isActive ? 1 : 0), id]);
  });
  return { id };
}

async function resetPassword(id, password, actor) {
  await withTransaction(async (conn) => {
    const [[u]] = await conn.query('SELECT id, role FROM users WHERE id = ?', [id]);
    if (u && u.role === 'ADMIN') throw badRequest('Utilisez « npm run create-admin » pour le compte principal.');
    await lockTarget(conn, id, actor);
    await conn.query('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(password), id]);
  });
  return { id };
}

module.exports = { listStaff, createStaff, updateStaff, resetPassword };
