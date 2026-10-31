# Mise en production

Cible documentée : **un VPS Ubuntu 22.04/24.04** (Node 22, MySQL 8, Nginx, HTTPS Let's Encrypt). Les hébergements mutualisés sans Node.js ne conviennent pas pour le backend ; vérifiez toujours que votre hébergeur propose Node.js ≥ 20 et MySQL.

## Architecture recommandée (même domaine, plus simple et plus sûr)
- `https://boutique.example.com/` → fichiers statiques Angular
- `https://boutique.example.com/api/` et `/uploads/` → proxy vers Node (127.0.0.1:3000)
Cookies `SameSite=Lax`, pas de CORS cross-origin.

## Étapes
1. **Serveur** : `sudo apt install nginx mysql-server certbot python3-certbot-nginx` + Node 22 (nodesource ou nvm).
2. **MySQL** : créer base et utilisateur dédié (voir INSTALLATION.md §2). MySQL n'écoute que sur 127.0.0.1 (par défaut) : ne l'exposez pas à Internet.
3. **Code** : copier le projet dans `/var/www/boutique`, puis `cd backend && npm ci --omit=dev`.
4. **`.env` de production** (à la racine) :
   ```
   NODE_ENV=production
   PORT=3000
   DB_USER=boutique   DB_PASSWORD=...   DB_NAME=boutique
   JWT_SECRET=<48 octets aléatoires>
   CORS_ORIGINS=https://boutique.example.com
   COOKIE_SAMESITE=lax
   TRUST_PROXY=true
   SHOP_NAME=Ma Boutique   SHOP_CURRENCY=EUR
   ```
   `chmod 600 .env`. Ne jamais le versionner.
5. **Migrations + admin** : `npm run migrate` puis `npm run create-admin`.
6. **Frontend** : `cd frontend && npm ci && npm run build`. Dans `dist/frontend/browser/config.json`, mettre `{"apiUrl": ""}` (API sur le même domaine) puis copier le dossier vers `/var/www/boutique-web`.
7. **Processus Node** (systemd) : `/etc/systemd/system/boutique.service`
   ```
   [Unit]
   Description=Boutique API
   After=network.target mysql.service
   [Service]
   WorkingDirectory=/var/www/boutique/backend
   ExecStart=/usr/bin/node src/server.js
   Restart=always
   User=www-data
   [Install]
   WantedBy=multi-user.target
   ```
   `sudo systemctl enable --now boutique` ; journaux : `journalctl -u boutique -f` (logs JSON, sans secrets).
8. **Nginx** (`/etc/nginx/sites-available/boutique`) :
   ```nginx
   server {
     server_name boutique.example.com;
     root /var/www/boutique-web;
     index index.html;
     client_max_body_size 6m;
     location /api/    { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; }
     location /uploads/ { proxy_pass http://127.0.0.1:3000; }
     location / { try_files $uri $uri/ /index.html; }
   }
   ```
   Puis `sudo certbot --nginx -d boutique.example.com` (HTTPS + renouvellement automatique).
9. **Sauvegardes** : `crontab -e` → `0 3 * * * /var/www/boutique/scripts/backup.sh` + copie hors serveur du dossier `backups/` et de `backend/uploads/`. Restauration : voir `database/README.md`.
10. **Surveillance** : `journalctl`, ou un service d'uptime sur `https://boutique.example.com/health`.

## Frontend et API sur deux domaines différents
Exemple : `https://boutique.com` (statique) et `https://api.boutique.com`. Dans `.env` : `CORS_ORIGINS=https://boutique.com`, `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`, `TRUST_PROXY=true` (HTTPS obligatoire des deux côtés) ; dans `config.json` : `{"apiUrl": "https://api.boutique.com"}`. Les navigateurs qui bloquent les cookies tiers peuvent empêcher la connexion admin : privilégiez un sous-domaine du même site (`boutique.com` + `api.boutique.com` restent « same-site »).

## Hébergement statique du frontend seul
Netlify / Cloudflare Pages / Apache : publier `dist/frontend/browser` avec une règle de repli vers `index.html` (un `.htaccess` est déjà inclus pour Apache).
