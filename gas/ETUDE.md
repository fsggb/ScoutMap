# Étude : ScoutMap en Google Apps Script (GAS)

> Rédigée le 15 novembre 2026. **Ce qui est vérifié** = testé automatiquement dans un banc d'essai local qui imite Apps Script.
> **Ce qui n'est pas vérifié** = nécessite un vrai déploiement sur un compte Google (impossible depuis l'environnement de cette étude : pas de compte Google, pas de `clasp login`).

## 1. Est-ce possible ?
**Oui pour l'essentiel, pas à 100 %.** ScoutMap est une application 100 % navigateur (Leaflet + appels directs à la Géoplateforme, Waymarked Trails, Firebase). Il n'y a pas de serveur à réécrire : Apps Script joue seulement le rôle d'hébergeur (`doGet` renvoie la page). Le projet généré dans `gas/src/` fait **1,6 Mo** (page 136 ko + CSS 106 ko + code 1,4 Mo dont 580 ko de bibliothèque d'icônes chargée à la demande).

Adaptations nécessaires (automatisées par `build.mjs`, avec échec explicite si le code source dérive) :
- Apps Script ne transmet ni `?paramètres` ni `#ancre` à la page → relus via `google.script.url.getLocation` (liens `?lieu=`, `?itineraire=`, `?salle=`, `#projet=`, `#k=`).
- Les fichiers `.js` n'existent pas dans Apps Script → code embarqué dans des fichiers `.html`, exécuté au démarrage ; les thèmes restent chargés à la demande.
- « Enregistrer » (page web autonome) relisait ses propres fichiers par `fetch` → lit désormais les blocs embarqués.
- Liens de partage / « Modifier » : adresse `/exec` au lieu de `fsggb.github.io`.
- Retrait du client ScoutHub (chemin `/ScoutHub/…` propre à GitHub Pages).

## 2. Résultats des vérifications (banc d'essai : gabarit `<?!= ?>`, iframe sur autre origine avec le `sandbox` d'Apps Script, vrais services IGN/OSM/Firebase)
| # | Vérification | Résultat |
|---|---|---|
| 1 | Démarrage de ScoutMap dans l'iframe isolée, sans erreur JS | ✅ |
| 2 | Tuiles Plan IGN affichées (CORS) | ✅ |
| 3 | Accueil, localStorage | ✅ |
| 4 | Géocodage, altimétrie, sentiers balisés (appels directs) | ✅ |
| 5 | Lien `?lieu=Lyon` (paramètres via `getLocation`) | ✅ |
| 6 | Itinéraire par lien : géocodage + calcul de route + marqueurs | ✅ |
| 7 | « Enregistrer » → page .html autonome (901 ko), sans dépendance à Apps Script, qui se rouvre | ✅ |
| 8 | Bibliothèque d'icônes du Grand jeu | ✅ |
| 9 | Chargement du SDK Firebase (jeu en direct) | ✅ (chargement seul ; connexion à la base non testée) |
| 10 | **Géolocalisation** (« Ma position », positions en direct) | ❌ **bloquée** : « Geolocation has been disabled in this document by permissions policy » |

Pendant la mise au point, le banc a révélé 3 vrais défauts de la première version (blocs lus avant d'exister, export qui ne trouvait plus ses fichiers, logo mal substitué) : tous corrigés. La phase « vrai Apps Script » en révélera probablement d'autres.

## 3. Inconvénients par rapport à GitHub Pages
**Bloquants ou presque**
1. **Géolocalisation impossible** (très probablement identique sur le vrai Apps Script : l'iframe n'a pas `allow="geolocation"`). Conséquence : bouton « Ma position » et partage de position dans le jeu en direct inopérants — fonctions utiles sur le terrain, sur téléphone.
2. **Perte des travaux enregistrés** à la migration : les projets sont dans le `localStorage` de l'origine (`*.googleusercontent.com` pour Apps Script, `fsggb.github.io` aujourd'hui). Chaque chef devrait exporter ses travaux avant de changer d'adresse ; l'origine peut aussi changer si le déploiement est recréé.

**Gênants**
3. **Chargement plus lent et jamais mis en cache** : GitHub Pages sert des fichiers séparés, mis en cache par le navigateur/CDN ; Apps Script renvoie 1,6 Mo (≈ 450 ko compressés, estimation) à chaque ouverture + un démarrage à froid du serveur (souvent 1 à 3 s) + l'iframe intermédiaire + une attente de `getLocation`. Ordre de grandeur : **+1 à 4 s** à l'ouverture (estimation, non mesurée sur un vrai déploiement). Une fois la carte ouverte, la vitesse est identique (même code, mêmes services).
4. **Adresse longue et opaque** (`script.google.com/macros/s/…/exec`) ; pas de domaine personnalisé direct ; QR codes et liens ChatGDB (`CHATGDB.md`) à refaire.
5. **Le client ScoutHub est absent** (identité / crédits ChatGDB) : il suppose le même domaine `fsggb.github.io`.
6. **Vidéos du tutoriel non embarquées** (29 Mo) : lues sur GitHub Pages ou à héberger ailleurs.
7. **Déploiement manuel** : plus de publication automatique au `git push`, ni de sondes hebdomadaires des services IGN ; chaque mise à jour = `build` + `clasp push` + nouveau déploiement (en gardant l'identifiant pour conserver l'adresse). Deux copies à maintenir.
8. **Dépendance au compte Google** qui possède le script (départ du propriétaire, restrictions de partage externe du Workspace : l'accès « tout le monde, même anonyme » peut être interdit par l'administrateur).
9. **Quotas et plafonds Google** : pas de risque côté appels serveur (aucun n'est fait), mais limites d'exécutions simultanées par compte et pas d'engagement de disponibilité pour une charge forte (camp avec beaucoup de téléphones ouvrant la page en même temps).

**À tester sur un vrai déploiement (non vérifié)** : impression/PDF (`window.print` dans l'iframe), téléchargements et fenêtres contextuelles dans le vrai `sandbox`, `#projet=` très long, connexion Firebase (authentification anonyme, règles), comportement sur iPhone/Safari (stockage tiers).

## 4. Avantages
Hébergement dans l'espace Google de l'association (sans GitHub), pas de dépôt public nécessaire. **Aucun avantage fonctionnel** sur GitHub Pages.

## 5. Effort et délais
- Réalisation du projet + banc d'essai : fait (1 session).
- Déploiement initial : ≈ 15 min (clasp) ; mise à jour : ≈ 2 min avec `build.mjs`.
- Tests sur vrai Apps Script puis correctifs : prévoir une demi-journée.
- Maintenance : à chaque évolution de ScoutMap, relancer `build.mjs` ; il échoue si une adaptation ne s'applique plus.

## 6. Conclusion / recommandation
Faisable et fonctionnel pour : carte, recherche, itinéraires, azimuts, grand jeu, impression, export/import. **Pas « sans aucun problème »** : géolocalisation hors service, travaux locaux non transférables, ouverture plus lente, déploiement manuel. Recommandation : **garder GitHub Pages comme version principale** ; utiliser la version GAS en secours ou si l'hébergement Google est une contrainte, après un essai de recette sur un vrai déploiement.
