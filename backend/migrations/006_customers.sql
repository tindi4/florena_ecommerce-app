-- Comptes clients (séparés des comptes de l'équipe : un client ne peut jamais devenir administrateur par erreur).
-- Connexion par téléphone OU nom d'utilisateur + mot de passe.
CREATE TABLE IF NOT EXISTS customers (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NULL,
  username VARCHAR(30) NULL,
  phone VARCHAR(30) NOT NULL,
  phone_key VARCHAR(30) NOT NULL,             -- chiffres sans indicatif pays : « +228 90 12 34 56 » = « 90123456 »
  password_hash VARCHAR(255) NOT NULL,
  theme ENUM('light','dark') NOT NULL DEFAULT 'light',
  session_version INT UNSIGNED NOT NULL DEFAULT 1,  -- +1 au changement de mot de passe : les autres sessions sont fermées
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_username (username),
  UNIQUE KEY uq_customers_phone (phone_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- customer_id : compte client propriétaire (NULL = commande passée en invité).
-- tracking_code : code complet, long et aléatoire, qui suffit seul pour suivre la commande.
--   Les anciennes commandes reçoivent leur code à la première consultation (générateur cryptographique côté Node).
ALTER TABLE orders
  ADD COLUMN customer_id INT UNSIGNED NULL,
  ADD COLUMN tracking_code VARCHAR(40) NULL,
  ADD UNIQUE KEY uq_orders_tracking (tracking_code),
  ADD KEY idx_orders_customer (customer_id, created_at),
  ADD CONSTRAINT fk_orders_customer_account FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL;
