---
# Fiche de connaissances ChatGDB (format : ScoutHub/docs/projet-chatgdb.md, §5).
# ChatGDB lit ce fichier pour répondre aux questions sur les applications de ce dépôt.
depot: fsggb/ScoutMap
maj: 2026-11-23
---

# ScoutMap : Cartes IGN (orientation et raids)

Site : https://fsggb.github.io/ScoutMap/ . Cartes de la Géoplateforme IGN, sans clé ni compte. Version 2.6.2 (historique : CHANGELOG.md, ou Réglages › Version et nouveautés).

## Nouveautés de la version 2
- Hors connexion : la carte SCAN 25 d'une feuille A0 au 1:25 000 s'enregistre par défaut (Réglages › Hors connexion, ou menu Outils) ; l'application s'installe sur téléphone et ordinateur.
- Ma position avec boussole ; 2e appui sur le bouton de position = carte orientée dans la direction du téléphone, bouton N = nord en haut.
- Réglages en pleine page avec les valeurs par défaut (boucle ou aller simple, distance maximale, allure, unités, impression).
- Impression groupée : Bibliothèque, Ctrl + clic sur plusieurs tracés, puis Imprimer ; un onglet par tracé dans l'aperçu.
- Grille « Carroyage kilométrique bleu » comme les cartes IGN.
- Le bouton Retour du navigateur ne quitte plus l'application.

## Nouveautés de la version 2.1 et 2.2
- Itinéraire et azimuts réunis : barre d'outils flottante Déplacer / Chemin / Droite / Azimut. Chaque point est rejoint par le chemin (sentiers), en ligne droite ou en azimut, et on peut les mélanger dans un même itinéraire. L'azimut est en degrés, par rapport au nord magnétique (déclinaison estimée automatiquement), avec contre-azimut et distance ; on peut placer le point suivant par azimut et distance.
- Recherche : coordonnées de tous formats (degrés décimaux, degrés minutes secondes, Lambert 93, UTM) et liens Google Maps, OpenStreetMap, Géoportail.
- Deux points ne font jamais une boucle. Le profil d'altitude n'apparaît qu'avec un tracé calculé.
- Pilotage par ChatGDB (section ci-dessous) et vue partielle de carte pour les artefacts.

## Partage en direct (2.3 et 2.4)
- Le chef peut verrouiller la modification (les co-administrateurs suivent sans modifier). Les cartes partagées sont compressées. Un travail partagé reste dans la bibliothèque avec la mention « Partage ».
- Deux façons de partager : « Sur le terrain » (le chef dirige, les autres suivent) ou « Préparer à plusieurs » (tout le monde modifie la carte en même temps ; les modifications simultanées sont fusionnées, chacun garde ses ajouts). Partagé : le tracé ouvert et les tracés de la bibliothèque affichés avec lui.

