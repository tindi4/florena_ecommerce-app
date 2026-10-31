# Frontend (Angular 21, composants standalone)

```bash
npm install          # (le fichier .npmrc active legacy-peer-deps)
npm start            # http://localhost:4200 (API attendue sur l'URL de public/config.json)
npm run build        # production -> dist/frontend/browser
```

L'URL de l'API se règle dans `public/config.json` (copié tel quel dans le build) : aucun rebuild n'est nécessaire pour la changer.
Le nom de la boutique et la devise viennent du backend (`SHOP_NAME`, `SHOP_CURRENCY` dans `.env`).
