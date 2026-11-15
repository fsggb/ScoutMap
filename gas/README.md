# ScoutMap – version Google Apps Script

Application web Apps Script qui sert **exactement le même ScoutMap** que GitHub Pages (même `index.html`, `css/`, `js/`).
Toute la logique reste dans le navigateur ; Apps Script ne fait que servir la page (aucun appel serveur, aucun quota consommé).

## Contenu
| Fichier | Rôle |
|---|---|
| `build.mjs` | Génère `src/` depuis les sources du dépôt (à relancer après chaque modification de ScoutMap) |
| `Code.gs`, `shim.js` | Serveur (`doGet`, `include`) et pont navigateur (paramètres d'URL, `#ancre`, export autonome) |
| `src/` | **Projet prêt à pousser** : `Code.gs`, `Index.html`, `Css.html`, `Shim.html`, `Blobs.html`, `appsscript.json` |
| `test/harness.mjs` | Banc d'essai qui imite Apps Script (gabarit + iframe isolée + `getLocation`) – voir `ETUDE.md` |
| `ETUDE.md` | Étude de faisabilité, limites, performances |

## Déployer (clasp)
```bash
npm i -g @google/clasp
clasp login
cd gas/src && clasp create --type webapp --title "ScoutMap" --rootDir .
clasp push -f
clasp deploy --description "v1"
```
L'adresse `/exec` du déploiement est l'adresse publique. Pour la **garder identique** à chaque mise à jour :
`clasp deploy --deploymentId <ID>` (ou « Gérer les déploiements › Modifier » dans l'éditeur). Un nouveau « déploiement » crée une nouvelle adresse.

## Mettre à jour après une évolution de ScoutMap
```bash
node gas/build.mjs && node gas/test/harness.mjs   # nécessite playwright
cd gas/src && clasp push -f && clasp deploy --deploymentId <ID>
```
`build.mjs` s'arrête avec une erreur si une adaptation ne trouve plus son motif dans le code source (le code a changé : à réadapter).

## Vidéos du tutoriel
Les 4 vidéos (≈ 29 Mo) ne tiennent pas dans un projet Apps Script. Par défaut elles sont lues sur GitHub Pages ;
pour les héberger ailleurs : `ASSET_BASE=https://…/assets/ node gas/build.mjs`.
