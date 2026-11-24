# Historique des versions de ScoutMap

Chaque version publiée est notée ici (la plus récente en haut). Les numéros suivent la règle « majeure.mineure.correctif ».
On retrouve cet historique dans l'application : **Réglages › Version et nouveautés**.

## 2.6.1 — 24 novembre 2026

- **Nouveaux points : les épingles.** Les points posés sur la carte sont des épingles en forme de goutte (contour blanc, ombre douce, numéro lisible), la pointe posée exactement sur le lieu : départ vert, arrivée rouge, étapes bleues, azimuts dorés, repères violets. C'est la forme par défaut ; la pastille numérotée et le point simple restent au choix dans Réglages. La croix et l'ancien pointeur sont supprimés.

## 2.6.0 — 24 novembre 2026

- **Cartes hors connexion** : toutes les zones enregistrées sont maintenant dessinées par **un seul contour** (les chevauchements disparaissent), avec un léger remplissage vert. Les tuiles communes à plusieurs cartes ne sont ni retéléchargées ni enregistrées deux fois (le stockage est indexé par adresse de tuile) ; l'estimation avant enregistrement indique combien de tuiles sont déjà sur l'appareil.
- **Azimuts sans carte** : le masque est plus large (au moins 450 m autour de la zone) pour qu'aucune route proche ne guide à vue ; il reste sous le tracé, les points et les flèches, qui restent toujours lisibles.
- **Accueil sur téléphone** : les cartes d'accueil s'empilent sur une colonne (icône à gauche, texte entier) au lieu de se serrer sur trois colonnes.
- **ChatGDB** : nouvelles commandes `info.gr` (GR, GR de Pays et PR proches d'un lieu, avec longueur et points le long du tracé), `route.add_gr` (poser un tronçon de GR dans l'itinéraire) et `info.poi` (points de vue, patrimoine, eau, camping, refuge proches). Données OpenStreetMap (ODbL).

## 2.5.0 — 25 novembre 2026

### Vitesse
- **Itinéraire** : le tracé apparaît dès que le point est posé (moins d'une seconde au lieu de quatre) ; la recherche du village ou de l'église, qui faisait une trentaine de requêtes avant le calcul, passe après le tracé et en demande beaucoup moins.
- **Cartes d'impression** : le chargement des cartes IGN est mesuré (4 feuilles : 245 tuiles en 22 s en netteté « Rapide », 701 tuiles en 78 s en « Maximale »). **Réglages › Impression › Netteté des cartes imprimées** : Automatique (maximale jusqu'à 3 feuilles A4 ou 2 feuilles A3, rapide au-delà), Rapide ou Maximale. Aucune limitation « anti-abus » ne ralentit les cartes : seule la quantité de tuiles compte.
- **SCAN 25** : une tuile sans données (hors de la carte) ne déclenche plus la fausse alerte « SCAN 25 momentanément indisponible » ni le secours lent ; l'alerte n'apparaît qu'après plusieurs échecs sans aucune réussite.

