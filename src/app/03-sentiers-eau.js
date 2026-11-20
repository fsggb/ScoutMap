  /* ==== src/app/03-sentiers-eau.js : sentiers balisés (GR, PR) et points d'eau ==== */
  // ---------- Sentiers GR / GRP / PR, dessinés en rose : PR et circuits = BD TOPO (IGN) ; GR et GR de Pays = OpenStreetMap (via Waymarked Trails) ----------
  // GR : trait plein ; GR de Pays : tirets longs ; PR : pointillés. Le nom du GR est écrit de temps en temps sur le tracé.
  // Si le service est indisponible, on bascule sur les tuiles de secours (Waymarked Trails).
  var HK = { cells: {}, pend: {}, group: L.layerGroup(), colour: '#e0368a', ends: ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'] };
  var HK_CELL = 0.2, HK_MINZ = 12;
  function hkClass(tags) {
    var ref = String(tags.ref || ''), name = String(tags.name || ''), sym = String(tags['osmc:symbol'] || '').toLowerCase(), net = tags.network || '';
    if (/GRP|GR\s*®?\s*de\s*Pays/i.test(ref + ' ' + name)) return 'GRP';
    if (/^GR\s*\d/i.test(ref) || ((net === 'nwn' || net === 'iwn') && sym.indexOf('red') >= 0)) return 'GR';
    if (/^PR/i.test(ref) || (sym.indexOf('yellow') >= 0 && sym.indexOf('red') < 0)) return 'PR';
    return null;
  }
  function hkQuery(s, w, n, e) {
    var bb = '(' + s + ',' + w + ',' + n + ',' + e + ')';
    return '[out:json][timeout:30];(rel["route"="hiking"]["ref"~"^(GR|PR)"]' + bb + ';rel["route"="hiking"]["osmc:symbol"~"red|yellow"]' + bb + ';);out tags geom' + bb + ';';
  }
  function hkParse(j) {
    var out = [];
    (j.elements || []).forEach(function (el) {
      var cls = hkClass(el.tags || {}); if (!cls) return;
      var ways = (el.members || []).filter(function (m) { return m.type === 'way' && m.geometry && m.geometry.length > 1; }).map(function (m) { return m.geometry.map(function (q) { return [q.lat, q.lon]; }); });
      if (ways.length) out.push({ id: el.id, cls: cls, ref: String((el.tags || {}).ref || '').replace(/\s+/g, ' ').trim(), ways: ways });
    });
    return out;
  }
  // Itinéraires de randonnée pédestre de la BD TOPO (IGN, WFS de la Géoplateforme) : circuits et sentiers locaux (PR…) ; quelques GR y figurent aussi.
  function hkIgnParse(j) {
    var out = [];
    (j.features || []).forEach(function (f) {
      var pr = f.properties || {}, g = f.geometry; if (!g || !/pédestre/i.test(pr.nature || '')) return;
      var top = String(pr.toponyme || ''), cls = /GRP|GR\s*®?\s*de\s*Pays/i.test(top) ? 'GRP' : /(^|\s)GR\s?\d/i.test(top) ? 'GR' : 'PR';
      var lines = g.type === 'MultiLineString' ? g.coordinates : g.type === 'LineString' ? [g.coordinates] : [];
      var ways = lines.filter(function (l) { return l.length > 1; }).map(function (l) { return l.map(function (q) { return [q[1], q[0]]; }); });
      var m = /GR\s?\d+\w*/i.exec(top);
      if (ways.length) out.push({ id: 'i' + (pr.cleabs || out.length), cls: cls, ref: cls === 'GR' && m ? m[0].replace(/\s+/g, ' ').toUpperCase() : '', ways: ways });
    });
    return out;
  }
  // GR et GR de Pays : itinéraires OpenStreetMap listés puis téléchargés une seule fois (service Waymarked Trails, accessible depuis le navigateur).
  var WMT = 'https://hiking.waymarkedtrails.org/api/v1';
  function hkMercFrom(lat, lon) { return [lon * 20037508.34 / 180, Math.log(Math.tan((90 + lat) * Math.PI / 360)) * 20037508.34 / Math.PI]; }
  function hkLatLon(x, y) { return [(2 * Math.atan(Math.exp(y / 20037508.34 * Math.PI)) - Math.PI / 2) * 180 / Math.PI, x / 20037508.34 * 180]; }
  HK.routes = {};
  function hkRoute(r) {
    if (HK.routes[r.id]) return HK.routes[r.id];
    var cls = r.group === 'NAT' ? 'GR' : 'GRP';
    return (HK.routes[r.id] = fetch(WMT + '/details/relation/' + r.id).then(function (x) { if (!x.ok) throw new Error('HTTP ' + x.status); return x.json(); }).then(function (j) {
      var ways = [];
      (function walk(o) {
        if (Array.isArray(o)) { o.forEach(walk); return; }
        if (!o || typeof o !== 'object') return;
        if (o.geometry && o.geometry.type === 'LineString' && o.geometry.coordinates.length > 1) ways.push(o.geometry.coordinates.map(function (c) { return hkLatLon(c[0], c[1]); }));
        Object.keys(o).forEach(function (k) { if (k !== 'geometry') walk(o[k]); });
      })(j);
      return ways.length ? { id: r.id, cls: cls, ref: String(r.ref || '').replace(/\s+/g, ' ').trim(), ways: ways } : null;
    }).catch(function () { delete HK.routes[r.id]; return null; }));
  }
  function hkWmt(s, w, n, e) {
    var a = hkMercFrom(s, w), b = hkMercFrom(n, e);
    return fetch(WMT + '/list/by_area?limit=200&bbox=' + [a[0], a[1], b[0], b[1]].map(Math.round).join(',')).then(function (x) { if (!x.ok) throw new Error('HTTP ' + x.status); return x.json(); }).then(function (j) {
      var sel = (j.results || []).filter(function (r) { return (r.group === 'NAT' && /^GR/i.test(r.ref || '')) || (r.group === 'REG' && /GRP|de Pays/i.test((r.name || '') + ' ' + (r.ref || ''))); });
      return Promise.all(sel.map(hkRoute)).then(function (arr) { return arr.filter(Boolean); });
    });
  }
  // Une cellule contient deux jeux de données chargés séparément : osm (GR et GR de Pays, dès le zoom 12) et ign (PR et circuits, à partir du zoom 14 pour ne pas surcharger la carte).
  var HK_IGNZ = 14;
  function hkFetchCell(ci, cj, needIgn) {
    var key = ci + ',' + cj, cell = HK.cells[key] || (HK.cells[key] = { osm: null, ign: null, osmT: 0, ignT: 0 }), now = Date.now(), jobs = [];
    var s = ci * HK_CELL, w = cj * HK_CELL, n = s + HK_CELL, e = w + HK_CELL;
    if (!cell.osm && now - cell.osmT > 60000 && !HK.pend[key + 'o']) {
      HK.pend[key + 'o'] = hkWmt(s, w, n, e).then(function (arr) { cell.osm = arr; }, function () { cell.osmT = Date.now(); }).then(function () { delete HK.pend[key + 'o']; });
      jobs.push(HK.pend[key + 'o']);
    } else if (HK.pend[key + 'o']) jobs.push(HK.pend[key + 'o']);
    if (needIgn && !cell.ign && now - cell.ignT > 60000 && !HK.pend[key + 'i']) {
      var ignUrl = GP + '/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=BDTOPO_V3:itineraire_autre&OUTPUTFORMAT=application/json&COUNT=2500&SRSNAME=EPSG:4326&PROPERTYNAME=nature,toponyme,cleabs,geometrie&BBOX=' +
        s.toFixed(4) + ',' + w.toFixed(4) + ',' + n.toFixed(4) + ',' + e.toFixed(4) + ',urn:ogc:def:crs:EPSG::4326';
      HK.pend[key + 'i'] = fetch(ignUrl).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (j) { cell.ign = hkIgnParse(j); }, function () { cell.ignT = Date.now(); }).then(function () { delete HK.pend[key + 'i']; });
      jobs.push(HK.pend[key + 'i']);
    } else if (needIgn && HK.pend[key + 'i']) jobs.push(HK.pend[key + 'i']);
    return Promise.all(jobs);
  }
  function hkCells(b) {
    var out = [];
    for (var i = Math.floor(b.getSouth() / HK_CELL); i <= Math.floor(b.getNorth() / HK_CELL); i++) for (var j = Math.floor(b.getWest() / HK_CELL); j <= Math.floor(b.getEast() / HK_CELL); j++) out.push([i, j]);
    return out.length > 12 ? [] : out;
  }
  // Dessine les sentiers déjà chargés : un seul tracé par itinéraire (léger), rose ; GR plein, GR de Pays en tirets longs, PR en pointillés. Aucune icône : seulement le nom des GR, de temps en temps.
  function hkDraw(target, bounds, zoom, lbl) {
    // épaisseur proportionnelle au zoom, comme les petites routes orange : très fine de loin, plus marquée de près
    var seen = {}, nl = 0, wt = zoom < 12.5 ? 1.2 : zoom < 14 ? 1.6 : zoom < 15 ? 2.1 : zoom < 16 ? 2.6 : 3.2;
    hkCells(bounds).forEach(function (c) {
      var cell = HK.cells[c[0] + ',' + c[1]]; if (!cell) return;
      (cell.osm || []).concat(zoom >= HK_IGNZ ? (cell.ign || []) : []).forEach(function (r) {
        var dash = r.cls === 'PR' ? '1 5' : r.cls === 'GRP' ? '9 4' : null, w1 = r.cls === 'PR' ? Math.max(1.2, wt * 0.85) : wt;
        L.polyline(r.ways, { color: '#fff', weight: w1 + 1.4, opacity: 0.6, lineCap: 'butt', interactive: false }).addTo(target);
        L.polyline(r.ways, { color: HK.colour, weight: w1, opacity: 0.95, dashArray: dash, lineCap: r.cls === 'PR' ? 'round' : 'butt', interactive: false }).addTo(target);
        if (lbl && r.ref && r.cls !== 'PR' && zoom >= 13 && !seen[r.id] && nl < 8) {
          var best = null, bl = 0;
          r.ways.forEach(function (w2) { var mid = w2[Math.floor(w2.length / 2)]; if (w2.length > bl && bounds.contains(mid)) { bl = w2.length; best = mid; } });
          if (best) { seen[r.id] = 1; nl++; L.marker(best, { interactive: false, icon: L.divIcon({ className: 'hk-lbl', html: '<span>' + esc(r.ref) + '</span>', iconSize: [0, 0] }) }).addTo(target); }
        }
      });
    });
  }
  // ---------- Points d'eau : fontaines, sources, lavoirs, points d'eau (BD TOPO, IGN) et eau potable signalée sur OpenStreetMap ----------
  var WT = { cells: {}, pend: {}, group: L.layerGroup(), ends: ['https://overpass-api.de/api/interpreter', 'https://lz4.overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'] }, WT_CELL = 0.1, WT_MINZ = 12;
  var WT_NAT_UNUSED = { 'Fontaine': ['Fontaine', 'ign'], 'Source': ['Source', 'ign'], 'Source captée': ['Source captée', 'ign'], 'Lavoir': ['Lavoir', 'ign'], 'Point d\'eau': ['Point d’eau', 'ign'], 'Point d’eau': ['Point d’eau', 'ign'], 'Abreuvoir': ['Abreuvoir', 'ign'], 'Citerne': ['Citerne', 'ign'] };
  function wtIcon(pot) {
    var c = pot ? '#1565c0' : '#6f9bc9';
    return L.divIcon({ className: 'wt-ic', iconSize: [22, 22], iconAnchor: [11, 20], html: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2.2C9 6.4 5.8 9.8 5.8 14a6.2 6.2 0 0 0 12.4 0C18.2 9.8 15 6.4 12 2.2Z" fill="' + c + '" stroke="#fff" stroke-width="1.8" stroke-linejoin="round" paint-order="stroke"/><path d="M9.2 14.4a3 3 0 0 0 2.2 2.8" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".85"/></svg>' });
  }
  function wtCells(b) { var out = []; for (var i = Math.floor(b.getSouth() / WT_CELL); i <= Math.floor(b.getNorth() / WT_CELL); i++) for (var j = Math.floor(b.getWest() / WT_CELL); j <= Math.floor(b.getEast() / WT_CELL); j++) out.push([i, j]); return out.length > 12 ? [] : out; }
  // Une seule requête à la fois vers Overpass (les serveurs publics refusent les rafales).
  // Points d'eau potable demandés d'abord au serveur ScoutHub (il interroge OpenStreetMap et garde le résultat en mémoire) ; en secours, directement à Overpass.
  function hubEau(s, w, n, e) {
    return hubApi().then(function (api) { return fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'eau', b: [s, w, n, e] }) }); })
      .then(function (r) { return r.json(); }).then(function (j) { if (!j || !j.ok || !j.el) throw new Error((j && j.error) || 'réponse vide'); return { elements: j.el }; });
  }
  var wtQ = Promise.resolve();
  function wtQueue(fn) { var r = wtQ.then(fn); wtQ = r.then(function () {}, function () {}); return r; }
  function wtFetchTimeout(url, ms, body) { var c = window.AbortController ? new AbortController() : null, t = setTimeout(function () { if (c) c.abort(); }, ms), o = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body }; if (c) o.signal = c.signal; return fetch(url, o).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; }); }
  var wtWarned = false;
  function wtFetchCell(ci, cj) {
    var key = ci + ',' + cj, cell = WT.cells[key] || (WT.cells[key] = { pts: null, t: 0 }), now = Date.now();
    if (cell.pts || now - cell.t < 60000) return Promise.resolve();
    if (WT.pend[key]) return WT.pend[key];
    var s = ci * WT_CELL, w = cj * WT_CELL, n = s + WT_CELL, e = w + WT_CELL;
    var bb = '(' + s.toFixed(5) + ',' + w.toFixed(5) + ',' + n.toFixed(5) + ',' + e.toFixed(5) + ')';
    // eau potable seulement : fontaines à boire, robinets, sources et puits signalés potables (OpenStreetMap)
    var q = '[out:json][timeout:25];(node["amenity"="drinking_water"]' + bb + ';node["man_made"="water_tap"]["drinking_water"!="no"]' + bb + ';node["amenity"="fountain"]["drinking_water"="yes"]' + bb + ';node["natural"="spring"]["drinking_water"="yes"]' + bb + ';node["man_made"="water_well"]["drinking_water"="yes"]' + bb + ';node["amenity"="water_point"]["drinking_water"!="no"]' + bb + ';);out;';
    var lastErr = '';
    function tryEnd(k) {
      if (k >= WT.ends.length) return Promise.reject(new Error(lastErr || 'indisponible'));
      return wtFetchTimeout(WT.ends[k], 20000, 'data=' + encodeURIComponent(q)).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (j) { if (!j || !j.elements) throw new Error('réponse vide'); return j; }).catch(function (er) { lastErr = (WT.ends[k].split('/')[2] || '') + ' : ' + (er && er.name === 'AbortError' ? 'délai dépassé' : (er && er.message) || 'erreur'); return tryEnd(k + 1); });
    }
    return (WT.pend[key] = wtQueue(function () { return hubEau(s, w, n, e).catch(function () { return tryEnd(0); }); }).then(function (j) {
      var out = [];
      (j.elements || []).forEach(function (el) {
        if (el.lat == null) return; var t = el.tags || {};
        out.push({ lat: el.lat, lon: el.lon, kind: t.amenity === 'drinking_water' ? 'Eau potable' : t.man_made === 'water_tap' ? 'Robinet d’eau' : t.amenity === 'water_point' ? 'Point d’eau' : t.natural === 'spring' ? 'Source potable' : t.man_made === 'water_well' ? 'Puits potable' : 'Fontaine', name: t.name || '', pot: true, src: 'OpenStreetMap' });
      });
      cell.pts = out;
    }).catch(function (er) {
      cell.t = Date.now();
      if (window.console) console.warn('Points d’eau :', er && er.message);
      if (!wtWarned) { wtWarned = true; toast('Points d’eau potable indisponibles (OpenStreetMap) — ' + ((er && er.message) || 'pas de réponse') + '. Nouvel essai en déplaçant la carte.'); }
    }).then(function () { delete WT.pend[key]; }));
  }
  function wtDraw(target, bounds, zoom) {
    wtCells(bounds).forEach(function (c) {
      var cell = WT.cells[c[0] + ',' + c[1]]; if (!cell || !cell.pts) return;
      cell.pts.forEach(function (p) {
        if (!bounds.contains([p.lat, p.lon])) return;
        var m = L.marker([p.lat, p.lon], { icon: wtIcon(p.pot), interactive: !target._wtPrint, keyboard: false, zIndexOffset: 700 });
        if (!target._wtPrint) m.bindTooltip('<b>' + esc(p.kind) + '</b>' + (p.name ? ' · ' + esc(p.name) : '') + '<br>' + 'Eau potable signalée sur OpenStreetMap : à vérifier sur place (panneau « eau non potable », fontaine tarie…)' + '<br><small>Source : ' + p.src + '</small>', { direction: 'top', offset: [0, -16] });
        m.addTo(target);
      });
    });
  }
  function wtRefresh() {
    WT.group.clearLayers();
    if (!S.ov.water) { if (map.hasLayer(WT.group)) map.removeLayer(WT.group); setNote('water', '', ''); return; }
    if (!map.hasLayer(WT.group)) WT.group.addTo(map);
    var z = map.getZoom(); if (z < WT_MINZ) { setNote('water', 'Zoomez un peu pour voir les points d’eau potable.', ''); return; }
    setNote('water', '', '');
    var b = map.getBounds(); wtDraw(WT.group, b, z);
    var todo = wtCells(b).filter(function (c) { var cl = WT.cells[c[0] + ',' + c[1]]; return !cl || (!cl.pts && Date.now() - cl.t > 60000); });
    if (todo.length) Promise.all(todo.map(function (c) { return wtFetchCell(c[0], c[1]); })).then(function () { if (S.ov.water && map.getZoom() >= WT_MINZ) { WT.group.clearLayers(); wtDraw(WT.group, map.getBounds(), map.getZoom()); } });
  }
  var wtTimer; map.on('moveend zoomend', function () { clearTimeout(wtTimer); wtTimer = setTimeout(wtRefresh, 350); });
  function waterDraw(m) {
    if (!S.ov.water) return Promise.resolve();
    var b = m.getBounds(), z = m.getZoom();
    return Promise.all(wtCells(b).map(function (c) { return wtFetchCell(c[0], c[1]); })).then(function () { var g = L.layerGroup(); g._wtPrint = true; wtDraw(g, b, z); g.addTo(m); });
  }
  function hkNeeds(b, z) { return hkCells(b).filter(function (c) { var cell = HK.cells[c[0] + ',' + c[1]]; return !cell || (!cell.osm && Date.now() - cell.osmT > 60000) || (z >= HK_IGNZ && !cell.ign && Date.now() - cell.ignT > 60000); }); }
  function hkRefresh() {
    HK.group.clearLayers();
    if (!ovOn('hiking')) { if (map.hasLayer(HK.group)) map.removeLayer(HK.group); return; }
    if (!map.hasLayer(HK.group)) HK.group.addTo(map);
    var z = map.getZoom(); if (z < HK_MINZ) return;
    var b = map.getBounds();
    hkDraw(HK.group, b, z, true);
    var todo = hkNeeds(b, z);
    if (todo.length) Promise.all(todo.map(function (c) { return hkFetchCell(c[0], c[1], z >= HK_IGNZ); })).then(function () { if (ovOn('hiking') && map.getZoom() >= HK_MINZ) { HK.group.clearLayers(); hkDraw(HK.group, map.getBounds(), map.getZoom(), true); } });
  }
  var hkTimer; map.on('moveend zoomend', function () { clearTimeout(hkTimer); hkTimer = setTimeout(hkRefresh, 350); });
  // Pour les documents imprimés : charge les cellules nécessaires puis dessine dans la carte du document.
  function hikeDraw(m) {
    if (!ovOn('hiking')) return Promise.resolve();
    var b = m.getBounds(), z = m.getZoom();
    return Promise.all(hkCells(b).map(function (c) { return hkFetchCell(c[0], c[1], z >= HK_IGNZ); })).then(function () { hkDraw(m, b, z, true); });
  }
  // Ce que le SCAN 25 dessine déjà : inutile (et gênant) de le superposer.
  var SCAN_HAS = { hiking: true, contour: true };
  function ovOn(k) { return !!S.ov[k] && !(S.base === 'scan25' && SCAN_HAS[k]); }
  function applyLayers() {
    if (S.base === 'scan25' && !SCAN25.cfg) S.base = 'plan';
    Object.keys(LAYERS).forEach(function (k) {
      var on = LAYERS[k].base ? k === S.base : ovOn(k);
      if (k === 'hiking' || LAYERS[k].vector) on = false;   // sentiers et points d'eau sont dessinés en vectoriel
      if (on) { if (!map.hasLayer(tiles[k])) tiles[k].addTo(map); } else if (map.hasLayer(tiles[k])) map.removeLayer(tiles[k]);
    });
    tiles[S.base].bringToBack();
    $$('#base-grid button').forEach(function (b) { b.classList.toggle('on', b.dataset.base === S.base); });
    $$('#ov-grid button').forEach(function (b) { b.classList.toggle('on', ovOn(b.dataset.ov)); b.hidden = S.base === 'scan25' && !!SCAN_HAS[b.dataset.ov]; });
    $('#ov-scan-note').hidden = S.base !== 'scan25';
    $('#layer-thumb').src = thumbUrl(S.base); if (S.base === 'scan25' && SCAN25.cfg && SCAN25.cfg.hub) s25Thumb($('#layer-thumb'));
    renderDates(); hkRefresh(); wtRefresh();
    var nOv = OVERS.filter(ovOn).length;
    [$('#tab-badge'), $('#lb-badge')].forEach(function (b) { b.hidden = !nOv; b.textContent = '+' + nOv; });
  }
  // Panneau « Fonds et informations » : trois onglets (fond de carte / informations affichées / netteté).
  function popTab(tab) {
    $$('#pop-tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === tab); });
    $$('#layer-pop .pop-sec').forEach(function (sec) { sec.hidden = sec.dataset.tab !== tab; });
    $('#data-dates').hidden = tab === 'sharp';
  }
  function thumbUrl(key) {
    if (LAYERS[key].scan) return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="200" height="150" fill="#f4efdf"/><path d="M0 110C40 90 70 125 110 100S170 90 200 105V150H0Z" fill="#cfe3b3"/><path d="M20 0C40 60 20 90 60 150" stroke="#e2a24a" stroke-width="5" fill="none"/><path d="M0 40C60 30 120 70 200 40" stroke="#6fa8dc" stroke-width="3" fill="none"/><g fill="none" stroke="#b5651d" stroke-width=".8" opacity=".7"><ellipse cx="140" cy="60" rx="50" ry="22"/><ellipse cx="140" cy="60" rx="34" ry="14"/><ellipse cx="140" cy="60" rx="18" ry="7"/></g><text x="8" y="140" font-family="sans-serif" font-size="13" font-weight="700" fill="#1b2a6b">SCAN 25</text></svg>');
    var z = 10, n = 1 << z, lon = 5.72, lat = 45.19, r = lat * Math.PI / 180;
    return srcUrl(key, z, Math.floor((lon + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)).replace('{s}', 'a');
  }
  // Un seul type de travail est visible à la fois : les autres calques sont masqués.
  function applyVis() {
    Object.keys(GROUPS).forEach(function (k) {
      var on = (k === 'route' || k === 'az' ? (S.mode === 'route' || S.mode === 'az') : S.mode === k) && S.vis[k] !== false, g = GROUPS[k];
      if (on && !map.hasLayer(g)) g.addTo(map); else if (!on && map.hasLayer(g)) map.removeLayer(g);
    });
    var tOn = S.mode === 'route' || S.mode === 'az';
    if (tOn && !map.hasLayer(gTracks)) gTracks.addTo(map); else if (!tOn && map.hasLayer(gTracks)) map.removeLayer(gTracks);
  }
  function ensureVisible(k) { if (S.vis[k] === false) { S.vis[k] = true; applyVis(); renderLayerList(); } }

  map.on('moveend', function () { var c = map.getCenter(); S.view = { c: [c.lat, c.lng], z: map.getZoom() }; persist(); });

