# Partage en direct (itinéraire, azimuts, grand jeu : positions, discussion, QR code)

Un chef partage ce qu'il a ouvert (**itinéraire**, **azimuts** ou **grand jeu**) avec le bouton **Partager en direct** : un QR code (et un lien) est affiché. Les autres chefs le scannent, saisissent leur prénom et voient la carte en lecture seule, les positions des autres chefs en temps réel et la discussion. Le créateur peut modifier la carte ; ses modifications sont envoyées toutes les 4 secondes. Il peut aussi envoyer un **lien administrateur** (bouton Inviter) : l’autre chef devient co-administrateur et modifie la carte comme lui. « Révoquer » invalide les liens administrateur.

## Principe
- Service : le serveur **Cloudflare** de ScoutHub (`wss://scouthub.fsggb.workers.dev/direct/<identifiant>`, code dans le dépôt ScoutHub, dossier `cloudflare/`, classe `Partage`). Un objet par partage, connexions WebSocket ; rien à configurer dans ScoutMap.
- Tout ce qui est envoyé (carte, positions, messages) est **chiffré dans le navigateur** (AES-GCM) avec une clé qui n'est que dans le lien (`#k=…`, jamais envoyée au serveur). Identifiant du partage : 16 caractères aléatoires.
- Droits vérifiés par le serveur : seul le créateur (secret gardé sur son appareil) ou un co-administrateur (jeton du lien administrateur) peut changer la carte ; seul le créateur peut créer ou révoquer les liens administrateur et terminer le partage.
- Les positions sont publiées si la case « Je partage ma position » est cochée (toutes les ~3 s, et au moins toutes les 12 s) ; décocher efface la position. « Terminer le partage » supprime tout ; un partage inactif est effacé au bout de 3 jours.
- Coupure réseau : reconnexion automatique. Sur téléphone, le navigateur coupe la géolocalisation quand l'écran est verrouillé.
- Anciens liens `?salle=` : toujours acceptés (mais les partages créés avec l'ancien service Firebase n'existent plus).
