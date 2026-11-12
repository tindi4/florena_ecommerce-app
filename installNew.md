# installNew.md : commandes à lancer après la mise à jour

Ordre à suivre. Remplacez `VOTRE_...` par vos valeurs. Sous Windows, utilisez PowerShell (les commandes `npm` sont identiques).

## Nouveautés de cette mise à jour (à lire d'abord)

| Migration | Contenu | Effet sur vos données |
|---|---|---|
| `005_settings.sql` | table `settings` (nom, couleur, logo) | aucune donnée modifiée ; sans réglage, le nom du `.env` (`SHOP_NAME`) est utilisé |
| `006_customers.sql` | comptes clients + code de suivi des commandes | les commandes existantes restent en « invité » ; leur code de suivi est créé à la première consultation |
| `007_custom_roles.sql` | rôles personnalisables (tables `roles`, `role_permissions`) | chaque compte de l'équipe est rattaché au rôle qu'il avait : **mêmes droits qu'avant** |

- ⚠️ **Toute l'équipe devra se reconnecter une fois** à l'administration (les sessions portent maintenant une « audience » qui les distingue des sessions clients).
- ⚠️ Le serveur API doit être **redémarré après** `npm run migrate` (s'il tourne pendant la migration, il affichera des erreurs `Unknown column`).
- Nouvelle variable facultative dans `.env` : `CUSTOMER_TTL_DAYS=30` (durée de connexion d'un client, 30 jours par défaut).
- Frontend : `package.json` contient maintenant une section `overrides` (`glob` 14.0.3, `minimatch` 11.0.3) qui corrige 16 failles « moderate » de l'outillage d'Angular CLI. Lancez bien `npm install` dans `frontend/`.

## 0. Avant de remplacer quoi que ce soit

1. **Copiez votre dossier actuel** ailleurs (sauvegarde).
2. **Exportez votre base** :
   ```bash
   mysqldump -u VOTRE_UTILISATEUR_MYSQL -p VOTRE_BASE > sauvegarde-avant-maj.sql
   ```
3. Notez ou gardez ces éléments, qu'il ne faut **pas écraser** en décompressant la nouvelle version :
   - `.env` (à la racine) : l'archive n'en contient pas, le vôtre reste en place ;
   - `backend/uploads/` : les photos de vos produits (l'archive n'en contient pas) ;
   - `frontend/public/config.json` : l'archive en contient un par défaut (`apiUrl` = `http://localhost:3000`). **Si le vôtre pointe vers votre vrai site, gardez votre version** et ajoutez-y seulement ces deux lignes :
     ```json
     "googleMapsApiKey": "",
     "defaultMapCenter": { "lat": 6.1725, "lng": 1.2314 }
     ```

## 1. Remplacer le code

Décompressez `ecommerce-project.zip` **par-dessus** votre projet (ou remplacez le dossier, puis remettez votre `.env`, votre `backend/uploads/` et votre `config.json`).

## 2. Compléter le fichier `.env` (racine du projet)

Ajoutez les lignes manquantes (la liste complète est dans `.env.example`) :

```env
SHOP_CURRENCY=XOF
DELIVERY_FEE_SUGGESTED=1000
PHONE_COUNTRY_CODE=228
SITE_URL=https://VOTRE-SITE.com
SHOP_WHATSAPP=228XXXXXXXX
# Facultatif (affichés sur la facture PDF) :
# SHOP_ADDRESS=Quartier, Lomé
# SHOP_PHONE=+228 90 00 00 00
```

- `SITE_URL` : adresse publique du site (en local : `http://localhost:4200`).
- `SHOP_WHATSAPP` : numéro WhatsApp de la boutique, format international **sans le +**.

## 3. Backend (dossier `backend/`)

```bash
cd backend
npm install            # installe pdfkit, zod 4 et les correctifs de sécurité
npm run migrate        # applique les migrations manquantes (jusqu'à 007) ; vos données sont conservées
npm start              # API sur http://localhost:3000
```

Vérification : ouvrez http://localhost:3000/health : vous devez voir `{"ok":true}`.

Seulement si vous repartez d'une **base vide** :
```bash
npm run create-admin   # crée l'administrateur principal
npm run seed:demo      # (facultatif) 2 produits d'exemple
```

## 4. Frontend (dossier `frontend/`), dans un deuxième terminal

```bash
cd frontend
npm install
npm start              # http://localhost:4200
```

## 5. Production (serveur Linux, Nginx)

```bash
# backend
cd /var/www/boutique/backend
npm ci --omit=dev
npm run migrate
sudo systemctl restart boutique         # nom de votre service systemd

# frontend
cd /var/www/boutique/frontend
npm ci
npm run build
# copiez le contenu de dist/frontend/browser vers le dossier servi par Nginx
# SANS écraser votre config.json de production, puis :
sudo systemctl reload nginx
```

Si les pages ne se mettent pas à jour chez vous, faites **Ctrl + F5** (le navigateur garde l'ancienne version en cache).

## 6. Vérifier que tout fonctionne (2 minutes)

1. `/admin/nimportequoi` : doit renvoyer vers `/admin/login` quand vous n'êtes pas connecté.
2. Connectez-vous à l'admin : le tableau de bord s'affiche, le menu contient **Statistiques** et **Équipe**.
3. Boutique : passez une commande de test (cochez « Me faire livrer »), puis suivez-la sur `/suivi`.
4. Admin, ouvrez la commande : fixez les frais (**Valider 1 000**), cliquez sur **Modifier la commande** (téléphone, articles), essayez **Envoyer par WhatsApp**.
5. Page **Équipe** : créez un compte « Gestionnaire de commandes » et vérifiez qu'il n'a pas accès aux produits.
6. **Équipe > Rôles et permissions** : créez un rôle « Caissier » avec seulement « Marquer payé / non payé », attribuez-le à un compte de test : il voit les commandes mais n'a ni bouton « Confirmer », ni « Annuler », ni frais de livraison.
7. **Réglages** (menu, administrateur) : changez la couleur et envoyez un logo (PNG ou JPG pour qu'il apparaisse aussi sur la facture PDF). Vérifiez le site public, la page `/admin/login` et un PDF.
8. Boutique : **Connexion > Créer un compte** avec le téléphone d'une commande passée sur cet appareil, puis **Mon compte** : la commande y est rattachée. Essayez le thème sombre.
9. Page **Suivi** : collez le code complet (`CMD-XXXXXXXXXX-…`, affiché après la commande) sans téléphone : la commande s'affiche. Le téléphone seul est refusé.

## 7. Carte Google (facultatif)

Dans Google Cloud : activez **Maps JavaScript API** et **Geocoding API**, créez une clé **restreinte à votre domaine**, puis collez-la dans `frontend/public/config.json` (`"googleMapsApiKey": "VOTRE_CLE"`). Si vous êtes en production, modifiez aussi le `config.json` du dossier publié. Sans clé, le bouton « Utiliser ma position » fonctionne déjà.

## 8. Envoyer sur GitHub

```bash
git status                       # vérifiez que .env n'apparaît PAS
git add .
git commit -m "Mise à jour : livraison, WhatsApp, statistiques, équipe, facture PDF, édition des commandes"
git push
```

## 9. Tests (facultatif)

```sql
-- une seule fois, dans MySQL :
CREATE DATABASE boutique_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON boutique_test.* TO 'VOTRE_UTILISATEUR_MYSQL'@'localhost';
```
```bash
cd backend
npm test                         # 122 tests ; la base boutique_test est vidée à chaque fois
```

## 10. Sauvegardes

### Lancer une sauvegarde à la main
```bash
cd backend
npm run backup
```
Le script crée `backups/boutique-AAAA-MM-JJ_HH-MM-SS.sql.gz` (à la racine du projet ; ce dossier est ignoré par git) et ne garde que les **`BACKUP_KEEP`** dernières sauvegardes (14 par défaut, à régler dans `.env`). En cas d'échec, aucun fichier n'est laissé et le message explique pourquoi.

Il faut que `mysqldump` soit installé, avec la **même famille et une version au moins égale** à celle du serveur. Un `mysqldump` MariaDB/XAMPP ne peut pas se connecter à MySQL 8 : il affiche `caching_sha2_password could not be loaded`. Le script cherche `mysqldump` dans le PATH, puis sous Windows dans `C:\Program Files\MySQL\…\bin`. Sinon, indiquez son chemin dans `.env` :
```
MYSQLDUMP_PATH='C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe'
```

### Programmer une sauvegarde chaque nuit
**Linux (cron)** : `crontab -e`, puis ajoutez cette ligne (3 h du matin) :
```
0 3 * * * cd /chemin/vers/backend && npm run backup >> ../backups/backup.log 2>&1
```
Si cron ne trouve pas `npm`, remplacez `npm run backup` par le chemin complet de node (`which node`) suivi de `scripts/backup.js`.

**Windows (Planificateur de tâches)** : dans une invite de commandes, adaptez le chemin et lancez :
```bat
schtasks /Create /TN "Boutique - sauvegarde" /SC DAILY /ST 03:00 /TR "cmd /c cd /d E:\chemin\vers\backend && npm run backup >> ..\backups\backup.log 2>&1"
```
Vous pouvez aussi passer par l'interface : *Planificateur de tâches > Créer une tâche de base > Tous les jours, 03:00 > Démarrer un programme*, avec `cmd`, les arguments `/c npm run backup` et le dossier `backend` dans *Commencer dans*. Testez la tâche avec un clic droit, puis *Exécuter*, et vérifiez qu'un fichier apparaît dans `backups/`.

### Restaurer une sauvegarde
```bash
gunzip -t backups/boutique-2026-01-01_03-00-00.sql.gz          # vérifie que le fichier est intact
gunzip -c backups/boutique-2026-01-01_03-00-00.sql.gz | mysql -u boutique -p boutique
```
⚠️ La restauration **remplace** les tables existantes. Testez-la d'abord sur une base vide (par exemple `boutique_restore`).

### Copier les sauvegardes hors du serveur
Une sauvegarde rangée sur le même disque disparaît avec lui (panne, vol, piratage). Copiez régulièrement **`backups/`** et **`backend/uploads/`**, qui contient les photos des produits et le logo et n'est pas dans la base, vers un autre endroit : disque externe, autre serveur (`rsync`), stockage en ligne. Faites aussi de temps en temps un test de restauration complet.

## Dépannage rapide

| Message | Que faire |
|---|---|
| `npm install` du frontend échoue (`edgesOut`) | Le fichier `frontend/.npmrc` (legacy-peer-deps) doit être présent ; relancez `npm install`. |
| `Variable d'environnement manquante` | Il manque une ligne dans `.env` (comparez avec `.env.example`). |
| `Unknown column ...` / erreur SQL | La migration n'a pas été lancée : `cd backend && npm run migrate`. |
| `ECONNREFUSED 3306` | MySQL n'est pas démarré. |
| Le site ne joint pas l'API | Vérifiez `apiUrl` dans `frontend/public/config.json` et `CORS_ORIGINS` dans `.env`. |
| La connexion admin échoue après un changement de domaine | `CORS_ORIGINS` doit contenir exactement l'adresse du site ; voir `docs/DEPLOYMENT.md`. |
| Le client ne retrouve plus sa commande | Si vous avez changé son numéro de téléphone, il doit utiliser le **nouveau** numéro (ou le code complet, qui ne dépend pas du téléphone). |
| « Session expirée » juste après la mise à jour | Normal une seule fois : reconnectez-vous. |
| Un membre de l'équipe arrive sur « Aucun accès » | Son rôle n'a aucune permission cochée : **Équipe > Rôles et permissions**. |
| Le logo n'apparaît pas sur la facture PDF | Seuls les logos **PNG ou JPG** peuvent être imprimés dans le PDF (WebP / SVG : le nom de la boutique est affiché). |
| `Fichier trop lourd : 2 Mo maximum` | Réduisez le logo (un logo web pèse en général moins de 200 ko). |
