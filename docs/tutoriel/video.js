// Tutoriels vidéo de ScoutMap : vidéos sous-titrées (sans voix), jouées par un vrai navigateur sur l'application locale.
// Usage : node docs/tutoriel/video.js global|route|az|game|tout        (Playwright et ffmpeg requis)
// Sortie : assets/tuto-<nom>.mp4 et assets/tuto-poster-<nom>.png
// Chaque étape = une phrase affichée en bas de l'écran, puis l'action correspondante jouée avec un curseur visible.
'use strict';
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..', '..'), OUT = path.join(ROOT, 'assets'), TMP = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'sm-tuto-'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); }
  let b = fs.readFileSync(f); if (/\.(html|js)$/.test(f)) b = Buffer.from(b.toString().replace(/__V__/g, 'tuto'));
  r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(b);
});

const OVERLAY = `
(() => {
  const css = document.createElement('style'); css.textContent = \`
  #tt-cap{position:fixed;left:50%;bottom:34px;transform:translateX(-50%);z-index:2147483000;max-width:min(1040px,92vw);padding:14px 26px;border-radius:16px;background:rgba(0,7,97,.94);color:#fff;font:600 24px/1.35 Inter,system-ui,sans-serif;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.35);border:2px solid #c6a24e;transition:opacity .25s}
  #tt-cap[hidden]{display:block!important;opacity:0}
  #tt-cur{position:fixed;z-index:2147483001;width:26px;height:26px;margin:-4px 0 0 -4px;pointer-events:none;transition:none}
  #tt-cur svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))}
  #tt-card{position:fixed;inset:0;z-index:2147483002;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#000761;color:#fff;font-family:Georgia,'Times New Roman',serif;text-align:center;transition:opacity .5s}
  #tt-card h1{font-size:58px;margin:0;font-weight:700}#tt-card p{font:500 26px Inter,system-ui,sans-serif;color:#c6a24e;margin:0}#tt-card i{width:120px;height:4px;background:#c6a24e;border-radius:2px}
  \`; document.head.appendChild(css);
  const cap = document.createElement('div'); cap.id = 'tt-cap'; cap.hidden = true; document.body.appendChild(cap);
  const cur = document.createElement('div'); cur.id = 'tt-cur'; cur.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l15 9-6.5 1.5L9 19z" fill="#fff" stroke="#000761" stroke-width="1.6" stroke-linejoin="round"/></svg>'; document.body.appendChild(cur);
  window.__tt = {
    say(t) { cap.textContent = t; cap.hidden = !t; },
    cur(x, y) { cur.style.left = x + 'px'; cur.style.top = y + 'px'; },
    card(h, p) { let c = document.getElementById('tt-card'); if (!h) { if (c) { c.style.opacity = 0; setTimeout(() => c.remove(), 600); } return; } if (!c) { c = document.createElement('div'); c.id = 'tt-card'; document.body.appendChild(c); } c.style.opacity = 1; c.innerHTML = '<h1></h1><i></i><p></p>'; c.children[0].textContent = h; c.children[2].textContent = p || ''; }
  };
})();`;

