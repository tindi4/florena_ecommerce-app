-- Comptes d'équipe : l'ADMIN (principal) crée des comptes secondaires avec un rôle.
ALTER TABLE users
  MODIFY role ENUM('ADMIN','MANAGER','ORDER_CLERK','CATALOG_CLERK','CUSTOMER') NOT NULL DEFAULT 'CUSTOMER',
  ADD COLUMN created_by_user_id INT UNSIGNED NULL;

ALTER TABLE users
  ADD CONSTRAINT fk_users_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL;
