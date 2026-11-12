# Guide de l'administration

Connexion : `/admin/login`. Sur mobile, le menu ☰ ouvre la navigation ; la cloche 🔔 indique les notifications non lues.

## Commandes (liste de tâches)
- Onglets : **À traiter** (en attente, confirmées, en préparation) · **Terminées** · **Annulées** · **Toutes**. Une commande « Terminée » ou « Annulée » quitte automatiquement « À traiter ».
- Une pastille **Nouvelle** signale une commande dont la notification n'a pas été lue ; l'ouvrir la marque comme lue.
- Dans le détail : boutons **Confirmer**, **Mettre en préparation**, **Marquer terminée**, **Annuler** (avec confirmation, stock remis en vente). Le client voit le nouveau statut dans « Suivi » (rafraîchi toutes les 30 s).
- **Marquer comme payée** : à utiliser quand le client a réglé. Le client voit « Payée » ; « Annuler le paiement » corrige une erreur. Les changements sont tracés dans l'historique (qui, quand).
- Filtre « Non payées » pour relancer les règlements.

## Notifications et messages
- Chaque nouvelle commande et chaque message du formulaire « Nous écrire » crée une notification. Onglets : Non lues / Déjà vues / Toutes ; « Tout marquer comme lu ».
- **Messages** : onglets « À traiter » / « Traités » ; bouton « Marquer comme traité ».

## Produits et variantes
- Les options sont libres. Dans « Générer des variantes » : saisissez le nom (Taille, Pointure, Couleur…) et les valeurs, ou utilisez les raccourcis **XS → XXL**, **S → XL**, **Pointures 36 → 47** (bornes modifiables, ex. jusqu'à 45 ou plus). Plusieurs options se combinent (Couleur × Pointure) ; supprimez les combinaisons que vous ne vendez pas.
- Chaque variante a son prix, son stock, son SKU (facultatif) et peut être désactivée.
- « Désactiver » un produit le masque sans effacer les commandes passées. Modifier un prix ne change jamais les commandes déjà enregistrées.

## Stock
Page Stock : filtre bas / rupture, correction avec **motif obligatoire**, historique par variante.

## Prévenir le client (WhatsApp ou SMS)
Dans le détail d'une commande : champ « Prévenir le client » avec un message pré-rempli (modifiable). **Vous choisissez** « Envoyer par WhatsApp » ou « Envoyer par SMS » : le message s'ouvre dans l'application, prêt à partir. Le canal et la date du dernier envoi sont enregistrés. Pour un envoi 100 % automatique, il faudra un service payant (WhatsApp Business API, passerelle SMS).

## Frais de livraison
Lomé : 1000 automatiquement. Hors Lomé : le client choisit son montant (minimum 1500, réglable dans `.env`). Vous pouvez corriger les frais dans le détail de la commande tant qu'elle n'est pas terminée ou annulée.

## Facture / bon de commande PDF
Bouton « Facture PDF » (ou « Bon de commande PDF » tant que la commande n'est pas payée) dans la commande. Le client a le même bouton sur la page « Suivi ».

## Statistiques et caisse
Page **Statistiques** : chiffre d'affaires par jour, produits les plus vendus, encaissé du jour, reste à encaisser, panier moyen, export CSV.

## Équipe et rôles (administrateur principal)
Page **Équipe** : créez un compte, choisissez son rôle (Gérant, Gestionnaire de commandes, Gestionnaire de catalogue et stock), désactivez-le ou changez son mot de passe. Les droits s'appliquent immédiatement.


## Livraison, WhatsApp / SMS, facture
- **Livraison** : le client coche « Me faire livrer » (et « Ajouter les frais de livraison »). Dans la commande, section **Livraison**, cliquez sur « Valider 1 000 » ou saisissez **n'importe quel montant** (0 = offerte) puis « Valider ce montant » : le total est recalculé et le client le voit dans son suivi.
- **Prévenir le client** : section « Prévenir le client » de la commande. Le message est pré-rempli et modifiable ; vous choisissez **WhatsApp** ou **SMS** (le message s'ouvre dans votre application, prêt à envoyer). Le dernier envoi est noté dans la commande.
- **Facture / bon de commande PDF** : bouton en haut des actions. Le client peut aussi la télécharger depuis son suivi.
- **Modifications du client** : si le client modifie sa commande (avant la mise en préparation), vous recevez une notification (cloche qui s'agite, pastille, message à l'écran, son, compteur dans l'onglet) et la commande porte la pastille violette **Modifiée**. Le bouton « 🔔 Son activé / 🔕 Son coupé » du menu règle le son (le navigateur n'autorise le son qu'après un premier clic sur la page).

## Statistiques et caisse (rôles Administrateur et Gérant)
Page **Statistiques** : entré en caisse aujourd'hui, chiffre d'affaires du jour, période (7/30/90 jours ou dates libres), reste à encaisser, panier moyen, graphique par jour, produits les plus vendus, export CSV.
« Encaissé » = commandes marquées payées (au jour du paiement). Les jours sont calculés en UTC (= heure de Lomé).

## Équipe et rôles (administrateur principal)
Page **Équipe** : créez des comptes secondaires (nom, e-mail, mot de passe de 12 caractères minimum) et choisissez leur rôle. Changer un rôle ou désactiver un compte agit immédiatement.
| Rôle | Accès |
|---|---|
| Administrateur principal | tout, y compris l'équipe |
| Gérant | commandes, catalogue/stock, statistiques |
| Gestionnaire de commandes | commandes, notifications, messages, factures |
| Gestionnaire de catalogue et stock | produits, catégories, stock |


## Modifier une commande (admin, gérant, gestionnaire de commandes)
Dans le détail d'une commande, bouton **« ✏️ Modifier la commande »**. Vous pouvez changer :
- le **numéro de téléphone** (le client devra utiliser le nouveau numéro pour suivre sa commande), le nom, la civilité, le message ;
- l'**adresse / quartier**, la position sur la carte et la **livraison** (demandée ou non) ;
- les **articles** : changer une quantité, retirer un article, **ajouter** un article (recherche par nom ou SKU), modifier un **prix** (remise négociée).

Le stock est ajusté automatiquement (retiré ou remis en vente), le total est recalculé (frais de livraison inclus) et la modification est notée dans l'historique avec votre nom. Les articles ne sont plus modifiables quand la commande est **terminée ou annulée** (les coordonnées, elles, restent corrigeables). Cette permission est donnée aux rôles Administrateur, Gérant et Gestionnaire de commandes ; le gestionnaire de catalogue ne l'a pas.
Le client, lui, ne peut modifier que ses coordonnées de livraison, son nom et son message (avant la préparation) : pour changer son numéro ou ses articles, il vous écrit.
