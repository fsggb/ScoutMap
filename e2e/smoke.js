// Essai de bout en bout dans un vrai navigateur (Playwright + Chromium) : l'application démarre sans erreur,
// le bouton Retour ne quitte pas la page, les notifications se rangent, la bibliothèque n'imprime pas de doublon,
// l'aperçu d'impression pose toutes les feuilles tout de suite.
// Lancer : node e2e/smoke.js   (Playwright doit être installé : npm i -D playwright && npx playwright install chromium)
'use strict';
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..'), TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.md': 'text/markdown', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let fails = 0; const ok = (c, m) => { console.log((c ? '✔ ' : '✘ ') + m); if (!c) fails++; };
srv.listen(0, async () => {
  const url = 'http://localhost:' + srv.address().port + '/index.html', b = await chromium.launch(), errs = [];
  try {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(url); await p.waitForTimeout(2000);
    // bibliothèque : un tracé + une copie périmée de ce tracé dans un autre travail
    const line = []; for (let i = 0; i <= 60; i++) line.push([45.10 + i * 0.002, 5.70 + Math.sin(i / 6) * 0.02]);
    const wps = [0, 20, 40, 60].map((i) => ({ lat: line[i][0], lon: line[i][1] }));
    const proj = (id, rname, layers) => ({ id, name: 'Itinéraire du 18/11/2026', updated: Date.now() - id, kinds: ['Itinéraire'], data: { app: 'ScoutMap', v: 1, name: '', rail: 'route', route: { id: id + 1, name: rname, color: '#c0262d', wps, loop: false }, az: { pts: [] }, game: { shapes: [] }, layers: layers || [], res: { line, dist: 14000, dur: 12000, directs: [], nat: [], portions: [] } } });
    await p.evaluate((l) => localStorage.setItem('scoutmap.projects', JSON.stringify(l)), [proj(100, 'Raid des Chamois'), proj(200, 'Copie', [{ type: 'route', vis: true, pid: 100, data: { id: 9, name: 'ancienne copie', wps } }])]);
    await p.reload(); await p.waitForTimeout(2000); await p.mouse.click(700, 400); await p.waitForTimeout(300);
    await p.evaluate(() => document.querySelector('#route-lib').click()); await p.waitForTimeout(300);
    ok((await p.locator('#lib-body .lname').allTextContents()).includes('Raid des Chamois'), 'bibliothèque : le nom donné au tracé est affiché');
    await p.evaluate(() => [...document.querySelectorAll('#lib-body .lib-row')].find((li) => li.dataset.pid === '200').querySelector('[data-a=open]').click()); await p.waitForTimeout(600);
    await p.evaluate(() => SM.openPdf()); await p.waitForTimeout(500);
    ok(await p.locator('#pdf-pick label.pk').count() <= 1, 'impression : un même tracé ne figure qu’une fois');
    await p.click('#pdf-ok'); await p.waitForTimeout(1500);
    ok(await p.locator('#doc-pages .tile-box').count() >= 1, 'aperçu : les feuilles de carte sont posées sans attendre les fonds');
    await p.goBack(); await p.waitForTimeout(400);
    ok(p.url().startsWith(url) && !(await p.evaluate(() => document.body.classList.contains('doc-open'))), 'Retour : ferme l’aperçu sans quitter la page');
    const nc = await p.evaluate(() => window.scoutmap && window.scoutmap.commands().then((l) => l.length));
    const err = await p.evaluate(() => window.scoutmap.execute('commande.inconnue', {}).then(() => '', (e) => e.message));
    ok(nc >= 20 && /inconnue/.test(err), 'pilotage ChatGDB : ' + nc + ' commandes, refus clair d’une commande inconnue');
    await p.evaluate(() => SM.toast('Essai de notification')); await p.waitForTimeout(9000);
    ok(await p.locator('.ntf').count() === 0 && (await p.locator('#ntf-recent').innerText()).includes('Essai'), 'notifications : rangées dans le bouton Notifications');
  } finally {
    ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
    await b.close(); srv.close(); process.exitCode = fails ? 1 : 0;
  }
});
