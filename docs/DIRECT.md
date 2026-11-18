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
