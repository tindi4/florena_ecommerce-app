# Base de données

`schema.sql` est une copie de `backend/migrations/001_init.sql` (création de toutes les tables, clés étrangères, index, contraintes).
Préférez `npm run migrate` (dans `backend/`) : il mémorise les migrations déjà appliquées dans `schema_migrations`.

## Tables
users, categories, products, product_images, product_variants (options libres en JSON : `{"Couleur":"Noir","Taille":"42"}`),
orders (statut + `payment_status`), order_items (copie figée nom/SKU/variante/prix), order_status_history (statuts ET paiements),
stock_movements, customer_messages, notifications.

## Règles clés
- Montants en `DECIMAL(12,2)`; calculs serveur en centimes (entiers).
- Stock déduit **une fois** à la création de la commande ; restitué **une fois** à l'annulation (`orders.stock_restored`).
- Statuts : `EN_ATTENTE`, `CONFIRMEE`, `EN_PREPARATION`, `TERMINEE`, `ANNULEE`. Paiement : `NON_PAYE`, `PAYE`.

## Sauvegarde / restauration
```bash
./scripts/backup.sh                      # écrit backups/boutique-AAAAMMJJ-HHMMSS.sql.gz
gunzip -c backups/FICHIER.sql.gz | mysql -u UTILISATEUR -p NOM_BASE
```
Sur Windows : `mysqldump -u UTILISATEUR -p NOM_BASE > sauvegarde.sql` puis `mysql -u UTILISATEUR -p NOM_BASE < sauvegarde.sql`.
Sauvegardez aussi le dossier `backend/uploads/` (images des produits).
