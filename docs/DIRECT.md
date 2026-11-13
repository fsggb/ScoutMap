# Jeu en direct (positions, chat, QR code)

Un chef crée un jeu en direct depuis **Grand jeu ▸ Partager en direct…** : un QR code (et un lien) est affiché. Les autres chefs le scannent, saisissent leur prénom et voient le jeu en lecture seule, les positions des autres chefs en temps réel et le chat. Le créateur peut modifier le jeu ; ses modifications sont envoyées toutes les 4 secondes. Il peut aussi envoyer un **lien administrateur** (bouton Inviter) : l’autre chef devient co-administrateur et modifie la carte comme lui. « Révoquer » invalide les liens administrateur.

## Principe
- Base **Firebase Realtime Database** (Google), authentification **anonyme**. Config publique dans `js/firebase-config.js` (vide = fonction désactivée).
- Tout ce qui est écrit (jeu, positions, messages) est **chiffré dans le navigateur** (AES-GCM) avec une clé qui n'est que dans le lien (`#k=…`, jamais envoyée au serveur). Identifiant de salle : 16 caractères aléatoires.
- Règles d'accès : `docs/firebase-rules.json` (à coller dans Firebase ▸ Realtime Database ▸ Règles).
- Les positions sont publiées si la case « Je partage ma position » est cochée (toutes les ~3 s, et au moins toutes les 12 s) ; décocher efface la position du jeu en direct. « Terminer le jeu en direct » supprime tout.
- Limite : sur téléphone, le navigateur coupe la géolocalisation quand l'écran est verrouillé.

## Mise en place Firebase
1. console.firebase.google.com : créer un projet, ajouter une application web (`</>`) et copier `firebaseConfig`.
2. Authentication ▸ Méthode de connexion ▸ **Anonyme** : activer.
3. Realtime Database ▸ Créer (Belgique, mode verrouillé), puis **Règles** : coller `docs/firebase-rules.json`.
4. Renseigner `window.SM_FIREBASE = { … }` dans `js/firebase-config.js` (avec `databaseURL`).

## Azimuts et avatars
- **Azimuts :** le bouton « Partager en direct… » existe aussi dans l'application Azimuts : les autres chefs voient le parcours (points, azimuts, distances, profil) et les positions ; chaque chef peut se placer à un poste.
- **Avatars :** dans l'onglet « Chefs », « Mon avatar » permet de choisir une icône (celles du thème du jeu) et une couleur ; elles servent de marqueur de position et d'image dans la discussion.

## Liens administrateur (règles à mettre à jour)
Les règles Firebase ont changé : recoller `docs/firebase-rules.json` dans Realtime Database ▸ Règles, puis Publier. Le lien administrateur contient un jeton secret (`&a=…`) ; il est enregistré dans `admtok` (non lisible par les autres) et le co-administrateur s’inscrit dans `admins/<son identifiant>`.
