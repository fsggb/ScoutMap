# Jeu en direct (positions, chat, QR code)

Un chef crée un jeu en direct depuis **Grand jeu ▸ Partager en direct…** : un QR code (et un lien) est affiché. Les autres chefs le scannent, saisissent leur prénom et voient le jeu en lecture seule, les positions des autres chefs en temps réel et le chat. Seul le créateur peut modifier le jeu ; ses modifications sont envoyées toutes les 4 secondes.

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
