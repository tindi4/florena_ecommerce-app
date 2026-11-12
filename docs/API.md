# API REST (`/api`)

Réponses JSON. Erreurs : `{ "error": { "code", "message", "details?" } }`. Listes paginées : `{ items, page, limit, total, totalPages }`.

## Public
| Méthode | Route | Description |
|---|---|---|
| GET | `/settings` | nom de boutique, devise |
| GET | `/categories` | catégories actives |
| GET | `/products?search&category&sort=newest\|price_asc\|price_desc&page&limit` | catalogue |
| GET | `/products/:slug` | fiche produit + variantes (options libres) et stock |
| POST | `/cart/check` | `{items:[{variantId,quantity}]}` → prix/stock réels |
| POST | `/orders` | `deliveryZone` (`LOME`\|`HORS_LOME`) obligatoire ; `deliveryFee` hors Lomé (minimum imposé) ; `customerName`, `customerGender` (`HOMME`\|`FEMME`), `latitude`/`longitude`/`locationLabel` facultatifs ; `customerPhone` obligatoire. Crée la commande (en-tête optionnel `Idempotency-Key`). 409 `CART_CHANGED` si prix/stock ont changé |
| POST | `/orders/invoice` | `{orderNumber, phone}` → facture ou bon de commande **PDF** |
| PATCH | `/orders/edit` | `{orderNumber, phone, changes}` : le client modifie sa commande (nom, civilité, adresse, message, livraison, position) tant qu'elle n'est pas en préparation ; notifie l'admin |
| POST | `/orders/invoice` | `{orderNumber, phone}` → facture / bon de commande PDF |
| POST | `/orders/track` | `{orderNumber, phone}` → statut, paiement, articles, chronologie |
| POST | `/messages` | message client (notifie l'admin) |

## Authentification
`POST /auth/login` → `{user, csrfToken}` + cookie HttpOnly · `POST /auth/logout` · `GET /auth/me`.
Toute écriture `/admin/*` exige l'en-tête `X-CSRF-Token`.

## Administration (cookie + CSRF)
| Route | Description |
|---|---|
| GET `/admin/dashboard`, `/admin/counters` | indicateurs, compteurs de notifications |
| GET `/admin/orders?view=todo\|done\|cancelled\|all&status&payment=paid\|unpaid&search&page` | liste |
| GET `/admin/orders/:id` | détail + historique (ouvre = notifications lues) |
| PATCH `/admin/orders/:id/status` `{status, comment?}` | transitions : EN_ATTENTE→CONFIRMEE/ANNULEE ; CONFIRMEE→EN_PREPARATION/TERMINEE/ANNULEE ; EN_PREPARATION→TERMINEE/ANNULEE |
| PATCH `/admin/orders/:id/payment` `{paid, note?}` | marquer payé / non payé |
| PATCH `/admin/orders/:id/delivery-fee` `{fee}` | fixe les frais de livraison (tout montant ≥ 0) |
| POST `/admin/orders/:id/notify` `{channel: WHATSAPP\|SMS, message?}` | prépare le lien WhatsApp/SMS et trace l'envoi |
| GET `/admin/orders/:id/invoice` | PDF |
| PUT `/admin/orders/:id` `{details?, items?}` | modification complète (téléphone, coordonnées, livraison, articles) en une transaction ; permission `orders_edit` |
| GET `/admin/order-variants?search=` | articles à ajouter à une commande (permission `orders_edit`) |
| GET `/admin/stats?from&to` | chiffre d'affaires, caisse, top produits (permission `stats`) |
| GET/POST `/admin/users`, PATCH `/admin/users/:id`, POST `/admin/users/:id/password` | équipe (permission `users`, administrateur principal) |
| PATCH `/admin/orders/:id/delivery-fee` `{fee}` | ajuste les frais de livraison (commande non terminée/annulée) |
| POST `/admin/orders/:id/notify` `{channel: WHATSAPP\|SMS, message?}` | prépare le lien WhatsApp/SMS et trace l'envoi |
| GET `/admin/orders/:id/invoice` | PDF (facture ou bon de commande) |
| GET `/admin/stats?from&to` | chiffre d'affaires, caisse, produits les plus vendus (permission `stats`) |
| GET/POST `/admin/users`, PATCH `/admin/users/:id`, POST `/admin/users/:id/password` | équipe et rôles (permission `users`, administrateur principal) |
| GET `/admin/notifications?filter=unread\|read\|all`, POST `/admin/notifications/read-all`, PATCH `/admin/notifications/:id/read` | notifications |
| GET `/admin/messages?status`, PATCH `/admin/messages/:id/status` `{status:NOUVEAU\|TRAITE}` | messages clients |
| GET/POST `/admin/products`, GET/PUT `/admin/products/:id`, PATCH `/admin/products/:id/active` | produits et variantes (PUT synchronise la liste des variantes) |
| POST `/admin/products/:id/images` (multipart `image`), DELETE `/admin/images/:id` | images |
| GET/POST `/admin/categories`, PUT `/admin/categories/:id`, PATCH `/admin/categories/:id/active` | catégories |
| GET `/admin/stock?filter=low\|out&search`, POST `/admin/variants/:id/stock` `{quantity, reason}`, GET `/admin/variants/:id/stock-history` | stock |

## Réglages (permission `settings`)
GET `/settings` (public) → `{shopName, primaryColor, logoUrl, currency, delivery, shopWhatsapp}` ·
GET/PUT `/admin/settings` `{shopName?, primaryColor? (#RRGGBB)}` · POST `/admin/settings/logo` (multipart `logo`, 2 Mo) · DELETE `/admin/settings/logo`.

## Suivi sans compte
`/orders/track`, `/orders/invoice` et `/orders/edit` acceptent `{code}` (code complet `CMD-XXXXXXXXXX-YYYYYYYYYYYYYYYYYYYY`) **ou** `{orderNumber, phone}`. Le téléphone seul → 400.

## Comptes clients (cookie `customer_token` + `X-CSRF-Token`)
| Route | Description |
|---|---|
| POST `/customer/register` `{phone, username?, name?, password}` | crée le compte (mot de passe ≥ 8) ; 5 / h / IP |
| POST `/customer/login` `{identifier, password}` | identifiant = téléphone ou nom d'utilisateur ; 10 / 15 min / IP |
| POST `/customer/logout` · GET `/customer/me` | session |
| GET `/account/orders`, GET `/account/orders/:number`, GET `/account/orders/:number/invoice` | mes commandes |
| POST `/account/orders/claim` `{orders: [numéro ou code]}` | rattacher des commandes en invité (même téléphone) |
| PATCH `/account/profile` `{username?, name?}` · POST `/account/password` `{currentPassword, newPassword}` · PATCH `/account/preferences` `{theme: light\|dark}` | profil |
| POST `/orders` avec la session client + `X-CSRF-Token` | commande rattachée au compte |

## Rôles et permissions (permission `team`)
GET `/admin/roles` → rôles + catalogue des permissions · POST `/admin/roles` `{name, description?, permissions[]}` · PATCH `/admin/roles/:id` · DELETE `/admin/roles/:id` (refusé s'il est attribué).
Comptes : POST `/admin/users` `{name, email, password, roleId}` (ou `role: MANAGER|ORDER_CLERK|CATALOG_CLERK`).

| Permission | Routes |
|---|---|
| `orders.view` | tableau de bord, liste/détail/PDF des commandes, notifications |
| `orders.edit` | PUT `/admin/orders/:id`, `/admin/order-variants` |
| `orders.status` / `orders.cancel` | PATCH `/status` (ANNULEE exige `orders.cancel`) |
| `orders.fee` · `orders.payment` · `orders.notify` | frais de livraison · paiement · WhatsApp/SMS |
| `messages` | messages clients (+ notifications) |
| `products` · `stock` | produits, images, catégories · stock |
| `stats` · `team` · `settings` | statistiques · équipe et rôles · réglages |

Modèles par défaut : **Administrateur principal** (tout, verrouillé), **Gérant** (commandes, messages, produits, stock, stats), **Gestionnaire de commandes** (commandes + messages), **Gestionnaire de catalogue** (produits + stock). Le compte principal (`npm run create-admin`) a toujours toutes les permissions.
