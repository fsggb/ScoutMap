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
    // Overpass avec secours entre serveurs (délai 25 s chacun)
    function grAsk(q) {
      var ends = HK.ends.slice(), last = null;
      function tryOne(i) {
        if (i >= ends.length) return Promise.reject(last || new Error('le service des sentiers (OpenStreetMap) ne répond pas : réessayez dans un moment'));
        var ctl = window.AbortController ? new AbortController() : null, t = setTimeout(function () { if (ctl) ctl.abort(); }, 25000);
        return fetch(ends[i], { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl ? ctl.signal : undefined })
          .then(function (r) { clearTimeout(t); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .catch(function (e) { clearTimeout(t); last = e; return tryOne(i + 1); });
      }
      return tryOne(0);
    }
    // Met bout à bout les tronçons d'un sentier (ils arrivent en désordre) en partant de celui qui passe le plus près du centre
    function grChain(ways, c0) {
      var segs = ways.filter(function (w) { return w.length > 1; }).map(function (w) { return w.slice(); }), used = segs.map(function () { return false; });
      if (!segs.length) return [];
      var best = -1, bd = Infinity;
      segs.forEach(function (w, i) { w.forEach(function (pt) { var d = c0.distanceTo(L.latLng(pt[0], pt[1])); if (d < bd) { bd = d; best = i; } }); });
      var chain = segs[best].slice(); used[best] = true;
      function d2(a, b) { return L.latLng(a[0], a[1]).distanceTo(L.latLng(b[0], b[1])); }
      function grow(atEnd) {
        for (;;) {
          var tip = atEnd ? chain[chain.length - 1] : chain[0], pick = -1, rev = false, bdd = 60;
          segs.forEach(function (w, i) { if (used[i]) return; var a = d2(tip, w[0]), b = d2(tip, w[w.length - 1]); if (a < bdd) { bdd = a; pick = i; rev = false; } if (b < bdd) { bdd = b; pick = i; rev = true; } });
          if (pick < 0) return; used[pick] = true;
          var w = rev ? segs[pick].slice().reverse() : segs[pick];
          if (atEnd) chain = chain.concat(w); else chain = w.slice().reverse().concat(chain);
        }
      }
      grow(true); grow(false); return chain;
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
      { id: 'app.point_style', label: 'Apparence des points posés sur la carte', location: 'Réglages', params: { forme: 'epingle | pastille | point' },
        run: function (p) { var f = String(p.forme || ''); if (['epingle', 'pastille', 'point'].indexOf(f) < 0) throw new Error('forme : epingle, pastille ou point'); DEF.points.style = f; saveDefaults(); applyPointStyle(); return { forme: f }; } },
      { id: 'map.grid', label: 'Grille sur la carte (aucune, kilométrique, carroyage bleu, UTM, lat/long, jeu)', location: 'Affichage', params: { type: 'none | l93 | km | utm | ll | game' },
        run: function (p) { var t = String(p.type || 'none'); if (['none', 'l93', 'km', 'utm', 'll', 'game'].indexOf(t) < 0) throw new Error('grille inconnue : ' + t); S.grid = { type: t }; if (SM.grid) SM.grid.apply(); persist(); return { grille: t }; } },
      { id: 'route.add', label: 'Ajouter un point à l’itinéraire (lieu, coordonnées ou lien), relié par chemin, en ligne droite ou en azimut', location: 'Itinéraire',
        params: { query: 'lieu (ou coords, ou lat+lon)', mode: 'chemin | droite | azimut', nom: 'texte (facultatif)', at: 'position (facultatif, à la fin par défaut)' },
        run: function (p) { return addPoint({ lat: p.lat, lon: p.lon, coords: p.coords, query: p.query, name: p.nom, at: p.at }, p.mode); } },
      { id: 'info.sun', label: 'Heures de lever et de coucher du soleil (heure de France) pour un lieu et un jour', location: 'Jeu', params: { query: 'lieu (ou coords, ou lat+lon ; sinon le centre de la carte)', date: 'AAAA-MM-JJ (aujourd’hui par défaut)' },
        run: function (p) {
          var go = function (la, lo) { var d = p.date ? new Date(String(p.date) + 'T12:00:00') : new Date(); if (isNaN(d)) throw new Error('date : AAAA-MM-JJ'); var t = G.sunTimes(la, lo, d);
            return { lat: +la.toFixed(4), lon: +lo.toFixed(4), date: d.toISOString().slice(0, 10), heure_ete: t.ete, lever: G.fmtMin(t.lever), coucher: G.fmtMin(t.coucher), minutes_de_jour: t.lever != null && t.coucher != null ? t.coucher - t.lever : null }; };
          if (p.lat != null || p.coords || p.query) return where(p).then(function (g) { return go(g.lat, g.lon); });
          var c = map.getCenter(); return go(c.lat, c.lng);
        } },
      { id: 'route.analyse', label: 'Analyse d’un itinéraire pour un jeu ou un raid : distance, dénivelé, durée de marche, heure d’arrivée comparée au coucher du soleil, alertes', location: 'Jeu',
        params: { depart: 'heure de départ HH:MM (défaut 09:00)', date: 'AAAA-MM-JJ (aujourd’hui par défaut)', allure_kmh: 'allure sur le plat (défaut : réglage de l’application)', pauses_min: 'minutes de pauses et d’épreuves (défaut 0)' },
        run: function (p) {
          needRoute(); var r = RT.route; if (!r || !r.line || r.line.length < 2) throw new Error('aucun itinéraire calculé : posez au moins deux points (route.result attend le calcul)');
          if (p.allure_kmh != null) S.speed = Math.max(1, Math.min(8, num(p.allure_kmh, 'allure_kmh')));
          return profileFor(r.line).then(function (pr) {
            var dist = r.dist, km = dist / 1000, asc = pr ? Math.round(pr.asc) : null, desc = pr ? Math.round(pr.desc) : null, sec = walkSecs(pr, dist), pause = Math.max(0, +p.pauses_min || 0) * 60;
            var m0 = /^(\d{1,2})[:h ]?(\d{2})?$/.exec(String(p.depart || '09:00').trim()), dep = m0 ? (+m0[1]) * 60 + (+(m0[2] || 0)) : 540;
            var d = p.date ? new Date(String(p.date) + 'T12:00:00') : new Date(), a0 = r.line[0], sun = G.sunTimes(a0[0], a0[1], isNaN(d) ? new Date() : d);
            var arr = dep + Math.round((sec + pause) / 60), alertes = [];
            if (km > 40) alertes.push('Plus de 40 km en une journée : c’est très long pour des jeunes (même à vélo, à voir), à proposer à la réflexion du chef.');
            else if (km > 25) alertes.push('Plus de 25 km : une longue journée de marche, à adapter à l’âge et à l’entraînement.');
            if (asc != null && asc >= 500 && km > 15) alertes.push('Dénivelé positif de ' + asc + ' m sur ' + km.toFixed(1).replace('.', ',') + ' km : l’effort est supérieur à la distance seule, prévoir du temps en plus.');
            if (asc != null && km > 0 && asc / km > 60) alertes.push('Terrain raide (' + Math.round(asc / km) + ' m de montée par km).');
            if (sun.coucher != null && arr > sun.coucher - 45) alertes.push('Arrivée estimée à ' + G.fmtMin(arr) + ', trop près du coucher du soleil (' + G.fmtMin(sun.coucher) + ') : prévoir de partir plus tôt, de raccourcir, ou des lampes.');
            if (sun.coucher != null && arr > sun.coucher) alertes.push('Une partie du parcours se fera de nuit : jeu nocturne à préparer exprès (encadrement, lampes, sécurité).');
            return { distance_km: +km.toFixed(2), denivele_positif_m: asc, denivele_negatif_m: desc, altitude_min_m: pr ? Math.round(pr.min) : null, altitude_max_m: pr ? Math.round(pr.max) : null, allure_kmh: S.speed,
              duree_marche: G.fmtDur(sec), pauses_min: pause / 60, depart: G.fmtMin(dep), arrivee_estimee: G.fmtMin(arr), lever_soleil: G.fmtMin(sun.lever), coucher_soleil: G.fmtMin(sun.coucher),
              marge_avant_coucher_min: sun.coucher != null ? sun.coucher - arr : null, alertes: alertes };
          });
        } },
      /* GR, GR de Pays et PR proches d'un lieu (données OpenStreetMap, comme la couche « Sentiers » de la carte) : nom, longueur dans la zone, et des points
         régulièrement espacés le long du tracé, que route.add_gr (ou route.add) peut poser comme points d'un itinéraire qui suit le sentier. */
      { id: 'info.gr', label: 'Sentiers de grande randonnée (GR, GR de Pays, PR) proches d’un lieu : référence, distance au lieu, longueur dans la zone, points le long du tracé', location: 'Jeu',
        params: { query: 'lieu (ou coords, ou lat+lon ; sinon le centre de la carte)', rayon_km: '1 à 15 (défaut 8)', pas_km: 'espacement des points rendus, 0,5 à 5 (défaut 2)' },
        run: function (p) {
          var R = Math.max(1, Math.min(15, +p.rayon_km || 8)), step = Math.max(0.5, Math.min(5, +p.pas_km || 2));
          var go = function (la, lo) {
            var dl = R / 110.54, dn = R / (111.32 * Math.cos(la * Math.PI / 180)), q = hkQuery(la - dl, lo - dn, la + dl, lo + dn), c0 = L.latLng(la, lo);
            return grAsk(q).then(function (j) {
              var rs = hkParse(j), byRef = {};
              rs.forEach(function (r) { var k = (r.ref || r.cls) + '|' + r.cls; (byRef[k] = byRef[k] || { ref: r.ref, cls: r.cls, ways: [] }).ways = byRef[k].ways.concat(r.ways); });
              var out = Object.keys(byRef).map(function (k) {
                var r = byRef[k], chain = grChain(r.ways, c0), near = Infinity, len = 0;
                chain.forEach(function (pt, i) { var d = c0.distanceTo(L.latLng(pt[0], pt[1])); if (d < near) near = d; if (i) len += L.latLng(chain[i - 1][0], chain[i - 1][1]).distanceTo(L.latLng(pt[0], pt[1])); });
                var pts = [], acc = 0, nextAt = 0;
                chain.forEach(function (pt, i) { if (i) acc += L.latLng(chain[i - 1][0], chain[i - 1][1]).distanceTo(L.latLng(pt[0], pt[1])); if (!i || acc >= nextAt) { pts.push({ km: +(acc / 1000).toFixed(2), lat: +pt[0].toFixed(5), lon: +pt[1].toFixed(5) }); nextAt = acc + step * 1000; } });
                return { ref: r.ref || '(sans numéro)', type: r.cls === 'GR' ? 'GR' : r.cls === 'GRP' ? 'GR de Pays' : 'PR (promenade et randonnée)', distance_au_lieu_km: +(near / 1000).toFixed(1), longueur_dans_la_zone_km: +(len / 1000).toFixed(1), points: pts.slice(0, 60) };
              }).filter(function (r) { return r.longueur_dans_la_zone_km > 0.3; }).sort(function (a, b) { return a.distance_au_lieu_km - b.distance_au_lieu_km; }).slice(0, 10);
              return { centre: [+la.toFixed(5), +lo.toFixed(5)], rayon_km: R, sentiers: out, source: 'OpenStreetMap (ODbL)', note: out.length ? 'Les points suivent le tracé dans l’ordre ; route.add_gr les pose en itinéraire.' : 'Aucun GR/PR trouvé dans ce rayon (essayez un rayon plus grand ou un autre lieu).' };
            });
          };
          if (p.lat != null || p.coords || p.query) return where(p).then(function (g) { return go(g.lat, g.lon); });
          var c = map.getCenter(); return go(c.lat, c.lng);
        } },
      { id: 'route.add_gr', label: 'Ajouter à l’itinéraire un tronçon de GR (ou GR de Pays, PR) : ses points sont posés le long du sentier, reliés par chemin', location: 'Itinéraire',
        params: { ref: 'référence (ex. GR 65, GR 13 ; sinon le plus proche)', query: 'lieu proche du tronçon (ou coords, ou lat+lon)', depuis_km: 'début du tronçon sur le tracé de info.gr (défaut 0)', jusqua_km: 'fin du tronçon (défaut : tout ce qui est dans la zone)', rayon_km: '1 à 15 (défaut 8)', pas_km: 'espacement des points posés, 0,5 à 5 (défaut 1,5)' },
        run: function (p) {
          needRoute();
          var ref = String(p.ref || '').replace(/\s+/g, '').toUpperCase(), from = Math.max(0, +p.depuis_km || 0), to = p.jusqua_km == null ? Infinity : +p.jusqua_km, pas = Math.max(0.5, Math.min(5, +p.pas_km || 1.5));
          var cmd = null; for (var i = 0; i < CMDS.length; i++) if (CMDS[i].id === 'info.gr') cmd = CMDS[i];
          return cmd.run({ lat: p.lat, lon: p.lon, coords: p.coords, query: p.query, rayon_km: p.rayon_km, pas_km: pas }).then(function (r) {
            var cand = r.sentiers.filter(function (x) { return !ref || String(x.ref).replace(/\s+/g, '').toUpperCase() === ref; })[0];
            if (!cand) throw new Error(ref ? 'aucun ' + p.ref + ' dans ce rayon autour du lieu : essayez rayon_km plus grand ou un lieu plus proche' : 'aucun sentier trouvé');
            var pts = cand.points.filter(function (x) { return x.km >= from && x.km <= to; }); if (pts.length < 2) throw new Error('tronçon trop court : élargissez depuis_km / jusqua_km');
            ensureVisible('route');
            pts.forEach(function (x, k) { var w = { lat: x.lat, lon: x.lon }; if (k === 0) w.name = cand.ref + ' (début)'; else if (k === pts.length - 1) w.name = cand.ref + ' (fin)'; S.route.wps.push(w); });
            renderRouteMarkers(); computeRoute(); persist(); fillPlaces(S.route);
            return { ref: cand.ref, points_poses: pts.length, de_km: pts[0].km, a_km: pts[pts.length - 1].km, suite: 'Utilisez route.result puis route.analyse pour vérifier la distance, le dénivelé et le coucher du soleil.' };
          });
        } },
      { id: 'info.poi', label: 'Lieux touristiques, points de vue, châteaux, églises, sources… proches d’un lieu (OpenStreetMap), avec distance', location: 'Jeu',
        params: { query: 'lieu (ou coords, ou lat+lon ; sinon le centre de la carte)', rayon_km: '0,5 à 15 (défaut 5)', type: 'tout | point_de_vue | patrimoine | eau | camping | refuge (défaut tout)' },
        run: function (p) {
          var R = Math.max(0.5, Math.min(15, +p.rayon_km || 5)), t = String(p.type || 'tout');
          var sel = { point_de_vue: ['["tourism"="viewpoint"]'], patrimoine: ['["historic"~"castle|monument|ruins|archaeological_site|memorial|fort|manor|wayside_cross"]', '["tourism"~"attraction|museum"]', '["amenity"="place_of_worship"]["name"]'], eau: ['["natural"="spring"]', '["amenity"="drinking_water"]', '["natural"="waterfall"]'], camping: ['["tourism"~"camp_site|caravan_site"]'], refuge: ['["tourism"~"alpine_hut|wilderness_hut"]', '["amenity"="shelter"]'], tout: ['["tourism"~"viewpoint|attraction|museum|alpine_hut|camp_site"]', '["historic"~"castle|monument|ruins|archaeological_site|fort|manor|wayside_cross"]', '["natural"~"waterfall|spring|peak"]["name"]'] }[t] || null;
          if (!sel) throw new Error('type : tout, point_de_vue, patrimoine, eau, camping ou refuge');
          var go = function (la, lo) {
            var ar = '(around:' + Math.round(R * 1000) + ',' + la + ',' + lo + ')', q = '[out:json][timeout:25];(' + sel.map(function (f) { return 'nwr' + f + ar + ';'; }).join('') + ');out center 80;';
            return grAsk(q).then(function (j) {
              var c0 = L.latLng(la, lo), seen = {}, out = [];
              (j.elements || []).forEach(function (e) {
                var tg = e.tags || {}, y = e.lat != null ? e.lat : e.center && e.center.lat, x = e.lon != null ? e.lon : e.center && e.center.lon; if (y == null || x == null) return;
                var nom = tg.name || ''; if (!nom && t === 'tout') return; var key = nom + (+y).toFixed(3); if (seen[key]) return; seen[key] = 1;
                out.push({ nom: nom || '(sans nom)', genre: tg.tourism || tg.historic || tg.natural || tg.amenity || '', lat: +(+y).toFixed(5), lon: +(+x).toFixed(5), distance_km: +(c0.distanceTo(L.latLng(y, x)) / 1000).toFixed(2), altitude_m: tg.ele ? Math.round(+tg.ele) : undefined });
              });
              out.sort(function (a, b) { return a.distance_km - b.distance_km; });
              return { centre: [+la.toFixed(5), +lo.toFixed(5)], rayon_km: R, lieux: out.slice(0, 30), source: 'OpenStreetMap (ODbL)' };
            });
          };
          if (p.lat != null || p.coords || p.query) return where(p).then(function (g) { return go(g.lat, g.lon); });
          var c = map.getCenter(); return go(c.lat, c.lng);
        } },
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
