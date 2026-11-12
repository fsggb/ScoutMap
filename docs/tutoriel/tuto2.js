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

const STEPS = [
  ['Bonjour, et bienvenue dans ScoutMap, l’outil pensé pour préparer les raids scouts.', async () => { await moveTo('.brand'); await wait(2500); }],
  ['Fini les cartes floues à l’impression, les calculs d’itinéraire peu intuitifs et les interfaces compliquées : tout ce qu’il faut est réuni au même endroit.', async () => {
    for (const m of ['file', 'edit', 'create', 'view', 'help']) { await moveTo('.menu-btn[data-menu=' + m + ']'); await wait(700); }
  }],
  ['À gauche, trois onglets : Itinéraire, Azimuts et Grand jeu.', async () => { for (const r of ['route', 'az', 'game', 'route']) { await moveTo('.rail-btn[data-rail=' + r + ']'); await wait(1100); } }],
  ['Commençons par l’itinéraire. Cherchez un lieu dans la barre de recherche : ici, Saint-Bertrand-de-Comminges.', async () => {
    await clickSel('#q'); await p.keyboard.type('Saint-Bertrand-de-Comminges', { delay: 90 });
    await p.waitForSelector('#suggest li', { timeout: 15000 }); await wait(700);
    await clickSel('#suggest li'); await wait(2500);
    await p.evaluate(() => window.SM.map.setView([43.0306, 0.5722], 11, { animate: false })); await wait(1500);
  }],
  ['Cliquez sur la carte pour poser le départ, puis les étapes. Pour une grande boucle, gardez des points assez éloignés les uns des autres.', async () => {
    for (const [dx, dy] of [[-30, 10], [110, -100], [210, -10], [170, 100], [20, 125], [-110, 70]]) { await clickOff(dx, dy); await wait(2200); }
  }],
  ['La boucle se calcule automatiquement, avec la distance, le dénivelé et le profil d’altitude.', async () => { await routeReady(); await wait(3000); await moveTo('#dock'); await wait(2000); }],
  ['Quand la carte est dézoomée, chaque point se place tout seul sur le village, le hameau ou le chemin le plus proche. Un clic droit sur un point permet de le remettre là où vous avez cliqué.', async () => {
    const pt = await p.evaluate(() => { const w = window.SM.S.route.wps[2], q = window.SM.map.latLngToContainerPoint([w.lat, w.lon]), r = window.SM.map.getContainer().getBoundingClientRect(); return [r.left + q.x, r.top + q.y]; });
    await move(pt[0], pt[1]); await wait(400); await p.mouse.click(pt[0], pt[1], { button: 'right' }); await wait(4500); await p.keyboard.press('Escape'); await wait(500);
  }],
  ['Vous pouvez aussi fixer une distance maximale. Elle n’est pas bloquante : elle sert seulement d’indication, et le tracé passe en rouge dès qu’on la dépasse.', async () => {
    await clickSel('label.switch:has(#max-on)'); await wait(800);
    await moveTo('#max-km'); await p.click('#max-km', { clickCount: 3 }); await p.keyboard.type('30'); await wait(2500);
  }],
  ['Ici, la boucle dépasse la limite : à vous de décider de la garder, ou de la raccourcir.', async () => { await moveTo('#gauge'); await wait(3500); await clickSel('label.switch:has(#max-on)'); await wait(500); }],
  ['Le bouton en bas à gauche change le fond de carte, et permet d’ajouter des informations comme les courbes de niveau. Il affiche aussi la date de mise à jour des données.', async () => {
    await clickSel('#layer-btn'); await wait(1500);
    await clickSel('#pop-tabs [data-tab=info]'); await wait(1200);
    await clickSel('#ov-grid [data-ov=contour]'); await wait(2500);
    await clickSel('#pop-tabs [data-tab=base]'); await wait(1200);
    await move(900, 250); await p.mouse.down(); await p.mouse.up(); await wait(500);
  }],
  ['Pour garder votre travail, ouvrez le menu Fichier : Enregistrer en GPX crée une trace lisible par toutes les applications de randonnée. Vous pouvez aussi ouvrir une trace GPX, KML ou GeoJSON venant d’une autre application.', async () => {
    await clickSel('.menu-btn[data-menu=file]'); await wait(1200);
    for (const t of ['Ouvrir une trace', 'Enregistrer en GPX']) { const it = await p.$('.mi:has-text("' + t + '")'); if (it) { const b = await it.boundingBox(); await move(b.x + b.width / 2, b.y + b.height / 2, 18); await wait(1800); } }
    await p.keyboard.press('Escape'); await p.mouse.click(900, 300); await wait(500);
  }],
  ['L’onglet Azimuts sert à la course d’orientation : posez des points, et vous obtenez les azimuts, les contre-azimuts et les distances.', async () => {
    await clickSel('.rail-btn[data-rail=az]'); await wait(800);
    for (const [dx, dy] of [[-120, 40], [20, -80], [170, 30]]) { await clickOff(dx, dy); await wait(1600); }
  }],
  ['Dans Grand jeu, choisissez un outil, puis dessinez. Pour une zone, cliquez les sommets l’un après l’autre, puis faites un double-clic pour terminer.', async () => {
    await clickSel('.rail-btn[data-rail=game]'); await wait(600);
    await clickSel('#gtools [data-gt=polygon]'); await wait(400);
    for (const [dx, dy] of [[-150, -90], [130, -100], [150, 60]]) { await clickOff(dx, dy); await wait(900); }
    const [cx, cy] = await centerPx(); await move(cx - 140, cy + 70); await wait(500); await p.mouse.dblclick(cx - 140, cy + 70); await wait(1500);
  }],
  ['Les couleurs se règlent avec les pastilles : cliquez sur Remplissage pour la couleur et la transparence, sur Contour pour le trait, ou sur Texte pour le gras et le souligné.', async () => {
    await clickSel('#gbar [data-pop=fill]'); await wait(2800);
    await clickSel('#gbar [data-pop=stroke]'); await wait(2800);
  }],
  ['Pour imprimer, cliquez sur Exporter en PDF.', async () => { await clickSel('.rail-btn[data-rail=route]'); await wait(500); await clickSel('#btn-pdf'); await wait(1500); }],
  ['Cochez ce que vous voulez imprimer : la feuille de route, les cartes de l’itinéraire, ou une carte générale. Les vignettes montrent ce que vous obtiendrez.', async () => {
    for (const k of ['roadmap', 'maps', 'onesheet']) { const el = await p.$('#doc-types [data-k=' + k + ']'); const b = await (await el.evaluateHandle(e => e.closest('.dcard'))).asElement().boundingBox(); await move(b.x + b.width / 2, b.y + b.height / 2, 20); await wait(1800); }
  }],
  ['Choisissez ensuite le papier, A4 ou A3, et l’échelle des cartes.', async () => {
    await clickSel('#pdf-set [data-k=paper] [data-v=A3]'); await wait(900); await clickSel('#pdf-set [data-k=paper] [data-v=A4]'); await wait(700);
    await clickSel('#pdf-set [data-k=tscale] [data-v="50000"]'); await wait(1500);
  }],
  ['Un clic sur Voir l’aperçu, et le document se prépare. Cela peut prendre un moment, le temps de charger toutes les cartes.', async () => { await clickSel('#pdf-ok'); await printReady(); await wait(1200); }],
  ['L’aperçu montre toutes les pages à la suite, avec leurs miniatures à gauche : cliquez sur une miniature pour aller directement à la page.', async () => {
    for (const n of [2, 3, 4, 1]) { const th = await p.$('.dthumb:nth-child(' + n + ')'); if (th) { const b = await th.boundingBox(); await move(b.x + b.width / 2, b.y + b.height / 2, 18); await wait(300); await p.mouse.down(); await p.mouse.up(); await wait(2200); } }
  }],
  ['La feuille de route est entièrement modifiable : cliquez sur n’importe quel texte pour le changer.', async () => {
    const h1 = await p.$('#doc-pages .sheet h1'); const b = await h1.boundingBox(); await move(b.x + b.width - 10, b.y + b.height / 2); await p.mouse.click(b.x + b.width - 10, b.y + b.height / 2);
    await p.keyboard.press('End'); await p.keyboard.type(' – Raid des Pyrénées', { delay: 80 }); await wait(1500);
  }],
  ['Elle se termine par un cadre de notes et les numéros d’urgence à compléter.', async () => { await p.evaluate(() => { const sc = document.querySelector('.doc-scroll'); sc.scrollBy({ top: 650, behavior: 'smooth' }); }); await wait(4500); }],
  ['Enfin, cliquez sur Imprimer pour utiliser votre imprimante, ou sur Enregistrer en PDF pour obtenir un fichier.', async () => { await moveTo('#doc-pdf'); await wait(2200); await moveTo('#doc-print'); await wait(2200); }],
  ['Voilà, vous savez tout. Bonne route avec ScoutMap.', async () => { await clickSel('#doc-back'); await wait(1500); }]
];

