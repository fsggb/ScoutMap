# ScoutMap

Application web de cartes IGN (Géoplateforme) pour l'orientation et les raids scouts — FSGGB.
Dépôt indépendant de ScoutHub : site statique publié sur GitHub Pages, sans clé ni secret.

**Site : https://fsggb.github.io/ScoutMap/**

## Interface

- **Barre de menus** : Fichier (nouveau, import/export GPX, export PDF), Édition (annuler, inverser, effacer), Créer (itinéraire, boucle, azimuts, mesures), Affichage (panneau, profil, calques, échelle), Aide (raccourcis).
- **Rail d'outils + panneau latéral** : Explorer, Itinéraire, Azimuts, Mesure, Calques. Le panneau se replie pour laisser toute la place à la carte.
- **Curseurs adaptés** : main pour déplacer la carte, croix pour poser des points, main fermée en glissant, pointeur sur le point de départ (clic = fermeture de la boucle), « + » sur le tracé (clic = ajout d'une étape). Une bulle indique ce qu'il faut faire et permet de revenir au déplacement (`Échap`).
- **Recherche** de lieux, adresses, sommets (Géoplateforme) ou de coordonnées (« 48.40, 2.70 »), avec navigation au clavier.
- **Fonds et couches** (bouton en bas à gauche, comme dans Google Maps) : Plan IGN, photographies aériennes ; courbes de niveau, ombrage du relief, pentes, cadastre.
- **Calques** : itinéraire, azimuts, mesure et chaque trace GPX sont des calques (afficher/masquer, centrer, supprimer).
- **Échelle** : affichée en permanence, réglable (échelles courantes ou valeur libre) et **aimantée** : à l'approche de 1 : 25 000, 1 : 50 000, etc., la carte se cale exactement dessus. Toute la France reste visible en dézoomant.
- **Netteté du fond** : en mode « Détaillée » (par défaut), le fond affiché à une échelle donnée est celui du niveau juste au-dessus (à 1 : 25 000, on voit le contenu du niveau plus précis au lieu d'un fond dézoomé). « Très détaillée » sert à l'impression haute définition.
- **Profil d'altitude** repliable et redimensionnable, avec lecture de la pente au survol.

## Itinéraire (à pied)

- Aller simple ou **boucle** (choix préalable, ou clic sur le point de départ A pour fermer la boucle automatiquement).
- **Distance maximale** facultative : la distance réelle est comparée au maximum ; en cas de dépassement tout passe en rouge (jauge, tracé, chiffres, document imprimé) **sans bloquer** l'utilisateur, qui peut déplacer les points.
- Plus rapide / plus court, allure de marche réglable, durée IGN et estimation de marche.
- Points nommables (utilisés dans la feuille de route), glisser pour déplacer, clic droit pour retirer, clic sur le tracé pour ajouter une étape.
- Éviter les autoroutes (contrainte appliquée par le service). Les routes nationales ne peuvent pas être exclues par la Géoplateforme : elles sont seulement **signalées** quand le service en donne le numéro (indicatif).

## Azimuts et mesures

Azimut, contre-azimut, distance et cumul par segment (degrés, grades ou millièmes ; nord géographique ou magnétique), fermeture du circuit par clic sur le point 1, placement d'une étape par azimut et distance. Mesure de distance et de surface.

## Export PDF et impression

*Fichier ▸ Exporter en PDF* (ou `Ctrl+P`) ouvre un aperçu **dont tous les textes sont modifiables** avant impression :

- **Feuille de route simplifiée** : distance, dénivelé positif, étapes.
- **Feuille de route détaillée** : durées, dénivelés, altitudes, consignes de guidage, avertissements.
- **Carte à l'échelle** : vue actuelle ou ajustée à l'itinéraire, imprimée à l'échelle exacte (imprimer à 100 %), fond très net.
- Options : vue d'ensemble de l'itinéraire, profil d'altitude (coupe du dénivelé), tableau d'azimuts, cadre de notes ; A4 ou A3, portrait ou paysage.

Pour obtenir un fichier PDF, choisir « Enregistrer au format PDF » comme imprimante dans la boîte d'impression du navigateur.

## GPX

Import (bouton, `Ctrl+O` ou glisser-déposer sur la carte) et export (`Ctrl+S`) de l'itinéraire, des azimuts, des mesures et des traces. Le nom du projet sert de nom de fichier.

## Limites connues

- Le **SCAN 25** (carte IGN papier au 1 : 25 000) n'est pas diffusé publiquement par la Géoplateforme (accès par licence ou clé). Le **Plan IGN** (mêmes données BD TOPO, courbes de niveau et sentiers à fort zoom) est l'alternative gratuite et légale ; le mode « Netteté » donne un rendu net à l'impression.
- Profils d'itinéraire : la Géoplateforme ne propose que « à pied » et « voiture » (pas de vélo/VTT) ; seul « à pied » est utilisé ici.
- La déclinaison magnétique est à saisir à la main (marge de la carte IGN) ; la convergence des méridiens est ignorée.
- Dénivelé : estimation à partir d'échantillons espacés d'environ 40 m au plus, lissée.
- L'échelle affichée correspond à un écran à 96 ppp ; l'impression « carte à l'échelle » à 100 % est exacte.

## Intégration ScoutHub

Si la page définit `window.ScoutHubSave({ name, mime, content })` (fonction renvoyant éventuellement une promesse), le bouton « Enregistrer dans ScoutHub » apparaît et envoie le GPX choisi dans l'espace personnel. Sinon le bouton reste caché. L'événement `scouthub:ready` peut être envoyé sur `window` pour l'activer après coup. `window.ScoutMap.exportGpx()` renvoie le GPX complet. Le script `/ScoutHub/scouthub-client.js` est chargé en option ; ScoutMap fonctionne sans.

## Développement

Site statique sans étape de build : ouvrir `index.html` via un serveur local (`python -m http.server`).
Bibliothèques (versions fixées, via cdnjs) : Leaflet 1.9.4, proj4js 2.12.1.

- `js/geo.js` : géométrie, projections, GPX (sans dépendance au DOM).
- `js/app.js` : carte, échelle, calques, outils, recherche, menus.
- `js/doc.js` : feuilles de route et cartes à l'échelle (aperçu éditable, impression).

Le workflow `.github/workflows/pages.yml` déploie sur GitHub Pages à chaque envoi sur `main`, à la demande, et chaque lundi à 3 h (vérification que les services Géoplateforme répondent, puis redéploiement).
