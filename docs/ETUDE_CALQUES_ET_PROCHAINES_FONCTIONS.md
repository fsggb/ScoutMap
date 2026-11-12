# Étude : calques réalistes, drapeaux, avatars, azimuts partagés (sans rien implanter)

*Document de préparation — rien de ce qui suit n'est encore développé. Objectif : ne rien casser, ne rien alourdir (tout se charge à la demande).*

## 1. Sources possibles de calques, de motifs et de reliefs

### 1.1 Données réelles IGN (licence ouverte) — la piste la plus prometteuse
Au lieu de dessiner une forêt ou une rivière à la main, ScoutMap peut **lire les vraies données** de la zone du jeu et les **redessiner dans le style du thème** :

| Besoin | Couche IGN (Géoplateforme) | Remarque |
|---|---|---|
| Forêts | `BDTOPO_V3:zone_de_vegetation` (WFS), `IGNF_FORETS-ANCIENNES` (WMTS), `LANDCOVER.FORESTINVENTORY.V2` | « Forêts anciennes » colle très bien au Moyen Âge |
| Rivières, lacs, mer | `BDTOPO_V3:cours_d_eau`, `plan_d_eau`, `surface_hydrographique` (WFS) | tracés vectoriels, redessinables en trait « encre » |
| Reliefs | service d'altimétrie (RGE ALTI) : jusqu'à plusieurs milliers de points par requête | permet de poser des symboles de montagne là où le terrain est vraiment haut |
| Lignes de crête, détails | `ligne_orographique`, `detail_orographique` | |
| Habitat, ponts, voies ferrées | `zone_d_habitation`, `troncon_de_voie_ferree`… | villages réels redessinés comme icônes de thème |

Principe d'usage : on trace une zone (rectangle ou polygone), puis « **Remplir avec : forêts / eaux / reliefs réels** » ; plafond de surface pour ne jamais ralentir (zone trop grande → on propose d'agrandir l'échelle).

### 1.2 Symboles et textures déjà existants (à vérifier avant toute réutilisation)
- **game-icons.net** (CC BY 3.0) : déjà utilisé pour les éléments (crédits affichés).
- **Fantasy Map Generator d'Azgaar** (GitHub) : contient des symboles de relief (montagnes, collines, arbres) au trait « carte de fantasy ». Licence annoncée MIT dans sa FAQ, mais d'anciens fichiers mentionnent la GPL : **à vérifier dans le fichier LICENSE du dépôt avant de copier quoi que ce soit** (et vérifier si les icônes ont une licence propre).
- **Kenney « cartography pack »** (OpenGameArt, indiqué CC0) : à ouvrir pour confirmer le contenu réel.
- **Limofeus « hand drawn icon pack »** (itch.io, CC0, 14 icônes, forêts et montagnes) : petit mais libre.
- **Parchemins et papiers** (OpenGameArt, plusieurs CC0) : textures de fond.
- À **éviter** : packs de Wonderdraft/Inkarnate/Dungeondraft (licences restrictives), certains packs « gratuits » non commerciaux.

Conclusion : pour les symboles, la meilleure voie est un mélange **(a) icônes libres vérifiées** + **(b) symboles générés par ScoutMap** (voir §2), ce qui évite toute dépendance de licence et reste léger.

## 2. Calques « réalistes » dans l'esprit de la carte d'exemple (montagnes hachurées, forêts en arbres, côtes hachurées)

Idée : **générer** les symboles à partir des vraies données plutôt que de les coller à la main.

1. **Montagnes et collines hachurées.** On échantillonne l'altitude sur une grille de la zone (une seule requête d'altimétrie), on repère collines (relief modéré) et montagnes (relief fort et pente), on pose des symboles en pointe avec hachures côté ombre (comme l'exemple), taille proportionnelle au relief réel, positions légèrement aléatoires mais stables.
2. **Forêts en bouquets d'arbres.** Dans chaque polygone de végétation, on sème des petits arbres (échantillonnage régulier avec jitter) : la forêt de l'exemple devient automatique.
3. **Rivières et côtes.** Tracé de l'IGN redessiné en trait d'encre, avec hachures parallèles le long des côtes et des lacs.
4. **Transparence réglable** : chaque calque a un curseur 0-100 % ; en bas, la vraie carte reste visible (réalisme) ou disparaît (mode « papier blanc » comme l'exemple : fond blanc/parchemin, trait noir).
5. **Style par thème** : encre brune (Moyen Âge), bleu nuit (pirates), sépia (Résistance), etc.

Intérêts : réaliste (colle au terrain réel du camp), léger (quelques centaines de petits tracés SVG), imprimable, et sans licence tierce.

## 3. Textures de zones (remplissage par motif)
- Déjà en place : forêt, eau, marais, désert, prairie, montagnes, champs (motifs répétés, couleur et transparence réglables).
- À prévoir : plus de motifs (neige, falaise, ville, culture en rangs, lave…), motifs qui **suivent le zoom** (option), texture au choix dans l'onglet Style d'une zone quelconque (« Remplissage : couleur / motif »), et bibliothèque propre à chaque thème.

## 4. Drapeaux
- Élément « drapeau » personnalisable : couleur, emblème (une icône du thème), nom d'équipe ; légende « Équipe rouge / bleue… ».
- Usage jeu : bases, postes à capturer, objectif ; option « drapeau capturé » (changement de couleur) à décider avec les chefs.

## 5. Avatars des chefs
- À l'arrivée, chaque chef choisit une icône de la bibliothèque du thème (château, chevalier, drakkar…) et une couleur ; elle sert de **marqueur de position** et d'**image dans la discussion**.
- Donnée minime (identifiant d'icône + couleur) transmise chiffrée comme le reste ; aucune image à stocker.

## 6. Azimuts : partage de position et de la carte
- Réutiliser le système du jeu en direct pour **les azimuts** : le créateur partage son parcours (points, azimuts, distances), les autres chefs voient la carte et les positions ; chaque chef placé à un poste peut se nommer « Poste 3 ».
- Aucun nouvel élément à construire côté carte : on généralise l'envoi du jeu (aujourd'hui limité au Grand jeu) à l'application en cours.

## 7. Garde-fous (rien qui alourdisse)
- Tout chargement **à la demande** (comme `themes.js`) ; idée : découper en un fichier par thème (-60 % de poids initial).
- Plafonds : surface maximale pour les remplissages automatiques, nombre maximal de symboles.
- Mise en cache locale des données IGN déjà lues.
- Chaque fonction derrière un bouton : si elle n'est pas utilisée, elle ne coûte rien.

## 8. Ordre de réalisation proposé
1. Avatars des chefs + drapeaux (petit, sans risque).
2. Partage des azimuts (généralisation d'un système existant).
3. Textures : choix du motif pour toute zone + nouveaux motifs.
4. Remplissage automatique forêts / eaux (données IGN) dans le style du thème.
5. Reliefs hachurés générés à partir de l'altimétrie.
6. Découpage de `themes.js` par thème (allègement).
