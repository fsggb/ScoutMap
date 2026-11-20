# Architecture de ScoutMap

Site statique servi par GitHub Pages. Aucun framework : JavaScript « classique » (ES5 pour l'essentiel), Leaflet pour la carte, proj4js pour les projections. Tout le texte visible et les commentaires sont en français.

## Chargement (ordre des scripts dans `index.html`)

| Fichier | Rôle |
|---|---|
| `js/geo.js` | Calculs purs : distances, caps, formats, conversions d'azimut, GPX/KML/GeoJSON (`window.Geo`). |
| `js/position.js` | Position GPS filtrée, une seule pour toute l'application (`window.SMGeo`). |
| `js/app.js` | **Le moteur**, généré depuis `src/app/` (voir plus bas). Expose `window.SM`. |
| `js/game.js`, `js/calques.js`, `js/themes*.js` | Grand jeu (outils, thèmes, calques réalistes). `themes*.js` sont chargés à la demande. |
| `js/paginate.js` | Découpage d'un tracé en feuilles A4/A3 (calcul pur, `window.Paginate`). |
| `js/doc.js` | Impression : fenêtre de choix, aperçu éditable, feuilles de route, cartes, onglets de l'impression groupée. |
| `js/grid.js` | Grilles (Lambert-93, UTM, carroyage bleu IGN, lat/lon, quadrillage de jeu). |
| `js/offline.js` | Installation, cartes hors connexion (téléchargement, vérification, stockage), service worker. |
| `js/notif.js`, `js/live.js`, `js/chat.js`, `js/appel.js` | Partage en direct (WebSocket chiffré, discussion, appel WebRTC). |
| `js/settings.js` | Page Réglages (catégories, valeurs par défaut). |
| `js/nav.js` | Bouton Retour du navigateur (ne quitte jamais l'application). |
| `sw.js` | Service worker : application en cache (réseau d'abord), tuiles enregistrées (cache d'abord). |

Les modules après `app.js` n'accèdent au moteur que par `window.SM` (état `SM.S`, carte `SM.map`, `SM.toast`, `SM.LAYERS`…).

## Le moteur : `src/app/` → `js/app.js`

`js/app.js` est une seule fonction (IIFE) dont toutes les parties partagent les variables internes (`S`, `RT`, `map`, `toast`…). Pour la lire et la modifier facilement, elle est découpée en parties numérotées dans `src/app/` ; `scripts/build.js` les met bout à bout. La partie `00` ouvre la fonction, la `17` la referme et publie `window.SM`.

| Partie | Contenu |
|---|---|
| 00 | État `S` (sauvegardé dans `localStorage`), valeurs par défaut `DEF`, tracés neufs, historique |
| 01 | Fonds et couches (`LAYERS`), SCAN 25, avis de nouvelle version |
| 02 | Carte Leaflet, dates de mise à jour IGN |
| 03 | Sentiers balisés, points d'eau |
| 04 | Échelle, notifications (`toast`), sélection, outils, panneau, barre latérale, accueil |
| 05 | Calques (tracé ouvert + tracés affichés), empreinte `traceSig` |
| 06 | Altitudes, profil, noms de lieux |
| 07–08 | Itinéraire : points, ordre, calcul par tronçons, secours, alertes |
| 09 | Nature du parcours, azimuts, mesures, traces importées |
| 10 | Panneau des calques, bibliothèque (sélection, impression groupée) |
| 11–12 | Travaux enregistrés, fichiers, liens `#projet=`, fenêtres Fonds/Échelle, GPX |
| 13 | Menus contextuels, recherche |
| 14 | Simulation et export vidéo |
| 15 | Annuler/rétablir, menus, clavier, démarrage |
| 16 | Ma position, boussole, carte orientée |
| 17 | Liens d'action et raccourcis de l'application installée, `window.SM` |

## Données

- **État courant** : `localStorage['scoutmap.v3']` (le tracé ouvert, l'interface).
- **Bibliothèque** : `localStorage['scoutmap.projects']`, 40 travaux au plus. Chaque travail peut afficher des tracés d'autres travaux (`S.layers[].pid`) ; à l'ouverture ils sont relus depuis la bibliothèque (jamais de copie périmée), et l'impression écarte les doublons (`traceSig`).
- **Valeurs par défaut** : `localStorage['scoutmap.defaults']` (`route`, `az`, `print`).
- **Cartes hors connexion** : liste dans `localStorage['scoutmap.offline']`, tuiles dans le cache `sm-tiles-v1` (Cache Storage).
- **Fichiers** : la page web exportée contient tout le site et le travail ; un PDF imprimé contient le travail dans un lien invisible (rouvert par « Ouvrir »).

## Services externes

Géoplateforme IGN (`data.geopf.fr` : tuiles WMTS, itinéraire, altimétrie, géocodage, WFS BD TOPO, catalogue CSW), serveur ScoutHub sur Cloudflare (SCAN 25, partage en direct, relais TURN), Overpass/OpenStreetMap, Waymarked Trails. Toutes les erreurs réseau doivent laisser l'application utilisable (message dans les notifications, pas de blocage).

## Règles de développement

1. Modifier `src/app/`, puis `npm run build`. `npm test` échoue si `js/app.js` n'est pas à jour.
2. Tout texte visible en français clair (vocabulaire scout, pas de jargon informatique). Les messages passent par `toast(message, { kind, action })`.
3. Pas de dépendance nouvelle sans raison ; versions exactes depuis cdnjs.
4. Vérifier sur ordinateur et sur téléphone (390 px de large) ; `npm run e2e` avant de publier.
5. Noter chaque changement visible dans `CHANGELOG.md` ; changer le numéro dans `package.json` et dans `appVersion` (partie 17) à chaque version.
