-- Mot de passe oublié traité par la boutique (sans e-mail).
-- 1. Le client fait une demande (téléphone ou nom d'utilisateur) : une ligne « EN_ATTENTE » par compte, les doublons
--    sont regroupés (request_count, last_requested_at).
-- 2. Un membre de l'équipe crée un lien à usage unique (jeton haché dans customer_password_resets, 30 min)
--    et l'envoie au client par WhatsApp. La demande passe « TRAITEE ».
-- 3. Toutes les actions sont journalisées (qui, quand) dans customer_reset_log.
CREATE TABLE IF NOT EXISTS customer_reset_requests (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED NOT NULL,
  status ENUM('EN_ATTENTE','TRAITEE','IGNOREE') NOT NULL DEFAULT 'EN_ATTENTE',
  request_count INT UNSIGNED NOT NULL DEFAULT 1,
  last_requested_at DATETIME NOT NULL,
  handled_by INT UNSIGNED NULL,
  handled_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reset_req_status (status, last_requested_at),
  KEY idx_reset_req_customer (customer_id, status),
  CONSTRAINT fk_reset_req_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE,
  CONSTRAINT fk_reset_req_user FOREIGN KEY (handled_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lien créé par l'équipe : qui l'a créé et pour quelle demande.
ALTER TABLE customer_password_resets
  ADD COLUMN created_by INT UNSIGNED NULL AFTER customer_id,
  ADD COLUMN request_id INT UNSIGNED NULL AFTER created_by,
  ADD CONSTRAINT fk_resets_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_resets_request FOREIGN KEY (request_id) REFERENCES customer_reset_requests (id) ON DELETE SET NULL;

-- Journal : jamais de mot de passe ni de jeton, seulement qui a fait quoi et quand.
CREATE TABLE IF NOT EXISTS customer_reset_log (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED NULL,
  request_id INT UNSIGNED NULL,
  user_id INT UNSIGNED NULL,
  action ENUM('DEMANDE','LIEN_CREE','DEMANDE_IGNOREE','MOT_DE_PASSE_CHANGE') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reset_log_request (request_id, created_at),
  KEY idx_reset_log_customer (customer_id, created_at),
  CONSTRAINT fk_reset_log_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL,
  CONSTRAINT fk_reset_log_request FOREIGN KEY (request_id) REFERENCES customer_reset_requests (id) ON DELETE SET NULL,
  CONSTRAINT fk_reset_log_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE notifications
  MODIFY type ENUM('NEW_ORDER','NEW_MESSAGE','ORDER_UPDATED','NEW_REVIEW','RESET_REQUEST') NOT NULL;
