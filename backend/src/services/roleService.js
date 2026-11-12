'use strict';
const { pool, withTransaction } = require('../config/db');
const { conflict, notFound, badRequest, forbidden } = require('../utils/errors');
const { PERMISSIONS, ALL_PERMISSIONS, normalizePermissions } = require('../config/permissions');

/** Permissions effectives d'un compte de l'équipe (relues en base à chaque requête). */
async function permissionsFor(user) {
  if (user.role === 'ADMIN') return [...ALL_PERMISSIONS];      // compte principal : toujours tout
  if (!user.role_id) return [];
  const [rows] = await pool.query('SELECT permission FROM role_permissions WHERE role_id = ?', [user.role_id]);
  return normalizePermissions(rows.map((r) => r.permission));
}

async function listRoles() {
  const [roles] = await pool.query(
    `SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id AND u.role <> 'ADMIN') AS user_count
       FROM roles r ORDER BY r.is_system DESC, r.code IS NULL, r.name`);
  const [perms] = await pool.query('SELECT role_id, permission FROM role_permissions');
  const byRole = new Map();
  for (const p of perms) { if (!byRole.has(p.role_id)) byRole.set(p.role_id, []); byRole.get(p.role_id).push(p.permission); }
  return {
    items: roles.map((r) => ({
      id: r.id, code: r.code, name: r.name, description: r.description, isSystem: !!r.is_system,
      isTemplate: !!r.code, userCount: Number(r.user_count),
      permissions: r.is_system ? [...ALL_PERMISSIONS] : normalizePermissions(byRole.get(r.id)),
    })),
    permissions: PERMISSIONS,
  };
}

async function getRole(conn, id) {
  const [[r]] = await conn.query('SELECT * FROM roles WHERE id = ? FOR UPDATE', [id]);
  if (!r) throw notFound('Rôle introuvable.');
  return r;
}

/**
 * Anti-escalade : un membre qui gère l'équipe sans être le compte principal ne peut pas
 * donner (à un rôle ou à un compte) une permission qu'il n'a pas lui-même.
 */
function assertCanGrant(actor, permissions) {
  if (actor.isMain) return;
  const missing = permissions.filter((p) => !actor.permissions.includes(p));
  if (missing.length) {
    const labels = missing.map((m) => PERMISSIONS.find((p) => p.key === m).label.toLowerCase()).join(', ');
    throw forbidden(`Vous ne pouvez pas accorder des droits que vous n'avez pas : ${labels}.`);
  }
}

async function replacePermissions(conn, roleId, permissions) {
  await conn.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
  if (permissions.length) await conn.query('INSERT INTO role_permissions (role_id, permission) VALUES ?', [permissions.map((p) => [roleId, p])]);
}

const dupName = (err) => { if (err.code === 'ER_DUP_ENTRY') throw conflict('Un rôle porte déjà ce nom.'); throw err; };

async function createRole(input, actor) {
  const permissions = normalizePermissions(input.permissions);
  assertCanGrant(actor, permissions);
  try {
    return await withTransaction(async (conn) => {
      const [res] = await conn.query('INSERT INTO roles (name, description) VALUES (?, ?)', [input.name, input.description || null]);
      await replacePermissions(conn, res.insertId, permissions);
      return { id: res.insertId, permissions };
    });
  } catch (err) { return dupName(err); }
}

async function updateRole(id, input, actor) {
  try {
    return await withTransaction(async (conn) => {
      const r = await getRole(conn, id);
      if (r.is_system) throw badRequest('Le rôle « Administrateur principal » est verrouillé.');
      if (!actor.isMain && actor.roleId === r.id) throw forbidden('Vous ne pouvez pas modifier votre propre rôle.');
      if (input.name !== undefined || input.description !== undefined) {
        await conn.query('UPDATE roles SET name = ?, description = ? WHERE id = ?',
          [input.name ?? r.name, input.description === undefined ? r.description : input.description || null, id]);
      }
      let permissions;
      if (input.permissions) {
        permissions = normalizePermissions(input.permissions);
        // On vérifie aussi les droits RETIRÉS : sinon on pourrait dépouiller un rôle plus puissant que le sien.
        const [current] = await conn.query('SELECT permission FROM role_permissions WHERE role_id = ?', [id]);
        assertCanGrant(actor, [...new Set([...permissions, ...current.map((c) => c.permission)])]);
        await replacePermissions(conn, id, permissions);
      }
      return { id, permissions };
    });
  } catch (err) { return dupName(err); }
}

async function deleteRole(id, actor) {
  await withTransaction(async (conn) => {
    const r = await getRole(conn, id);
    if (r.is_system) throw badRequest('Le rôle « Administrateur principal » ne peut pas être supprimé.');
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM users WHERE role_id = ?', [id]);
    if (Number(n) > 0) throw conflict(`Ce rôle est attribué à ${n} compte(s) : changez d'abord leur rôle.`, undefined, 'ROLE_IN_USE');
    const [current] = await conn.query('SELECT permission FROM role_permissions WHERE role_id = ?', [id]);
    assertCanGrant(actor, current.map((c) => c.permission));
    await conn.query('DELETE FROM roles WHERE id = ?', [id]);
  });
  return { id };
}

/** Rôle à attribuer à un compte : id OU code d'un modèle (MANAGER…). Jamais le rôle verrouillé. */
async function resolveAssignable(conn, { roleId, role }, actor) {
  const [[r]] = roleId
    ? await conn.query('SELECT * FROM roles WHERE id = ?', [roleId])
    : await conn.query('SELECT * FROM roles WHERE code = ?', [role]);
  if (!r) throw badRequest('Rôle inconnu.');
  if (r.is_system) throw badRequest('Le rôle « Administrateur principal » ne peut pas être attribué.');
  const [perms] = await conn.query('SELECT permission FROM role_permissions WHERE role_id = ?', [r.id]);
  assertCanGrant(actor, normalizePermissions(perms.map((p) => p.permission)));
  return r;
}

module.exports = { permissionsFor, listRoles, createRole, updateRole, deleteRole, resolveAssignable, assertCanGrant };
