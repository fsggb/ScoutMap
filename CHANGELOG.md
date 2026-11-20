# Historique des versions de ScoutMap

Chaque version publiée est notée ici (la plus récente en haut). Les numéros suivent la règle « majeure.mineure.correctif ».
On retrouve cet historique dans l'application : **Réglages › Version et nouveautés**.

## 2.0.0 — 20 novembre 2026

### Nouveautés
- **Bouton Retour** : il ne fait plus quitter ScoutMap. Il ferme l'aperçu d'impression, la page Réglages, la fenêtre ou le menu ouvert, sinon il ramène à l'accueil.
- **Notifications** : les messages apparaissent en cartes discrètes, puis se rétrécissent et rentrent dans le bouton **Notifications**, où on les retrouve (liste « Récentes »). L'avis de nouvelle version y passe aussi, avec son bouton « Mettre à jour ».
- **Ma position** : un cône montre la direction du téléphone (boussole, sinon le sens de la marche). Un 2e appui fait tourner la carte dans votre direction, comme l'application Cartes IGN ; le bouton **N** remet le nord en haut.
- **Carroyage kilométrique bleu**, comme sur les cartes IGN papier (1 km, soit des carreaux de 4 cm au 1 : 25 000).
- **Page Réglages** en pleine page, rangée par catégories (Général, Itinéraire, Azimuts, Grand jeu, Impression, Hors connexion, Version et nouveautés), avec les **valeurs par défaut** des nouveaux tracés : boucle ou aller simple, distance maximale, optimisation, allure, options de calcul, unités d'azimut, choix d'impression.
- **Bibliothèque** : sélection de plusieurs tracés (Ctrl + clic, Maj + clic), **Tout sélectionner**, puis Afficher, Imprimer ou Masquer la sélection.
- L'accueil garde la barre latérale.

### Hors connexion et application installée
- La carte IGN **SCAN 25** est enregistrée par défaut, sur la surface d'une feuille **A0 au 1 : 25 000** (21 × 30 km) avec la meilleure netteté. Un cadre doré sur la carte montre la zone ; on déplace la carte pour recadrer. Formats A1 à A4, paysage, ou « ce qui est à l'écran ».
- Pendant le téléchargement : avancement dans une notification, écran maintenu allumé, bouton Arrêter ; « Compléter » reprend là où on s'est arrêté.
- Cartes enregistrées : vérifier qu'une carte est complète, la mettre à jour, la renommer ; rappel au-delà de 6 mois ; contour vert sur la carte quand on est sans réseau.
- Espace de stockage utilisé et protection des cartes contre l'effacement automatique par le navigateur.
- Installation guidée selon l'appareil (iPhone, Android, ordinateur) ; état « prête à démarrer sans réseau ».
- Application installée : raccourcis sur l'icône (nouvel itinéraire, azimuts, grand jeu, cartes hors connexion) et ouverture directe des fichiers GPX, KML et PDF ScoutMap.

### Impression
- **Impression simple** (bouton Imprimer) : le tracé ouvert seulement. **Impression groupée** : depuis la bibliothèque (sélection puis Imprimer), chaque tracé comme un document à part, avec **un onglet par tracé** dans l'aperçu pour le relire, le renommer, l'imprimer ou en faire le PDF seul.
- L'aperçu pose **toutes les feuilles d'un coup** (cadres, textes, tracés), puis les fonds de carte se chargent au fur et à mesure.
- Sur les cartes de l'itinéraire, seuls les **points** sont dessinés par défaut (le tracé reste disponible : « Tracé sur les cartes : Affiché »).
- Marges plus étroites : la carte occupe une plus grande partie de la feuille.
- L'en-tête de chaque feuille se place dans le coin où il ne cache aucune étape.

### Corrections
- Bibliothèque : un tracé n'apparaît plus en double (ou plus) à l'impression ; une copie ancienne d'un tracé modifié ou renommé n'est plus imprimée en plus.
- Bibliothèque : le nom affiché est celui donné à l'itinéraire, et non « Itinéraire du (date) ».
- Les cartes SCAN 25 enregistrées sont bien servies sans réseau.
- Le numéro de version de l'application est de nouveau lisible dans les réglages.

### Qualité
- Le moteur de l'application (`js/app.js`, 3 700 lignes) est découpé en 18 parties par domaine dans `src/app/`, réassemblées par `npm run build`.
- Tests automatiques (`npm test`) lancés sur chaque pull request et avant chaque mise en ligne : une erreur bloque la publication. Essai complet dans un vrai navigateur : `npm run e2e`.
- Versions publiées sur GitHub à partir de ce fichier, documentation (README, architecture, notes de reprise).
- Une ancienne carte de jeu contenant des données privées a été effacée de l'historique du dépôt.

## 1.x — 2 au 20 novembre 2026

Versions publiées avant la mise en place de cet historique (pull requests n° 1 à 111 du dépôt) : cartes IGN, itinéraire, azimuts, grand jeu (thèmes, calques réalistes, effets), impression multi-feuilles avec feuille de route, hors connexion, SCAN 25 par le serveur ScoutHub, partage en direct chiffré (positions, discussion, appel vocal de groupe), bibliothèque des tracés.
