  /* ==== src/app/16-pilotage-chatgdb.js : pilotage par ChatGDB (même canal que les applications Craft) et vue partielle ?vue=carte ==== */
  /* window.scoutmap : le canal de commandes que ChatGDB utilise pour les applications de ScoutHub (actions api_commandes, api_inspecter,
     api_executer, api_lot, api_requete). Mêmes méthodes que la suite Craft : commands(), execute(id, params), docInspect(), request(méthode, params).
     Chaque commande agit comme la personne le ferait (le travail est enregistré dans le navigateur, Ctrl+Z annule). */
  var PILOT = (function () {
    var MODES = { chemin: 'route', route: 'route', droite: 'direct', direct: 'direct', azimut: 'az', az: 'az' };
    function num(v, nom) { var n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.')); if (!isFinite(n)) throw new Error('« ' + nom + ' » doit être un nombre'); return n; }
    function needRoute() { if (S.mode !== 'route') { showHome(false); setRail('route'); } }
    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    // position à partir de {lat, lon}, {coords: « texte »} (tous formats, liens Google Maps…) ou {query: « lieu »}
    function where(p) {
      if (p && p.lat != null && p.lon != null) return Promise.resolve({ lat: num(p.lat, 'lat'), lon: num(p.lon, 'lon'), name: p.name || '' });
      var txt = String((p && (p.coords || p.query || p.lieu)) || '').trim(); if (!txt) return Promise.reject(new Error('indiquez lat et lon, coords ou query'));
      var c = window.SMCoords && SMCoords.parse(txt); if (c) return Promise.resolve({ lat: c.lat, lon: c.lon, name: p.name || '' });
      return geoSearch(txt.slice(0, 120), 1).then(function (fs) {
        var f = fs[0]; if (!f || !f.geometry) throw new Error('lieu introuvable : ' + txt);
        var pr = f.properties || {}; return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], name: p.name || String(pr.toponym || pr.name || pr.label || txt).slice(0, 80) };
      });
    }
    function legMode(w) { return w.az ? 'azimut' : w.direct ? 'droite' : 'chemin'; }
    function routeInfo() {
      var d = S.route, w = d.wps;
      return {
        nom: d.name, boucle: loopOf(d), outil: segOf() === 'az' ? 'azimut' : segOf() === 'direct' ? 'droite' : 'chemin',
        points_seuls: (d.spots || []).map(function (q, i) { return { id: q.id, nom: q.name || 'P' + (i + 1), lat: +q.lat.toFixed(6), lon: +q.lon.toFixed(6) }; }),
        points: w.map(function (p, i) {
          var o = { index: i, repere: lblOf(d, i), nom: nameOf(d, i), lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6) };
          if (i > 0) { o.rejoint = legMode(p); if (p.az) { var m = G.magAz([w[i - 1].lat, w[i - 1].lon], [p.lat, p.lon]); o.azimut = m.az; o.contre_azimut = m.back; o.distance_m = Math.round(m.dist); } }
          return o;
        }),
        calcul: RT.route ? { distance_m: Math.round(RT.route.dist), duree_s: Math.round(RT.route.dur || 0) } : null,
        etat: ($('#route-status') && $('#route-status').textContent) || ''
      };
    }
    function libList() { return projList().sort(function (a, b) { return b.updated - a.updated; }).map(function (e) { return { id: e.id, nom: e.name, contenu: e.kinds || [], modifie: new Date(e.updated).toISOString(), en_cours: e.id === S.pid, affiche: libShown(e.id) }; }); }
    function inspect() {
      var c = map.getCenter();
      return {
        application: 'ScoutMap', version: SM.appVersion, travail: S.name || '', type: S.mode || 'accueil', fond: S.base,
        couches: OVERS.filter(function (k) { return S.ov[k]; }), grille: S.grid && S.grid.type,
        vue: { lat: +c.lat.toFixed(5), lon: +c.lng.toFixed(5), zoom: +map.getZoom().toFixed(2), echelle: '1 : ' + sp(curScale()) },
        itineraire: S.mode === 'route' || S.route.wps.length ? routeInfo() : null,
        grand_jeu: S.game && S.game.shapes && S.game.shapes.length ? { nom: S.game.name, elements: S.game.shapes.length } : null,
        bibliotheque: libList().slice(0, 40)
      };
    }
    // attend la fin du calcul de l'itinéraire (30 s au plus)
    function settle() {
      var t0 = Date.now();
      return (function loop() {
        var st = ($('#route-status') && $('#route-status').textContent) || '';
        if (S.route.wps.length < 2 || RT.route || /impossible|introuvable|erreur/i.test(st) || Date.now() - t0 > 30000) return Promise.resolve(routeInfo());
        return wait(300).then(loop);
      })();
    }
    function addPoint(p, mode) {
      needRoute();
      return where(p).then(function (g) {
        var m = MODES[String(mode || p.mode || segOf()).toLowerCase()] || 'route', at = p.at == null ? null : Math.max(0, Math.min(S.route.wps.length, Math.round(num(p.at, 'at'))));
        addWp([g.lat, g.lon], g.name || null, at, m === 'route' ? null : m);
        return { ajoute: S.route.wps.length, point: { lat: g.lat, lon: g.lon, nom: g.name || '' } };
      });
    }
    var CMDS = [
      { id: 'app.inspect', label: 'État complet du travail (comme api_inspecter)', location: 'Application', run: function () { return inspect(); } },
      { id: 'project.new', label: 'Nouveau tracé (itinéraire, azimuts ou grand jeu)', location: 'Fichier', params: { type: 'itineraire | azimuts | grandjeu', nom: 'texte (facultatif)' },
        run: function (p) {
          var t = String(p.type || 'itineraire').toLowerCase();
          if (/jeu|game/.test(t)) newProject('game'); else { newProject('route'); if (/az/.test(t)) { S.route.seg = 'az'; S.route.loop = false; syncRouteUi(); setTool('route'); } }
          if (p.nom) { S.name = String(p.nom).slice(0, 80); $('#proj-name').value = S.name; S.route.name = S.name; syncNames(); }
          persist(); return inspect();
        } },
      { id: 'project.rename', label: 'Renommer le travail en cours', location: 'Fichier', params: { nom: 'texte' }, run: function (p) { var n = String(p.nom || '').trim().slice(0, 80); if (!n) throw new Error('« nom » vide'); S.name = n; $('#proj-name').value = n; if (S.mode === 'route') { S.route.name = n; syncNames(); } persist(); return { nom: n }; } },
      { id: 'library.list', label: 'Tracés enregistrés dans le navigateur (bibliothèque)', location: 'Bibliothèque', run: function () { return libList(); } },
      { id: 'library.open', label: 'Ouvrir un tracé de la bibliothèque', location: 'Bibliothèque', params: { id: 'identifiant (library.list)' }, run: function (p) { var id = +p.id; if (!projList().some(function (x) { return x.id === id; })) throw new Error('tracé introuvable : ' + p.id); openProj(id); return inspect(); } },
      { id: 'library.show', label: 'Afficher (ou masquer) un tracé de la bibliothèque sur la carte, avec le tracé en cours', location: 'Bibliothèque', params: { id: 'identifiant', visible: 'true | false' },
        run: function (p) {
          var id = +p.id, e = projList().filter(function (x) { return x.id === id; })[0]; if (!e) throw new Error('tracé introuvable : ' + p.id);
          var on = p.visible !== false && p.visible !== 'false';
          if (!on) { S.layers = S.layers.filter(function (l) { return l.pid !== id; }); applyVis(); renderStored(); renderLayerList(); refreshProfile(); persist(); }
          else if (!libShown(id)) addFromData(e.data, id);
          return { id: id, affiche: libShown(id) };
        } },
      { id: 'view.place', label: 'Centrer la carte sur un lieu, une adresse, des coordonnées ou un lien Google Maps', location: 'Affichage', params: { query: 'texte', zoom: 'nombre (facultatif, 14 par défaut)' },
        run: function (p) { return where(p).then(function (g) { showHome(false); map.setView([g.lat, g.lon], p.zoom == null ? 14 : num(p.zoom, 'zoom'), { animate: false }); return { lat: g.lat, lon: g.lon, nom: g.name }; }); } },
      { id: 'view.center', label: 'Centrer la carte sur des coordonnées', location: 'Affichage', params: { lat: 'nombre', lon: 'nombre', zoom: 'nombre (facultatif)' },
        run: function (p) { showHome(false); map.setView([num(p.lat, 'lat'), num(p.lon, 'lon')], p.zoom == null ? map.getZoom() : num(p.zoom, 'zoom'), { animate: false }); return inspect().vue; } },
      { id: 'view.scale', label: 'Régler l’échelle de la carte (ex. 25000 pour 1 : 25 000)', location: 'Affichage', params: { echelle: 'nombre' }, run: function (p) { setScale(num(p.echelle, 'echelle')); return inspect().vue; } },
      { id: 'view.fit', label: 'Cadrer la carte sur tout ce qui est tracé', location: 'Affichage', run: function () { $('#fit-all').click(); return inspect().vue; } },
      { id: 'map.base', label: 'Changer le fond de carte', location: 'Affichage', params: { fond: Object.keys(LAYERS).filter(function (k) { return LAYERS[k].base && !LAYERS[k].hidden; }).join(' | ') + ' | scan25' },
        run: function (p) { var b = String(p.fond || ''); if (!LAYERS[b] || !LAYERS[b].base) throw new Error('fond inconnu : ' + b); S.base = b; buildTiles(); applyLayers(); persist(); return { fond: b }; } },
      { id: 'map.layers', label: 'Afficher ou masquer des couches (courbes de niveau, ombrage, sentiers…)', location: 'Affichage', params: { afficher: OVERS.join(', '), masquer: 'idem' },
        run: function (p) { [].concat(p.afficher || []).forEach(function (k) { if (S.ov.hasOwnProperty(k)) S.ov[k] = true; }); [].concat(p.masquer || []).forEach(function (k) { if (S.ov.hasOwnProperty(k)) S.ov[k] = false; }); applyLayers(); persist(); return { couches: OVERS.filter(function (k) { return S.ov[k]; }) }; } },
      { id: 'app.point_style', label: 'Apparence des points posés sur la carte', location: 'Réglages', params: { forme: 'pastille | croix | pointeur | point' },
        run: function (p) { var f = String(p.forme || ''); if (['pastille', 'croix', 'pointeur', 'point'].indexOf(f) < 0) throw new Error('forme : pastille, croix, pointeur ou point'); DEF.points.style = f; saveDefaults(); applyPointStyle(); return { forme: f }; } },
      { id: 'map.grid', label: 'Grille sur la carte (aucune, kilométrique, carroyage bleu, UTM, lat/long, jeu)', location: 'Affichage', params: { type: 'none | l93 | km | utm | ll | game' },
        run: function (p) { var t = String(p.type || 'none'); if (['none', 'l93', 'km', 'utm', 'll', 'game'].indexOf(t) < 0) throw new Error('grille inconnue : ' + t); S.grid = { type: t }; if (SM.grid) SM.grid.apply(); persist(); return { grille: t }; } },
      { id: 'route.add', label: 'Ajouter un point à l’itinéraire (lieu, coordonnées ou lien), relié par chemin, en ligne droite ou en azimut', location: 'Itinéraire',
        params: { query: 'lieu (ou coords, ou lat+lon)', mode: 'chemin | droite | azimut', nom: 'texte (facultatif)', at: 'position (facultatif, à la fin par défaut)' },
        run: function (p) { return addPoint({ lat: p.lat, lon: p.lon, coords: p.coords, query: p.query, name: p.nom, at: p.at }, p.mode); } },
      { id: 'route.add_spot', label: 'Poser un point seul (repère isolé, non relié au chemin)', location: 'Itinéraire', params: { query: 'lieu (ou coords, ou lat+lon)', nom: 'texte (facultatif)' },
        run: function (p) { needRoute(); return where(p).then(function (g) { var o = addSpot([g.lat, g.lon], p.nom || g.name); return o ? { id: o.id, lat: g.lat, lon: g.lon, nom: o.name || '' } : null; }); } },
      { id: 'route.add_azimuth', label: 'Ajouter le point suivant par azimut (degrés, boussole) et distance depuis le dernier point', location: 'Itinéraire', params: { azimut: '0 à 360', distance: 'mètres', nom: 'texte (facultatif)' },
        run: function (p) {
          needRoute(); var w = S.route.wps; if (!w.length) throw new Error('posez d’abord le point de départ (route.add)');
          var az = num(p.azimut, 'azimut'), d = num(p.distance, 'distance'); if (az < 0 || az > 360 || d <= 0 || d > 50000) throw new Error('azimut entre 0 et 360, distance entre 1 m et 50 km');
          var last = w[w.length - 1], q = G.fromMagAz([last.lat, last.lon], az % 360, d); addWp(q, p.nom || null, null, 'az'); return routeInfo().points.slice(-1)[0];
        } },
      { id: 'route.mode', label: 'Changer la façon de rejoindre un point (chemin, droite, azimut)', location: 'Itinéraire', params: { index: 'numéro du point (1 = première étape)', mode: 'chemin | droite | azimut' },
        run: function (p) { var i = Math.round(num(p.index, 'index')), m = MODES[String(p.mode || '').toLowerCase()]; if (!S.route.wps[i] || i < 1) throw new Error('point inconnu : ' + p.index); if (!m) throw new Error('mode : chemin, droite ou azimut'); setDirect(i, m === 'az' ? 'az' : m === 'direct'); return routeInfo().points[i]; } },
      { id: 'route.tool', label: 'Choisir l’outil de pose (chemin, droite, azimut) pour les prochains points', location: 'Itinéraire', params: { mode: 'chemin | droite | azimut' },
        run: function (p) { var m = MODES[String(p.mode || '').toLowerCase()]; if (!m) throw new Error('mode : chemin, droite ou azimut'); needRoute(); S.route.seg = m; setTool('route'); persist(); return { outil: p.mode }; } },
      { id: 'route.remove', label: 'Retirer un point de l’itinéraire', location: 'Itinéraire', params: { index: 'numéro du point (0 = départ)' }, run: function (p) { var i = Math.round(num(p.index, 'index')); if (!S.route.wps[i]) throw new Error('point inconnu : ' + p.index); removeWp(i); return routeInfo(); } },
      { id: 'route.rename_point', label: 'Nommer un point de l’itinéraire', location: 'Itinéraire', params: { index: 'numéro', nom: 'texte' }, run: function (p) { var w = S.route.wps[Math.round(num(p.index, 'index'))]; if (!w) throw new Error('point inconnu'); w.name = String(p.nom || '').slice(0, 80); renderRouteMarkers(); persist(); return routeInfo(); } },
      { id: 'route.clear', label: 'Effacer tous les points de l’itinéraire', location: 'Itinéraire', run: function () { S.route.wps = []; select(null); renderRouteMarkers(); computeRoute(); persist(); return routeInfo(); } },
      { id: 'route.loop', label: 'Boucle (retour au départ) ou aller simple', location: 'Itinéraire', params: { boucle: 'true | false' }, run: function (p) { S.route.loop = p.boucle === true || p.boucle === 'true'; syncRouteUi(); renderRouteMarkers(); computeRoute(); persist(); return routeInfo(); } },
      { id: 'route.reverse', label: 'Inverser le sens de l’itinéraire', location: 'Itinéraire', run: function () { reverseRoute(); return routeInfo(); } },
      { id: 'route.options', label: 'Options de calcul : le plus rapide ou le plus court, distance maximale', location: 'Itinéraire', params: { optimisation: 'rapide | court', distance_max_km: 'nombre ou 0 pour aucune' },
        run: function (p) {
          if (p.optimisation) S.route.opt = /court|short/.test(p.optimisation) ? 'shortest' : 'fastest';
          if (p.distance_max_km != null) { var k = num(p.distance_max_km, 'distance_max_km'); S.route.maxOn = k > 0; if (k > 0) S.route.maxKm = k; }
          syncRouteUi(); computeRoute(); persist(); return routeInfo();
        } },
      { id: 'route.result', label: 'Attendre le calcul et donner le résultat (distance, durée, points, azimuts)', location: 'Itinéraire', run: function () { return settle(); } },
      { id: 'print.open', label: 'Ouvrir la fenêtre d’impression (la personne choisit et imprime)', location: 'Fichier', run: function () { if (!SM.openPdf) throw new Error('impression indisponible'); SM.openPdf(); return 'fenêtre d’impression ouverte'; } },
      { id: 'share.link', label: 'Lien qui ouvre ce travail complet dans ScoutMap', location: 'Fichier', run: function () { return projLink().then(function (u) { return { lien: u }; }); } },
      { id: 'embed.show', label: 'Passer cette page en vue partielle : la carte seule avec les tracés donnés, chacun de sa couleur (lecture seule, rien n’est enregistré)', location: 'Artefact',
        params: { donnees: 'travail ScoutMap (objet, produit par embed.spec)', titre: 'texte', legende: 'true | false', profil: 'true | false' }, run: function (p) { return embedShow(p); } },
      { id: 'embed.spec', label: 'Vue partielle pour un artefact ChatGDB : seulement la carte et les tracés choisis, chacun de sa couleur, avec une légende',
        location: 'Artefact', params: { ids: 'identifiants de la bibliothèque (facultatif ; sinon le travail en cours)', titre: 'texte (facultatif)', legende: 'true | false', profil: 'true | false' },
        run: function (p) { return embedSpec(p); } }
    ];
    function commands() { return CMDS.map(function (c) { return { id: c.id, label: c.label, location: c.location, params: c.params || {} }; }); }
    function execute(id, params) {
      var c = CMDS.filter(function (x) { return x.id === id; })[0];
      if (!c) return Promise.reject(new Error('commande inconnue « ' + id + ' » : voir la liste (commands)'));
      try { return Promise.resolve(c.run(params && typeof params === 'object' ? params : {})); } catch (e) { return Promise.reject(e); }
    }
    function request(m, p) {
      p = p || {};
      if (m === 'engine.commands') return Promise.resolve(commands());
      if (m === 'engine.execute') return execute(p.command || p.commande, p.params || p.parametres);
      if (m === 'document.inspect' || m === 'engine.inspect') return Promise.resolve(inspect());
      if (m === 'ui.inspect') return Promise.resolve({ accueil: !$('#home').hidden, panneau: S.panelOpen, onglet: SUB || S.rail, outil: RT.tool, outil_itineraire: segOf(), apercu_impression: document.body.classList.contains('doc-open') });
      if (m === 'render.embed') return embedSpec(p);
      return Promise.reject(new Error('méthode inconnue « ' + m + ' » (engine.commands, engine.execute, document.inspect, ui.inspect, render.embed)'));
    }
    // ---------- vue partielle : données compactes dans l'adresse (artefact « app » de ChatGDB) ----------
    function embedSpec(p) {
      var ids = [].concat(p.ids || []).map(Number).filter(isFinite), list = projList(), objs = [];
      if (ids.length) ids.forEach(function (id) { var e = list.filter(function (x) { return x.id === id; })[0]; if (!e) throw new Error('tracé introuvable : ' + id); objs.push(e.data); });
      else objs.push(projData(true));
      // un seul paquet : le premier tracé, les autres en « calques » (chacun garde sa couleur à l'affichage)
      var main = JSON.parse(JSON.stringify(objs[0])), extra = [];
      objs.slice(1).forEach(function (o) {
        ['route', 'az'].forEach(function (t) { if (o[t] && !isEmpty(t, o[t])) extra.push({ type: t, vis: true, data: o[t], res: t === 'route' ? o.res || null : null }); });
        (o.layers || []).forEach(function (l) { extra.push(l); });
      });
      main.layers = (main.layers || []).concat(extra);
      // allège : lignes calculées arrondies à 5 décimales (environ 1 m)
      function slim(r) { return r && r.line ? Object.assign({}, r, { line: r.line.map(function (q) { return [Math.round(q[0] * 1e5) / 1e5, Math.round(q[1] * 1e5) / 1e5]; }), portions: [] }) : r; }
      if (main.res) main.res = slim(main.res); main.layers = main.layers.map(function (l) { return Object.assign({}, l, { res: slim(l.res) }); });
      delete main.game; delete main.tracks;
      var args = { donnees: main, titre: p.titre ? String(p.titre).slice(0, 80) : '', legende: !(p.legende === false || p.legende === 'false'), profil: p.profil === true || p.profil === 'true' };
      var spec = { app: 'Cartes IGN', commandes: [{ commande: 'embed.show', parametres: args }] }, txt = JSON.stringify(spec);
      return Promise.resolve({ artefact: '<artifact id="carte" type="app" title="' + esc(p.titre || 'Carte') + '">' + txt + '</artifact>', taille: txt.length });
    }
    return { commands: commands, execute: execute, request: request, inspect: inspect };
  })();
  window.scoutmap = {
    commands: function () { return Promise.resolve(PILOT.commands()); },
    execute: function (id, params) { return PILOT.execute(id, params); },
    docInspect: function () { return Promise.resolve(PILOT.inspect()); },
    inspect: function () { return Promise.resolve(PILOT.inspect()); },
    request: function (m, p) { return PILOT.request(m, p); },
    version: function () { return SM.appVersion; }
  };
  // Vue partielle (commande embed.show, utilisée par les artefacts de ChatGDB) : la carte seule, en lecture, avec les tracés reçus.
  // Comme pour la suite Craft, rien ne passe par l'adresse ; la page ne touche jamais au travail enregistré dans le navigateur.
  function embedShow(P) {
    VIEWER = true; NOSAVE = true; clearTimeout(saveTimer);   // plus aucun enregistrement dans cette page (ni l'enregistrement déjà en attente)
    if (SIM.open) simClose(true);
    document.body.classList.add('viewer', 'embed'); showHome(false); S.panelOpen = false; $('#app').classList.add('nopanel'); setTool('pan');
    var dk = $('#dock'); if (dk) dk.classList.toggle('embed-off', !P.profil);
    var old = document.querySelector('.embed-legend'); if (old) old.parentNode.removeChild(old);
    var ready = P.donnees && P.donnees.app === 'ScoutMap' ? Promise.resolve(P.donnees) : Promise.resolve(null);
    return ready.then(function (o) {
      if (o) loadProject(o, null, { keepView: true });
      if (S.mode !== 'route' && S.mode !== 'az') setRail('route');
      setTool('pan'); S.panelOpen = false; $('#app').classList.add('nopanel');
      // couleurs différentes pour chaque tracé (l'impression, elle, garde une couleur unique)
      var used = [S.route.color]; S.layers.forEach(function (l) { if (l.type === 'route') { if (used.indexOf(l.data.color) >= 0) l.data.color = libColor('route', used); used.push(l.data.color); } });
      renderStored(); renderLayerList();
      var items = layersList(true).filter(function (l) { return !l.empty && (l.type === 'route' || l.type === 'az'); });
      var titre = String(P.titre || '').trim();
      if (P.legende !== false && (items.length > 1 || titre)) {
        var lg = document.createElement('div'); lg.className = 'embed-legend';
        lg.innerHTML = (titre ? '<b class="el-t">' + esc(titre) + '</b>' : '') + items.map(function (l) { return '<span><i style="background:' + esc(l.color) + '"></i>' + esc(l.name) + (l.res && l.res.dist ? ' · ' + G.fmtDist(l.res.dist) : '') + '</span>'; }).join('');
        $('#mapwrap').appendChild(lg);
      }
      setTimeout(function () {
        map.invalidateSize(); var b = null;
        items.forEach(function (l) { var x = layerBounds(l.key); if (x && x.isValid()) b = b ? b.extend(x) : L.latLngBounds(x.getSouthWest(), x.getNorthEast()); });
        if (b) fit(b, { padding: [40, 40], maxZoom: 16 });
      }, 400);
      return { tracés: items.length, titre: titre };
    });
  }
  // Préparation à plusieurs (js/live.js) : applique la carte fusionnée sans changer d'outil, de vue ni de panneau
  function applyShared(o) {
    if (!o || o.app !== 'ScoutMap') return;
    var rail = ['route', 'az', 'game'].indexOf(o.rail) >= 0 ? o.rail : 'route';
    if (rail !== S.mode) { var keepP = S.partage; loadProject(o, null, { keepView: true }); S.partage = keepP; if (keepP && keepP.pid) S.pid = keepP.pid; return; }
    if (typeof o.name === 'string' && o.name !== S.name) { S.name = o.name; $('#proj-name').value = S.name; }
    if (rail === 'route' && o.route) {
      var seg = S.route.seg; S.route = Object.assign(FRESH.route(null, 1), o.route); S.route.wps = o.route.wps || []; if (seg) S.route.seg = seg; else delete S.route.seg;
      if (SEL && SEL.k === 'route' && SEL.i >= S.route.wps.length) select(null);
      syncNames(); syncRouteUi(); renderRouteMarkers(); computeRoute();
    } else if (rail === 'az' && o.az) {
      S.az = Object.assign(FRESH.az(null, 1), o.az); S.az.pts = o.az.pts || []; if (SEL && SEL.k === 'az') select(null); renderAz();
    } else if (rail === 'game' && o.game) {
      S.game = Object.assign(FRESH.game(null, 1), o.game); S.game.shapes = o.game.shapes || []; if (window.SM && SM.game) SM.game.render();
    }
    if (Array.isArray(o.layers)) {
      S.layers = o.layers.filter(function (l) { return l && l.data && (l.type === 'route' || l.type === 'az'); }).map(function (l) {
        var d = Object.assign(FRESH[l.type](null, 1), l.data); if (l.type === 'route') d.wps = l.data.wps || []; else d.pts = l.data.pts || [];
        return { type: l.type, vis: l.vis !== false, data: d, res: l.res || null, pid: l.pid || null };
      });
      renderStored();
    }
    renderLayerList(); persist();
  }
