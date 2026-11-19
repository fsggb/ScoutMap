# Partage en direct (itinéraire, azimuts, grand jeu)

Le partage est un **onglet latéral à part entière** (bouton « Partage » dans la barre de gauche ; sur téléphone, feuille en bas de l'écran). Il n'ouvre **aucune fenêtre modale** : le prénom, l'invitation (QR code et lien) et la confirmation de fin s'affichent dans le volet lui-même. Les personnes invitées arrivent sur la même page, avec le volet « Partage » comme seul onglet.

Présentation façon messagerie : en-tête vert (nom du partage, noms des personnes connectées ou « Marie écrit… », un bouton d'appel, un bouton « Inviter »), onglets soulignés **Discussion · Personnes · Réglages**. Le contenu de la discussion (bulles, coches, photos, vocaux…) est décrit plus bas (`js/chat.js`).

## Le volet
- **Discussion** (onglet d'ouverture) : voir « Discussion façon WhatsApp » plus bas ; pastille sur l'onglet quand un message arrive. Le bouton d'appel et le titre sont ceux de l'en-tête du volet (pas de second en-tête dans la discussion).
- **Personnes** : qui est connecté (pastille verte = en ligne, sinon « parti il y a x min »), qui partage sa position. Un interrupteur « Montrer ma position sur la carte » (activé par défaut). Un clic sur une personne centre la carte sur elle ; « Voir tout le monde sur la carte ».
- **Réglages** : prénom, droits (lecture seule, co-administrateur, chef), lien co-administrateur (pour le chef), état technique, quitter ou terminer le partage (confirmation dans le volet).
- Une **pastille verte** sur le bouton « Partage » indique le nombre de personnes connectées ; une pastille rouge signale les messages non lus.
- Le bouton **Inviter** (en-tête) ouvre la vue d'invitation : QR code, lien à copier, « Envoyer par WhatsApp », et « Autres applications… » quand le navigateur sait partager.

Les avatars ont été supprimés : chaque personne est un rond de couleur avec l'initiale de son prénom.

## Principe technique
- Service : le serveur **Cloudflare** de ScoutHub (`wss://scouthub.fsggb.workers.dev/direct/<identifiant>`, code dans le dépôt ScoutHub, dossier `cloudflare/`, classe `Partage`). Un objet par partage, connexions WebSocket. **Firebase n'est plus utilisé nulle part.**
- Tout ce qui est envoyé (carte, positions, présence, messages) est **chiffré dans le navigateur** (AES-GCM) avec une clé qui n'est que dans le lien (`#k=…`, jamais envoyée au serveur). Identifiant du partage : 16 caractères aléatoires.
- Présence : chaque appareil envoie un signe de vie chiffré toutes les 10 s (avec sa position s'il la partage). « En ligne » = signe de vie de moins de 45 s ; une personne absente depuis plus de 15 min disparaît de la liste. Quitter envoie un départ immédiat.
- Droits vérifiés par le serveur : seul le créateur (secret gardé sur son appareil) ou un co-administrateur (jeton du lien administrateur) peut changer la carte ; seul le créateur peut créer ou révoquer le lien co-administrateur et terminer le partage. Les autres reçoivent la carte en lecture seule ; les modifications du chef sont envoyées toutes les 4 s.
- « Terminer le partage » supprime tout ; un partage inactif est effacé au bout de 3 jours. Coupure réseau : reconnexion automatique. Sur téléphone, le navigateur coupe la géolocalisation quand l'écran est verrouillé.
- Anciens liens `?salle=` (ancien service Firebase) : ils n'existent plus ; ScoutMap l'indique et demande un nouveau QR code.

## Appel vocal de groupe
Dans le volet Partage, le bouton de téléphone de l'en-tête appelle les autres personnes connectées, comme une conférence téléphonique : elles voient une barre « Rejoindre / Plus tard » dans le volet (ou une bannière en haut de l'écran quand le volet est fermé : jamais les deux à la fois) (avec une sonnerie et une vibration si le navigateur les permet) et seules celles qui veulent répondre rejoignent. Les personnes dans l'appel s'entendent toutes en même temps (duplex, annulation d'écho du navigateur), chacune peut couper son micro, et l'appel s'arrête quand la dernière raccroche. Audio seul, 8 personnes au plus.
- **Technique** (`js/appel.js`) : WebRTC en maillage (chaque appareil parle directement aux autres). Les messages de mise en relation (offres, réponses, candidats) circulent sur le canal chiffré du partage (clé du lien) : le serveur ne lit rien. Le serveur de partage (`/direct/{id}`, Durable Object) relaie ces messages (`t: "sig"`) et remet les identifiants du relais TURN de Cloudflare Realtime (`t: "turn"`), qui ne servent que si deux appareils ne peuvent pas se joindre directement. Sans TURN, STUN seul.
- **Limites** : sur téléphone, le navigateur coupe souvent le micro quand l'écran se verrouille ou que la page passe en arrière-plan (surtout iPhone) : l'appel est prévu écran allumé (la page demande de garder l'écran allumé quand c'est possible). La sonnerie ne marche que si ScoutMap est ouvert (pas de notification push). Une personne qui rejoint le partage pendant un appel ne le voit pas avant le prochain signe de vie des participants (quelques secondes).
- **Partage sans carte** : on peut lancer le partage même si la carte est vide (simple avertissement) ; ce que le chef pose ensuite apparaît chez les autres.

## Fiabilité (v. du 19/11)
- **Reconnexion sans fin** : si la connexion est coupée (veille du téléphone, changement de réseau), ScoutMap réessaie toutes les 1, 2, 4… jusqu'à 20 s, sans jamais abandonner ; au retour sur la page ou du réseau, il vérifie tout de suite. Un bandeau rouge « Connexion perdue » avec un bouton « Réessayer » s'affiche dans le panneau.
- **Connexion à moitié morte** : chaque appareil reçoit en écho son propre signe de vie toutes les 10 s ; sans rien reçu depuis 35 s, la connexion est refaite.
- **Messages** : affichés tout de suite avec leur état (« envoi… », « en attente de connexion… », « non envoyé · Réessayer ») ; renvoyés automatiquement après une reconnexion, sans doublon (identifiant dans le message chiffré).
- **Carte** : le chef envoie toujours le type de travail qu'il a sous les yeux (itinéraire, azimuts ou jeu), même s'il en change après avoir lancé le partage ; une ligne indique « Carte partagée : envoyée il y a x s » (côté invité : « Carte reçue il y a x s »).
- **Positions** : distance affichée dans la liste (« à 340 m »), « hors de l'écran » quand la personne n'est pas dans la vue (touchez son nom pour la voir) ; position envoyée au plus toutes les 4 s.
- **Version du site** : chaque signe de vie porte la version de ScoutMap ; la liste signale une personne qui utilise une autre version ; un bandeau « Nouvelle version disponible » propose la mise à jour.
- **État technique** : Réglages > « État technique (en cas de problème) » (version, connexion, délai, dernières erreurs…), avec un bouton pour le copier.
- **Serveur (cloudflare/src/index.js, classe Partage)** : positions gardées dans les connexions (aucune écriture de stockage), messages et carte diffusés même si le stockage est plein, `ping`/`pong`, erreurs renvoyées à l'expéditeur, départ diffusé immédiatement.

## Discussion façon WhatsApp (js/chat.js)
Même apparence et mêmes gestes qu'une messagerie de groupe connue, pour que personne ne soit perdu :
- **Bulles** vertes (moi) et blanches (les autres) avec queue, nom coloré de l'expéditeur, heure, séparateurs de jours (« Aujourd'hui », « Hier »), séparateur « N messages non lus », bouton « ↓ » avec compteur, fond beige à motifs, bandeau « messages chiffrés ». Mise en forme `*gras*`, `_italique_`, `~barré~`, `` `code` ``, liens cliquables, gros émojis seuls.
- **Coches** : ⏱ en attente de connexion, ✓ envoyé, ✓✓ grises reçu par tout le monde, ✓✓ bleues lu par tout le monde ; « Infos » d'un message = qui l'a lu, qui l'a reçu, qui ne l'a pas encore reçu. Le « reçu » et le « lu » voyagent dans le signe de vie chiffré de chaque personne (champs `dv` et `rd` : dernier message reçu / lu).
- **« Léa écrit… »** / « enregistre un message vocal… » dans l'en-tête (champ `ty` du signe de vie, valable 7 s).
- **Joindre** (trombone) : Photos (galerie), Appareil photo (en direct, caméra avant/arrière, avec repli sur l'appareil photo du téléphone), Document (650 Ko au plus), Position. Aperçu avec légende avant l'envoi, visionneuse plein écran.
- **Messages vocaux** : le micro de la barre de saisie (comme sur WhatsApp, micro quand le champ est vide) ; 2 minutes au plus ; lecture avec barre de progression et vitesse ×1,5 / ×2.
- **Sur un message** (flèche ⌄, clic droit ou appui long) : réagir (👍 ❤️ 😂 😮 😢 🙏), répondre (citation), copier, infos, **modifier** (15 min, mention « modifié »), supprimer **pour moi** ou **pour tous** (« Ce message a été supprimé »).
- Bouton téléphone de l'en-tête : lance l'appel vocal de groupe.
- Fichiers : photos réduites (1280 px, JPEG) et sons sont **chiffrés dans le navigateur** (clé du lien) puis déposés sur le serveur du partage (messages `media`, lecture `getm`, 60 fichiers au plus, supprimés avec le partage). Un serveur qui n'a pas la mise à jour répond sans accusé : le message passe en « non envoyé · Réessayer » avec une explication.
- Modifications, suppressions et réactions sont des messages chiffrés comme les autres (champs `ev`, `tg`) ; l'historique du serveur garde 250 messages.

## Aucune fenêtre modale (v. du 19/11)
Prénom, invitation, confirmation de fin **et** les écrans de la discussion (infos du message, suppression, aperçu et légende d'une photo, appareil photo, visionneuse) sont des **feuilles à l'intérieur du volet « Partage »** : aucun `dialog` du navigateur, aucune boîte `confirm`. Échap ou « Fermer » les ferme ; quitter l'onglet Discussion ou fermer le volet les ferme aussi (et coupe l'appareil photo). Les photos, vocaux et documents passent par le Worker de ScoutHub (messages `media` / `getm`, 650 Ko au plus, 60 fichiers par partage).

## Position en direct fiable (v. du 19/11)
- **Une seule localisation filtrée** (`js/position.js`, `SMGeo`) pour le bouton « Ma position » et pour le partage : avant, deux suivis GPS séparés et sans filtre faisaient sauter le repère de plusieurs kilomètres (Wi-Fi/IP d'un ordinateur) et recentrer la carte à chaque point.
- Le filtre (Kalman pondéré par la précision annoncée) ignore un point très imprécis (> 300 m) tant qu'on en a un bon, ne bouge pas pour un point à l'intérieur de l'incertitude, jette un saut improbable (plus vite que 90 km/h) sauf s'il est confirmé par le point suivant (4 points groupés pour un point « réseau »). Un déplacement réel (marche, voiture) est suivi avec 2 à 50 m de retard.
- Le bouton « Ma position » ne recentre la carte que si le point approche du bord de l'écran. Position approximative (réseau) : message explicite, cercle de précision visible.
- Côté réception : une présence plus ancienne ne remplace jamais une plus récente (le déchiffrement est asynchrone), une présence sans point garde le dernier connu (sauf position masquée), une reconnexion ne fait plus clignoter ni disparaître le repère d'une personne, le décalage d'horloge est recalculé à chaque ping. Les battements (toutes les 10 s) viennent d'un Worker, non ralenti quand l'onglet est en arrière-plan.
- Test : `js/position.js` face à un bruit de ±2 km (PC) et à des parasites (téléphone) ; l'ancienne version échouait (sauts de 3 km, carte déplacée 45 fois en 45 s).

## Reçu et lu = pour TOUTES les personnes
La liste des participants est gardée sur l'appareil (jusqu'à 90 min d'absence). **✓✓ gris « reçu »** seulement quand chacun a reçu le message ; **✓✓ bleus « lu »** seulement quand chacun l'a lu (discussion affichée). Une personne dont le téléphone est coupé garde le message à ✓ ; celle qui quitte le partage (Réglages) en sort. « Infos » du message liste qui l'a lu, reçu, pas encore reçu.

## Notifications et vibrations (`js/notif.js`)
- **Message** d'une autre personne : courte vibration si la page est visible mais la discussion fermée ; notification du système avec le nom et le texte si la page est en arrière-plan ; compteur `(n)` dans le titre de l'onglet.
- **Appel entrant** : vibrations répétées comme un vrai téléphone (3 secousses, pause, on recommence) et bip, jusqu'à « Rejoindre », « Plus tard » ou 50 s (alors « Appel manqué ») ; en arrière-plan, une notification renouvelée à chaque tour. L'appelant renouvelle la sonnerie toutes les 5 s tant que personne n'a rejoint.
- Réglages du partage : vibrer oui/non, notifications du système (bouton, jamais automatique), test. Un bandeau propose une fois d'activer les notifications.
- Limites : la vibration n'existe pas sur iPhone ; le navigateur la coupe quand la page est cachée (la notification du système vibre alors elle-même, sur Android) ; sans serveur de notifications push, une page fermée ne peut pas être prévenue.

## Menu d'un message
Le bouton d'options a sa place dans la bulle (le texte passe à côté, il ne recouvre plus rien) ; sur écran tactile : appui long ; clic droit sur ordinateur. Le menu s'ouvre sous la bulle (au-dessus s'il n'y a pas la place), jamais par-dessus.

