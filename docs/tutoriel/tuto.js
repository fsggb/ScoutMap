// Tutoriel ScoutMap v4 : chaque phrase est lue au moment même où l'action correspondante est jouée à l'écran.
const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const DIR = '/tmp/claude-0/-home-user/53c51b4b-3207-568d-98c6-f0c8e2ce75ec/scratchpad/voice/';
const URL = process.env.SM_URL || 'https://fsggb.github.io/ScoutMap/';
const VOICE = process.env.VOICE || 'fr_FR-tom-medium';

let T0, p;
const wait = ms => p.waitForTimeout(ms);
const move = async (x, y, steps = 28) => { await p.mouse.move(x, y, { steps }); };
const moveTo = async sel => { const el = await p.$(sel); const b = await el.boundingBox(); await move(b.x + b.width / 2, b.y + b.height / 2); return b; };
const clickSel = async sel => { await moveTo(sel); await wait(250); await p.mouse.down(); await p.mouse.up(); await wait(250); };
const centerPx = async () => p.evaluate(() => { const rc = window.SM.map.getContainer().getBoundingClientRect(); return [rc.left + rc.width / 2, rc.top + Math.min(rc.height, 420) / 2]; });
const clickOff = async (dx, dy) => { const [cx, cy] = await centerPx(); await move(cx + dx, cy + dy); await wait(200); await p.mouse.down(); await p.mouse.up(); };
const routeReady = async () => { for (let k = 0; k < 90; k++) { if (await p.evaluate(() => !!window.SM.RT.route)) return; await wait(1000); } };
const printReady = async () => { await p.waitForFunction(() => !document.querySelector('#doc-print').disabled, { timeout: 300000 }).catch(() => {}); };

const NOW = Date.now();
const mkRoute = (name, pts, loop) => ({ app: 'ScoutMap', v: 1, name, rail: 'route', base: 'otm', ov: { contour: false, shade: false, slope: false, cadastre: false, hiking: true, lidar: false },
  route: { id: 1, name: 'Itinéraire 1', color: '#000761', opt: 'fastest', loop, freeOrder: true, maxOn: false, maxKm: 10, avoidMotorway: true, noBack: true, snapChurch: true, flagNat: true, wps: pts.map(q => ({ lat: q[0], lon: q[1] })) },
  az: { pts: [] }, game: { shapes: [] }, tracks: [] });
const SEED = [
  { id: 11, name: 'Raid des Pyrénées – Patrouille des Loups', kinds: ['Itinéraire 58 km'], updated: NOW - 3600e3, data: mkRoute('Raid des Pyrénées – Patrouille des Loups', [[43.0307, 0.5705], [43.1, 0.65], [43.15, 0.5], [43.05, 0.4], [42.95, 0.45], [42.93, 0.6]], true) },
  { id: 12, name: 'Week-end de camp – boucle des lacs', kinds: ['Itinéraire 24 km'], updated: NOW - 86400e3 * 2, data: mkRoute('Week-end de camp – boucle des lacs', [[45.9, 6.12], [45.93, 6.2], [45.88, 6.25]], true) },
  { id: 13, name: 'Course d’orientation – camp d’été', kinds: ['Azimuts'], updated: NOW - 86400e3 * 5, data: { app: 'ScoutMap', v: 1, name: 'Course d’orientation – camp d’été', rail: 'az', base: 'otm', route: { wps: [] }, az: { pts: [[45.2, 5.7], [45.21, 5.72], [45.215, 5.75]], unit: 'deg', ref: 'true', decl: 0 }, game: { shapes: [] }, tracks: [] } },
  { id: 14, name: 'Grand jeu – chasse au trésor', kinds: ['Grand jeu'], updated: NOW - 86400e3 * 9, data: { app: 'ScoutMap', v: 1, name: 'Grand jeu – chasse au trésor', rail: 'game', base: 'otm', route: { wps: [] }, az: { pts: [] }, tracks: [],
    game: { shapes: [{ id: 5, kind: 'polygon', pts: [[45.2, 5.7], [45.21, 5.74], [45.19, 5.75]], fill: '#c0262d', alpha: 0.35, stroke: '#c0262d', linked: true, weight: 3, dash: false, fontColor: '#12142b', size: 18, text: '' }] } } }
];
const T = 'fr_FR-siwis-medium', F = T, U = T;
let clipEnd = 0, CUTS = [];
const cutWait = async fn => {
  const rest = clipEnd - Date.now(); if (rest > 0) await wait(rest + 200);
  const t1 = Date.now(); await fn(); const t2 = Date.now();
  if (t2 - t1 > 3000) CUTS.push([(t1 - T0) / 1000 + 0.7, (t2 - T0) / 1000 - 0.7]);
};

