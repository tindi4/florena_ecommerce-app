# Backend (Node.js / Express / MySQL)

| Commande | Rôle |
|---|---|
| `npm install` | installe les dépendances |
| `npm run migrate` | crée / met à jour les tables (dossier `migrations/`) |
| `npm run create-admin` | crée le premier administrateur (mot de passe saisi en terminal, jamais stocké en clair) |
| `npm run seed:demo` | (facultatif) données de démonstration |
| `npm start` | lance l'API sur le port `PORT` (3000 par défaut) |
| `npm test` | tests d'intégration (base `boutique_test`, **vidée à chaque exécution**) |

Structure : `src/routes` → `src/controllers` → `src/services` (SQL + règles métier) ; `src/middleware` (auth, CSRF, limites, erreurs) ; `src/validators` (zod).
Configuration : fichier `.env` à la **racine du projet** (voir `.env.example`).
