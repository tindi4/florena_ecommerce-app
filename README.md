# Boutique en ligne : Angular + Express + MySQL

Boutique sans paiement en ligne : le client commande, l'administrateur traite (confirmation, préparation, paiement constaté, fin).

**Dossiers** : `frontend/` (Angular 21 standalone) · `backend/` (API Express) · `database/` (schéma SQL) · `docs/` · `scripts/`.

## Démarrage rapide
Voir [docs/INSTALLATION.md](docs/INSTALLATION.md). En résumé :
```bash
cp .env.example .env                      # puis éditer (JWT_SECRET, DB_PASSWORD…)
cd backend && npm install && npm run migrate && npm run create-admin && npm start
cd ../frontend && npm install && npm start   # http://localhost:4200
```

## Fonctionnalités
- **Client** : accueil, catalogue (recherche, catégorie, tri, pagination), fiche produit à **variantes dynamiques** (couleur, taille en lettres *ou* pointure numérique 36-47…, etc.), panier (localStorage, revérifié par le serveur), commande sans compte, **suivi de commande en direct** (confirmée / en préparation / terminée / payée), formulaire de contact.
- **Admin** : tableau de bord, commandes en liste de tâches (À traiter / Terminées / Annulées), **notifications** (nouvelles commandes et messages), **marquage « Payé »**, historique des changements, produits / variantes / images, catégories, stock avec historique.
- **Commande** : nom et civilité facultatifs, téléphone obligatoire, localisation (Google Maps ou GPS), livraison Lomé 1000 F / hors Lomé au choix, facture ou bon de commande en PDF.
- **Équipe** : comptes secondaires avec rôles, WhatsApp/SMS choisi par l'admin, statistiques et suivi de caisse.
- **Fiabilité** : prix et stock revérifiés côté serveur, transaction MySQL + verrous (achats simultanés), idempotence anti double-commande, stock restitué une seule fois à l'annulation, historique des prix figé dans les commandes.

## Nouveautés (réglages, comptes clients, rôles)
- **Réglages** (administrateur) : nom, couleur principale et logo (PNG/JPG/WebP/SVG, 2 Mo, type réel vérifié) appliqués au site, à l'admin, à la page de connexion et à la facture PDF.
- **Comptes clients** : inscription / connexion par téléphone ou nom d'utilisateur ; « Mon compte » (toutes les commandes et leur statut, facture, nom d'utilisateur, mot de passe, thème clair/sombre). Les commandes en invité restent accessibles et peuvent être rattachées au compte (même téléphone + numéro ou code de la commande).
- **Suivi** : le code complet (`CMD-XXXXXXXXXX-` + 20 caractères aléatoires) suffit seul ; sinon numéro + téléphone. Le téléphone seul ne donne jamais accès.
- **Rôles personnalisables** : 13 permissions cochables une par une ; les 4 anciens rôles sont devenus des modèles ; anti-escalade (on n'accorde jamais un droit qu'on n'a pas).
- Menu admin à la hauteur de l'écran avec son propre défilement.

## Nouveautés de la version précédente
- Toute adresse `/admin/...` mène à `/admin/login` sans session.
- Commande : nom et téléphone obligatoires, civilité Monsieur/Madame facultative (décochée), « Me faire livrer » + « Ajouter les frais de livraison », adresse/quartier en un seul champ, « Laissez un message (facultatif) », localisation (GPS ou Google Maps).
- Frais de livraison fixés par l'administrateur (1 000 ou tout autre montant) ; le client peut modifier sa commande avant la préparation ; l'admin est alerté (cloche, pastille « Modifiée », son).
- Confirmation WhatsApp ou SMS choisie par l'admin ; « Continuer sur WhatsApp » côté client.
- Facture / bon de commande PDF (client et admin).
- Statistiques et caisse ; comptes d'équipe avec rôles.
- L'admin, les gérants et les gestionnaires de commandes peuvent modifier une commande (téléphone, coordonnées, livraison, articles).
- Finitions : bouton WhatsApp flottant, animations, dates en français, application installable (manifeste), mobile vérifié.

## Documentation
[Installation](docs/INSTALLATION.md) · [Déploiement](docs/DEPLOYMENT.md) · [Sécurité](docs/SECURITY.md) · [API](docs/API.md) · [Guide admin](docs/ADMIN_GUIDE.md) · [Base de données](database/README.md)

## Ce qui a été vérifié (et ce qui ne l'a pas été)
- ✅ 122 tests d'intégration backend réussis (dont réglages, comptes clients, suivi, rôles et un test qui vérifie que chaque route admin exige une permission) (`backend/tests/`) sur **MariaDB 10.11** ; le SQL n'utilise que des fonctions communes à MySQL 8, mais il n'a pas été exécuté sur MySQL 8 lui-même.
- ✅ Le frontend compile en développement et en production (309 ko initiaux).
- ⚠️ Le frontend n'a pas de tests unitaires versionnés dans ce dépôt (les parcours navigateur ont été joués à part) : refaites un parcours complet (commande -> admin -> suivi) après installation.
- ⚠️ WhatsApp/SMS : l'admin envoie le message depuis sa propre application (liens `wa.me` / `sms:`) ; ce n'est pas un envoi automatique par API.
- ⚠️ La carte Google n'a pas pu être testée (clé Google requise) ; le bouton GPS et le lien Google Maps ne demandent aucune clé.
- ⚠️ Pas de déploiement réel effectué.
