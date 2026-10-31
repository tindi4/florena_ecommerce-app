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
| POST | `/orders` | crée la commande (en-tête optionnel `Idempotency-Key`). 409 `CART_CHANGED` si prix/stock ont changé |
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
| GET `/admin/notifications?filter=unread\|read\|all`, POST `/admin/notifications/read-all`, PATCH `/admin/notifications/:id/read` | notifications |
| GET `/admin/messages?status`, PATCH `/admin/messages/:id/status` `{status:NOUVEAU\|TRAITE}` | messages clients |
| GET/POST `/admin/products`, GET/PUT `/admin/products/:id`, PATCH `/admin/products/:id/active` | produits et variantes (PUT synchronise la liste des variantes) |
| POST `/admin/products/:id/images` (multipart `image`), DELETE `/admin/images/:id` | images |
| GET/POST `/admin/categories`, PUT `/admin/categories/:id`, PATCH `/admin/categories/:id/active` | catégories |
| GET `/admin/stock?filter=low\|out&search`, POST `/admin/variants/:id/stock` `{quantity, reason}`, GET `/admin/variants/:id/stock-history` | stock |
