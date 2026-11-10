---
# Fiche de connaissances ChatGDB (format : ScoutHub/docs/projet-chatgdb.md, §5).
# ChatGDB lit ce fichier pour répondre aux questions sur les applications de ce dépôt.
depot: fsggb/ScoutMap
maj: 2026-11-10
---

# ScoutMap : Cartes IGN (orientation et raids)

Site : https://fsggb.github.io/ScoutMap/ . Cartes de la Géoplateforme IGN, sans clé ni compte.

## Fonctions
- Fonds : Plan IGN, photographies aériennes ; couches : courbes de niveau, ombrage, pentes, cadastre.
- Recherche de lieux, sommets et adresses.
- Itinéraire à pied ou en voiture : départ, étapes déplaçables, arrivée, feuille de route, distance, durée, dénivelé, estimation de marche (allure réglable).
- Azimuts successifs pour la course d'orientation : azimut, contre-azimut, distance, cumul ; degrés, grades ou millièmes ; nord géographique ou magnétique (déclinaison saisie à la main).
- Mesure de distance et de surface ; profil d'altitude avec pente.
- Import et export GPX ; impression A4 paysage (carte, profil, feuille de route, tableau d'azimuts).
- Coordonnées au curseur : WGS 84, Lambert-93, UTM. Le travail est mémorisé dans le navigateur.

## Limites
- Itinéraires : à pied ou en voiture seulement (pas de vélo/VTT).
- Pas de SCAN 25 (clé API requise) ; le Plan IGN le remplace.
- La déclinaison magnétique est à saisir à la main ; la convergence des méridiens est ignorée.
- Le dénivelé est une estimation lissée (échantillons d'environ 40 m).