let page, cx = 640, cy = 360;
const wait = (ms) => page.waitForTimeout(ms);
async function setCur(x, y) { cx = x; cy = y; await page.evaluate(([a, b]) => window.__tt && window.__tt.cur(a, b), [x, y]); }
async function glide(x, y, steps = 26) { const x0 = cx, y0 = cy; for (let i = 1; i <= steps; i++) { const t = i / steps, e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; await page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e); await setCur(x0 + (x - x0) * e, y0 + (y - y0) * e); await page.waitForTimeout(14); } }
const say = async (t, hold = 1800) => { await page.evaluate((s) => window.__tt.say(s), t); await wait(hold); };
async function box(sel) { const el = await page.$(sel); if (!el) throw new Error('introuvable : ' + sel); const b = await el.boundingBox(); if (!b) throw new Error('invisible : ' + sel); return b; }
async function click(sel, pause = 500) { const b = await box(sel); await glide(b.x + b.width / 2, b.y + b.height / 2); await wait(200); await page.mouse.down(); await page.mouse.up(); await wait(pause); }
async function clickMap(lat, lon, pause = 700) {
  const [x, y] = await page.evaluate(([a, b]) => { const p = SM.map.latLngToContainerPoint([a, b]), r = SM.map.getContainer().getBoundingClientRect(); return [r.left + p.x, r.top + p.y]; }, [lat, lon]);
  await glide(x, y); await wait(180); await page.mouse.down(); await page.mouse.up(); await wait(pause);
}
async function view(lat, lon, z) { await page.evaluate(([a, b, c]) => SM.map.setView([a, b], c, { animate: false }), [lat, lon, z]); await wait(900); }
async function until(fn, ms = 40000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn).catch(() => false)) return true; await wait(400); } return false; }
async function type(sel, text) { const b = await box(sel); await glide(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.up(); await page.fill(sel, ''); await page.type(sel, text, { delay: 90 }); await wait(400); }
const card = async (h, p, ms = 2600) => { await page.evaluate(([a, b]) => window.__tt.card(a, b), [h, p]); await wait(ms); await page.evaluate(() => window.__tt.card('')); await wait(700); };

// ---------- scénarios ----------
const ANNECY = [45.8992, 6.1294], TALLOIRES = [45.8333, 6.2153], MENTHON = [45.8626, 6.1975];
async function intro(titre, sous) { await card(titre, sous); }
async function startRoute() { await click('.home-card[data-start=route]', 900); }
async function poserTrajet() {
  await view(45.88, 6.17, 12);
  await say('Cliquez sur la carte pour poser le départ…', 1200); await clickMap(ANNECY[0], ANNECY[1]);
  await say('…puis l’arrivée. ScoutMap calcule le chemin par les routes et les sentiers.', 1400); await clickMap(TALLOIRES[0], TALLOIRES[1], 1200);
  await until(() => !!SM.RT.route, 45000); await wait(1200);
}
const SCENARIOS = {
  global: async () => {
    await intro('ScoutMap', 'Prise en main en quelques minutes');
    await say('Bienvenue dans ScoutMap, l’outil de la FSGGB pour préparer vos raids sur de vraies cartes IGN.', 3200);
    await say('À l’accueil : un itinéraire, des azimuts ou un grand jeu. Vos travaux restent dans ce navigateur.', 3200);
    await startRoute(); await poserTrajet();
    await say('Le profil d’altitude, la distance et la durée apparaissent dès que le tracé est calculé.', 3200);
    await say('La barre d’outils flottante : Déplacer, Chemin, Droite, Point seul et Azimut.', 3000);
    await click('#rail-library', 800); await say('Onglet Tracés : tous vos tracés du navigateur. Cliquez pour ouvrir, œil pour afficher plusieurs tracés ensemble.', 3600);
    await click('#rail-library', 600);
    await click('#route-pdf', 800); await say('Imprimer : feuille de route et cartes IGN nettes, une feuille par page, avec le PDF relisible dans ScoutMap.', 3600);
    await page.evaluate(() => document.querySelector('#dlg-pdf') && document.querySelector('#dlg-pdf').open && document.querySelector('#dlg-pdf').close());
    await click('[data-rail=share]', 800); await say('Partage en direct : suivre un groupe sur le terrain, ou préparer à plusieurs, avec un verrou pour le chef.', 3600);
    await say('Besoin d’aide ? Le menu Aide ouvre les tutoriels, et service-informatique@fsggb.fr répond à vos questions.', 3400);
  },
  route: async () => {
    await intro('L’itinéraire', 'Chemins, lignes droites, azimuts et points seuls');
    await startRoute(); await poserTrajet();
    await say('Une boucle revient au départ : il faut au moins trois points (avec deux points, c’est un aller simple).', 2600);
    await say('Outil Droite : le point suivant est relié à vol d’oiseau, par exemple à travers un champ.', 2600);
    await click('#rbar [data-rt=direct]', 500); await clickMap(MENTHON[0], MENTHON[1], 1200);
    await say('Outil Azimut : saisissez l’azimut à la boussole (degrés) et la distance, le point se place tout seul.', 3000);
    await click('#rbar [data-rt=az]', 600);
    await page.evaluate(() => { const a = document.querySelector('#raim'); a && a.scrollIntoView({ block: 'center' }); });
    await type('#raim-az', '90'); await type('#raim-d', '300'); await click('#raim-add', 1200);
    await say('Chaque tronçon en azimut affiche son azimut, son contre-azimut et sa distance, aussi sur la feuille de route.', 3400);
    await say('Outil Point : un repère isolé (poste de secours, rendez-vous), non relié au chemin.', 2600);
    await click('#rbar [data-rt=spot]', 500); await clickMap(ANNECY[0] - 0.01, ANNECY[1] + 0.03, 1000);
    await click('#rbar [data-rt=pan]', 600);
    await say('Outil Déplacer : la carte bouge sans poser de point. Échap termine la pose.', 2800);
    await click('#route-pdf', 1000); await say('Imprimer : un tracé en une couleur, les points en pastille, croix ou pointeur selon vos Réglages.', 3400);
  },
  az: async () => {
    await intro('Les azimuts', 'Course d’orientation à la boussole');
    await click('.home-card[data-start=az]', 1200);
    await view(45.8992, 6.1294, 15);
    await say('« Créer des azimuts » ouvre l’itinéraire avec l’outil Azimut déjà choisi.', 2800);
    await say('Cliquez le point de départ, puis chaque point suivant : chaque tronçon est une ligne droite.', 2800);
    await clickMap(45.8992, 6.1294); await clickMap(45.9035, 6.1405, 900); await clickMap(45.9072, 6.1362, 900);
    await say('Chaque tronçon affiche l’azimut en degrés (nord magnétique, déclinaison déjà comptée), et la distance.', 3600);
    await say('Ou placez le point suivant en saisissant l’azimut et la distance.', 2400);
    await page.evaluate(() => { const a = document.querySelector('#raim'); a && a.scrollIntoView({ block: 'center' }); });
    await type('#raim-az', '200'); await type('#raim-d', '250'); await click('#raim-add', 1200);
    await say('Le contre-azimut (pour revenir) est donné dans la liste des points.', 2800);
    await say('Chemin, Droite et Azimut se mélangent : un morceau d’azimut au milieu d’un itinéraire est possible.', 3400);
    await click('#route-pdf', 900); await say('La feuille de route imprimée reprend les azimuts, contre-azimuts et distances.', 3200);
  },
  game: async () => {
    await intro('Le grand jeu', 'Zones, bases, éléments et partage en direct');
    await click('.home-card[data-start=game]', 1500);
    await say('L’assistant commence par le thème du jeu : Moyen Âge, Pirates, Résistance… ou Libre.', 3200);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button,.gth,[data-theme]')].find((x) => /Libre/.test(x.textContent || '')); b && b.scrollIntoView({ block: 'center' }); });
    await wait(900);
    await say('Le thème Libre donne accès à toute la bibliothèque : 323 éléments de tous les thèmes.', 3200);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button,.gth,[data-theme]')].find((x) => /Libre/.test(x.textContent || '')); b && b.click(); });
    await wait(600);
    await page.evaluate(() => { SM.S.game.theme = 'perso'; SM.S.game.themeLocked = true; if (SM.game.closeWizard) SM.game.closeWizard(); SM.persist(); SM.game.render(); });   // fin de l'assistant (thème Libre)
    await wait(1200);
    await view(45.8992, 6.1294, 14);
    await say('Une seule recherche par mot-clé dans tous les thèmes : tapez « tour », « feu », « tente »…', 3000);
    await type('#gsearch-in', 'tour'); await wait(1600);
    await say('Cliquez un élément puis la carte pour le poser ; cliquez-glissez pour choisir sa taille.', 3000);
    const r = await page.$('#gstamps .gst:not([hidden])'); if (r) { const b = await r.boundingBox(); await glide(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.up(); await wait(500); }
    await clickMap(45.9, 6.13, 1000);
    await page.fill('#gsearch-in', ''); await wait(600);
    await say('Les onglets Équipes, Terrains, Lignes et Images complètent le jeu.', 2800);
    await click('[data-rail=share]', 900); await say('Partagez le jeu en direct : tout le monde se voit sur la carte, avec discussion et appel vocal.', 3600);
  }
};

async function run(name) {
  const dir = path.join(TMP, name); fs.mkdirSync(dir, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir, size: { width: 1280, height: 720 } }, locale: 'fr-FR' });
  page = await ctx.newPage(); cx = 640; cy = 360;
  page.on('pageerror', (e) => console.log('  erreur page :', e.message));
  await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await wait(2500);
  await page.addStyleTag({ content: '.leaflet-container{cursor:none!important}' });
  await page.evaluate(OVERLAY); await setCur(640, 360);
  try { await SCENARIOS[name](); await wait(1200); } catch (e) { console.log('  étape manquée (' + name + ') :', e.message); }
  await page.evaluate(() => window.__tt.say(''));
  const vid = page.video(); await ctx.close(); await b.close();
  const webm = await vid.path(), mp4 = path.join(OUT, 'tuto-' + name + '.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-vf', 'scale=1280:720,fps=25', '-c:v', 'libx264', '-crf', '30', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '1.2', '-i', mp4, '-frames:v', '1', path.join(OUT, 'tuto-poster-' + name + '.png')]);
  console.log('✔ ' + name + ' : ' + (fs.statSync(mp4).size / 1048576).toFixed(1) + ' Mo');
}
srv.listen(0, '127.0.0.1', async () => {
  const arg = process.argv[2] || 'tout', list = arg === 'tout' ? ['global', 'route', 'az', 'game'] : [arg];
  for (const n of list) { if (!SCENARIOS[n]) { console.log('scénario inconnu : ' + n); continue; } await run(n); }
  srv.close(); fs.rmSync(TMP, { recursive: true, force: true });
});
