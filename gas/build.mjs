// Génère le projet Google Apps Script (gas/src) à partir des sources de ScoutMap (index.html, css/, js/).
// Usage : node gas/build.mjs            (depuis la racine du dépôt)
//   ASSET_BASE=https://…/assets/ node gas/build.mjs   pour héberger vidéos et vignettes ailleurs
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'gas', 'src');
const ASSET_BASE = (process.env.ASSET_BASE || 'https://fsggb.github.io/ScoutMap/assets/').replace(/\/?$/, '/');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

// remplacement exact : échoue si le motif n'apparaît pas exactement `n` fois (détecte une dérive du code source)
function sub(src, name, from, to, n = 1) {
  const parts = src.split(from);
  if (parts.length - 1 !== n) throw new Error(`[${name}] motif attendu ${n} fois, trouvé ${parts.length - 1} : ${from}`);
  return parts.join(to);
}
const blob = (name, txt) => `<script type="text/x-sm" data-f="${name}">${txt.replace(/<\/script/gi, '<\\/script')}</script>\n`;

// ---------- sources ----------
let index = rd('index.html');
let app = rd('js/app.js'), game = rd('js/game.js'), live = rd('js/live.js');

// 1. L'iframe Apps Script n'a ni ?paramètres ni #ancre de l'URL réelle : le shim fournit SM_LOC / SM_APP_URL
index = sub(index, 'index', "/[?&]salle=/.test(location.search)", "/[?&]salle=/.test(window.SM_LOC.search)");
app = sub(app, 'app', "APP_URL = 'https://fsggb.github.io/ScoutMap/'", 'APP_URL = window.SM_APP_URL');
app = sub(app, 'app', "var hash = location.hash || '';", "var hash = window.SM_LOC.hash || '';");
app = sub(app, 'app', "try { P = new URLSearchParams(location.search); }", "try { P = new URLSearchParams(window.SM_LOC.search); }");
live = sub(live, 'live', "location.href.split('#')[0].split('?')[0] + '?salle='", "window.SM_APP_URL + '?salle='");
live = sub(live, 'live', "location.replace(location.href.split('?')[0].split('#')[0])", "window.SM_NAV(window.SM_APP_URL)");
live = sub(live, 'live', "try { P = new URLSearchParams(location.search); }", "try { P = new URLSearchParams(window.SM_LOC.search); }");
live = sub(live, 'live', "/[#&]k=([A-Za-z0-9_-]+)/.exec(location.hash)", "/[#&]k=([A-Za-z0-9_-]+)/.exec(window.SM_LOC.hash)");
live = sub(live, 'live', "/[#&]a=([A-Za-z0-9_-]+)/.exec(location.hash)", "/[#&]a=([A-Za-z0-9_-]+)/.exec(window.SM_LOC.hash)");

// 2. Les thèmes (580 ko) restent chargés à la demande, mais depuis les blocs embarqués
game = sub(game, 'game', "sc.src = 'js/themes.js' + (VQ ? '?' + VQ : ''); sc.onload = res; sc.onerror = function () { themesP = null; rej(); }; document.head.appendChild(sc);",
  "window.SM_LOAD('js/themes.js') ? res() : (themesP = null, rej());");
game = sub(game, 'game', "sc.src = 'js/themes-art.js' + (VQ ? '?' + VQ : ''); sc.onload = res; sc.onerror = function () { artP = null; rej(); }; document.head.appendChild(sc);",
  "window.SM_LOAD('js/themes-art.js') ? res() : (artP = null, rej());");

// 3. « Enregistrer » (page web autonome) relit ses propres fichiers : ici ils sont dans les blocs embarqués
app = sub(app, 'app', "function get(u, bin) { return fetch(u).then(", "function get(u, bin) { return window.SM_FETCH(u, bin).then(");
app = sub(app, 'app', "get(/\\.html?$/.test(page) ? page : dir + 'index.html')", "get(dir + 'index.html')");

