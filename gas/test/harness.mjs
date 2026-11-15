// Banc d'essai local : imite Apps Script (HtmlService + iframe isolée sur une autre origine) pour vérifier gas/src.
// Limites : ce n'est PAS Google ; il reproduit le gabarit <?!= ?>, l'attribut sandbox et google.script.url.getLocation.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const f = (n) => readFileSync(join(SRC, n), 'utf8');

function evaluate() { // gabarit Apps Script
  return f('Index.html')
    .replace(/<\?!= include\('([A-Za-z]+)'\) \?>/g, (m, n) => f(n + '.html'))
    .replace(/<\?!= JSON\.stringify\(appUrl\) \?>/, JSON.stringify('http://localhost:8001/exec'));
}
const inner = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(evaluate()); }).listen(8002);
// page parente : reproduit le cadre Apps Script (iframe sandbox) et google.script.url.getLocation
const wrapper = (qs, hash) => `<!doctype html><body style="margin:0"><iframe id="app" style="border:0;width:100vw;height:100vh"
 sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
 src="http://localhost:8002/?harness=1"></iframe>
<script>addEventListener('message',e=>{ if(e.data==='getLocation'){ e.source.postMessage({loc:{parameter:${JSON.stringify(qs)},hash:${JSON.stringify(hash)}}},'*'); } });</script>`;
let cur = { qs: {}, hash: '' };
const outer = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(wrapper(cur.qs, cur.hash)); }).listen(8001);
// stub côté iframe injecté avant le code de la page
const STUB = `window.google={script:{url:{getLocation:function(cb){ var h=function(e){ if(e.data&&e.data.loc){ removeEventListener('message',h); cb(e.data.loc);} }; addEventListener('message',h); parent.postMessage('getLocation','*'); }}}};`;

const results = []; const ok = (name, pass, info = '') => { results.push({ name, pass }); console.log((pass ? 'OK   ' : 'ÉCHEC') + ' ' + name + (info ? ' — ' + info : '')); };

async function open(browser, qs = {}, hash = '') {
  cur = { qs, hash };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, permissions: ['geolocation'], geolocation: { latitude: 48.85, longitude: 2.35 } });
  const page = await ctx.newPage(); const errs = [], fails = [];
  await ctx.addInitScript(STUB);
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('requestfailed', r => fails.push(r.url().slice(0, 90)));
  await page.goto('http://localhost:8001/'); const fr = page.frameLocator('#app'); const frame = () => page.frames().find(x => x.url().startsWith('http://localhost:8002'));
  await page.waitForFunction(() => document.querySelector('#app') !== null);
  for (let i = 0; i < 40 && !(frame() && await frame().evaluate(() => !!window.SM && !!window.L).catch(() => false)); i++) await page.waitForTimeout(500);
  return { ctx, page, frame, errs, fails };
}

