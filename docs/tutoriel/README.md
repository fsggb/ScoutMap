# Tutoriel vidéo ScoutMap

La vidéo `assets/tuto-scoutmap.mp4` (bouton « Tutoriel » de l'application) est générée par script :

- `tuto3.js` : scénario Playwright joué sur le site déployé, avec curseur visible ; chaque phrase de la voix de synthèse (Piper, voix française `fr_FR-tom-medium`) démarre au moment de l'action correspondante.
- Montage : les clips audio sont placés aux instants enregistrés (`adelay` de ffmpeg) sur la vidéo capturée.

Pour refaire la vidéo après un changement d'interface : modifier les textes / actions dans `tuto3.js`, relancer, puis remplacer `assets/tuto-scoutmap.mp4`.

Voix : trois voix Piper françaises (`fr_FR-tom-medium` pour l'itinéraire et l'impression, `fr_FR-siwis-medium` pour les azimuts, `fr_FR-upmc-medium` pour le grand jeu). Les attentes de chargement sont coupées au montage (liste `CUTS` du script).
