  /* ==== src/app/02-carte-dates.js : création de la carte Leaflet, netteté, dates de mise à jour des données IGN ==== */
  // ---------- Carte ----------
  var map = L.map('map', { zoomControl: false, zoomSnap: 0, zoomDelta: 1, wheelPxPerZoomLevel: 90, maxZoom: 19, minZoom: 4,
    doubleClickZoom: false, attributionControl: false }).setView(S.view.c, S.view.z);
  var attrCtl = L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(map);
  L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);
  var gStored = L.layerGroup().addTo(map), gSearch = L.layerGroup().addTo(map), gTracks = L.layerGroup().addTo(map), gMeas = L.layerGroup().addTo(map),
    gAz = L.layerGroup().addTo(map), gRoute = L.layerGroup().addTo(map), gCursor = L.layerGroup().addTo(map);
  var gGame = L.layerGroup().addTo(map);
  var GROUPS = { route: gRoute, az: gAz, meas: gMeas, game: gGame };

  // Netteté : automatique = fond standard quand on voit une grande étendue, détaillé quand on s'approche.
  // Netteté toujours automatique : fond détaillé dès qu'on s'approche, sauf sur un écran à faible densité de pixels où cela ne changerait rien à l'œil.
  function wantOff() { var dpr = window.devicePixelRatio || 1; return curScale() >= 200000 || dpr < 1.25 ? 0 : 1; }
  function buildTiles() {
    Object.keys(tiles).forEach(function (k) { map.removeLayer(tiles[k]); });
    tiles = {};
    Object.keys(LAYERS).forEach(function (k) { tiles[k] = LAYERS[k].vector ? L.layerGroup() : tile(k, curOff); });
    applyLayers();
  }
  // ---------- Date de mise à jour des données (catalogue IGN, CSW de la Géoplateforme) ----------
  var DSET = { scan25: 'IGNF_SCAN-25', plan: 'IGNF_PLAN-IGN', ortho: 'IGNF_BD-ORTHO', etat: 'IGNF_SCAN-EM-40K', contour: 'IGNF_COURBES-DE-NIVEAU', shade: 'IGNF_BD-ALTI',
    lidar: 'IGNF_MNT-LIDAR-HD', slope: 'IGNF_BD-ALTI', cadastre: 'IGNF_PARCELLAIRE-EXPRESS-PCI' };
  var DDATE = {};   // identifiant de jeu de données -> 'AAAA-MM-JJ' (dernière date connue, affichée tout de suite puis revérifiée à chaque ouverture)
  try { var dc = JSON.parse(localStorage.getItem('scoutmap.dates') || '{}'); if (dc && dc.d) DDATE = dc.d; } catch (e) { /* ignore */ }
  function fmtDate(iso) { var d = new Date(iso + 'T12:00:00'); return isNaN(d) ? iso : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }
  function ageDays(iso) { return Math.round((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 864e5); }
  function fetchDate(id) {
    return fetch(GP + '/csw?REQUEST=GetRecordById&SERVICE=CSW&VERSION=2.0.2&OUTPUTSCHEMA=http://standards.iso.org/iso/19115/-3/mdb/2.0&elementSetName=full&ID=' + encodeURIComponent(id))
      .then(function (r) { return r.ok ? r.text() : ''; }).then(function (x) {
        var best = '', re = /<cit:CI_Date>([\s\S]*?)<\/cit:CI_Date>/g, m;
        while ((m = re.exec(x))) {
          var d = /<gco:Date(?:Time)?>([^<]+)/.exec(m[1]), ty = /codeListValue="([^"]+)"/.exec(m[1]);
          if (d && ty && ty[1] === 'revision' && d[1].slice(0, 4) >= '2000' && d[1].slice(0, 10) > best) best = d[1].slice(0, 10);
        }
        if (best) { DDATE[id] = best; try { localStorage.setItem('scoutmap.dates', JSON.stringify({ t: Date.now(), d: DDATE })); } catch (e) { /* ignore */ } }
        return best;
      }).catch(function () { return ''; });
  }
  // Texte d'état d'une couche : { txt, old } (utilisable aussi par les documents imprimés).
  function layerDate(k) {
    var d = LAYERS[k]; if (!d) return null;
    if (!DSET[k]) return { txt: 'mise à jour continue (OpenStreetMap)', old: false };
    var iso = DDATE[DSET[k]];
    if (k === 'etat') return { txt: 'carte historique de 1820-1866 (ne change pas)', old: false };
    if (!iso) return { txt: 'date en cours de lecture…', old: false, pending: true };
    var a = ageDays(iso);
    return { txt: 'données IGN mises à jour le ' + fmtDate(iso) + ' (il y a ' + (a < 60 ? a + ' j' : Math.round(a / 30) + ' mois') + ')', iso: iso, old: a > 400 };
  }
  var attrDate = '';
  function renderDates() {
    var el = $('#data-dates'), i = layerDate(S.base), txt = '';
    if (i) txt = i.iso ? 'Mise à jour : ' + fmtDate(i.iso) : (i.pending || ['etat', 'carte1950', 'cassini', 'cassiniroi', 'photo1950'].indexOf(S.base) >= 0) ? '' : 'Mise à jour continue';
    if (el) el.innerHTML = txt ? '<p>' + esc(txt) + '</p>' : '';
    // ligne discrète en bas de la carte : date du fond
    var bi = layerDate(S.base);
    if (attrCtl) {
      if (attrDate) attrCtl.removeAttribution(attrDate);
      attrDate = bi && bi.iso ? 'données du ' + new Date(bi.iso + 'T12:00:00').toLocaleDateString('fr-FR') : '';
      if (attrDate) attrCtl.addAttribution(attrDate);
    }
  }
  // Les dates sont relues auprès du catalogue de l'IGN à chaque ouverture, puis toutes les 20 minutes et au retour sur l'onglet : une nouvelle édition s'affiche d'elle-même.
  var datesT = 0;
  function loadDates() {
    var ids = {}; Object.keys(DSET).forEach(function (k) { ids[DSET[k]] = 1; }); datesT = Date.now();
    Promise.all(Object.keys(ids).map(fetchDate)).then(renderDates);
  }
  setInterval(function () { if (document.visibilityState === 'visible') loadDates(); }, 20 * 60 * 1000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && Date.now() - datesT > 5 * 60 * 1000) loadDates(); });
