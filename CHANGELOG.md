# Historique des versions de ScoutMap

Chaque version publiée est notée ici (la plus récente en haut). Les numéros suivent la règle « majeure.mineure.correctif ».
On retrouve cet historique dans l'application : **Réglages › Version et nouveautés**.

## 2.0.0 — 20 novembre 2026

### Nouveautés
- **Bouton Retour** : il ne fait plus quitter ScoutMap. Il ferme l'aperçu d'impression, la fenêtre ou le menu ouvert, sinon il ramène à l'accueil.
- **Notifications** : les messages apparaissent en cartes discrètes, puis se rétrécissent et rentrent dans le bouton **Notifications**, où on les retrouve (liste « Récentes »). L'avis de nouvelle version y passe aussi, avec son bouton « Mettre à jour ».
- **Hors connexion** : la carte IGN **SCAN 25** est enregistrée par défaut, sur la surface d'une feuille **A0 au 1 : 25 000** (21 × 30 km) avec la meilleure netteté. Un cadre doré sur la carte montre la zone ; on déplace la carte pour recadrer. Formats A1 à A4, paysage, ou « ce qui est à l'écran ».
- **Ma position** : un cône montre la direction du téléphone (boussole, sinon le sens de la marche). Un 2e appui fait tourner la carte dans votre direction, comme l'application Cartes IGN ; le bouton **N** remet le nord en haut.
- **Carroyage kilométrique bleu**, comme sur les cartes IGN papier (1 km, soit des carreaux de 4 cm au 1 : 25 000).
- **Page Réglages** en pleine page, rangée par catégories (Général, Itinéraire, Azimuts, Grand jeu, Hors connexion, Version et nouveautés).
- **Bibliothèque** : sélection de plusieurs tracés (Ctrl + clic, Maj + clic), **Tout sélectionner**, puis Afficher, Imprimer ou Masquer la sélection.
- L'accueil garde la barre latérale.

### Impression
- L'aperçu pose **toutes les feuilles d'un coup** (cadres, textes, tracés), puis les fonds de carte se chargent au fur et à mesure.
- Sur les cartes de l'itinéraire, seuls les **points** sont dessinés par défaut (le tracé reste disponible : « Tracé sur les cartes : Affiché »).
- Marges plus étroites : la carte occupe une plus grande partie de la feuille.
- L'en-tête de chaque feuille se place dans le coin où il ne cache aucune étape.

### Corrections
- Bibliothèque : un tracé n'apparaît plus en double (ou plus) à l'impression ; une copie ancienne d'un tracé modifié ou renommé n'est plus imprimée en plus.
- Bibliothèque : le nom affiché est celui donné à l'itinéraire, et non « Itinéraire du (date) ».
- Les cartes SCAN 25 enregistrées sont bien servies sans réseau.

### Qualité
- Tests automatiques (`node --test tests/unit.test.js`) lancés avant chaque mise en ligne : une erreur bloque la publication. Essai complet dans un vrai navigateur : `node e2e/smoke.js`.
- Ce fichier d'historique des versions.

## 1.x — 2 au 20 novembre 2026

Versions publiées avant la mise en place de cet historique (pull requests n° 1 à 111 du dépôt) : cartes IGN, itinéraire, azimuts, grand jeu (thèmes, calques réalistes, effets), impression multi-feuilles avec feuille de route, hors connexion, SCAN 25 par le serveur ScoutHub, partage en direct chiffré (positions, discussion, appel vocal de groupe), bibliothèque des tracés.
