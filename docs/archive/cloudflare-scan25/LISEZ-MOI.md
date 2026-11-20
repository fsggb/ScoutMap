# Service de tuiles SCAN 25 (Cloudflare Workers) : gratuit, rapide, clé privée

> **En service :** le serveur Cloudflare de ScoutHub (`https://scouthub.fsggb.workers.dev/scan25/{z}/{x}/{y}.jpg`, code dans le dépôt ScoutHub, dossier `cloudflare/`) rend déjà ce service ; la clé IGN est dans le magasin de secrets du compte (`IGN_SCAN25_KEY`). Le Worker séparé décrit ci-dessous n'est plus nécessaire.

- **Gratuit, sans carte bancaire** : offre « Workers Free » de Cloudflare (100 000 demandes par jour).
- **Clé privée** : elle est enregistrée comme « secret » du Worker. Elle n'apparaît ni dans le code, ni dans ScoutMap, ni dans le navigateur.
- **Rapide** : les tuiles sont servies en binaire et gardées 7 jours dans le cache Cloudflare : la 2e demande d'une même tuile est instantanée pour tout le monde.
- **Protégé** : le service refuse les demandes venant d'un autre site que `fsggb.github.io`.

## Mise en service (dans le navigateur, sans rien installer)
1. Créer un compte gratuit sur https://dash.cloudflare.com (adresse e-mail seulement).
2. **Workers & Pages**, **Create**, **Create Worker** : nom `scan25`, **Deploy**.
3. **Edit code** : effacer le code d'exemple, coller tout le contenu de `worker.js`, **Deploy**.
4. **Settings**, **Variables and Secrets**, **Add** : type **Secret**, nom `SCAN25_KEY`, valeur = la clé IGN (32 caractères), **Deploy**.
5. Noter l'adresse du Worker (en haut de la page), de la forme `https://scan25.xxxx.workers.dev`.
6. Test : ouvrir `https://scan25.xxxx.workers.dev/scan25/6/32/22.jpg` : une tuile de carte (image) doit s'afficher.
7. Donner l'adresse à ScoutMap (elle sera enregistrée dans `js/app.js`, `S25P.url`, sous la forme `https://scan25.xxxx.workers.dev/scan25/{z}/{x}/{y}.jpg`).

## Dépannage
- `IGN indisponible` (502) : la clé n'a pas le droit sur SCAN 25 en visualisation, ou elle est mal copiée (refaire l'étape 4).
- `site non autorisé` (403) : la demande ne vient pas de `fsggb.github.io` (liste `AUTORISES` en haut de `worker.js`).
- Tant que l'adresse n'est pas configurée, ScoutMap utilise automatiquement le serveur ScoutHub (plus lent).