const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  // 1. démarrage
  let t = await open(browser); let fr = t.frame();
  ok('1. La page se charge et ScoutMap démarre dans l’iframe isolée', !!fr && await fr.evaluate(() => !!window.SM && !!window.L && !!document.querySelector('.leaflet-container')));
  ok('1b. Aucune erreur JavaScript au démarrage', t.errs.length === 0, t.errs.slice(0, 3).join(' | '));
  await t.page.waitForTimeout(2500);
  const tiles = await fr.evaluate(() => [...document.querySelectorAll('.leaflet-tile')].filter(i => i.complete && i.naturalWidth > 0).length);
  ok('2. Les tuiles IGN se chargent (CORS depuis l’iframe)', tiles > 0, tiles + ' tuiles affichées');
  ok('3. Accueil affiché (cartes de choix)', await fr.evaluate(() => !!document.querySelector('#home') && getComputedStyle(document.querySelector('#home')).display !== 'none'));
  // 4. stockage + géocodage + altimétrie via les vrais services
  ok('4. localStorage utilisable dans l’iframe', await fr.evaluate(() => { try { localStorage.setItem('t', '1'); const v = localStorage.getItem('t') === '1'; localStorage.removeItem('t'); return v; } catch (e) { return false; } }));
  const geo = await fr.evaluate(() => fetch('https://data.geopf.fr/geocodage/search?q=Lyon&limit=1').then(r => r.json()).then(j => j.features.length).catch(e => 'ERR ' + e.message));
  ok('5. Géocodage Géoplateforme (fetch cross-origin)', geo === 1, String(geo));
  const alti = await fr.evaluate(() => fetch('https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=2.35&lat=48.85&resource=ign_rge_alti_wld&zonly=true').then(r => r.status).catch(e => 'ERR'));
  ok('6. Altimétrie Géoplateforme', alti === 200, String(alti));
  const ovp = await fr.evaluate(() => fetch('https://hiking.waymarkedtrails.org/api/v1/list/by_area?limit=1&bbox=250000,6250000,260000,6260000').then(r => r.status).catch(e => 'ERR'));
  ok('7. Waymarked Trails (sentiers GR)', ovp === 200, String(ovp));
  // 8. géolocalisation (point faible attendu)
  const g = await fr.evaluate(() => new Promise(res => navigator.geolocation.getCurrentPosition(p => res('OK'), e => res('refusée: ' + e.message), { timeout: 4000 })));
  ok('8. Géolocalisation (bouton « Ma position », positions en direct)', g === 'OK', g);
  await t.ctx.close();

  // 9. paramètres d'URL (?lieu=) transmis via google.script.url.getLocation
  t = await open(browser, { lieu: 'Lyon', zoom: '12' }); fr = t.frame(); await t.page.waitForTimeout(4000);
  const c = await fr.evaluate(() => { const m = document.querySelector('.leaflet-container')._leaflet_map || null; return m ? [m.getCenter().lat, m.getCenter().lng] : null; }).catch(() => null);
  const lyon = c ? Math.abs(c[0] - 45.76) < 0.1 && Math.abs(c[1] - 4.84) < 0.1 : null;
  const pin = await fr.evaluate(() => !!document.querySelector('.leaflet-marker-icon'));
  ok('9. Lien d’action ?lieu=Lyon&zoom=12 (paramètres Apps Script → SM_LOC)', await fr.evaluate(() => /lieu=Lyon/.test(window.SM_LOC.search)) && pin, 'repère de recherche posé : ' + pin);
  await t.ctx.close();

  // 10. itinéraire via URL puis export en page web autonome
  t = await open(browser, { itineraire: 'Lyon|Villeurbanne', boucle: '1', titre: 'Essai' }); fr = t.frame(); await t.page.waitForTimeout(9000);
  const wps = await fr.evaluate(() => document.querySelectorAll('.leaflet-marker-icon').length);
  ok('10. Itinéraire par lien (géocodage + calcul de route + marqueurs)', wps >= 2, wps + ' marqueurs');
  const dl = t.page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  await t.page.frameLocator('#app').locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {}); await t.page.keyboard.press('Control+s');
  const d = await dl;
  if (d) {
    const p = await d.path(); const html = readFileSync(p, 'utf8');
    ok('11. « Enregistrer » produit une page web .html autonome', /scoutmap-data/.test(html) && html.length > 600000, d.suggestedFilename() + ' · ' + (html.length / 1024).toFixed(0) + ' ko');
    ok('11b. La page exportée ne dépend pas d’Apps Script ni de /ScoutHub', !/<script src="\/ScoutHub|<script src="[^"]*script\.google|<script src="[^"]*googleusercontent/.test(html));
    // réouverture de la page exportée hors Apps Script
    const pg = await t.ctx.newPage(); await pg.setContent(html.replace('<head>', '<head><base href="https://fsggb.github.io/ScoutMap/">'), { waitUntil: 'load' }); await pg.waitForTimeout(4000);
    ok('11c. La page exportée s’ouvre et affiche la carte', await pg.evaluate(() => !!document.querySelector('.leaflet-container')));
  } else ok('11. « Enregistrer » produit une page web .html autonome', false, 'aucun téléchargement déclenché (bouton introuvable ou bloqué)');
  await t.ctx.close();

  // 12. grand jeu : chargement différé des thèmes
  t = await open(browser); fr = t.frame();
  const th = await fr.evaluate(() => new Promise(async res => { try { window.SM_LOAD('js/themes.js'); await new Promise(r => setTimeout(r, 300)); res(!!window.SM_THEMES); } catch (e) { res('ERR ' + e.message); } }));
  ok('12. Bibliothèque d’icônes du Grand jeu (themes.js embarqué)', th === true, String(th));
  // 13. Firebase (jeu en direct) : chargement du SDK depuis gstatic
  const fb = await fr.evaluate(() => new Promise(res => { const s = document.createElement('script'); s.src = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js'; s.onload = () => res(!!window.firebase); s.onerror = () => res(false); document.head.appendChild(s); }));
  ok('13. SDK Firebase chargé depuis l’iframe (jeu en direct)', fb === true);
  await t.ctx.close();
} finally { await browser.close(); inner.close(); outer.close(); }
const bad = results.filter(r => !r.pass); console.log(`\n${results.length - bad.length}/${results.length} vérifications réussies`); process.exit(bad.length ? 1 : 0);
