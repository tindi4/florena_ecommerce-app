-- Livraison demandée par le client ; frais fixés ensuite par l'administrateur.
-- Suivi de l'envoi de la confirmation (WhatsApp / SMS) et des modifications faites par le client.
ALTER TABLE orders
  ADD COLUMN subtotal_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER currency,
  ADD COLUMN delivery_requested TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN delivery_fee_accepted TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN delivery_fee_status ENUM('NONE','PENDING','SET') NOT NULL DEFAULT 'NONE',
  ADD COLUMN delivery_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN customer_edited_at DATETIME NULL,
  ADD COLUMN confirmation_channel ENUM('WHATSAPP','SMS') NULL,
  ADD COLUMN confirmation_sent_at DATETIME NULL,
  ADD COLUMN confirmation_sent_by_user_id INT UNSIGNED NULL;

-- Anciennes commandes : le sous-total est l'ancien total (sans livraison).
UPDATE orders SET subtotal_amount = total_amount;

ALTER TABLE orders
  ADD CONSTRAINT fk_orders_notified_by FOREIGN KEY (confirmation_sent_by_user_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE order_status_history
  MODIFY event_type ENUM('STATUS','PAYMENT','NOTIFY','FEE','EDIT') NOT NULL DEFAULT 'STATUS';

ALTER TABLE notifications
  MODIFY type ENUM('NEW_ORDER','NEW_MESSAGE','ORDER_UPDATED') NOT NULL;
