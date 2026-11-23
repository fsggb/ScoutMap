  /* ==== src/app/11-projets-fichiers.js : travaux enregistrés dans le navigateur, ouverture et enregistrement de fichiers, page web ==== */
  // ---------- Travaux enregistrés dans le navigateur, fichiers .json / .html, ouverture ----------
  var PKEY = 'scoutmap.projects', APP_URL = 'https://fsggb.github.io/ScoutMap/';
  function projList() { try { var a = JSON.parse(localStorage.getItem(PKEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function projStore(list) { try { localStorage.setItem(PKEY, JSON.stringify(list)); return true; } catch (e) { toast('Le stockage du navigateur est plein : téléchargez vos travaux pour les garder.'); return false; } }
  function projData(withRes) {
    var o = { app: 'ScoutMap', v: 1, partage: S.partage || undefined, name: S.name || '', rail: S.rail, base: S.base, ov: S.ov, route: S.route, az: S.az, game: S.game, gameStyle: S.gameStyle, grid: S.grid, tracks: S.tracks,
      layers: S.layers.filter(function (l) { return l.type === 'route' || l.type === 'az'; }).map(function (l) { return { type: l.type, vis: l.vis !== false, data: l.data, res: l.res || null, pid: l.pid || null }; }) };
    if (withRes && RT.route && RT.route.line) {
      o.res = { line: RT.route.line, dist: RT.route.dist, dur: RT.route.dur, bounds: RT.route.bounds, directs: RT.route.directs || [], nat: RT.route.nat || [],
        portions: (RT.route.portions || []).map(function (q) { return { start: q.start, end: q.end, distance: q.distance, duration: q.duration, steps: [] }; }) };
    }
    return o;
  }
  function projKinds() {
    var k = [];
    if (S.route.wps.length) k.push('Itinéraire' + (RT.route ? ' ' + G.fmtDist(RT.route.dist) : ''));
    if (S.az.pts.length) k.push('Azimuts');
    if (S.game.shapes.length) k.push('Grand jeu');
    if (S.tracks.length) k.push('Trace importée');
    return k;
  }
  var DEFAULT_NAME = /^(Itinéraire|Azimuts|Grand jeu|Mesure) \d+$|^Sans nom$/;
  function projName() {
    if (S.name) return S.name;
    // pas de nom de travail : le nom donné à l'itinéraire (ou aux azimuts) s'il a été changé
    var own = ['route', 'az', 'game'].filter(function (t) { return !isEmpty(t, S[t]) && S[t].name && !DEFAULT_NAME.test(S[t].name.trim()); })[0];
    if (own) return S[own].name.trim();
    var k = projKinds()[0] || 'Travail';
    return k.split(' ')[0] + ' du ' + new Date().toLocaleDateString('fr-FR');
  }
  function projAutosave() {
    var kinds = projKinds(); if (NOSAVE || !kinds.length || (VIEWER && !S.partage)) return;
    var eid = (S.partage && S.partage.pid) || S.pid;     // un travail partagé garde un identifiant stable : une seule ligne dans la bibliothèque
    var list = projList().filter(function (e) { return e.id !== eid; });
    var pd = projData(true);
    if (pd.res && pd.res.line) { var ln = pd.res.line.map(function (p) { return [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]; }); pd.res = Object.assign({}, pd.res, { line: ln.length > 4000 ? ln.filter(function (p, i) { return i % Math.ceil(ln.length / 4000) === 0 || i === ln.length - 1; }) : ln }); }
    list.push({ id: eid, name: projName(), updated: Date.now(), kinds: kinds, data: pd, partage: S.partage || undefined });
    list.sort(function (a, b) { return b.updated - a.updated; });
    projStore(list.slice(0, 40));
  }
  function safeName(s) { return (s || 'scoutmap').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'scoutmap'; }
  function b64e(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64d(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }
  function loadProject(o, id, opts) {
    if (!o || o.app !== 'ScoutMap') throw new Error('Ce fichier n’est pas un travail ScoutMap.');
    S.pid = id || nid(); S.name = o.name || ''; S.partage = o.partage || undefined; $('#proj-name').value = S.name;
    S.route = Object.assign(freshRoute(null, 1), o.route || {}); S.route.wps = (o.route && o.route.wps) || [];
    S.az = Object.assign(freshAz(null, 1), o.az || {}); S.az.pts = (o.az && o.az.pts) || [];
    S.game = Object.assign(freshGame(null, 1), o.game || {}); S.game.shapes = (o.game && o.game.shapes) || [];
    if (o.gameStyle) Object.assign(S.gameStyle, o.gameStyle);
    S.tracks = o.tracks || [];
    S.layers = (Array.isArray(o.layers) ? o.layers : []).filter(function (l) { return l && l.data && (l.type === 'route' || l.type === 'az'); }).map(function (l) {
      var d = Object.assign(FRESH[l.type](null, 1), l.data); if (l.type === 'route') d.wps = l.data.wps || []; else d.pts = l.data.pts || []; if (!d.id) d.id = nid();
      return { type: l.type, vis: l.vis !== false, data: d, res: l.res || null, pid: l.pid || null };
    });
    // tracés d'autres travaux affichés à côté : on reprend leur dernière version (sinon une copie ancienne s'imprimait en plus)
    (function () {
      var refs = {}, lib = {}; projList().forEach(function (e) { lib[e.id] = e; });
      var keep = S.layers.filter(function (l) { return !l.pid; });
      S.layers.forEach(function (l) { if (l.pid && l.pid !== S.pid && lib[l.pid]) refs[l.pid] = 1; });
      S.layers = keep;
      Object.keys(refs).forEach(function (k) { var e = lib[k], d = e.data || {}; ['route', 'az'].forEach(function (t) {
        if (!d[t] || isEmpty(t, Object.assign({ wps: [], pts: [] }, d[t]))) return;
        var x = Object.assign(FRESH[t](null, 1), d[t]); if (t === 'route') x.wps = d[t].wps || []; else x.pts = d[t].pts || []; x.id = nid();
        S.layers.push({ type: t, vis: true, data: x, res: t === 'route' && d.res && d.res.line ? d.res : null, pid: +k });
      }); });
      var seen = {}; ['route', 'az'].forEach(function (t) { seen[traceSig(t, S[t])] = 1; });
      S.layers = S.layers.filter(function (l) { var k = traceSig(l.type, l.data); if (!k) return true; if (seen[k]) return false; seen[k] = 1; return true; });
    })();
    if (o.base && LAYERS[o.base] && LAYERS[o.base].base && !LAYERS[o.base].hidden) S.base = o.base;
    S.grid = o.grid && o.grid.type ? { type: o.grid.type } : { type: 'none' }; if (window.SM && SM.grid) SM.grid.apply();
    if (o.ov) Object.assign(S.ov, o.ov);
    RT.route = o.res && o.res.line ? { line: o.res.line, dist: o.res.dist, dur: o.res.dur, bounds: o.res.bounds, directs: o.res.directs || [], nat: o.res.nat || [], portions: o.res.portions || [], back: { runs: [], total: 0 } } : null;
    var rail = ['route', 'az', 'game'].indexOf(o.rail) >= 0 ? o.rail : (S.route.wps.length ? 'route' : S.az.pts.length ? 'az' : S.game.shapes.length ? 'game' : 'route');
    select(null); applyVis(); applyLayers(); syncRouteUi(); refreshRouteView(); renderAz(); renderTracks(); renderLayerList(); if (window.SM && SM.game) SM.game.render();
    showHome(false); setRail(rail); setTool(rail === 'game' ? 'game' : 'pan'); persist();
    syncNames();
    var first = (rail === 'route' || rail === 'az') && isEmpty(rail, S[rail]) ? S.layers.filter(function (l) { return l.type === rail; })[0] : null;
    if (first) { activate(first.data.id); return; }
    var b = layerBounds(rail === 'route' ? 'route' : rail); if (!(opts && opts.keepView) && b && b.isValid && b.isValid()) fit(b, { padding: [70, 70], maxZoom: 16 });
  }
  function downloadText(name, text, mime) { download(name, text, mime); }
  function exportHtml(dataOverride, nameOverride) {
    var data = dataOverride && dataOverride.app ? dataOverride : projData(true), fname = (nameOverride || projName());
    var dir = location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, ''), page = location.href.split('#')[0].split('?')[0];
    toast('Préparation de la page web…');
    function get(u, bin) { return fetch(u).then(function (r) { if (!r.ok) throw new Error('Fichier introuvable : ' + u); return bin ? r.blob() : r.text(); }); }
    function dataUri(blob) { return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(blob); }); }
    get(/\.html?$/.test(page) ? page : dir + 'index.html').then(function (html) {
      var jobs = [];
      html = html.replace(/<link rel="stylesheet" href="(css\/[^"?]+)(\?[^"]*)?">/g, function (m, u) { var k = jobs.length; jobs.push(get(dir + u)); return '@@CSS' + k + '@@'; });
      html = html.replace(/<script src="(js\/[^"?]+)(\?[^"]*)?"><\/script>/g, function (m, u) { var k = jobs.length; jobs.push(get(dir + u)); return '@@JS' + k + '@@'; });
      html = html.replace(/<script src="\/ScoutHub[^>]*><\/script>/g, '');
      var logo = get(dir + 'assets/fsggb.png', true).then(dataUri);
      // un grand jeu emporte sa bibliothèque d'icônes (sinon les éléments ne s'afficheraient pas dans la page seule)
      var needLib = !!(data.game && data.game.shapes && data.game.shapes.length), lib = needLib ? [get(dir + 'js/themes.js'), get(dir + 'js/themes-art.js').catch(function () { return ''; })] : [];
      return Promise.all(jobs.concat([logo]).concat(lib)).then(function (res) {
        var lg = res[jobs.length], first = true, libTxt = needLib ? '<script>' + res[jobs.length + 1].replace(/<\/script/g, '<\\/script') + '</script>\n' + (res[jobs.length + 2] ? '<script>' + res[jobs.length + 2].replace(/<\/script/g, '<\\/script') + '</script>\n' : '') : '';
        html = html.replace(/@@(CSS|JS)(\d+)@@/g, function (m, kind, k) {
          var txt = res[+k].replace(/<\/script/g, '<\\/script');
          if (kind === 'CSS') return '<style>' + res[+k] + '</style>';
          var pre = '';
          if (first) { first = false; pre = libTxt + '<script id="scoutmap-data" type="application/json">' + JSON.stringify(data).replace(/</g, '\\u003c') + '</script>\n<script>window.SM_VIEWER=true;</script>\n'; }
          return pre + '<script>' + txt + '</script>';
        });
        html = html.split('assets/fsggb.png').join(lg);
        html = html.replace('<head>', '<head>\n<!-- Page ScoutMap (FSGGB) : tous les éléments du raid sont dans <script id="scoutmap-data"> (JSON). Ouvrez ce fichier dans ScoutMap (Fichier > Ouvrir) pour le modifier. -->');
        download(safeName(fname) + '.html', html, 'text/html');
        toast('Page web enregistrée : elle s’ouvre dans n’importe quel navigateur, sans outils d’édition.');
      });
    }).catch(function (e) { toast('Export impossible : ' + (e.message || 'erreur')); });
  }

  // ---------- Travail <-> texte (liens #projet= et données cachées dans les PDF) ----------
  function bytesB64(u8) { var s = ''; for (var i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64Bytes(t) { t = t.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; var bin = atob(t), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function pipeBytes(u8, stream) { return new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
  function projEncode(o) {
    var json = JSON.stringify(o);
    if (typeof CompressionStream === 'undefined') return Promise.resolve(b64e(json));
    return pipeBytes(new TextEncoder().encode(json), new CompressionStream('deflate-raw')).then(function (z) { return 'z' + bytesB64(z); }, function () { return b64e(json); });
  }
  function projDecode(t) {
    if (t.charAt(0) !== 'z') { try { return Promise.resolve(JSON.parse(b64d(t))); } catch (e) { return Promise.reject(e); } }
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('Ce navigateur ne sait pas relire ce fichier : essayez avec un navigateur récent.'));
    return pipeBytes(b64Bytes(t.slice(1)), new DecompressionStream('deflate-raw')).then(function (u) { return JSON.parse(new TextDecoder().decode(u)); });
  }
  // lien « ouvrir ce travail dans ScoutMap » (mis, invisible, dans les PDF imprimés)
  function projLink() {
    var o = projData(true);
    return projEncode(o).then(function (t) {
      if (t.length > 1500000) { o = projData(false); return projEncode(o).then(function (t2) { return APP_URL + '#projet=' + t2; }); }
      return APP_URL + '#projet=' + t;
    });
  }
  // cherche le travail caché dans un PDF imprimé par ScoutMap (le lien est écrit en clair dans le fichier)
  function pdfProject(buf) {
    var u = new Uint8Array(buf), txt = '';
    for (var i = 0; i < u.length; i += 16384) txt += String.fromCharCode.apply(null, u.subarray(i, i + 16384));
    var re = /#projet=([A-Za-z0-9_\-]+)/g, m, best = null;
    while ((m = re.exec(txt))) { if (!best || m[1].length > best.length) best = m[1]; }
    if (!best) return Promise.resolve(null);
    return projDecode(best);
  }
  function fileToProject(f) {
    return new Promise(function (ok, ko) {
      var fr = new FileReader(), pdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
      fr.onerror = function () { ko(new Error('Lecture impossible.')); };
      fr.onload = function () {
        try {
          if (pdf) { pdfProject(fr.result).then(function (o) { if (!o) throw new Error('Ce PDF ne contient pas de travail ScoutMap (seuls les PDF imprimés par ScoutMap se relisent).'); ok(o); }).catch(ko); return; }
          var txt = String(fr.result), o = null;
          if (/\.html?$/i.test(f.name)) { var m = /<script id="scoutmap-data" type="application\/json">([\s\S]*?)<\/script>/.exec(txt); if (!m) throw new Error('Cette page ne contient pas de travail ScoutMap.'); o = JSON.parse(m[1]); }
          else o = JSON.parse(txt);
          ok(o && o.app === 'ScoutMap' ? o : null);
        } catch (e) { ko(e); }
      };
      if (pdf) fr.readAsArrayBuffer(f); else fr.readAsText(f);
    });
  }
  function openFiles(files) {
    Array.prototype.forEach.call(files, function (f) {
      if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') { fileToProject(f).then(function (o) { loadProject(o); toast('Travail retrouvé dans le PDF : ' + (o.name || f.name)); }).catch(function (e) { toast(e.message || 'Ouverture impossible.'); }); return; }
      if (/\.(gpx|kml)$/i.test(f.name)) { if (S.mode !== 'route') setRail('route'); showHome(false); importGpx(f); return; }
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var txt = String(fr.result), o = null;
          if (/\.html?$/i.test(f.name)) { var m = /<script id="scoutmap-data" type="application\/json">([\s\S]*?)<\/script>/.exec(txt); if (!m) throw new Error('Cette page ne contient pas de travail ScoutMap.'); o = JSON.parse(m[1]); }
          else { o = JSON.parse(txt); }
          if (o && o.app === 'ScoutMap') { loadProject(o); toast('Travail ouvert : ' + (o.name || f.name)); }
          else if (/\.(geo)?json$/i.test(f.name)) { if (S.mode !== 'route') setRail('route'); showHome(false); importGpx(f); }
          else throw new Error('Format non reconnu.');
        } catch (e) { toast(e.message || 'Ouverture impossible.'); }
      };
      fr.readAsText(f);
    });
  }
  function newProject(t) {
    resetAll(false); S.pid = nid(); showHome(false); setRail(t);
    if (t === 'game' && window.SM && SM.game && SM.game.wizard) SM.game.wizard();
    if (isMobile()) { S.panelOpen = false; applyPanel(); persist(); }
  }
  function fmtWhen(ts) { return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' + new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  function renderHome() {
    var list = projList().sort(function (a, b) { return b.updated - a.updated; });
    $('#proj-rows').innerHTML = list.length ? list.map(function (e) {
      return '<li data-id="' + e.id + '"><button class="pr-open" data-a="open"><b>' + esc(e.name) + '</b><small>' + esc((e.kinds || []).join(' · ')) + ' · ' + fmtWhen(e.updated) + '</small></button>' +
        '<button class="ibtn" data-a="dl" title="Enregistrer ce travail (page web .html)" aria-label="Télécharger">' + ic('download') + '</button><button class="ibtn danger" data-a="del" title="Supprimer" aria-label="Supprimer">' + ic('trash') + '</button></li>';
    }).join('') : '<li class="pr-none">Aucun travail enregistré pour le moment : ils apparaîtront ici automatiquement.</li>';
  }
  function resetAll(ask) {
    if (ask && !confirm('Effacer le travail en cours ? (il reste dans la liste de l’accueil tant que vous ne le supprimez pas)')) return;
    S.route = freshRoute(null, 1); S.az = freshAz(null, 1); S.meas = freshMeas(null, 1); S.game = freshGame(null, 1); S.layers = []; S.tracks = []; S.name = '';
    S.vis = { route: true, az: true, meas: true, game: true }; RT.route = null; select(null); applyVis();
    $('#proj-name').value = ''; S.pid = nid();
    syncRouteUi(); refreshRouteView(); renderAz(); renderMeas(); renderTracks(); renderStored(); renderLayerList(); if (window.SM && SM.game) SM.game.render(); persist();
    if (ask) showHome(true);
  }
  $('#proj-name').addEventListener('input', function () { S.name = this.value; persist(); });

