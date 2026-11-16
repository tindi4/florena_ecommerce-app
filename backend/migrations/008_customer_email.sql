-- Adresse e-mail du compte client (facultative) : elle sert uniquement à réinitialiser un mot de passe oublié.
ALTER TABLE customers
  ADD COLUMN email VARCHAR(190) NULL AFTER phone_key,
  ADD UNIQUE KEY uq_customers_email (email);

-- Demandes de réinitialisation : on ne garde que l'empreinte (SHA-256) du jeton, jamais le jeton lui-même.
-- Un jeton sert une seule fois et expire au bout d'une heure.
CREATE TABLE IF NOT EXISTS customer_password_resets (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_resets_token (token_hash),
  KEY idx_resets_customer (customer_id),
  CONSTRAINT fk_resets_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