// Chaque étape : [voix, texte, action, partie]. Parties : 1 prise en main, 2 itinéraire, 3 enregistrer et imprimer, 4 azimuts, 5 grand jeu, 6 pour aller plus loin.
const CARDS = ['', 'Prise en main', 'L’itinéraire', 'Enregistrer et imprimer', 'Les azimuts', 'Le grand jeu', 'Pour aller plus loin'];
const STEPS = [
  [T, 'Bonjour, et bienvenue dans ScoutMap, l’outil de la Fédération des Scouts et Guides Godefroy de Bouillon, pensé pour préparer les raids.', async () => { await moveTo('.brand'); await wait(1500); }, 1],
  [T, 'Fini les cartes floues à l’impression, les calculs d’itinéraire peu intuitifs et les interfaces compliquées : tout est réuni au même endroit.', async () => { await moveTo('#home-open'); await wait(1200); await moveTo('.home-card[data-start=route]'); await wait(1200); await moveTo('.home-card[data-start=game]'); await wait(1000); }, 1],
  [T, 'Depuis l’accueil, vous pouvez ouvrir un fichier, créer un itinéraire, des azimuts ou un grand jeu, ou reprendre un de vos travaux, enregistrés automatiquement dans ce navigateur.', async () => { await moveTo('#proj-rows li:nth-child(1)'); await wait(1500); await moveTo('#proj-rows li:nth-child(2) [data-a=dl]'); await wait(1200); await moveTo('.proj-note'); await wait(1200); }, 1],
  [T, 'Chaque application a son propre tutoriel vidéo, et il y a aussi un tutoriel global : ils sont accessibles ici, sous les cartes.', async () => { for (const k of ['global', 'route', 'az', 'game']) { await moveTo('.tuto-chip[data-tuto=' + k + ']'); await wait(800); } }, 1],
  [T, 'Commençons par un nouvel itinéraire.', async () => { await clickSel('.home-card[data-start=route]'); await wait(800); }, 2],
  [T, 'Cherchez un lieu dans la barre de recherche : ici, Saint-Bertrand-de-Comminges.', async () => {
    await clickSel('#q'); await p.keyboard.type('Saint-Bertrand-de-Comminges', { delay: 70 });
    await p.waitForSelector('#suggest li', { timeout: 15000 }); await wait(500);
    await clickSel('#suggest li'); await wait(2000);
    await p.evaluate(() => window.SM.map.setView([43.0306, 0.5722], 11, { animate: false })); await wait(1000);
  }, 2],
  [T, 'Le bouton Édition, avec un stylo, est activé : un clic sur la carte pose un point. Le cadenas verrouille la carte, pour la déplacer sans rien poser.', async () => {
    const sel = '#panel [data-pane=route] [data-edit]';
    await moveTo(sel); await wait(1200); await clickSel(sel); await wait(1600); await clickSel(sel); await wait(800);
  }, 2],
  [T, 'Cliquez sur la carte pour poser le départ, puis les étapes. Pour une grande boucle, gardez des points assez éloignés les uns des autres.', async () => {
    for (const [dx, dy] of [[-30, 10], [110, -100], [210, -10], [170, 100], [20, 125], [-110, 70]]) { await clickOff(dx, dy); await wait(1500); }
  }, 2],
  [T, 'La boucle se calcule automatiquement, avec la distance, le dénivelé et le profil d’altitude.', async () => { await cutWait(routeReady); await wait(1500); await moveTo('#dock'); await wait(1200); }, 2],
  [T, 'Tout est automatique : chaque point se place sur le village ou le chemin le plus proche, l’ordre des points est optimisé, et la boucle est calculée sans repasser deux fois au même endroit. Un clic droit sur un point permet de le remettre là où vous avez cliqué, ou de le supprimer.', async () => {
    const pt = await p.evaluate(() => { const w = window.SM.S.route.wps[2], q = window.SM.map.latLngToContainerPoint([w.lat, w.lon]), r = window.SM.map.getContainer().getBoundingClientRect(); return [r.left + q.x, r.top + q.y]; });
    await move(pt[0], pt[1]); await wait(300); await p.mouse.click(pt[0], pt[1], { button: 'right' }); await wait(5200); await p.keyboard.press('Escape'); await wait(300);
  }, 2],
  [T, 'Vous pouvez aussi supprimer un point avec la touche Suppr, inverser le sens du parcours, ou réduire la liste des points avec la petite flèche.', async () => {
    await moveTo('#wps li:nth-child(2)'); await wait(900); await moveTo('#route-reverse'); await wait(1300);
    await clickSel('#wps-toggle'); await wait(1400); await clickSel('#wps-toggle'); await wait(500);
  }, 2],
  [T, 'En bas à gauche, le bouton Alertes rassemble les informations importantes, comme un passage en double ou une distance dépassée. Le bouton Réglages ouvre les paramètres de l’itinéraire.', async () => {
    await clickSel('#rail-notif'); await wait(3000); await clickSel('#rail-settings'); await wait(3000); await clickSel('#rail-mode'); await wait(500);
  }, 2],
  [T, 'Vous pouvez aussi fixer une distance maximale. Elle n’est pas bloquante : elle sert seulement d’indication, et le tracé passe en rouge dès qu’on la dépasse.', async () => {
    await clickSel('label.switch:has(#max-on)'); await wait(500);
    await moveTo('#max-km'); await p.click('#max-km', { clickCount: 3 }); await p.keyboard.type('30'); await wait(1800);
  }, 2],
  [T, 'Ici, la boucle dépasse la limite : à vous de décider de la garder, ou de la raccourcir.', async () => { await moveTo('#gauge'); await wait(2200); await clickSel('label.switch:has(#max-on)'); await wait(300); }, 2],
  [T, 'Le bouton en bas à gauche de la carte change le fond, et permet d’ajouter des informations comme les courbes de niveau. Il affiche aussi la date de mise à jour des données.', async () => {
    await clickSel('#layer-btn'); await wait(1000);
    await clickSel('#pop-tabs [data-tab=info]'); await wait(800);
    await clickSel('#ov-grid [data-ov=contour]'); await wait(2000);
    await clickSel('#pop-tabs [data-tab=base]'); await wait(800);
    await move(900, 250); await p.mouse.down(); await p.mouse.up(); await wait(300);
  }, 2],
  [T, 'Pour garder votre travail, ouvrez le menu Fichier. Enregistrer crée une page web, qui se rouvre dans ScoutMap et que vous pouvez partager. Exporter crée une trace GPX, pour les autres applications, mais elle ne peut pas être modifiée.', async () => {
    await clickSel('.menu-btn[data-menu=file]'); await wait(800);
    for (const t of ['Enregistrer (page web', 'Exporter la trace']) { const it = await p.$('.mi:has-text("' + t + '")'); if (it) { const b = await it.boundingBox(); await move(b.x + b.width / 2, b.y + b.height / 2, 16); await wait(4200); } }
    await p.keyboard.press('Escape'); await p.mouse.click(900, 300); await wait(300);
  }, 3],
  [T, 'Bon à savoir : l’impression porte uniquement sur ce que vous voyez dans l’application affichée. Ici, c’est l’itinéraire qui sera imprimé.', async () => { await moveTo('#rail-mode'); await wait(1800); }, 3],
  [T, 'Pour imprimer, cliquez sur le bouton Imprimer, puis PDF, en haut à droite.', async () => { await clickSel('#btn-pdf'); await wait(1000); }, 3],
  [T, 'Sélectionnez les documents que vous voulez imprimer : la feuille de route, les cartes de l’itinéraire, ou une carte générale. Les petites images montrent ce que vous obtiendrez.', async () => {
    for (const k of ['roadmap', 'maps', 'onesheet']) { const el = await p.$('#doc-types [data-k=' + k + ']'); const b = await (await el.evaluateHandle(e => e.closest('.dcard'))).asElement().boundingBox(); await move(b.x + b.width / 2, b.y + b.height / 2, 18); await wait(1500); }
  }, 3],
  [T, 'Choisissez ensuite le papier, A4 ou A3, et l’échelle des cartes.', async () => {
    await clickSel('#pdf-set [data-k=paper] [data-v=A3]'); await wait(700); await clickSel('#pdf-set [data-k=paper] [data-v=A4]'); await wait(500);
    await clickSel('#pdf-set [data-k=tscale] [data-v="50000"]'); await wait(1000);
  }, 3],
  [T, 'Un clic sur Voir l’aperçu : les pages apparaissent au fur et à mesure qu’elles sont prêtes.', async () => { await clickSel('#pdf-ok'); await wait(3500); await cutWait(printReady); await wait(800); }, 3],
  [T, 'L’aperçu montre toutes les pages à la suite, avec leurs miniatures à gauche : la feuille de route sur deux pages, puis la planche d’assemblage et chaque carte.', async () => {
    for (const n of [1, 2, 3, 4, 1]) { const th = await p.$('.dthumb:nth-child(' + n + ')'); if (th) { const b = await th.boundingBox(); await move(b.x + b.width / 2, b.y + b.height / 2, 14); await wait(250); await p.mouse.down(); await p.mouse.up(); await wait(1900); } }
  }, 3],
  [T, 'La feuille de route est entièrement modifiable : cliquez sur n’importe quel texte pour le changer. L’en-tête modifié se répercute sur la deuxième page.', async () => {
    const h1 = await p.$('#doc-pages .sheet h1'); const b = await h1.boundingBox(); await move(b.x + b.width - 10, b.y + b.height / 2); await p.mouse.click(b.x + b.width - 10, b.y + b.height / 2);
    await p.keyboard.press('End'); await p.keyboard.type(' – Raid des Pyrénées', { delay: 60 }); await wait(1200);
    const th = await p.$('.dthumb:nth-child(2)'); const tb = await th.boundingBox(); await move(tb.x + tb.width / 2, tb.y + tb.height / 2, 14); await p.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2); await wait(1800);
  }, 3],
  [T, 'La page 2 contient le tableau des étapes, avec la distance et le dénivelé de chaque étape, les cases de date et d’heure à remplir, puis les notes et un message de bon raid.', async () => { await p.evaluate(() => { const sc = document.querySelector('.doc-scroll'); sc.scrollBy({ top: 520, behavior: 'smooth' }); }); await wait(4500); }, 3],
  [T, 'Enfin, cliquez sur Imprimer pour utiliser votre imprimante, ou sur Enregistrer en PDF pour obtenir un fichier.', async () => { await moveTo('#doc-pdf'); await wait(1800); await moveTo('#doc-print'); await wait(1800); }, 3],
  [T, 'Pour changer d’application, revenez à l’accueil avec le bouton maison, en haut à gauche, puis choisissez Créer des azimuts.', async () => { await clickSel('#doc-back'); await wait(700); await p.keyboard.press('Escape'); await wait(400); await clickSel('.rail-btn[data-rail=home]'); await wait(900); await clickSel('.home-card[data-start=az]'); await wait(800); }, 4],
  [T, 'L’application Azimuts sert à la course d’orientation : posez des points, et vous obtenez les azimuts, les contre-azimuts et les distances.', async () => {
    for (const [dx, dy] of [[-120, 40], [20, -80], [170, 30]]) { await clickOff(dx, dy); await wait(1500); }
    await moveTo('#az-table'); await wait(1800);
  }, 4],
  [T, 'L’unité, degrés, grades ou millièmes, et le nord, géographique ou magnétique, se règlent dans le bouton Réglages.', async () => {
    await clickSel('#rail-settings'); await wait(1500); await moveTo('#az-unit'); await wait(1500); await moveTo('#az-ref'); await wait(1500); await clickSel('#rail-mode'); await wait(400);
  }, 4],
  [T, 'Pour imprimer, cliquez sur Imprimer : vous obtenez une feuille d’azimuts, avec le tableau des azimuts, des contre-azimuts et des distances, la vue d’ensemble et le profil, puis les cartes.', async () => {
    await clickSel('#btn-pdf'); await wait(3800); await clickSel('#pdf-cancel'); await wait(500);
  }, 4],
  [T, 'Revenons à l’accueil, et choisissons Créer un grand jeu.', async () => { await clickSel('.rail-btn[data-rail=home]'); await wait(900); await clickSel('.home-card[data-start=game]'); await wait(1500); }, 5],
  [T, 'Un assistant s’affiche à la place de la carte. Première étape : choisissez le thème du jeu, par exemple les guerres de Vendée. Chaque thème apporte ses illustrations, ses bases et ses lignes.', async () => {
    await wait(1500); await p.$eval('#gwz [data-th=vendee]', e => e.scrollIntoView({ block: 'center', behavior: 'smooth' })); await wait(1300); await clickSel('#gwz [data-th=vendee]'); await wait(1800); await clickSel('#gwz-next'); await wait(800);
  }, 5],
  [T, 'Deuxième étape : l’échelle de départ. Un fond de carte adapté au thème est déjà choisi, vous pouvez le changer ici si vous préférez. Vous pourrez zoomer et dézoomer librement ensuite.', async () => {
    await clickSel('#gwz [data-sc="5000"]'); await wait(1600); await moveTo('#gw-base'); await wait(1800); await clickSel('#gwz-go'); await wait(2200);
    await p.evaluate(() => window.SM.map.setView([43.24346, 1.9244], 17, { animate: false })); await wait(1200);
  }, 5],
  [T, 'À gauche, la bibliothèque a cinq onglets : Éléments, Équipes, Terrains, Lignes et Images. La recherche retrouve un élément en quelques lettres.', async () => {
    for (const k of ['teams', 'zones', 'lines', 'images', 'elements']) { await clickSel('#gsub [data-sub=' + k + ']'); await wait(700); }
    await clickSel('#gsearch-in'); await p.keyboard.type('moulin', { delay: 110 }); await wait(1600); await p.fill('#gsearch-in', ''); await p.dispatchEvent('#gsearch-in', 'input'); await wait(400);
  }, 5],
  [T, 'Commencez par vos équipes. Ajoutez une équipe, donnez-lui un nom et une couleur, puis choisissez l’image de sa base.', async () => {
    await clickSel('#gsub [data-sub=teams]'); await wait(500); await p.waitForSelector('#gteams', { timeout: 8000 }).catch(() => {}); await clickSel('#gteam-add'); await wait(500);
    await p.fill('.gteam:nth-child(1) [data-tn]', 'Blancs'); await wait(900);
    await clickSel('#gteam-add'); await wait(500); await p.fill('.gteam:nth-child(2) [data-tn]', 'Bleus'); await wait(900);
    await p.waitForSelector('.gteam [data-tb]', { timeout: 8000 }).catch(() => {}); const tb = await p.$('.gteam:nth-child(1) [data-tb]'); if (tb) { await moveTo('.gteam:nth-child(1) [data-tb]'); await wait(1500); } else { await wait(1200); }
  }, 5],
  [T, 'Cliquez sur Poser la base, puis sur la carte. Cliquez et glissez pour choisir sa taille. La bannière prend la couleur de l’équipe.', async () => {
    await clickSel('.gteam:nth-child(1) [data-tbase]'); const [cx, cy] = await centerPx(); await move(cx + 120, cy - 40); await wait(300);
    await p.mouse.down(); await move(cx + 200, cy + 20, 20); await p.mouse.up(); await wait(1500);
  }, 5],
  [T, 'Posez ensuite un point de départ pour chaque patrouille, puis la base de la deuxième équipe : une image différente peut représenter chaque camp.', async () => {
    await clickSel('.gteam:nth-child(1) [data-tstart]'); await clickOff(60, -60); await wait(500);
    await clickSel('.gteam:nth-child(2) [data-tbase]'); await clickOff(-200, 60); await wait(1500);
  }, 5],
  [T, 'Les limites se tracent avec les lignes à motifs : palissades, barbelés, zones minées, haies. Cliquez les points, puis faites un double-clic pour finir.', async () => {
    await clickSel('#gsub [data-sub=lines]'); await wait(700); await clickSel('#glines [data-mo=haie]'); await wait(500);
    for (const [dx, dy] of [[-250, -120], [-80, -150], [90, -110]]) { await clickOff(dx, dy); await wait(600); }
    const [cx, cy] = await centerPx(); await move(cx + 220, cy - 60); await wait(300); await p.mouse.dblclick(cx + 220, cy - 60); await wait(1600);
  }, 5],
  [T, 'À gauche de la carte, la palette d’outils donne un accès direct aux formes : sélection, zone, rectangle, cercle, ligne, flèche, croix et texte. Chaque outil a son raccourci clavier : V, P, R, C, L, A, X et T.', async () => {
    for (const k of ['polygon', 'rect', 'circle', 'line', 'arrow', 'text', 'select']) { await moveTo('#gpalette [data-gt=' + k + ']'); await wait(450); }
    await clickSel('#gpalette [data-gt=rect]'); await clickOff(-200, 120); await clickOff(-60, 210); await wait(1500);
  }, 5],
  [T, 'Les couleurs, l’épaisseur et le texte se règlent dans la barre du bas, toujours visible. Elle s’applique à l’élément sélectionné, ou aux prochains éléments si rien n’est sélectionné.', async () => {
    await clickSel('#gb-fill'); await wait(1200); await clickSel('#gpal .gpal-g button:nth-child(5)'); await wait(900);
    await clickSel('#gs-weight-p'); await wait(800); await moveTo('#gstyle'); await wait(1200);
  }, 5],
  [T, 'Dans l’onglet Images, ajoutez le logo d’une équipe, une photo, ou créez un blason en choisissant sa division, sa figure et ses couleurs.', async () => {
    await clickSel('#gsub [data-sub=images]'); await wait(700); await clickSel('#gimg-bl'); await wait(2200);
    await p.selectOption('#gbl-part', 'ecartele'); await wait(900); await p.selectOption('#gbl-ch', 'etoile'); await wait(1500); await clickSel('#gbl-ok'); await wait(1500);
  }, 5],
  [T, 'Pour que les autres chefs suivent le jeu, le bouton Partager en direct affiche un code Q R : ils voient la carte, leurs positions respectives, et peuvent discuter. Vous pouvez aussi leur envoyer un lien administrateur pour qu’ils modifient la carte avec vous.', async () => {
    await moveTo('#game-live'); await wait(3500);
  }, 5],
  [T, 'Pour imprimer le jeu, cliquez sur Imprimer : la carte générale est proposée, pour voir toute la zone sur une seule feuille, avec la légende. Échap, ou un clic droit, relâche l’outil et revient à la sélection.', async () => {
    await clickSel('#game-pdf'); await wait(4000); await clickSel('#pdf-cancel'); await wait(500);
  }, 5],
  [T, 'Pour revoir un tutoriel à tout moment, cliquez sur le point d’interrogation en haut, ou ouvrez le menu Aide, où vous trouverez aussi l’adresse du service informatique.', async () => {
    await moveTo('#btn-tuto'); await wait(1500);
    await clickSel('.menu-btn[data-menu=help]'); await wait(700);
    const it = await p.$('.mi:has-text("service informatique")'); if (it) { const b = await it.boundingBox(); await move(b.x + b.width / 2, b.y + b.height / 2, 14); await wait(1800); }
    await p.keyboard.press('Escape'); await p.mouse.click(900, 300); await wait(300);
  }, 6],
  [T, 'Voilà, vous savez tout. Si vous avez des questions, un problème ou une idée d’amélioration, n’hésitez pas à contacter le service informatique de la fédération. Bonne route avec ScoutMap !', async () => { await wait(2500); }, 6]
];

