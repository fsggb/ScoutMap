# Tutoriel vidéo ScoutMap

La vidéo `assets/tuto-scoutmap.mp4` (bouton « Tutoriel » de l'application) est générée par script :

- `tuto2.js` : scénario Playwright joué sur le site déployé, avec curseur visible ; chaque phrase de la voix de synthèse (Piper, voix française `fr_FR-tom-medium`) démarre au moment de l'action correspondante.
- Montage : les clips audio sont placés aux instants enregistrés (`adelay` de ffmpeg) sur la vidéo capturée.

Pour refaire la vidéo après un changement d'interface : modifier les textes / actions dans `tuto2.js`, relancer, puis remplacer `assets/tuto-scoutmap.mp4`.
