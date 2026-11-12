-- Réglages de la boutique modifiables depuis l'administration (nom, couleur principale, logo).
-- Table clé / valeur : ajouter un réglage ne demande pas de nouvelle colonne.
-- Si une clé est absente, le serveur utilise la valeur du fichier .env (SHOP_NAME…) ou une valeur par défaut.
CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(64) NOT NULL,
  setting_value VARCHAR(1000) NULL,
  updated_by_user_id INT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key),
  CONSTRAINT fk_settings_user FOREIGN KEY (updated_by_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
