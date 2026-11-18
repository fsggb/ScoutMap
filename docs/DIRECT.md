# Partage en direct (itinéraire, azimuts, grand jeu)

Un seul bouton : **Partager** (colonne de boutons à droite de la carte). Un QR code et un lien s'affichent : les personnes invitées le scannent, entrent leur prénom (une seule fois) et apparaissent aussitôt sur la carte.

## Le panneau (3 onglets)
- **Personnes** : qui est connecté (en ligne, parti il y a x min), qui partage sa position. Un interrupteur « Montrer ma position sur la carte » (activé par défaut). Un clic sur une personne centre la carte sur elle ; « Voir tout le monde sur la carte » cadre tout le groupe. Chacun se voit sur la carte, avec son prénom, dès que sa position est connue.
- **Discussion** : messages de tout le monde, pastille rouge quand un message arrive.
- **Réglages** : prénom, droits (lecture seule, co-administrateur, chef), lien co-administrateur (pour le chef), quitter ou terminer le partage.
- Une **pastille verte** sur le bouton « Partage » (même côté que les alertes) indique le nombre de personnes connectées ; une pastille rouge à gauche signale les messages non lus.
- Le bouton **Inviter** (en haut du panneau) rouvre le QR code à tout moment.

Les avatars ont été supprimés : chaque personne est un rond de couleur avec l'initiale de son prénom.

## Principe technique
- Service : le serveur **Cloudflare** de ScoutHub (`wss://scouthub.fsggb.workers.dev/direct/<identifiant>`, code dans le dépôt ScoutHub, dossier `cloudflare/`, classe `Partage`). Un objet par partage, connexions WebSocket. **Firebase n'est plus utilisé nulle part.**
- Tout ce qui est envoyé (carte, positions, présence, messages) est **chiffré dans le navigateur** (AES-GCM) avec une clé qui n'est que dans le lien (`#k=…`, jamais envoyée au serveur). Identifiant du partage : 16 caractères aléatoires.
- Présence : chaque appareil envoie un signe de vie chiffré toutes les 10 s (avec sa position s'il la partage). « En ligne » = signe de vie de moins de 45 s ; une personne absente depuis plus de 15 min disparaît de la liste. Quitter envoie un départ immédiat.
- Droits vérifiés par le serveur : seul le créateur (secret gardé sur son appareil) ou un co-administrateur (jeton du lien administrateur) peut changer la carte ; seul le créateur peut créer ou révoquer le lien co-administrateur et terminer le partage. Les autres reçoivent la carte en lecture seule ; les modifications du chef sont envoyées toutes les 4 s.
- « Terminer le partage » supprime tout ; un partage inactif est effacé au bout de 3 jours. Coupure réseau : reconnexion automatique. Sur téléphone, le navigateur coupe la géolocalisation quand l'écran est verrouillé.
- Anciens liens `?salle=` (ancien service Firebase) : ils n'existent plus ; ScoutMap l'indique et demande un nouveau QR code.

## Appel vocal de groupe
Dans le panneau Partage, « Lancer un appel vocal » appelle les autres personnes connectées, comme une conférence téléphonique : elles voient une bannière « Rejoindre / Plus tard » (avec une sonnerie et une vibration si le navigateur les permet) et seules celles qui veulent répondre rejoignent. Les personnes dans l'appel s'entendent toutes en même temps (duplex, annulation d'écho du navigateur), chacune peut couper son micro, et l'appel s'arrête quand la dernière raccroche. Audio seul, 8 personnes au plus.
- **Technique** (`js/appel.js`) : WebRTC en maillage (chaque appareil parle directement aux autres). Les messages de mise en relation (offres, réponses, candidats) circulent sur le canal chiffré du partage (clé du lien) : le serveur ne lit rien. Le serveur de partage (`/direct/{id}`, Durable Object) relaie ces messages (`t: "sig"`) et remet les identifiants du relais TURN de Cloudflare Realtime (`t: "turn"`), qui ne servent que si deux appareils ne peuvent pas se joindre directement. Sans TURN, STUN seul.
- **Limites** : sur téléphone, le navigateur coupe souvent le micro quand l'écran se verrouille ou que la page passe en arrière-plan (surtout iPhone) : l'appel est prévu écran allumé (la page demande de garder l'écran allumé quand c'est possible). La sonnerie ne marche que si ScoutMap est ouvert (pas de notification push). Une personne qui rejoint le partage pendant un appel ne le voit pas avant le prochain signe de vie des participants (quelques secondes).
- **Partage sans carte** : on peut lancer le partage même si la carte est vide (simple avertissement) ; ce que le chef pose ensuite apparaît chez les autres.