function makeClips() {
  STEPS.forEach((s, i) => {
    const txt = s[0].replace(/'/g, '’');
    fs.writeFileSync(DIR + 'c.txt', txt);
    execSync(`python3 -m piper -m ${DIR}${VOICE}.onnx --length-scale 1.06 --sentence-silence 0.3 -f ${DIR}r${i}.wav < ${DIR}c.txt`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -v error -i ${DIR}r${i}.wav -af "adelay=150|150,loudnorm=I=-17:TP=-2" -ar 44100 ${DIR}n${i}.wav`);
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
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await wait(3500);
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded' }); await wait(3500);
  await p.evaluate(() => window.SM.map.setView([46.6, 2.5], 6, { animate: false }));
  await move(640, 400, 5);
  const starts = [];
  for (let i = 0; i < STEPS.length; i++) {
    const t = Date.now(); starts.push((t - T0) / 1000);
    try { await STEPS[i][1](); } catch (e) { console.log('step', i, 'erreur', String(e).slice(0, 120)); }
    const left = dur(i) * 1000 + 450 - (Date.now() - t);
    if (left > 0) await wait(left);
  }
  fs.writeFileSync(DIR + 'starts2.json', JSON.stringify(starts));
  await ctx.close(); await browser.close();
  console.log('starts', starts.map(x => Math.round(x)), 'total', (Date.now() - T0) / 1000);
})();
