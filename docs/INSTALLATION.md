# Installation locale (Windows, macOS, Linux)

## 1. Logiciels à installer
1. **Node.js 22 LTS** (ou 20 LTS) : https://nodejs.org — vérifiez avec `node -v`.
2. **MySQL 8** (ou MariaDB 10.6+) : https://dev.mysql.com/downloads/installer/ (Windows : « MySQL Installer »).
3. Un terminal (PowerShell sous Windows).

> Angular 21 demande Node ≥ 20.19 / 22.12 ; en cas de message d'erreur, installez la dernière version 22 LTS.

## 2. Créer la base MySQL
Ouvrez un terminal MySQL (`mysql -u root -p`) puis :
```sql
CREATE DATABASE boutique CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'boutique'@'localhost' IDENTIFIED BY 'UN_MOT_DE_PASSE_SOLIDE';
GRANT ALL PRIVILEGES ON boutique.* TO 'boutique'@'localhost';
FLUSH PRIVILEGES;
```

## 3. Configurer l'environnement
Décompressez l'archive, ouvrez un terminal dans le dossier `ecommerce-project`, puis :
```bash
cp .env.example .env          # Windows PowerShell : Copy-Item .env.example .env
```
Éditez `.env` : `DB_PASSWORD` (celui de l'étape 2), `SHOP_NAME`, `SHOP_CURRENCY` (ex. `XOF`, `EUR`) et surtout `JWT_SECRET` :
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Collez le résultat dans `JWT_SECRET`.

> Nouveautés de configuration dans `.env` : `SHOP_CURRENCY=XOF`, `DELIVERY_FEE_LOME`, `DELIVERY_FEE_OUTSIDE_MIN`, `PHONE_COUNTRY_CODE=228`, `SITE_URL` (voir `.env.example`).
> Carte Google (facultatif) : renseignez `googleMapsApiKey` dans `frontend/public/config.json`. Activez dans Google Cloud « Maps JavaScript API » et « Geocoding API », puis restreignez la clé à l'adresse de votre site. Sans clé, le bouton « Utiliser ma position » fonctionne quand même.

## 4. Backend
```bash
cd backend
npm install
npm run migrate          # crée les tables
npm run create-admin     # e-mail, nom, mot de passe (12 caractères minimum)
npm run seed:demo        # FACULTATIF : 2 produits d'exemple (T-shirt en lettres, baskets en pointures)
npm start                # API sur http://localhost:3000
```
Test : ouvrez http://localhost:3000/health → `{"ok":true}`.

## 5. Frontend (deuxième terminal)
```bash
cd frontend
npm install
npm start                # http://localhost:4200
```

## 5 bis. Carte Google (facultatif)
Sans clé, le client peut quand même utiliser « Utiliser ma position » (GPS du téléphone) et l'admin voit un lien Google Maps.
Pour la recherche d'adresse et la carte avec repère déplaçable :
1. https://console.cloud.google.com → créer un projet → activer **Maps JavaScript API** et **Geocoding API** (facturation Google requise ; un crédit mensuel gratuit existe).
2. Créer une clé API et la **restreindre** aux adresses de votre site (« Référents HTTP », ex. `https://boutique.example.com/*`) et à ces deux API.
3. La coller dans `frontend/public/config.json` : `"googleMapsApiKey": "VOTRE_CLE"` (ou dans `dist/.../config.json` en production).

## 5 ter. WhatsApp
Dans `.env` : `SHOP_WHATSAPP=22890000000` (numéro de la boutique, format international sans +) pour le bouton « Continuer sur WhatsApp » côté client ; `PHONE_COUNTRY_CODE=228` et `SITE_URL=https://votre-site` pour les messages envoyés par l'admin.

## 6. Utilisation
- Boutique : http://localhost:4200
- Administration : http://localhost:4200/admin/login

## 7. Lancer les tests du backend (facultatif)
```sql
CREATE DATABASE boutique_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON boutique_test.* TO 'boutique'@'localhost';
```
puis `cd backend && npm test` (la base `boutique_test` est vidée à chaque exécution).

## Dépannage
- `ECONNREFUSED 3306` : MySQL n'est pas démarré.
- `Access denied` : vérifiez `DB_USER` / `DB_PASSWORD` dans `.env`.
- Page blanche / erreurs réseau côté boutique : vérifiez que l'API tourne et que `frontend/public/config.json` pointe vers elle.
- Cookie admin refusé : `CORS_ORIGINS` doit contenir exactement l'URL du frontend.
