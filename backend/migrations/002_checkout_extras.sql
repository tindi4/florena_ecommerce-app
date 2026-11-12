-- Commande : civilité facultative (Monsieur / Madame) et position GPS facultative.
ALTER TABLE orders
  ADD COLUMN customer_gender ENUM('HOMME','FEMME') NULL AFTER customer_name,
  ADD COLUMN latitude DECIMAL(9,6) NULL,
  ADD COLUMN longitude DECIMAL(9,6) NULL,
  ADD COLUMN location_label VARCHAR(255) NULL;
