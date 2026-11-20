# ScoutMap

Application web de la **FSGGB** (Fédération des Scouts et Guides Godefroy de Bouillon) pour préparer les sorties sur les cartes IGN : **itinéraires à pied**, **azimuts** de course d'orientation et **grands jeux**, imprimables et utilisables **hors connexion**.

**→ https://fsggb.github.io/ScoutMap/** · [Historique des versions](CHANGELOG.md) · [Versions publiées](https://github.com/fsggb/ScoutMap/releases)

## Ce que fait ScoutMap

| | |
|---|---|
| **Itinéraire** | Points posés sur la carte (aimantés sur l'église du village quand on est dézoomé), boucle ou aller simple, ordre de passage optimisé, points en ligne droite, distance maximale, profil d'altitude, temps de marche selon la pente, alertes (tunnel, route nationale, aller-retour). |
| **Azimuts** | Azimut, contre-azimut, distance et cumul ; degrés, grades ou millièmes ; nord géographique ou magnétique. |
| **Grand jeu** | Assistant (échelle et thème), éléments illustrés, zones, lignes, textes, calques réalistes (relief, forêts, eau), effets (parchemin…), légende. |
| **Impression** | Feuille de route, cartes numérotées F1, F2… au 1 : 10 000 / 25 000 / 50 000 sur A4 ou A3, carte générale. Impression **groupée** de plusieurs tracés depuis la bibliothèque, avec un onglet par tracé. PDF relisible par ScoutMap. |
| **Hors connexion** | Application installable ; cartes SCAN 25 enregistrées sur l'appareil (par défaut une feuille A0 au 1 : 25 000), position GPS, boussole et carte orientée. |
| **Partage en direct** | Lien ou QR code : positions des chefs, discussion et appel vocal de groupe, chiffrés de bout en bout ([détails](docs/DIRECT.md)). |
| **Fichiers** | Page web autonome (.html), GPX, KML, GeoJSON, PDF ScoutMap. |

Les réglages par défaut (boucle, distance maximale, unités, impression…) se choisissent dans **Réglages**. Le détail de chaque fonction est dans l'aide de l'application.

## Données et services

- **Cartes et calculs** : [Géoplateforme de l'IGN](https://geoservices.ign.fr/) (Plan IGN, photographies, altitudes, itinéraires, recherche, BD TOPO), données ouvertes.
- **SCAN 25** : servi par le serveur Cloudflare de ScoutHub (`scouthub.fsggb.workers.dev/scan25/…`), qui garde la clé IGN dans son coffre et n'accepte que les sites autorisés. Le code de ce serveur vit dans le dépôt ScoutHub.
- **Autres** : OpenStreetMap et Waymarked Trails (sentiers, eau potable), OpenTopoMap et autres fonds libres (consultation seulement, jamais enregistrés hors connexion ni imprimés en série), game-icons.net (CC BY 3.0) et OpenMoji (CC BY-SA 4.0) pour le grand jeu.

## Développement

Site statique (HTML, CSS, JavaScript sans framework, [Leaflet](https://leafletjs.com/) 1.9.4 et proj4js 2.12.1 depuis cdnjs). Seule étape de préparation : l'assemblage du moteur.

```bash
npm run build      # assemble js/app.js à partir de src/app/ (à relancer après toute modification de src/app/)
npm test           # vérifie l'assemblage + tests automatiques (Node 18+, sans dépendance)
npm run serve      # http://localhost:8765
npm run e2e        # essai complet dans Chromium (npm i puis npx playwright install chromium)
```

- `src/app/` : le moteur, en 18 parties numérotées par domaine. **Ne jamais modifier `js/app.js` à la main** : il est généré.
- `js/` : les autres modules (impression `doc.js`, grand jeu `game.js`, hors connexion `offline.js`, réglages `settings.js`, partage `live.js`…). Architecture détaillée : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- `tests/` (tests unitaires) et `e2e/` (essai dans un navigateur).

### Publication

- Chaque envoi sur `main` lance les tests puis déploie sur GitHub Pages (`.github/workflows/pages.yml`) ; un test qui échoue bloque la mise en ligne. Les pull requests sont testées aussi.
- Versions : numéro dans `package.json` et `CHANGELOG.md`. Une étiquette `vX.Y.Z` poussée crée la version publiée sur GitHub (`.github/workflows/release.yml`).
- Les utilisateurs sont prévenus d'une nouvelle version par une notification dans l'application.

## Intégrations

- **ScoutHub** : script optionnel `/ScoutHub/scouthub-client.js` (enregistrement dans l'espace personnel) ; ScoutMap fonctionne sans.
- **ChatGDB** : fiche [CHATGDB.md](CHATGDB.md) et liens d'action (`?lieu=`, `?itineraire=`, `?nouveau=`…).

## Contact

Service informatique de la FSGGB : adresse dans le menu **Aide** de l'application.
