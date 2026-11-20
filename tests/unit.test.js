// Tests automatiques de ScoutMap : calculs purs (géométrie, filtre de position, découpage en feuilles).
// Lancer : node --test tests/unit.test.js   (Node 18 ou plus, aucune dépendance à installer)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// charge un fichier du site dans un faux « window »
function load(files) {
  const win = { navigator: {}, setTimeout, clearTimeout, Math, Date };
  win.proj4 = Object.assign(() => [0, 0], { defs: () => {} });   // projections : non testées ici
  win.window = win;
  const ctx = vm.createContext(win);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
  return win;
}

test('Geo : distances, caps et formats', () => {
  const { Geo } = load(['geo.js']);
  const paris = [48.8566, 2.3522], lyon = [45.764, 4.8357];
  const d = Geo.haversine(paris, lyon);
  assert.ok(d > 389000 && d < 395000, 'Paris-Lyon ≈ 392 km, obtenu ' + d);
  assert.ok(Math.abs(Geo.bearing([45, 5], [46, 5])) < 0.01, 'plein nord = 0°');
  assert.ok(Math.abs(Geo.bearing([45, 5], [45, 6]) - 90) < 1, 'plein est ≈ 90°');
  const p = Geo.destination([45, 5], 90, 1000);
  assert.ok(Math.abs(Geo.haversine([45, 5], p) - 1000) < 1, 'destination à 1 km');
  assert.equal(Geo.fmtDist(950).replace(/\s/g, ' '), '950 m');
  assert.ok(/^1[,.]50 km$/.test(Geo.fmtDist(1500)));
  assert.equal(Geo.esc('<a href="x">'), '&lt;a href=&quot;x&quot;&gt;');
});

test('Geo : conversions d\'azimut (degrés, grades, millièmes, nord magnétique)', () => {
  const { Geo } = load(['geo.js']);
  for (const unit of ['deg', 'grd', 'mil']) {
    for (const ref of ['true', 'mag']) {
      const v = Geo.trueToUnit(123.4, unit, ref, 2.5);
      assert.ok(Math.abs(Geo.unitToTrue(v, unit, ref, 2.5) - 123.4) < 1e-6, unit + '/' + ref + ' aller-retour');
    }
  }
  assert.ok(Math.abs(Geo.trueToUnit(90, 'grd', 'true', 0) - 100) < 1e-9, '90° = 100 gr');
});

test('Position : un saut absurde est ignoré, un vrai déplacement confirmé est accepté', () => {
  const win = load(['position.js']);
  const G = win.SMGeo, got = [];
  // abonnement sans GPS réel : on alimente le filtre à la main
  win.navigator.geolocation = { watchPosition: () => 1, clearWatch: () => {} };
  const stop = G.subscribe((f) => got.push(f));
  const t0 = 1_700_000_000_000;
  G.feed(45.0, 5.0, 10, t0);
  assert.equal(got.length, 1, 'premier point émis');
  G.feed(45.5, 5.5, 10, t0 + 1000);                       // 70 km en 1 s : impossible
  assert.ok(G.dist(got.at(-1).lat, got.at(-1).lon, 45, 5) < 50, 'le saut isolé ne déplace pas le repère');
  G.feed(45.0003, 5.0, 8, t0 + 30000);                     // 33 m en 30 s : marche normale
  assert.ok(got.at(-1).lat > 45.0001, 'un déplacement normal est suivi');
  G.feed(45.2, 5.2, 8, t0 + 40000); G.feed(45.2001, 5.2, 8, t0 + 45000);   // saut confirmé par le point suivant (voiture, téléporté…)
  assert.ok(Math.abs(got.at(-1).lat - 45.2) < 0.001, 'un saut confirmé deux fois est accepté');
  stop();
});

test('Paginate : chaque point du tracé tombe dans au moins une feuille', () => {
  const { Paginate } = load(['paginate.js']);
  const line = []; for (let i = 0; i <= 200; i++) line.push([45.1 + i * 0.0009, 5.7 + Math.sin(i / 20) * 0.03]);
  for (const paper of [[210, 297], [297, 420]]) {
    const pl = Paginate.plan({ lines: [line], scale: 25000, paper, orient: 'auto', mix: true, margin: 5, overlap: 10, corridor: 6 });
    assert.ok(pl && pl.pages.length >= 1, 'au moins une feuille');
    for (const p of Paginate.densify ? Paginate.densify(line, 50) : line) {
      const inside = pl.pages.some((pg) => p[0] >= Math.min(pg.sw[0], pg.ne[0]) - 1e-9 && p[0] <= Math.max(pg.sw[0], pg.ne[0]) + 1e-9 && p[1] >= Math.min(pg.sw[1], pg.ne[1]) - 1e-9 && p[1] <= Math.max(pg.sw[1], pg.ne[1]) + 1e-9);
      assert.ok(inside, 'point ' + p + ' hors de toutes les feuilles (' + paper + ')');
    }
    pl.pages.forEach((pg, i) => assert.equal(pg.n, i + 1, 'feuilles numérotées F1, F2… dans l\'ordre'));
  }
});

test('Site : tous les scripts sont syntaxiquement valides et référencés', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const refs = [...html.matchAll(/<script src="(js\/[^"?]+)/g)].map((m) => m[1]);
  assert.ok(refs.length > 10);
  for (const r of refs) {
    const src = fs.readFileSync(path.join(__dirname, '..', r), 'utf8');
    assert.doesNotThrow(() => new vm.Script(src, { filename: r }), r);
  }
  assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8')), 'sw.js');
});

test('Service worker : les tuiles SCAN 25 du serveur ScoutHub sont reconnues pour le hors connexion', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const fn = new vm.Script(src.match(/function isTile\(url\) \{.*?\}(?= |$)/m)[0] + '\nisTile');
  const isTile = fn.runInNewContext({});
  assert.ok(isTile('https://scouthub.fsggb.workers.dev/scan25/16/33872/23460.jpg'));
  assert.ok(isTile('https://data.geopf.fr/wmts?SERVICE=WMTS&LAYER=X'));
  assert.ok(!isTile('https://fsggb.github.io/ScoutMap/js/app.js'));
});

test('Assemblage : le fichier de l\'application correspond bien aux parties de src/app/', () => {
  const { assemble } = require('../scripts/build.js');
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'js', 'app' + '.js'), 'utf8'), assemble(), 'lancez « npm run build »');
});
