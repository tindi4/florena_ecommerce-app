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
- **Fiabilité** : prix et stock revérifiés côté serveur, transaction MySQL + verrous (achats simultanés), idempotence anti double-commande, stock restitué une seule fois à l'annulation, historique des prix figé dans les commandes.

## Documentation
[Installation](docs/INSTALLATION.md) · [Déploiement](docs/DEPLOYMENT.md) · [Sécurité](docs/SECURITY.md) · [API](docs/API.md) · [Guide admin](docs/ADMIN_GUIDE.md) · [Base de données](database/README.md)

## Ce qui a été vérifié (et ce qui ne l'a pas été)
- ✅ 29 tests d'intégration backend réussis (voir `backend/tests/api.test.js`) sur **MariaDB 10.11** ; le SQL n'utilise que des fonctions communes à MySQL 8, mais il n'a pas été exécuté sur MySQL 8 lui-même.
- ✅ Le frontend compile en développement et en production (302 ko initiaux).
- ⚠️ Le frontend n'a **pas** été testé dans un navigateur (aucun navigateur disponible dans l'environnement de génération) et n'a pas de tests automatisés : faites un parcours complet (commande → admin → suivi) après installation.
- ⚠️ Pas d'envoi d'e-mail/SMS ; pas de déploiement réel effectué.
