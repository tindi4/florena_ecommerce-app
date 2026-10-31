# Sécurité : ce qui est en place

| Sujet | Mise en œuvre |
|---|---|
| Mots de passe | bcrypt (coût 12) ; jamais en clair ; premier admin créé uniquement par `npm run create-admin` |
| Session admin | JWT dans un cookie **HttpOnly**, `Secure` en production, `SameSite` configurable ; rien dans localStorage |
| Permissions | `requireAdmin` relit l'utilisateur en base (actif + rôle ADMIN) à **chaque** requête `/api/admin/*` |
| CSRF | jeton aléatoire inclus dans le JWT, exigé dans l'en-tête `X-CSRF-Token` pour toute écriture admin |
| Force brute | 10 tentatives de connexion / 15 min / IP ; réponse identique que l'e-mail existe ou non |
| Injection SQL | requêtes paramétrées partout (mysql2) |
| Validation | zod côté serveur sur toutes les entrées ; tailles de corps limitées (100 ko) |
| Prix / stock / total | toujours recalculés et vérifiés côté serveur, dans une transaction avec verrous (`FOR UPDATE`) |
| Double commande | clé `Idempotency-Key` + contrainte UNIQUE ; bouton bloqué pendant l'envoi |
| Numéro de commande | aléatoire (`CMD-` + 10 caractères), le suivi exige aussi le téléphone ; limité à 60 essais / 10 min |
| Fichiers | JPEG/PNG/WebP uniquement, contrôle des octets magiques, 5 Mo, nom aléatoire |
| En-têtes HTTP | helmet ; CORS restreint à `CORS_ORIGINS` |
| Erreurs | messages génériques côté client ; détails dans les journaux serveur seulement |

## À faire de votre côté
- Mot de passe admin long et unique ; `JWT_SECRET` aléatoire (≥ 32 caractères) ; `.env` en `chmod 600`.
- HTTPS obligatoire en production ; MySQL non exposé à Internet.
- Mises à jour régulières : `npm audit` dans `backend/` et `frontend/`.
- Sauvegardes testées (restauration à blanc une fois).

## Limites connues
- Pas de réinitialisation de mot de passe par e-mail : `npm run create-admin` avec le même e-mail remplace le mot de passe.
- Pas d'e-mail/SMS envoyé aux clients : ils consultent le statut via la page « Suivi ».
- Les notifications admin sont rafraîchies toutes les 20 s (pas de temps réel/push).
