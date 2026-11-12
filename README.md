# ScoutMap

Application web de cartes IGN (Géoplateforme) pour l'orientation et les raids scouts — FSGGB.
Dépôt indépendant de ScoutHub : site statique publié sur GitHub Pages, sans clé ni secret.

**Site : https://fsggb.github.io/ScoutMap/**

## Simplification (novembre 2026)
- **Trois applications, plus d'onglets croisés** : la barre de gauche montre Accueil (retour à l'accueil pour changer de type de travail), l'application en cours, puis en bas **Alertes** (compteur rouge : tracé qui repasse au même endroit, distance à vol d'oiseau, tunnel, route nationale, distance maximale, erreurs), **Réglages** (paramètres de l'itinéraire, unités des azimuts, options du grand jeu) et Panneau. Ils s'ouvrent à la place des outils du panneau. Séparateur avant les boutons d'action de la liste des points.
- **Tutoriels vidéo** : un global et un par application (itinéraire, azimuts, grand jeu), accessibles par le « ? », le menu Aide et des pastilles discrètes sur l'accueil.
- **Ouverture de fichiers** : le sélecteur accepte les pages web .html exportées, les GPX, KML, GeoJSON et les anciens .json ; le bouton d'import du panneau est retiré (Fichier > Ouvrir, ou glisser-déposer). Anti-répétition : un autre chemin n'est retenu que s'il ajoute au plus 200 m.
- **Verrou Édition / Verrouillé** (stylo / cadenas, en haut du panneau Itinéraire et Azimuts) à la place du bandeau bleu : en Édition un clic sur la carte pose un point ; verrouillé, la carte ne fait que se déplacer. Un travail ouvert démarre verrouillé.
- **Enregistrer / Exporter** : « Enregistrer » (Ctrl+S) crée la page web .html, qui se rouvre dans ScoutMap et se partage ; « Exporter » crée la trace GPX pour les autres applications ; « Imprimer » et « Enregistrer en PDF ». Plus de fichier .json (ouvert encore s'il en existe).
- **Panneau** : liste des points repliable (bouton chevron), plus de cartes de chiffres ni de consignes de guidage sous la liste (le profil d'altitude donne distance et dénivelé).
- **Points hors sentier (pic, col, versant)** : le point reste exactement où il est (un pic ou un col proche est repéré) et il est relié en pointillés, comme un azimut, au chemin le plus proche (recherche jusqu'à 2,5 km) qui sert au calcul. Cette distance à vol d'oiseau est ajoutée au total (aller simple pour le départ et l'arrivée, aller-retour pour les étapes) et signalée. Si aucun chemin n'est trouvé, un message l'indique. Un point dans un champ ou près d'un village est, lui, ramené sur le chemin ou le village le plus proche.
- **Sentiers GR / GRP / PR** : tracés en rose, sans icônes. GR (trait plein) et GR de Pays (tirets longs) depuis OpenStreetMap (via le service Waymarked Trails), à partir du zoom 12, avec leur nom sur le tracé ; PR et circuits locaux (pointillés) depuis la BD TOPO de l'IGN, à partir du zoom 14. Ils s'impriment avec les cartes.
- **Aide** : bouton « ? » en haut (tutoriel vidéo) ; menu Aide : vidéo dans un nouvel onglet et contact du service informatique (service-informatique@fsggb.fr).
- **Accueil et travaux enregistrés** : au démarrage, quatre cartes (Ouvrir un fichier, Créer un itinéraire, des azimuts, un grand jeu) et la liste des travaux enregistrés automatiquement dans le navigateur (ouvrir, télécharger, supprimer ; avertissement : effacés si on vide les données du navigateur).
- **Fichiers** : « Enregistrer le travail » (.json, entièrement modifiable : points, azimuts, formes, traces), « Exporter en page web » (.html autonome, lecture seule : carte, profil, impression ; bouton **Modifier** qui rouvre le travail dans ScoutMap via `#projet=<JSON en base64url>`), « Enregistrer en GPX » (trace lisible par toutes les applications, non modifiable dans ScoutMap). « Ouvrir un fichier » lit le .json, le .html exporté, le GPX, le KML et le GeoJSON.
- **Feuille de route en deux pages** : page 1 (chiffres, carte, profil, numéros d'urgence, responsables à remplir) et page 2 (en-tête synchronisé, tableau des étapes avec distance, cumul, altitude, D+ et date/heure à remplir, notes, « Bon raid ! »).
- **Tunnels** : évités ; si un tunnel est le seul passage, une alerte l'indique.
- **Impression (version 2)** : première fenêtre à trois cases avec vignettes en direct (feuille de route, cartes de l'itinéraire, carte générale), format A4/A3, échelle et tracé affiché ou non ; puis aperçu sans barre d'outils, avec miniatures cliquables à gauche, boutons « Enregistrer en PDF » et « Imprimer », et « Retour » vers les réglages. La feuille de route tient sur une page (carte et profil se réduisent selon le nombre d'étapes) et se termine par deux colonnes : notes et numéros d'urgence.
- **Placement intelligent des points** : une fois dézoomé, un point cliqué se place sur le village (église ou mairie), le hameau, le col ou le sommet proche, sinon sur le chemin le plus proche ; très zoomé il reste où l'on clique. Clic droit sur un point déplacé : « Remettre à l'endroit où j'ai cliqué ».
- **Itinéraires** : tunnels évités (sauf passage obligé), détours anti-aller-retour limités (pas de boucles supplémentaires).
- **Grand jeu** : réglages par pastilles Remplissage / Contour / Texte (couleur, transparence, épaisseur, pointillés ; texte avec gras, italique, souligné).
- **Tutoriel vidéo** : bouton « Tutoriel » en haut (ou menu Aide), vidéo dans `assets/tuto-scoutmap.mp4`.
- **Impression en étapes** : 1) choisir le document et le format du papier (A4 / A3, orientation automatique) ; 2) aperçu avec barre d'outils en direct ; 3) « Imprimer » (fenêtre du système) ou « Enregistrer en PDF ». La « Carte du parcours » imprime dans l'ordre : feuille de route (portrait), planche d'assemblage, puis toutes les cartes F1, F2… (case « Avec la feuille de route »).
- **Secours du tracé** : si aucun chemin n'est trouvé depuis un point (champ, enclave), il est ramené sur l'église, la mairie ou le hameau à moins de 100 m, sinon sur le chemin le plus proche (BD TOPO), puis l'itinéraire est recalculé.
- **Trois onglets** dans la barre de gauche : Itinéraire, Azimuts, Grand jeu. Chaque onglet a son propre dessin ; en changeant d'onglet, la carte n'affiche que le dessin de l'onglet. Plus de calques superposés, plus d'écran d'accueil, plus d'outil Mesures.
- **Fond par défaut : OpenTopoMap**, aussi utilisé pour l'impression ; les sentiers balisés (GR, PR…) sont affichés par défaut à partir du zoom 10.
- **Traces** : enregistrement en GPX ; ouverture de GPX, KML et GeoJSON (menu Fichier ou glisser-déposer sur la carte), affichées sur l'onglet Itinéraire.
- **Impression** : quatre grandes cartes (feuille de route, feuille détaillée, carte à l'échelle, carte du parcours sur plusieurs feuilles) puis, dans l'aperçu, une barre d'outils (papier, sens, échelle, tracé affiché ou points seulement) qui recalcule en direct.

## Fonds de carte (« filtres ») et conditions d'usage

Bouton *Fonds et couches* : **Plan IGN**, **Photographies**, **État-major (1820-66)** (IGN, données ouvertes de la Géoplateforme) ; **OpenTopoMap**, **OpenStreetMap**, **OSM France**, **CyclOSM** (serveurs libres) ; couches : courbes de niveau, ombrage, **relief LiDAR HD**, pentes, cadastre, **sentiers balisés (Waymarked Trails : GR…)**. Toutes les sources sont chargées en CORS, avec attribution affichée.

Les serveurs de tuiles OpenStreetMap (politique d'usage des tuiles) n'autorisent que la **consultation interactive** : pas de téléchargement préventif ni hors ligne. ScoutMap ne les charge donc que pour ce que l'utilisateur regarde (vignettes chargées à la première ouverture du panneau, netteté limitée à un niveau de plus), et l'**impression multi-feuilles utilise toujours le Plan IGN**.

## Carte du parcours sur plusieurs feuilles (A4 / A3)

*Fichier ▸ Imprimer la carte du parcours…* (ou bouton du panneau Itinéraire) : le tracé est découpé en **feuilles A4 ou A3 avec le moins de feuilles possible**.

- **Orientation automatique** (portrait ou paysage, le moins de feuilles), marges de feuille, **chevauchement minimal** entre feuilles (10 mm par défaut) et marge autour du tracé réglables ; échelle 1 : 10 000, 1 : 25 000 ou 1 : 50 000.
- **Seules les feuilles traversées par le tracé** sont imprimées : pour une boucle, pas de feuilles « du centre ». Les feuilles redondantes sont supprimées, la grille est testée à plusieurs positions.
- Les feuilles sont **numérotées dans l'ordre du parcours** et portent les renvois vers leurs voisines (↑ → ↓ ←, y compris les diagonales), l'échelle, une barre d'échelle ; une **planche d'assemblage** (vue d'ensemble numérotée) est ajoutée en première page.
- Le nombre de feuilles est annoncé en direct dans la boîte de dialogue (« 9 feuilles A4 en paysage — portrait : 11 »).
- Netteté : en mode automatique, tuiles IGN à 2 niveaux de plus en A4 (≈ 384 ppp) et 1 niveau en A3, avec relance automatique des tuiles en échec, pour éviter le flou d'une simple impression de capture d'écran. Imprimer à 100 %.

## Types de travail et accueil

L'**écran d'accueil** (bouton *Accueil*, touche `H`, ou clic sur le logo) propose quatre types de travail : **Itinéraire à pied**, **Azimuts**, **Mesures** et **Grand jeu**. Chaque type a ses propres outils et ses propres calques : quand on change de type, on ne voit plus les autres (la carte, la liste des calques, les exports et le profil d'altitude ne concernent que le type en cours). Le travail de chaque type est conservé et retrouvé en y revenant ; l'accueil indique ce qui existe déjà.

## Grand jeu (zones, formes, flèches, croix, textes)

Pour préparer des cartes de grand jeu : **zone** (polygone), **rectangle**, **cercle**, **ligne**, **flèche**, **croix** et **zone de texte**. Pour chaque élément : couleur de remplissage, **transparence réglable (0 à 100 %)**, couleur et épaisseur du contour, pointillés, et pour les textes la taille et la couleur du texte. Sélection d'un élément (poignées blanches = sommets, poignées rondes = ajout de sommet, poignée dorée = déplacement), duplication, premier plan / arrière-plan, suppression (`Suppr`), annulation (`Ctrl+Z`), clic droit pour les actions. Plusieurs calques de grand jeu possibles ; impression sur une carte à l'échelle (PDF).

## Téléphone

Sur petit écran, l'interface passe en mode téléphone : barre d'outils en bas, panneau en feuille qui se replie (croix de fermeture), indications en haut avec bouton « Terminer » pour finir une zone ou une ligne au toucher, grandes poignées tactiles, profil d'altitude replié, bouton **Ma position** (localisation de l'appareil), appui long pour le menu contextuel.

## Interface

- **Barre de menus** : Fichier (nouveau, import/export GPX, export PDF), Édition (annuler, inverser, effacer), Créer (itinéraire, boucle, azimuts, mesures), Affichage (panneau, profil, calques, échelle), Aide (raccourcis).
- **Rail d'outils + panneau latéral** : Explorer, Itinéraire, Azimuts, Mesure, Calques. Le panneau se replie pour laisser toute la place à la carte.
- **Curseurs adaptés** : main pour déplacer la carte, croix pour poser des points, main fermée en glissant, pointeur sur le point de départ (clic = fermeture de la boucle), « + » sur le tracé (clic = ajout d'une étape). Une bulle indique ce qu'il faut faire et permet de revenir au déplacement (`Échap`).
- **Recherche** de lieux, adresses, sommets (Géoplateforme) ou de coordonnées (« 48.40, 2.70 »), avec navigation au clavier.
- **Fonds et couches** (bouton en bas à gauche, comme dans Google Maps) : Plan IGN, photographies aériennes ; courbes de niveau, ombrage du relief, pentes, cadastre.
- **Calques** : chaque itinéraire, chaque tracé d'azimuts, chaque mesure et chaque trace GPX est un calque indépendant (afficher/masquer, renommer par double-clic, inverser le sens, centrer, modifier, supprimer). Un clic sur un tracé de la carte le rouvre en édition.
- **Échelle** : affichée en permanence ; zoom libre, avec deux échelles prédéfinies (1 : 25 000 et 1 : 50 000) ou une valeur libre. Toute la France reste visible en dézoomant.
- **Feuilles mélangées portrait/paysage** : l'option « Mélanger » (Chrome/Edge) choisit l'orientation de chaque feuille pour réduire encore leur nombre (ex. boucle de 105 km : 14 feuilles au lieu de 16). Les feuilles sont numérotées **F1, F2…** (carrés dorés), distinctes des numéros d'étapes (pastilles rondes) ; chaque bord indique la feuille voisine (ex. « ↗ F1 »).
- **Panneau « Fonds et informations » à onglets** : *Fond de carte* (un seul), *Informations* (relief, sentiers, cadastre… combinables, pastille « +n » sur le bouton) et *Netteté*.
- En netteté auto, le fond passe au niveau « Haute » au-delà de 6 feuilles A4 pour que la génération reste rapide ; « Très détaillée » reste disponible.
- **Pas de limite d'étapes** : l'itinéraire est calculé tronçon par tronçon (repère à repère), on peut donc poser autant de points secondaires qu'on veut ; déplacer un point ne recalcule que les tronçons concernés.
- **Point au centre du village** : tant que la carte n'est pas zoomée au maximum (jusqu'à ≈ 1 : 4 000, rayon d'au moins 45 m ; plus large quand on dézoome), le point se place sur l'église la plus importante de la zone ; à défaut sur la mairie ; dans une ville (beaucoup d'églises), sur l'édifice le plus important, le plus central (données IGN « culte chrétien » / « mairie »). Désactivable dans les paramètres de l'itinéraire.
- **Boucle la plus rapide, ordre libre** : par défaut un itinéraire est une boucle à pied « le plus rapide » ; avec « Ordre de passage libre » (paramètres), l'ordre des points est réorganisé (départ conservé) pour obtenir la boucle la plus courte par les points choisis (estimée à vol d'oiseau), et la numérotation suit le nouvel ordre. Insérer un point sur le tracé ou réordonner à la main reste possible.
- **La carte ne bouge jamais toute seule** quand on pose un point ; le bouton « Recadrer » (sous les boutons de zoom) ajuste la vue sur le tracé. L'ordre de passage est par défaut indépendant de l'ordre de pose des points (départ conservé).
- **Date de mise à jour des cartes** : le panneau « Fonds et informations » indique, pour le fond et chaque information active, la date de révision du jeu de données IGN (lue dans le catalogue de la Géoplateforme, mise en cache 24 h), avec une alerte au-delà de 13 mois ; elle apparaît aussi dans les crédits de la carte et au pied des PDF. Pour les photographies, un lien mène aux dates de prise de vue par département.
- **Liens d'action (pour ChatGDB)** : `?lieu=…&zoom=…`, `?centre=lat,lon`, `?fond=…`, `?couches=…`, `?itineraire=A|B|C&boucle=1&titre=…` préparent la carte depuis l'adresse (voir `CHATGDB.md`).
- **Éviter de repasser par le même chemin** (réglage activé par défaut, dans « Paramètres de l'itinéraire ») : les passages repris sont signalés en pointillés orange, et le tracé essaie automatiquement un passage décalé (jusqu'à ≈ 1,8 km sur le côté) quand une alternative proche existe ; sinon, un avertissement indique la longueur reprise.
- **Netteté du fond** : en mode « Auto » (par défaut), fond standard quand on voit une grande étendue et fond détaillé en s'approchant : à 1 : 25 000, on voit le contenu du niveau juste au-dessus au lieu d'un fond dézoomé. « Standard », « Détaillée » et « Très détaillée » (impression) sont aussi disponibles.
- **Profil d'altitude** repliable et redimensionnable, avec lecture de la pente au survol.

## Itinéraire (à pied)

- Aller simple ou **boucle** (choix préalable, ou clic sur le point de départ A pour fermer la boucle automatiquement).
- **Distance maximale** facultative : la distance réelle est comparée au maximum ; en cas de dépassement tout passe en rouge (jauge, tracé, chiffres, document imprimé) **sans bloquer** l'utilisateur, qui peut déplacer les points.
- Plus rapide / plus court, allure de marche réglable (5 km/h par défaut), durée IGN et estimation de marche. Bouton « Inverser le sens » (en boucle, A reste le départ).
- **Points numérotés dans l'ordre de passage** : un point posé près du tracé s'insère dans le bon tronçon, la poignée du panneau réordonne les points, et la numérotation suit toujours. Un clic sélectionne un point (surbrillance sur la carte et dans le panneau, et inversement) ; `Suppr` ou `⌫` le retire.
- Les étapes prennent par défaut le nom du village ou du hameau voisin (Géoplateforme) ; chaque nom reste modifiable.
- Points nommables (utilisés dans la feuille de route), glisser pour déplacer, clic droit pour retirer, clic sur le tracé pour ajouter une étape.
- Éviter les autoroutes (contrainte appliquée par le service). Les routes nationales ne peuvent pas être exclues par la Géoplateforme : elles sont seulement **signalées** quand le service en donne le numéro (indicatif).

## Annuler / rétablir et simulation

- **Annuler / rétablir** (`Ctrl+Z`, `Ctrl+Y`, boutons de la barre du haut) : points posés, supprimés, déplacés, réordonnés, itinéraire inversé, calques créés ou supprimés. Les modifications rapprochées (frappe, glissement) forment une seule étape.
- **Simulation du parcours** (menu *Créer ▸ Simulation du parcours…*, sans bouton dédié) : un curseur parcourt le tracé affiché dans le profil d'altitude, en suivant le relief (il ralentit dans les montées d'après l'allure réglée). Les commandes sont dans le panneau latéral : lecture/pause, position, **durée de la simulation de 3 à 10 secondes**, option « la carte suit le curseur ». Altitude, pente et temps de marche s'affichent en direct et le curseur est répercuté sur le profil.
- **Export vidéo** : *Exporter en vidéo…* recadre d'abord la carte sur tout le parcours, attend les tuiles, enregistre la simulation (carte, tracé parcouru, curseur, profil d'altitude facultatif), puis propose d'**enregistrer ou non** le fichier (WebM, ou MP4 selon le navigateur). Tout se fait dans le navigateur, sans envoi.
- **Menus contextuels (clic droit)** : sur un point (renommer, supprimer, en faire le départ ou l'arrivée, fermer la boucle, copier, centrer), sur le tracé (ajouter une étape, inverser, simulation, PDF), sur la carte (départ/étape/arrivée, azimut, mesure, copier, annuler/rétablir), sur le diagramme d'altitude (centrer, ajouter une étape, simulation depuis ce point, copier) et sur une ligne de calque.

## Azimuts et mesures

Azimut, contre-azimut, distance et cumul par segment (degrés, grades ou millièmes ; nord géographique ou magnétique), fermeture du circuit par clic sur le point 1, placement d'une étape par azimut et distance. Mesure de distance et de surface.

## Export PDF et impression

*Fichier ▸ Exporter en PDF* (ou `Ctrl+P`) ouvre un aperçu **dont tous les textes sont modifiables** avant impression. Le type par défaut est la feuille de route simplifiée, titrée du nom du calque :

- **Feuille de route simplifiée** : distance, dénivelé positif, étapes.
- **Feuille de route détaillée** : durées, dénivelés, altitudes, consignes de guidage, avertissements.
- Une colonne vide « Date et heure d'arrivée » est prévue pour chaque étape. Le dépassement de distance maximale n'est jamais mentionné sur les documents.
- On choisit **quels calques imprimer** (un, plusieurs ou tous) : une feuille par itinéraire ou tracé d'azimuts, ou tous les calques choisis sur une même carte.
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
