# Tutoriel vidéo ScoutMap

La vidéo `assets/tuto-scoutmap.mp4` (bouton « ? » de l'application, menu Aide > Tutoriel vidéo) est générée par script :

- `tuto.js` : scénario Playwright joué sur le site déployé, avec curseur visible. Chaque phrase de la voix de synthèse (Piper, voix française `fr_FR-siwis-medium`) démarre au moment de l'action correspondante ; les attentes de chargement sont repérées (`CUTS`) pour être coupées.
- `compose.py` : montage ffmpeg : affiche de titre (`assets/tuto-poster.png`), vidéo capturée sans les coupes, pistes audio placées aux bons instants.

Pour refaire la vidéo après un changement d'interface : modifier les textes / actions dans `tuto.js`, relancer (nécessite Playwright, Piper et ffmpeg), monter avec `compose.py`, puis remplacer `assets/tuto-scoutmap.mp4`.
