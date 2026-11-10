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


## Liens d'action (ChatGDB peut préparer la carte pour l'utilisateur)
Base : `https://fsggb.github.io/ScoutMap/` suivi de paramètres. Tout est optionnel ; les valeurs sont encodées pour une URL (espace = %20).
- `lieu=Lyon` : cherche le lieu (IGN) et centre la carte dessus. `zoom=14` règle le niveau (2 à 19).
- `centre=45.76,4.83` : centre la carte sur des coordonnées (latitude,longitude).
- `fond=plan|ortho|otm|osm|osmfr|cyclosm|etat` : fond de carte (plan IGN, photo aérienne, topographique…).
- `couches=contour,shade,slope,cadastre,hiking,lidar` : couches affichées en plus (courbes de niveau, ombrage, pentes, cadastre, sentiers, relief LiDAR).
- `itineraire=Lyon|Villeurbanne|45.7,4.9` : crée un itinéraire (de 2 à 12 étapes séparées par `|`, noms de lieux ou coordonnées). `boucle=1` ramène au départ. `titre=Sortie%20du%20samedi` nomme le projet.
Exemple : `https://fsggb.github.io/ScoutMap/?itineraire=Annecy|Talloires|Menthon-Saint-Bernard&boucle=1&titre=Sortie%20du%20lac&fond=plan`
Les liens sont expérimentaux : si un lieu est introuvable, la carte l'indique et l'utilisateur peut corriger à la main.
