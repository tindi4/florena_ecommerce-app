-- Avis clients sur les articles.
-- Seul un client connecté ayant reçu l'article (commande TERMINEE rattachée à son compte) peut donner son avis :
-- chaque avis publié est donc un « achat vérifié ». Un avis par article et par client (modifiable).
-- Tout avis (nouveau ou modifié) attend la validation de la boutique avant d'être visible.
CREATE TABLE IF NOT EXISTS product_reviews (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  order_id INT UNSIGNED NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment VARCHAR(1000) NOT NULL,
  photo_url VARCHAR(255) NULL,
  author_name VARCHAR(60) NOT NULL,
  status ENUM('EN_ATTENTE','PUBLIE','REFUSE') NOT NULL DEFAULT 'EN_ATTENTE',
  shop_reply VARCHAR(600) NULL,
  moderated_by INT UNSIGNED NULL,
  moderated_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reviews_product_customer (product_id, customer_id),
  KEY idx_reviews_product_status (product_id, status, created_at),
  KEY idx_reviews_status (status, created_at),
  CONSTRAINT fk_reviews_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE SET NULL,
  CONSTRAINT fk_reviews_moderator FOREIGN KEY (moderated_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notification « nouvel avis à valider » dans l'administration.
ALTER TABLE notifications
  MODIFY type ENUM('NEW_ORDER','NEW_MESSAGE','ORDER_UPDATED','NEW_REVIEW') NOT NULL;
