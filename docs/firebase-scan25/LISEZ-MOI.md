# Service de tuiles SCAN 25 (Firebase) : rapide et clé privée

La clé IGN reste côté serveur (Secret Manager). ScoutMap charge les tuiles à `https://scoutmap-fsggb.web.app/scan25/{z}/{x}/{y}.jpg` ;
le CDN de Firebase Hosting garde chaque tuile 30 jours, donc le chargement est aussi rapide que pour les autres fonds.

## Prérequis
- Le projet Firebase `scoutmap-fsggb` (celui du jeu en direct) doit passer au forfait **Blaze** (carte bancaire ; les quotas gratuits couvrent largement l'usage).
- Firebase CLI : `npm install -g firebase-tools`, puis `firebase login`.

## Mise en service (depuis ce dossier)
```bash
firebase use scoutmap-fsggb
firebase functions:secrets:set SCAN25_KEY      # coller la clé IGN de 32 caractères
cd functions && npm install && cd ..
firebase deploy --only functions,hosting
```
Test : ouvrir `https://scoutmap-fsggb.web.app/scan25/6/32/22.jpg` : une tuile (image) doit s'afficher.

## En cas de problème
- 502 « IGN indisponible » : clé sans droit sur SCAN 25 visualisation, ou clé mal copiée (`firebase functions:secrets:set SCAN25_KEY` pour la refaire, puis redéployer).
- Tant que le service n'est pas déployé, ScoutMap utilise automatiquement le serveur ScoutHub (plus lent).