function makeClips() {
  CARDS.forEach((c, k) => { if (!k) return; fs.writeFileSync(DIR + 'c.txt', 'Partie ' + k + '.\n\n' + c.replace(/’/g, "'") + '.'); execSync(`python3 -m piper -m ${DIR}${T}.onnx --length-scale 0.9 --sentence-silence 0.55 -f ${DIR}pr${k}.wav < ${DIR}c.txt`, { stdio: 'ignore' }); execSync(`ffmpeg -y -v error -i ${DIR}pr${k}.wav -af "loudnorm=I=-17:TP=-2" -ar 44100 ${DIR}p${k}.wav`); });
  STEPS.forEach((st, i) => {
    let txt = st[1];
    const PRON = [[/ScoutMap/g, 'Scout Map'], [/\bPDF\b/g, 'P D F'], [/\bGPX\b/g, 'G P X'], [/\bKML\b/g, 'K M L'], [/GeoJSON/g, 'Géo Jason'], [/\bA4\b/g, 'A quatre'], [/\bA3\b/g, 'A trois'], [/\bGR\b/g, 'G R'], [/\bPR\b/g, 'P R'], [/Imprimer \/ PDF/g, 'Imprimer ou P D F'], [/ : /g, ', '], [/ – /g, ', ']];
    PRON.forEach(([re, to]) => { txt = txt.replace(re, to); });
    txt = txt.replace(/\. /g, '.\n\n');
    txt = txt.replace(/'/g, '’');
    fs.writeFileSync(DIR + 'c.txt', txt);
    execSync(`python3 -m piper -m ${DIR}${st[0]}.onnx --length-scale 0.9 --sentence-silence 0.55 -f ${DIR}r${i}.wav < ${DIR}c.txt`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -v error -i ${DIR}r${i}.wav -af "loudnorm=I=-17:TP=-2" -ar 44100 ${DIR}n${i}.wav`);
  });
}
const dur = i => parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${DIR}n${i}.wav`).toString());

(async () => {
  if (!process.env.SKIP_TTS) makeClips();
  const px = process.env.HTTPS_PROXY;
  const browser = await chromium.launch({ proxy: px ? { server: px, bypass: 'localhost,127.0.0.1' } : undefined });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: DIR + 'rec', size: { width: 1280, height: 720 } } });
  await ctx.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      const c = document.createElement('div');
      c.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px)';
      c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M3 2l7 19 3-8 8-3z" fill="#fff" stroke="#000761" stroke-width="1.6" stroke-linejoin="round"/></svg>';
      document.body.appendChild(c);
      document.addEventListener('mousemove', e => { c.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`; }, true);
      document.addEventListener('mousedown', e => {
        const r = document.createElement('div');
        r.style.cssText = `position:fixed;left:${e.clientX - 18}px;top:${e.clientY - 18}px;width:36px;height:36px;border-radius:50%;border:3px solid #c6a24e;z-index:2147483646;pointer-events:none;transition:all .45s ease-out;opacity:1`;
        document.body.appendChild(r);
        requestAnimationFrame(() => { r.style.transform = 'scale(1.8)'; r.style.opacity = '0'; });
        setTimeout(() => r.remove(), 600);
      }, true);
    });
  });
  p = await ctx.newPage();
  T0 = Date.now();
  await ctx.addInitScript(seed => { try { if (!localStorage.getItem('scoutmap.projects')) localStorage.setItem('scoutmap.projects', JSON.stringify(seed)); } catch (e) {} }, SEED);
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#home:not([hidden])', { timeout: 20000 });
  await p.waitForTimeout(1200);
  CUTS.push([0, Math.max(0, (Date.now() - T0) / 1000 - 0.5)]);   // on coupe le chargement initial : la vidéo commence sur l'accueil
  await move(640, 400, 5);
  const starts = [];
  for (let i = 0; i < STEPS.length; i++) {
    const t = Date.now(); starts.push((t - T0) / 1000); clipEnd = t + dur(i) * 1000;
    try { await STEPS[i][2](); } catch (e) { console.log('step', i, 'erreur', String(e).slice(0, 120)); }
    const left = clipEnd + 450 - Date.now();
    if (left > 0) await wait(left);
  }
  fs.writeFileSync(DIR + 'starts6.json', JSON.stringify({ starts, parts: STEPS.map(x => x[3]), cuts: CUTS, total: (Date.now() - T0) / 1000 }));
  await ctx.close(); await browser.close();
  console.log('starts', starts.map(x => Math.round(x)), 'cuts', JSON.stringify(CUTS.map(c => c.map(Math.round))), 'total', (Date.now() - T0) / 1000);
})();
