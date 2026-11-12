'use strict';
/*
 * Permissions cochables une par une dans « Équipe > Rôles ».
 * Les rôles sont en base (tables roles et role_permissions, migration 007).
 * Le compte principal (users.role = 'ADMIN', créé par `npm run create-admin`) a TOUJOURS toutes les permissions :
 * impossible de s'enfermer dehors en modifiant un rôle.
 */
const PERMISSIONS = [
  { key: 'orders.view', group: 'Commandes', label: 'Voir les commandes', hint: 'Liste, détail, tableau de bord, notifications, facture PDF' },
  { key: 'orders.edit', group: 'Commandes', label: 'Modifier les commandes', hint: 'Téléphone, coordonnées, livraison, articles' },
  { key: 'orders.status', group: 'Commandes', label: 'Faire avancer les commandes', hint: 'Confirmer, mettre en préparation, terminer' },
  { key: 'orders.fee', group: 'Commandes', label: 'Fixer les frais de livraison' },
  { key: 'orders.cancel', group: 'Commandes', label: 'Annuler une commande', hint: 'Le stock est remis en vente' },
  { key: 'orders.payment', group: 'Commandes', label: 'Marquer payé / non payé' },
  { key: 'orders.notify', group: 'Commandes', label: 'Prévenir le client', hint: 'WhatsApp ou SMS' },
  { key: 'messages', group: 'Clients', label: 'Messages des clients' },
  { key: 'products', group: 'Catalogue', label: 'Produits et catégories', hint: 'Créer, modifier, photos, prix' },
  { key: 'stock', group: 'Catalogue', label: 'Stocks', hint: 'Ajuster les quantités, historique' },
  { key: 'stats', group: 'Gestion', label: 'Statistiques et caisse' },
  { key: 'team', group: 'Gestion', label: 'Équipe et rôles', hint: 'Créer des comptes et des rôles' },
  { key: 'settings', group: 'Gestion', label: 'Réglages de la boutique', hint: 'Nom, couleur, logo' },
];
const ALL_PERMISSIONS = PERMISSIONS.map((p) => p.key);

// Les 4 anciens rôles fixes, gardés comme modèles (même contenu que la migration 007).
const ORDER_PERMS = ['orders.view', 'orders.edit', 'orders.status', 'orders.fee', 'orders.cancel', 'orders.payment', 'orders.notify', 'messages'];
const ROLE_TEMPLATES = {
  ADMIN: ALL_PERMISSIONS,
  MANAGER: [...ORDER_PERMS, 'products', 'stock', 'stats'],
  ORDER_CLERK: ORDER_PERMS,
  CATALOG_CLERK: ['products', 'stock'],
};

// Valeurs possibles de users.role pour un membre de l'équipe (CUSTOMER = ancien type, jamais accepté).
// 'ADMIN' = compte principal ; les autres reçoivent leurs droits par users.role_id.
const STAFF_ROLES = ['ADMIN', 'MANAGER', 'ORDER_CLERK', 'CATALOG_CLERK', 'STAFF'];

/** Garde les permissions connues, sans doublon ; toute action sur les commandes suppose de pouvoir les voir. */
function normalizePermissions(list) {
  const set = new Set((list || []).filter((p) => ALL_PERMISSIONS.includes(p)));
  if ([...set].some((p) => p.startsWith('orders.'))) set.add('orders.view');
  return ALL_PERMISSIONS.filter((p) => set.has(p));
}

module.exports = { PERMISSIONS, ALL_PERMISSIONS, ROLE_TEMPLATES, STAFF_ROLES, normalizePermissions };