## Pilotage par ChatGDB (canal de commandes, comme la suite Craft)
Après « ouvrir » Cartes IGN, ChatGDB utilise `api_commandes`, `api_inspecter`, `api_executer`, `api_lot` et `api_requete` (méthodes engine.commands, engine.execute, document.inspect, ui.inspect, render.embed). Commandes principales :
- `project.new` {type: itineraire | azimuts | grandjeu, nom} ; `project.rename` {nom}.
- `route.add` {query (lieu) ou coords (texte, tous formats, lien Google Maps) ou lat + lon, mode: chemin | droite | azimut, nom, at} ; `route.add_azimuth` {azimut en degrés, distance en mètres, nom} ; `route.mode` {index, mode} ; `route.tool` {mode} ; `route.remove` {index} ; `route.rename_point` {index, nom} ; `route.loop` {boucle} ; `route.reverse` ; `route.options` {optimisation: rapide | court, distance_max_km} ; `route.clear`.
- `route.result` : attend le calcul et renvoie la distance (m), la durée (s), les points, les azimuts et contre-azimuts.
- `library.list` (tracés du navigateur, avec leur id) ; `library.open` {id} ; `library.show` {id, visible} (affiche un tracé en plus, de sa couleur).
- `game.add` {type texte|croix|ligne|zone|cercle|fleche|rectangle, points [[lat,lon]…], texte, nom, couleur, rayon_m, taille, etape, enigme, code, reponse, patrouille} ; `game.steps` {chef} ; `game.reveal` {jusqua} ; `game.remove` {id} : éléments de jeu, étapes avec énigmes, révélation progressive.
- `info.gr` {query|lat+lon, rayon_km 1-15, pas_km} : GR, GR de Pays et PR proches (référence, distance au lieu, longueur dans la zone, points le long du tracé).
- `route.add_gr` {ref, query|lat+lon, depuis_km, jusqua_km, rayon_km, pas_km} : pose un tronçon de GR dans l'itinéraire (suivre un GR pour une boucle ou une étape), à vérifier ensuite avec route.result et route.analyse.
- `info.poi` {query|lat+lon, rayon_km 0,5-15, type tout|point_de_vue|patrimoine|eau|camping|refuge} : lieux touristiques proches avec distance (OpenStreetMap).
- `route.analyse` {depart HH:MM, date, allure_kmh, pauses_min} : distance, dénivelé, durée de marche, heure d'arrivée, marge avant le coucher du soleil et alertes (plus de 40 km, dénivelé, nuit) ; `info.sun` {query | lat+lon, date} : lever et coucher du soleil (heure de France).
- `view.place` {query, zoom} ; `view.center` {lat, lon, zoom} ; `view.scale` {echelle} ; `view.fit` ; `map.base` {fond} ; `map.layers` {afficher, masquer} ; `map.grid` {type: none | l93 | km | utm | ll | game}.
- `print.open` (ouvre la fenêtre d'impression pour la personne) ; `share.link` (lien du travail complet).
- `embed.spec` {ids (bibliothèque, facultatif ; sinon le travail en cours), titre, legende, profil} : renvoie la balise artefact de type app à recopier telle quelle (elle contient la commande `embed.show` : aucune donnée dans l'adresse, comme pour les applications Craft). L'artefact montre seulement la carte avec les tracés choisis, chacun de sa couleur, et une légende (nom et distance). Rien n'est modifié dans le navigateur de la personne.
- `route.add_spot` {query | coords | lat+lon, nom} : point seul (repère isolé) ; `app.point_style` {forme: pastille | croix | pointeur | point}.

## Fonctions
- Fonds : Plan IGN, photographies aériennes ; couches : courbes de niveau, ombrage, pentes, cadastre.
- Recherche de lieux, sommets et adresses.
- Itinéraire à pied ou en voiture : départ, étapes déplaçables, arrivée, feuille de route, distance, durée, dénivelé, estimation de marche (allure réglable).
- Azimuts successifs pour la course d'orientation : azimut, contre-azimut, distance, cumul ; degrés, grades ou millièmes ; nord géographique ou magnétique (déclinaison saisie à la main).
- Mesure de distance et de surface ; profil d'altitude avec pente.
- Import et export GPX ; impression A4 paysage (carte, profil, feuille de route, tableau d'azimuts).
- Coordonnées au curseur : WGS 84, Lambert-93, UTM. Le travail est mémorisé dans le navigateur.
- Mise à jour des cartes : le bouton « Fonds et infos » (en bas à gauche de la carte) affiche, pour le fond et chaque information active, la date de mise à jour des données IGN (« il y a 34 j », en rouge au-delà de 13 mois) ; la date du fond figure aussi dans la ligne de crédits de la carte et au pied des documents imprimés. Les fonds OpenStreetMap sont mis à jour en continu ; l'État-major est une carte historique (1820-1866). Pour les photographies, la date de prise de vue varie selon le département (lien vers la liste IGN dans le panneau).

## Limites
- Itinéraires : à pied ou en voiture seulement (pas de vélo/VTT).
- SCAN 25 (carte IGN au 1:25 000) : fond `scan25`, servi par le serveur Cloudflare de ScoutHub (clé IGN cachée), jusqu’au zoom 16.
- Partage en direct (itinéraire, azimuts ou grand jeu) : QR code et lien `?direct=…`, positions, discussion et appel vocal de groupe (WebRTC, jusqu’à 8 personnes, chacun choisit de rejoindre), chiffrés ; serveur Cloudflare de ScoutHub. Le partage peut être lancé même si la carte est vide.
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
- `nouveau=route|az|game` : ouvre directement un nouvel itinéraire, des azimuts ou un grand jeu. `ouvrir=horsconnexion` : réglages des cartes hors connexion ; `ouvrir=bibliotheque` : bibliothèque des tracés.
Les liens sont expérimentaux : si un lieu est introuvable, la carte l'indique et l'utilisateur peut corriger à la main.

- `#projet=<JSON en base64url>` (après l'adresse) ouvre un travail complet (itinéraire, azimuts, grand jeu) : c'est le format utilisé par le bouton « Modifier » des pages web exportées. Pour préparer un itinéraire simple, préférer `?itineraire=...`.
- Au démarrage, l'accueil propose : ouvrir un fichier, créer un itinéraire, des azimuts ou un grand jeu, et reprendre un travail enregistré dans le navigateur.
