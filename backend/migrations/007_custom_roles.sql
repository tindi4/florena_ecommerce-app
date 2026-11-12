-- Rôles personnalisables : chaque rôle a une liste de permissions cochées une par une.
-- Les 4 anciens rôles fixes deviennent des rôles en base (modèles par défaut) et chaque compte existant
-- est rattaché au rôle qu'il avait : personne ne perd ni ne gagne de droits.
CREATE TABLE IF NOT EXISTS roles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NULL,                     -- ADMIN, MANAGER… pour les modèles ; NULL pour un rôle créé dans l'admin
  name VARCHAR(80) NOT NULL,
  description VARCHAR(255) NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 0,   -- 1 = rôle verrouillé (Administrateur principal)
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code),
  UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT UNSIGNED NOT NULL,
  permission VARCHAR(40) NOT NULL,
  PRIMARY KEY (role_id, permission),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO roles (code, name, description, is_system) VALUES
  ('ADMIN', 'Administrateur principal', 'Tous les droits. Rôle verrouillé.', 1),
  ('MANAGER', 'Gérant', 'Commandes, messages, catalogue, stock et statistiques', 0),
  ('ORDER_CLERK', 'Gestionnaire de commandes', 'Toutes les actions sur les commandes et les messages', 0),
  ('CATALOG_CLERK', 'Gestionnaire de catalogue et stock', 'Produits, catégories et stock', 0);

-- Correspondance avec les anciennes permissions :
--   orders      -> orders.view, orders.status, orders.fee, orders.cancel, orders.payment, orders.notify, messages
--   orders_edit -> orders.edit · catalog -> products, stock · stats -> stats · users -> team · settings -> settings
INSERT INTO role_permissions (role_id, permission)
SELECT r.id, p.permission FROM roles r JOIN (
  SELECT 'ADMIN' AS code, 'orders.view' AS permission UNION ALL SELECT 'ADMIN', 'orders.edit' UNION ALL SELECT 'ADMIN', 'orders.status'
  UNION ALL SELECT 'ADMIN', 'orders.fee' UNION ALL SELECT 'ADMIN', 'orders.cancel' UNION ALL SELECT 'ADMIN', 'orders.payment'
  UNION ALL SELECT 'ADMIN', 'orders.notify' UNION ALL SELECT 'ADMIN', 'messages' UNION ALL SELECT 'ADMIN', 'products'
  UNION ALL SELECT 'ADMIN', 'stock' UNION ALL SELECT 'ADMIN', 'stats' UNION ALL SELECT 'ADMIN', 'team' UNION ALL SELECT 'ADMIN', 'settings'
  UNION ALL SELECT 'MANAGER', 'orders.view' UNION ALL SELECT 'MANAGER', 'orders.edit' UNION ALL SELECT 'MANAGER', 'orders.status'
  UNION ALL SELECT 'MANAGER', 'orders.fee' UNION ALL SELECT 'MANAGER', 'orders.cancel' UNION ALL SELECT 'MANAGER', 'orders.payment'
  UNION ALL SELECT 'MANAGER', 'orders.notify' UNION ALL SELECT 'MANAGER', 'messages' UNION ALL SELECT 'MANAGER', 'products'
  UNION ALL SELECT 'MANAGER', 'stock' UNION ALL SELECT 'MANAGER', 'stats'
  UNION ALL SELECT 'ORDER_CLERK', 'orders.view' UNION ALL SELECT 'ORDER_CLERK', 'orders.edit' UNION ALL SELECT 'ORDER_CLERK', 'orders.status'
  UNION ALL SELECT 'ORDER_CLERK', 'orders.fee' UNION ALL SELECT 'ORDER_CLERK', 'orders.cancel' UNION ALL SELECT 'ORDER_CLERK', 'orders.payment'
  UNION ALL SELECT 'ORDER_CLERK', 'orders.notify' UNION ALL SELECT 'ORDER_CLERK', 'messages'
  UNION ALL SELECT 'CATALOG_CLERK', 'products' UNION ALL SELECT 'CATALOG_CLERK', 'stock'
) p ON p.code = r.code;

-- users.role garde le TYPE de compte : 'ADMIN' = compte principal, 'STAFF' = membre de l'équipe (droits via role_id).
-- Les anciennes valeurs MANAGER / ORDER_CLERK / CATALOG_CLERK restent valides.
ALTER TABLE users
  MODIFY role ENUM('ADMIN','MANAGER','ORDER_CLERK','CATALOG_CLERK','STAFF','CUSTOMER') NOT NULL DEFAULT 'CUSTOMER',
  ADD COLUMN role_id INT UNSIGNED NULL;

UPDATE users u JOIN roles r ON r.code = u.role SET u.role_id = r.id
 WHERE u.role IN ('ADMIN', 'MANAGER', 'ORDER_CLERK', 'CATALOG_CLERK');

-- RESTRICT : impossible de supprimer un rôle encore attribué à un compte.
ALTER TABLE users
  ADD CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE RESTRICT;
