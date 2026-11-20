# Notes pour reprendre ScoutMap (développeur ou Claude)

Lisez d'abord [README.md](README.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) et le haut de [CHANGELOG.md](CHANGELOG.md).

## Règles du projet

- **Le moteur se modifie dans `src/app/`**, jamais dans `js/app.js` (généré). Après chaque modification : `npm run build`, puis `npm test`. Les tests échouent si l'assemblage n'est pas à jour, et la mise en ligne est alors bloquée.
- Tout ce que voit l'utilisateur est en **français simple** : les utilisateurs sont des chefs scouts, pas des informaticiens. Les commentaires du code sont aussi en français.
- Les messages à l'utilisateur passent par `toast(texte, { kind: 'ok'|'warn'|'bad'|'info', action: { label, fn }, sticky })`. Ils s'affichent puis se rangent dans le bouton Notifications.
- Rien ne doit casser sans réseau : chaque appel à un service a un secours ou un message clair.
- Vérifier sur ordinateur **et** sur un écran de téléphone (390 px), puis `npm run e2e`.
- Chaque changement visible va dans `CHANGELOG.md`. Une version = numéro dans `package.json` + `appVersion` (partie `src/app/17-liens-api.js`) + étiquette `vX.Y.Z` (la version GitHub est créée automatiquement).
- Publier = fusionner sur `main` (tests, puis déploiement GitHub Pages).

## Ce qui a été fait pour la version 2.0.0 (novembre 2026)

Reprise de l'application, développée très vite (111 pull requests en 18 jours), pour la rendre fiable :

- Bouton Retour qui ne quitte plus l'application (`js/nav.js`).
- Notifications en cartes qui se rangent dans le bouton Notifications (partie 04).
- Hors connexion complet : SCAN 25 par défaut, zone A0 au 1 : 25 000 avec cadre à recadrer, compléter / mettre à jour / vérifier / renommer, stockage et protection, zones visibles sur la carte (`js/offline.js`). Installation guidée selon l'appareil, raccourcis et ouverture de fichiers pour l'application installée (`manifest.webmanifest`).
- Boussole : cône de direction et carte orientée comme Cartes IGN (partie 16). **À essayer sur de vrais téléphones Android et iPhone** : c'est seulement testé sur simulateur.
- Carroyage kilométrique bleu (`js/grid.js`).
- Page Réglages pleine page avec les valeurs par défaut de l'itinéraire, des azimuts et de l'impression (`js/settings.js`).
- Bibliothèque : plus de doublons à l'impression (copies périmées), nom donné au tracé, sélection Ctrl/Maj.
- Impression : simple depuis le tracé, groupée depuis la bibliothèque avec un onglet par tracé ; toutes les feuilles affichées tout de suite ; points seuls par défaut ; marges réduites ; en-tête qui évite les étapes (`js/doc.js`).
- Découpage de `app.js` en 18 parties (`src/app/`), tests automatiques, essai de bout en bout, historique des versions, documentation.
- Revue d'ergonomie du grand jeu : voir la section 2.0.0 du CHANGELOG pour ce qui a été corrigé.

## Pistes et points ouverts

Tout ce qui reste à faire est aussi dans les [tickets GitHub](https://github.com/fsggb/ScoutMap/issues) (n° 113 à 124).

- **Tutoriels vidéo** (`assets/tuto-*.mp4`, 29 Mo) : ils ne sont plus à jour avec la version 2. Il faut décider de les refaire (scripts dans `docs/tutoriel/`) ou de les retirer.
- **SCAN 25** : le serveur ScoutHub refuse les sites non autorisés, mais un programme peut se faire passer pour `fsggb.github.io`. Ajouter une limite de débit par adresse dans le serveur (dépôt ScoutHub).
- **Ancien projet Firebase** `scoutmap-fsggb` : il n'est plus utilisé. Le supprimer dans la console Firebase.
- **Grand jeu** : les changements les plus lourds de la revue d'ergonomie restent à faire (voir le CHANGELOG et les issues GitHub).
- Étape suivante possible pour le code : passer `src/app/` en modules ES avec un état partagé explicite, au lieu d'une seule fonction découpée.
