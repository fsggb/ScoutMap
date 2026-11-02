# ScoutMap

Application web de cartes IGN (Géoplateforme) pour l'orientation et les raids scouts — FSGGB.

**Site : https://fsggb.github.io/ScoutMap/**

## Fonctions

- Fonds : Plan IGN, photographies aériennes ; couches : courbes de niveau, ombrage, pentes, cadastre.
- Recherche de lieux, sommets et adresses (service de géocodage de la Géoplateforme).
- Itinéraire à pied ou en voiture (service de calcul d'itinéraire IGN) : départ, étapes déplaçables, arrivée, clic sur le tracé pour ajouter une étape, feuille de route, distance, durée, dénivelé et estimation de marche (allure réglable).
- Azimuts successifs pour la course d'orientation : azimut, contre-azimut, distance et cumul par segment, en degrés, grades ou millièmes, nord géographique ou magnétique (déclinaison saisie), placement d'une étape par azimut et distance.
- Mesure de distance et de surface.
- Profil d'altitude (altimétrie IGN) de l'itinéraire, des azimuts, des mesures et des traces importées, avec lecture de la pente le long du profil.
- Import et export GPX.
- Impression A4 paysage : carte, profil, feuille de route et tableau d'azimuts.
- Coordonnées au curseur : WGS 84 (décimal ou degrés-minutes-secondes), Lambert-93, UTM.
- Travail mémorisé dans le navigateur (`localStorage`).

## Limites connues

- Les profils de calcul d'itinéraire de la Géoplateforme se limitent à « à pied » et « voiture » : pas de vélo/VTT.
- La couche SCAN 25 n'est pas servie sans clé API ; le Plan IGN (avec courbes de niveau à fort zoom) la remplace.
- La déclinaison magnétique est à saisir à la main (marge de la carte IGN) ; la convergence des méridiens est ignorée.
- Dénivelé : estimation à partir d'échantillons espacés d'environ 40 m au plus, lissée.

## Intégration ScoutHub

Si la page définit `window.ScoutHubSave({ name, mime, content })` (fonction renvoyant éventuellement une promesse), le bouton « Enregistrer dans ScoutHub » apparaît et envoie le GPX choisi dans l'espace personnel. Sinon le bouton reste caché. L'événement `scouthub:ready` peut être envoyé sur `window` pour l'activer après coup. `window.ScoutMap.exportGpx()` renvoie le GPX complet.

## Développement

Site statique sans étape de build : ouvrir `index.html` via un serveur local (`python -m http.server`).
Bibliothèques (versions fixées, via cdnjs) : Leaflet 1.9.4, proj4js 2.12.1. Aucune clé ni secret.

Le workflow `.github/workflows/pages.yml` déploie sur GitHub Pages à chaque envoi sur `main`, à la demande, et chaque lundi à 3 h (vérification que les services Géoplateforme répondent, puis redéploiement).
