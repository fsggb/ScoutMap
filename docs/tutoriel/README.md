# Tutoriels vidéo de ScoutMap

Quatre vidéos sous-titrées (sans voix) : `assets/tuto-global.mp4`, `tuto-route.mp4`, `tuto-az.mp4`, `tuto-game.mp4`, avec leurs affiches `assets/tuto-poster-*.png`. Elles s'ouvrent depuis l'accueil (« Tutoriels vidéo ») et le menu Aide.

## Les refaire après un changement d'interface

Elles sont générées par `video.js` : un vrai navigateur joue le scénario sur l'application locale (curseur visible, une phrase affichée en bas à chaque étape), enregistre l'écran, puis ffmpeg produit le MP4.

```
npm i -D playwright && npx playwright install chromium     # une fois
node docs/tutoriel/video.js global      # ou route, az, game, tout
```

- Les scénarios sont dans l'objet `SCENARIOS` de `video.js` : une étape = `say('phrase', durée)` puis une action (`click`, `clickMap`, `type`, `view`…). Pour modifier une vidéo, modifier ses phrases et ses actions.
- Si un élément de l'interface a changé de nom, le script le signale (« étape manquée … ») et continue : corriger le sélecteur.
- Il faut un accès au réseau (fonds de carte IGN, calcul d'itinéraire).

`tuto.js`, `cards.js` et `compose.py` sont l'ancienne méthode (voix de synthèse Piper) : conservés pour mémoire, plus utilisés.

## Présentation

Une présentation Google (« ScoutMap – Tutoriel de prise en main (FSGGB) ») reprend les mêmes sujets en diapositives, pour une formation en groupe.