// 4. Vidéos et vignettes (30 Mo) : ne tiennent pas dans un projet Apps Script → adresse configurable (ASSET_BASE)
const fixAssets = (s) => s.replace(/(["'(])assets\/(tuto-[A-Za-z0-9._-]+)/g, `$1${ASSET_BASE}$2`).replace(/'assets\/tuto-'/g, `'${ASSET_BASE}tuto-'`);
index = fixAssets(index); app = fixAssets(app);
app = app.replace(/'assets\/tuto-poster-'/g, `'${ASSET_BASE}tuto-poster-'`);

// 5. Logo : en base64 (sert aussi aux exports)
const logo = 'data:image/png;base64,' + readFileSync(join(ROOT, 'assets/fsggb.png')).toString('base64');
const withLogo = (s) => s.split('assets/fsggb.png').join(logo);

// 6. Le client ScoutHub (chemin /ScoutHub/… de GitHub Pages) n'existe pas ici
const scriptTags = /<script src="[^"]*"[^>]*><\/script>\n?/g;
const exportTemplate = index; // modèle de la page exportée : encore les balises <script src="js/…">
const body = index.slice(0, index.indexOf('<script>if(/[?&]salle='));
if (!/<body/.test(body)) throw new Error('structure index.html inattendue');

// ---------- Index.html (gabarit Apps Script) ----------
const head = body.slice(0, body.indexOf('</head>'));
const headLinks = [...head.matchAll(/<link rel="stylesheet" href="(https:[^"]+)">/g)].map(m => `<link rel="stylesheet" href="${m[1]}">`).join('\n');
const bodyHtml = withLogo(body.slice(body.indexOf('<body')).replace(/<body[^>]*>/, '').trim());

const css = rd('css/style.css');
const sources = {
  'js/geo.js': rd('js/geo.js'), 'js/app.js': app, 'js/game.js': game, 'js/paginate.js': rd('js/paginate.js'),
  'js/doc.js': rd('js/doc.js'), 'js/calques.js': rd('js/calques.js'), 'js/vendor/qrcode.min.js': rd('js/vendor/qrcode.min.js'),
  'js/firebase-config.js': rd('js/firebase-config.js'), 'js/live.js': live,
};
const lazy = { 'js/themes.js': rd('js/themes.js'), 'js/themes-art.js': rd('js/themes-art.js') };
const order = Object.keys(sources);
const cdn = ['https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.12.1/proj4.js'];

rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const W = (n, t) => writeFileSync(join(OUT, n), t);

W('Css.html', `<style>\n${css.replace(/<\/style/gi, '<\\/style')}\n</style>\n`);
W('Shim.html', readFileSync(join(ROOT, 'gas', 'shim.js'), 'utf8').replace(/^/, '<script>\n').replace(/$/, '\n</script>\n'));
W('Blobs.html',
  order.map(f => blob(f, f === 'js/app.js' ? sources[f] : withLogo(sources[f]))).join('') +
  Object.entries(lazy).map(([f, t]) => blob(f, t)).join('') +
  blob('assets/fsggb.png', logo) +
  blob('index.html', exportTemplate.replace(/<script src="\/ScoutHub[^>]*><\/script>\n?/, '')) +
  blob('css/style.css', css) +
  `<script type="application/json" id="sm-order">${JSON.stringify(order)}</script>\n` +
  `<script type="application/json" id="sm-cdn">${JSON.stringify(cdn)}</script>\n`);
W('Index.html', `<!DOCTYPE html>
<html lang="fr">
<head>
<base target="_top">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>ScoutMap – FSGGB</title>
${headLinks}
<?!= include('Css') ?>
</head>
<body>
${bodyHtml}
<script>window.SM_APP_URL = <?!= JSON.stringify(appUrl) ?>;</script>
<?!= include('Shim') ?>
<?!= include('Blobs') ?>
<script>window.SM_BOOT();</script>
</body>
</html>
`);
W('Code.gs', readFileSync(join(ROOT, 'gas', 'Code.gs'), 'utf8'));
W('appsscript.json', JSON.stringify({
  timeZone: 'Europe/Paris', exceptionLogging: 'STACKDRIVER', runtimeVersion: 'V8',
  webapp: { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' },
}, null, 2) + '\n');

const size = (n) => (readFileSync(join(OUT, n)).length / 1024).toFixed(0) + ' ko';
console.log('Projet Apps Script généré dans gas/src :');
for (const n of ['Index.html', 'Css.html', 'Shim.html', 'Blobs.html', 'Code.gs', 'appsscript.json']) console.log(' ', n.padEnd(16), size(n));