### Azimuts
- **Épreuve sans carte** : sous le choix du mode, « Carte (épreuve à la boussole, sans carte) » : carte visible, **masquée sous la zone des azimuts**, ou **toute la carte masquée**. Le masque s'imprime aussi sur les cartes.
- Le bouton « Créer des azimuts » de l'accueil est retiré : les azimuts se font dans l'itinéraire (outil Azimut).
- Menus : doublons retirés (Enregistrer en PDF, Retirer le dernier point, Installer l'application dans Aide, échelles 1 : 2 000 et 1 : 1 000, lien vers la Géoplateforme).

### Recherche
- Les **liens courts Google Maps** (maps.app.goo.gl…) s'ouvrent : le serveur ScoutHub lit l'adresse complète (un navigateur ne peut pas la lire lui-même depuis un autre site). Seules les adresses de Google Maps sont suivies.

### Grand jeu
- Le thème **« Thème libre »** est nommé clairement ; le nom du jeu est un titre comme « Choisissez le thème du jeu » ; double-clic sur un thème pour continuer.
- **Le fond de carte choisi à l'assistant est bien appliqué** (avant, il était perdu avec le thème libre ou quand il différait de celui du thème).
- **Palette** : les éléments du thème d'abord, puis **tous les autres thèmes en dessous, fermés**. Le panneau des fonds de carte montre **tous les fonds** directement.
- Le panneau latéral du grand jeu **garde la même largeur** (il ne s'élargit plus).
- **Les éléments suivent le terrain** : tracés, croix, flèches et textes rétrécissent quand on dézoome et grossissent quand on zoome, comme les icônes. Les contours (bordures des lignes illustrées, routes, murs…) sont **moins épais** et le trait par défaut passe de 3 à 2.

### Notifications
- Notifications et bulles d'aide du grand jeu **toutes en clair** (carte blanche, filet or), plus de bleu foncé.

### Pour ChatGDB
- Nouvelles commandes : `route.analyse` (distance, dénivelé, durée de marche, heure d'arrivée comparée au coucher du soleil, alertes) et `info.sun` (lever et coucher du soleil, heure de France).

## 2.4.0 — 24 novembre 2026

Une seule version pour tout ce lot (partage, pilotage, points, grand jeu).

### Partage en direct
- **Verrouillage** : en préparation à plusieurs, la personne qui dirige peut **verrouiller la modification** (Partage › Réglages). Les co-administrateurs suivent alors la carte sans pouvoir la modifier ; le serveur refuse leurs envois, pas seulement l'interface. Réversible à tout moment.
- **Données minimales** : les cartes partagées sont **compressées** avant d'être chiffrées (3 à 10 fois moins de données), les tracés calculés sont allégés (précision d'un mètre, sans les consignes détaillées), et rien n'est envoyé tant que rien ne change.
- **Historique** : un travail partagé (qu'on dirige, qu'on suit ou qu'on modifie à plusieurs) est rangé dans la **bibliothèque du navigateur avec la mention « Partage »** (« Partage terminé » une fois fini). Une seule ligne par partage, sans doublon.
- **Téléphone** : tous les menus de la barre du haut (Fichier, Édition, Outils, Affichage, Aide) et les trois onglets du partage restent visibles ; le texte de l'invitation dit si la personne modifie ou suit en lecture seule.

### Pilotage par ChatGDB
- Comme pour les applications Craft, **plus aucun paramètre d'adresse** : ChatGDB ouvre ScoutMap puis lui envoie des commandes natives. La vue partielle d'un artefact (carte seule, tracés de couleurs différentes, légende) s'obtient par la commande `embed.show`, avec ses données dans l'artefact et non dans le lien.
- Nouvelles commandes : `route.add_spot` (point seul), `app.point_style` (apparence des points).

### Points
- **Point seul** : nouvel outil de la barre (Déplacer, Chemin, Droite, Point, Azimut) pour poser un repère isolé, non relié au chemin. Il se nomme, se déplace, se supprime, s'imprime sur les cartes et s'enregistre avec le tracé.
- **Apparence des points** (Réglages › Général) : pastille numérotée, croix, pointeur ou point simple, à l'écran comme à l'impression.

### Grand jeu
- Le thème **Libre** (ex-« Personnalisé ») donne accès à toute la **bibliothèque complète** (323 éléments de tous les thèmes), classée par thème.
- **Une seule recherche par mot-clé dans tous les thèmes à la fois** (nom, catégorie ou thème) ; un jeu avec thème garde ses éléments en premier, avec un bouton « Toute la bibliothèque (tous les thèmes) ».

### Corrections
- Le travail partagé ne se duplique plus dans la bibliothèque à chaque mise à jour.

### Tutoriels
- Les quatre **tutoriels vidéo** (global, itinéraire, azimuts, grand jeu) sont refaits à jour, sous-titrés, et générés par script (`docs/tutoriel/video.js`) : ils se refont en une commande après un changement d'interface. Ils pèsent 8 Mo au lieu de 29 Mo. Une **présentation Google** (« ScoutMap – Tutoriel de prise en main (FSGGB) ») reprend les mêmes sujets pour une formation en groupe.

## 2.3.0 — 23 novembre 2026

### Préparation à plusieurs en direct
- Le partage en direct propose deux façons de partager : **Sur le terrain** (je dirige, les autres suivent en lecture seule, comme avant) ou **Préparer à plusieurs** (tout le monde modifie la carte).
- En préparation à plusieurs, les personnes invitées ouvrent **l'application complète** avec tous les outils ; leur travail en cours est d'abord rangé dans leur bibliothèque.
- Les modifications faites **en même temps** sont **fusionnées** au lieu de s'écraser : chacun garde ses ajouts (insérés à leur place), les suppressions et déplacements de chacun s'appliquent, et pour une même valeur changée par deux personnes, la plus récente l'emporte. Elles arrivent chez les autres en une à deux secondes, sans interrompre ce qu'on est en train de dessiner. Une notification discrète indique qui a modifié la carte.
- Ce qui est partagé : le tracé ouvert (itinéraire, azimuts ou grand jeu) et, pour un itinéraire, les tracés de la bibliothèque affichés avec lui.
- Le chef peut reprendre la main seul en révoquant le lien co-administrateur (Partage › Réglages).

## 2.2.0 — 23 novembre 2026

### Pilotage par ChatGDB
- ScoutMap offre maintenant à ChatGDB le **même canal de commandes que les applications de la suite Craft** (Word, Excel…) : ChatGDB peut créer un itinéraire, ajouter des points par nom de lieu, coordonnées ou azimut, choisir chemin, ligne droite ou azimut, lire la distance et la durée, ouvrir et afficher des tracés de la bibliothèque, changer le fond, la grille ou l'échelle, ouvrir l'impression. 27 commandes, décrites dans la fiche ChatGDB.
- **Vue partielle** (`?vue=carte`) : la carte seule, avec les tracés choisis chacun de sa couleur et une légende (nom et distance), en lecture seule, sans rien enregistrer. ChatGDB s'en sert pour montrer une carte dans un artefact.

## 2.1.0 — 23 novembre 2026

### Itinéraire et azimuts réunis
- **Barre d'outils flottante** dans l'itinéraire, comme celle du grand jeu : **Déplacer** (la carte bouge sans poser de point), puis la façon de rejoindre le point suivant : **Chemin** (par les routes et sentiers), **Droite** (à vol d'oiseau) ou **Azimut**.
- On peut **mélanger** les trois dans un même itinéraire : un morceau en azimut au milieu d'un itinéraire, par exemple. Clic droit sur un point pour changer la façon de le rejoindre.
- **Azimut** : ligne droite avec l'azimut à la boussole, **en degrés et par rapport au nord magnétique** (la déclinaison est estimée automatiquement, sans réglage), le contre-azimut et la distance. Affichés sur la carte, dans la liste des points et sur la feuille de route imprimée.
- **Placer le point suivant par azimut et distance** (outil Azimut) : le point est posé depuis le dernier, en tenant compte de la déclinaison.
- « Créer des azimuts » à l'accueil ouvre un itinéraire avec l'outil Azimut. Les anciens travaux d'azimuts s'ouvrent comme avant.
- **Plus de bouton Édition / Verrouillé** : l'outil Déplacer le remplace. Un nouvel itinéraire commence directement en pose de points ; un itinéraire rouvert s'ouvre en Déplacer, pour ne pas ajouter de point par mégarde. Échap termine la pose de points.

## 2.0.1 — 23 novembre 2026

### Corrections
- **Boucle à deux points** : avec seulement un départ et une arrivée, l'itinéraire est toujours un aller simple (avant, une boucle refaisait le même chemin au retour et doublait la distance). Une boucle demande au moins trois points.
- **Profil d'altitude** : il n'apparaît qu'une fois au moins deux points placés et le tracé calculé.
- **Boussole** : le cap tient compte de l'inclinaison du téléphone. Tenu incliné ou presque droit (comme pour lire la carte en marchant), il ne dérive plus et ne s'inverse plus. Le lissage réagit plus vite aux vrais demi-tours et filtre mieux les petits tremblements. Sur iPhone, un message propose de recalibrer quand la boussole est imprécise.
- **Aperçu d'impression** : toutes les feuilles (feuilles de route et cartes) s'affichent tout de suite ; les noms des lieux, le profil d'altitude et les fonds de carte se remplissent ensuite sans bloquer les feuilles suivantes.

### Nouveautés
- **Recherche** : on peut coller des coordonnées dans tous les formats (degrés décimaux avec point ou virgule, degrés minutes secondes, lettres N/S/E/O, Lambert 93, UTM) et des liens de carte (Google Maps, OpenStreetMap, Géoportail, « geo: »). Un lien Google Maps sans position cherche le lieu nommé ; un lien court (maps.app.goo.gl) affiche comment obtenir le lien complet.

## 2.0.0 — 20 novembre 2026

### Nouveautés
- **Bouton Retour** : il ne fait plus quitter ScoutMap. Il ferme l'aperçu d'impression, la page Réglages, la fenêtre ou le menu ouvert, sinon il ramène à l'accueil.
- **Notifications** : les messages apparaissent en cartes sous la barre du haut, puis se rétrécissent et rentrent dans le bouton **Notifications**, où on les retrouve (liste « Récentes »). On les fait disparaître en les **glissant** de côté, comme sur un téléphone. Trois niveaux : **« À vérifier »** (point sans chemin, tunnel, passage à vol d'oiseau, route nationale, distance dépassée) reste affiché jusqu'à ce qu'on le ferme ; les simples informations (point posé sur l'église, position trouvée) passent vite. L'avis de nouvelle version y passe aussi, avec son bouton « Mettre à jour ».
- **Boussole** toujours visible avec les boutons de la carte : un appui oriente la carte dans la direction du téléphone (et démarre la position), un autre remet le nord en haut ; l'aiguille montre toujours le nord. Plus de saccade quand le téléphone passe par le nord. Si les capteurs de mouvement sont désactivés pour le site, une notification explique comment les autoriser.
- La barre latérale n'a plus de bouton Itinéraire / Azimuts / Grand jeu : on choisit le type de travail à l'accueil, et le bouton Panneau ramène aux outils.
- **Ma position** : un cône montre la direction du téléphone (boussole, sinon le sens de la marche). Un 2e appui fait tourner la carte dans votre direction, comme l'application Cartes IGN ; le bouton **N** remet le nord en haut. Si la boussole ne répond pas, ScoutMap dit pourquoi (capteurs bloqués, accord refusé sur iPhone, ordinateur sans boussole) ; **Réglages › Général › Tester la boussole** permet de vérifier un appareil.
- **Carroyage kilométrique bleu**, comme sur les cartes IGN papier (1 km, soit des carreaux de 4 cm au 1 : 25 000).
- **Page Réglages** en pleine page, rangée par catégories (Général, Itinéraire, Azimuts, Grand jeu, Impression, Hors connexion, Version et nouveautés), avec les **valeurs par défaut** des nouveaux tracés : boucle ou aller simple, distance maximale, optimisation, allure, options de calcul, unités d'azimut, choix d'impression.
- **Bibliothèque** : sélection de plusieurs tracés (Ctrl + clic, Maj + clic), **Tout sélectionner**, puis Afficher, Imprimer ou Masquer la sélection.
- L'accueil garde la barre latérale.

### Hors connexion et application installée
- La carte IGN **SCAN 25** est enregistrée par défaut, sur la surface d'une feuille **A0 au 1 : 25 000** (21 × 30 km) avec la meilleure netteté. Un cadre doré sur la carte montre la zone ; on déplace la carte pour recadrer. Formats A1 à A4, paysage, ou « ce qui est à l'écran ».
- Pendant le téléchargement : avancement dans une notification, écran maintenu allumé, bouton Arrêter ; « Compléter » reprend là où on s'est arrêté.
- Cartes enregistrées : vérifier qu'une carte est complète, la mettre à jour, la renommer ; rappel au-delà de 6 mois ; contour vert sur la carte quand on est sans réseau.
- Espace de stockage utilisé et protection des cartes contre l'effacement automatique par le navigateur.
- Installation guidée selon l'appareil (iPhone, Android, ordinateur) ; état « prête à démarrer sans réseau ».
- Application installée : raccourcis sur l'icône (nouvel itinéraire, azimuts, grand jeu, cartes hors connexion) et ouverture directe des fichiers GPX, KML et PDF ScoutMap.

### Impression
- **Impression simple** (bouton Imprimer) : le tracé ouvert seulement. **Impression groupée** : depuis la bibliothèque (sélection puis Imprimer), chaque tracé comme un document à part, avec **un onglet par tracé** dans l'aperçu pour le relire, le renommer, l'imprimer ou en faire le PDF seul.
- L'aperçu pose **toutes les feuilles d'un coup** (cadres, textes, tracés), puis les fonds de carte se chargent au fur et à mesure.
- Sur les cartes de l'itinéraire, seuls les **points** sont dessinés par défaut (le tracé reste disponible : « Tracé sur les cartes : Affiché »).
- Marges plus étroites : la carte occupe une plus grande partie de la feuille.
- L'en-tête de chaque feuille se place dans le coin où il ne cache aucune étape.

### Grand jeu plus simple
- Les consignes s'affichent pendant le dessin (comment terminer une zone, poser un élément…) ; Retour arrière retire le dernier point posé.
- L'élément qu'on vient de poser est sélectionné (on règle sa couleur sans toucher aux autres) ; choisir un outil désélectionne l'élément précédent.
- La barre de style du bas ne déborde plus : tous les réglages sont visibles, aussi sur téléphone.
- Sur téléphone, le volet se referme quand on prend un outil pour dessiner sur la carte.
- Un seul nom pour le jeu (celui de l'assistant devient le nom du travail) ; l'assistant n'a plus de bouton en double, et « Annuler » sur un jeu vide ramène à l'accueil.
- Libellés plus clairs : « Plusieurs » (poser plusieurs fois le même élément), « Couleurs des prochains dessins », couleurs sans code hexadécimal.
- Les fonds historiques choisis (Cassini, carte de 1950…) sont conservés à la réouverture.
- Impression d'un jeu : plus de choix propres à l'itinéraire, et l'échelle de la carte générale est indiquée exactement.

### Corrections
- Bibliothèque : un tracé n'apparaît plus en double (ou plus) à l'impression ; une copie ancienne d'un tracé modifié ou renommé n'est plus imprimée en plus.
- Bibliothèque : le nom affiché est celui donné à l'itinéraire, et non « Itinéraire du (date) ».
- Les cartes SCAN 25 enregistrées sont bien servies sans réseau.
- Le numéro de version de l'application est de nouveau lisible dans les réglages.

### Qualité
- Le moteur de l'application (`js/app.js`, 3 700 lignes) est découpé en 18 parties par domaine dans `src/app/`, réassemblées par `npm run build`.
- Tests automatiques (`npm test`) lancés sur chaque pull request et avant chaque mise en ligne : une erreur bloque la publication. Essai complet dans un vrai navigateur : `npm run e2e`.
- Versions publiées sur GitHub automatiquement dès qu'un nouveau numéro arrive sur `main`, avec les notes de ce fichier ; documentation (README, guide d'utilisation, architecture, notes de reprise).
- Une ancienne carte de jeu contenant des données privées a été effacée de l'historique du dépôt.

## 1.x — 2 au 20 novembre 2026

Versions publiées avant la mise en place de cet historique (pull requests n° 1 à 111 du dépôt) : cartes IGN, itinéraire, azimuts, grand jeu (thèmes, calques réalistes, effets), impression multi-feuilles avec feuille de route, hors connexion, SCAN 25 par le serveur ScoutHub, partage en direct chiffré (positions, discussion, appel vocal de groupe), bibliothèque des tracés.
