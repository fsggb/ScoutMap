  /* ==== src/app/14-simulation-video.js : simulation du parcours et export vidéo ==== */
  // ---------- Simulation du parcours : un curseur parcourt le tracé en suivant le relief ----------
  var SIM = { open: false, prof: null, t: [], tot: 1, pos: 0, playing: false, dur: 6, follow: true, raf: 0, last: 0, marker: null, trail: null, rec: false, label: 'Parcours' };
  function simPrepare(p) {
    var z = p.pts.map(function (q) { return q.z; }), s = z.map(function (v, i) { return (z[Math.max(0, i - 1)] + v + z[Math.min(z.length - 1, i + 1)]) / 3; });
    var t = [0], kk = Math.max(1, S.speed || 5) / 5.04;
    for (var i = 1; i < p.pts.length; i++) { var ds = Math.max(0.1, p.pts[i].d - p.pts[i - 1].d), sl = Math.max(-0.45, Math.min(0.45, (s[i] - s[i - 1]) / ds)); t.push(t[i - 1] + ds / 1000 / (6 * Math.exp(-3.5 * Math.abs(sl + 0.05)) * kk) * 3600); }
    SIM.prof = p; SIM.t = t; SIM.tot = t[t.length - 1] || 1;
  }
  function simAt(tt) {
    var p = SIM.prof.pts, t = SIM.t, i = 0; tt = Math.max(0, Math.min(SIM.tot, tt));
    while (i < p.length - 2 && t[i + 1] < tt) i++;
    var a = p[i], b = p[i + 1] || a, f = t[i + 1] > t[i] ? (tt - t[i]) / (t[i + 1] - t[i]) : 0;
    return { i: i, d: a.d + (b.d - a.d) * f, lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, z: a.z + (b.z - a.z) * f,
      slope: b.d > a.d ? (b.z - a.z) / (b.d - a.d) * 100 : 0 };
  }
  // follow : recentre la carte sur le curseur (lecture, ou déplacement de la barre de position)
  function simRender(follow) {
    var r = simAt(SIM.pos), ll0 = L.latLng(r.lat, r.lon), p = SIM.prof.pts;
    if (!SIM.marker) SIM.marker = L.marker(ll0, { interactive: false, zIndexOffset: 3000, icon: L.divIcon({ className: 'sim-wrap', html: '<div class="sim-dot"></div>', iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(gCursor);
    SIM.marker.setLatLng(ll0);
    var trail = p.slice(0, r.i + 1).map(function (q) { return [q.lat, q.lon]; }).concat([[r.lat, r.lon]]);
    if (!SIM.trail) SIM.trail = L.polyline(trail, { color: '#c6a24e', weight: 6, opacity: 0.95, interactive: false, lineCap: 'round' }).addTo(gCursor); else SIM.trail.setLatLngs(trail);
    var svg = $('#profile'), g = svg._geom;
    if (g && S.dockOpen) {
      var c = svg.querySelector('.cur');
      if (c) { c.setAttribute('visibility', 'visible'); c.querySelector('line').setAttribute('x1', g.X(r.d)); c.querySelector('line').setAttribute('x2', g.X(r.d)); c.querySelector('circle').setAttribute('cx', g.X(r.d)); c.querySelector('circle').setAttribute('cy', g.Y(r.z)); }
    }
    $('#sim-slider').value = Math.round(SIM.pos / SIM.tot * 1000);
    $('#ss-d').textContent = G.fmtDist(r.d); $('#ss-z').textContent = Math.round(r.z) + ' m';
    $('#ss-s').textContent = (r.slope >= 0 ? '+' : '') + r.slope.toFixed(0) + ' %'; $('#ss-t').textContent = G.fmtDur(SIM.pos);
    if (follow && SIM.follow && !SIM.rec) map.panTo(ll0, { animate: false });
  }
  function simFrame(ts) {
    if (!SIM.playing) return;
    var dt = Math.min(0.1, (ts - SIM.last) / 1000); SIM.last = ts;
    SIM.pos = Math.min(SIM.tot, SIM.pos + dt * SIM.tot / SIM.dur); simRender(true);
    if (SIM.pos >= SIM.tot) { SIM.playing = false; simBtn(); return; }
    SIM.raf = requestAnimationFrame(simFrame);
  }
  function simBtn() { $('#sim-play').innerHTML = ic(SIM.playing ? 'pause' : 'play'); $('#sim-play').title = SIM.playing ? 'Pause' : 'Lecture'; }
  function simPlay() {
    if (SIM.playing) { SIM.playing = false; cancelAnimationFrame(SIM.raf); simBtn(); return; }
    if (SIM.pos >= SIM.tot) SIM.pos = 0;
    SIM.playing = true; SIM.last = performance.now(); simBtn(); SIM.raf = requestAnimationFrame(simFrame);
  }
  function simOpen() {
    if (!currentProfile) { toast('Tracez d’abord un itinéraire (ou des azimuts) pour lancer la simulation.'); return; }
    setRail('sim');
    SIM.open = true; simPrepare(currentProfile); SIM.pos = 0; SIM.playing = false; cancelAnimationFrame(SIM.raf); simBtn();
    var o = $('#profile-src').selectedOptions[0]; SIM.label = o ? o.textContent : 'Parcours'; $('#sim-src').textContent = SIM.label;
    var b = L.latLngBounds(currentProfile.pts.map(function (q) { return [q.lat, q.lon]; })); if (!map.getBounds().contains(b)) fit(b, { padding: [90, 90], maxZoom: 16 });
    simRender(false);
  }
  function simClose(keepRail) {
    SIM.open = false; SIM.playing = false; cancelAnimationFrame(SIM.raf);
    if (SIM.marker) { gCursor.removeLayer(SIM.marker); SIM.marker = null; } if (SIM.trail) { gCursor.removeLayer(SIM.trail); SIM.trail = null; }
    var c = $('#profile').querySelector('.cur'); if (c) c.setAttribute('visibility', 'hidden');
    if (!keepRail) setRail(S.mode || 'route');
  }
  // Le tracé affiché dans le profil a changé : on repart du début (ou on ferme s'il n'y a plus de tracé).
  function simSync() {
    if (!SIM.open || SIM.rec) return;
    if (!currentProfile) { simClose(); return; }
    if (currentProfile !== SIM.prof) { SIM.playing = false; cancelAnimationFrame(SIM.raf); simPrepare(currentProfile); SIM.pos = 0; simBtn(); simRender(false); }
  }
  $('#sim-play').addEventListener('click', simPlay);
  $('#sim-restart').addEventListener('click', function () { SIM.pos = 0; simRender(true); });
  $('#sim-close').addEventListener('click', function () { simClose(); });
  $('#sim-slider').addEventListener('input', function () { SIM.pos = this.value / 1000 * SIM.tot; simRender(true); });
  $('#sim-dur').addEventListener('input', function () { SIM.dur = +this.value; $('#sim-dur-v').textContent = SIM.dur + ' s'; });
  $('#sim-follow').addEventListener('change', function () { SIM.follow = this.checked; });

  // ---------- Export vidéo de la simulation ----------
  var REC = { cancel: false, url: null, name: '' };
  function waitTiles(ms) {
    return new Promise(function (res) {
      var t0 = Date.now();
      (function chk() {
        var pending = map.getContainer().querySelectorAll('img.leaflet-tile:not(.leaflet-tile-loaded)').length;
        if (!pending || Date.now() - t0 > ms) setTimeout(res, 250); else setTimeout(chk, 150);
      })();
    });
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  var FONT = '"Inter","Segoe UI",system-ui,sans-serif';
  // Compose une image de la carte (tuiles déjà chargées par Leaflet + tracés) dans un canvas.
  function drawSimFrame(ctx, W, H, pos, strip) {
    var mapEl = map.getContainer(), mr = mapEl.getBoundingClientRect();
    ctx.fillStyle = '#e6e3d9'; ctx.fillRect(0, 0, W, H);
    var lays = [].slice.call(map.getPane('tilePane').querySelectorAll('.leaflet-layer'));
    lays.sort(function (a, b) { return (parseInt(a.style.zIndex, 10) || 0) - (parseInt(b.style.zIndex, 10) || 0); });
    lays.forEach(function (lay) {
      var op = parseFloat(getComputedStyle(lay).opacity); ctx.globalAlpha = isNaN(op) ? 1 : op;
      [].forEach.call(lay.querySelectorAll('img.leaflet-tile'), function (img) {
        if (!img.complete || !img.naturalWidth) return;
        var r = img.getBoundingClientRect();
        ctx.drawImage(img, Math.floor(r.left - mr.left), Math.floor(r.top - mr.top), Math.ceil(r.width) + 1, Math.ceil(r.height) + 1);
      });
    });
    ctx.globalAlpha = 1;
    function P(la, lo) { return map.latLngToContainerPoint([la, lo]); }
    function path(pts) { ctx.beginPath(); pts.forEach(function (c, i) { var q = P(c[0], c[1]); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var items = layersList().filter(function (l) { return l.vis && !l.empty; });
    S.tracks.forEach(function (t) { if (t.show !== false) { path(t.coords); ctx.strokeStyle = '#fff'; ctx.lineWidth = 7; ctx.stroke(); ctx.strokeStyle = t.color; ctx.lineWidth = 4; ctx.stroke(); } });
    items.forEach(function (l) {
      if (l.type === 'route' && l.res) { path(l.res.line); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = l.color; ctx.lineWidth = 5; ctx.stroke(); }
      else if (l.type === 'az' && l.data.pts.length > 1) { path(l.data.pts); ctx.setLineDash([10, 6]); ctx.strokeStyle = l.color; ctx.lineWidth = 4; ctx.stroke(); ctx.setLineDash([]); }
      else if (l.type === 'meas' && l.data.pts.length > 1) { path(l.data.pts); ctx.setLineDash([2, 6]); ctx.strokeStyle = l.color; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]); }
    });
    // trace parcourue
    var r = simAt(pos), pts = SIM.prof.pts;
    path(pts.slice(0, r.i + 1).map(function (q) { return [q.lat, q.lon]; }).concat([[r.lat, r.lon]]));
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 11; ctx.stroke(); ctx.strokeStyle = '#c6a24e'; ctx.lineWidth = 7; ctx.stroke();
    function dot(q, rad, fill, label, txt) {
      ctx.beginPath(); ctx.arc(q.x, q.y, rad, 0, 6.2832); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
      if (label) { ctx.fillStyle = txt || '#fff'; ctx.font = '700 ' + Math.round(rad) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, q.x, q.y + 1); }
    }
    items.forEach(function (l) {
      if (l.type === 'route') l.data.wps.forEach(function (w, i) { dot(P(w.lat, w.lon), 12, { start: '#1a7f37', end: '#b4232c', via: '#000761' }[clsOf(l.data, i)], lblOf(l.data, i)); });
      else if (l.type === 'az') l.data.pts.forEach(function (w, i) { dot(P(w[0], w[1]), 11, '#c6a24e', String(i + 1), '#000761'); });
    });
    // curseur
    var q = P(r.lat, r.lon);
    ctx.beginPath(); ctx.arc(q.x, q.y, 15, 0, 6.2832); ctx.fillStyle = '#000761'; ctx.fill();
    ctx.beginPath(); ctx.arc(q.x, q.y, 12.5, 0, 6.2832); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(q.x, q.y, 9, 0, 6.2832); ctx.fillStyle = '#c6a24e'; ctx.fill();
    // carte d'information
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    var title = SIM.label, info = G.fmtDist(r.d) + '  ·  alt. ' + Math.round(r.z) + ' m  ·  pente ' + (r.slope >= 0 ? '+' : '') + r.slope.toFixed(0) + ' %  ·  ' + G.fmtDur(pos);
    ctx.font = '700 18px ' + FONT; var w1 = ctx.measureText(title).width; ctx.font = '500 14px ' + FONT; var w2 = ctx.measureText(info).width;
    var cw = Math.max(w1, w2) + 28;
    ctx.fillStyle = 'rgba(255,255,255,.94)'; rr(ctx, 14, 14, cw, 62, 12); ctx.fill();
    ctx.fillStyle = '#000761'; ctx.font = '700 18px ' + FONT; ctx.fillText(title, 28, 40);
    ctx.fillStyle = '#4d5069'; ctx.font = '500 14px ' + FONT; ctx.fillText(info, 28, 63);
    // profil d'altitude
    if (strip) {
      var sh = Math.round(H * 0.2), sx = 14, sy = H - sh - 14, sw = W - 28, pad = 12;
      ctx.fillStyle = 'rgba(255,255,255,.94)'; rr(ctx, sx, sy, sw, sh, 12); ctx.fill();
      var tot = pts[pts.length - 1].d || 1, zs = pts.map(function (a) { return a.z; }), lo = Math.min.apply(null, zs), hi = Math.max.apply(null, zs), span = Math.max(10, hi - lo);
      var X = function (d) { return sx + pad + d / tot * (sw - 2 * pad); }, Y = function (z) { return sy + sh - pad - 8 - (z - lo) / span * (sh - 2 * pad - 14); };
      ctx.beginPath(); pts.forEach(function (a, i) { if (i) ctx.lineTo(X(a.d), Y(a.z)); else ctx.moveTo(X(a.d), Y(a.z)); });
      ctx.lineTo(X(tot), sy + sh - pad - 8); ctx.lineTo(X(0), sy + sh - pad - 8); ctx.closePath(); ctx.fillStyle = 'rgba(198,162,78,.45)'; ctx.fill();
      ctx.beginPath(); pts.forEach(function (a, i) { if (i) ctx.lineTo(X(a.d), Y(a.z)); else ctx.moveTo(X(a.d), Y(a.z)); }); ctx.strokeStyle = '#000761'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(r.d), sy + 6); ctx.lineTo(X(r.d), sy + sh - 6); ctx.strokeStyle = '#c6a24e'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(X(r.d), Y(r.z), 6, 0, 6.2832); ctx.fillStyle = '#c6a24e'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#000761'; ctx.stroke();
      ctx.fillStyle = '#6b6f85'; ctx.font = '500 12px ' + FONT; ctx.textAlign = 'left'; ctx.fillText(Math.round(lo) + ' – ' + Math.round(hi) + ' m', sx + pad, sy + 16);
    }
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '500 11px ' + FONT; ctx.textAlign = 'right';
    var at = '© IGN – Géoplateforme · ScoutMap FSGGB', aw = ctx.measureText(at).width + 12;
    ctx.fillRect(W - aw - 4, strip ? H - 12 - Math.round(H * 0.2) - 30 : H - 24, aw, 18); ctx.fillStyle = '#4d5069'; ctx.fillText(at, W - 10, strip ? H - 12 - Math.round(H * 0.2) - 17 : H - 11);
  }
  function recBar(msg) { var b = $('#recbar'); b.hidden = !msg; if (msg) $('#rec-txt').textContent = msg; }
  // Recadre la carte sur le parcours, attend les tuiles, puis enregistre la simulation.
  function exportVideo(strip) {
    if (!SIM.open || !SIM.prof) { toast('Ouvrez d’abord la simulation d’un parcours.'); return; }
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { toast('Ce navigateur ne sait pas enregistrer de vidéo : essayez Chrome, Edge ou Firefox récent.'); return; }
    var mapEl = map.getContainer(), W = mapEl.clientWidth - (mapEl.clientWidth % 2), H = mapEl.clientHeight - (mapEl.clientHeight % 2);
    var saveC = map.getCenter(), saveZ = map.getZoom();
    REC.cancel = false; SIM.rec = true; SIM.playing = false; cancelAnimationFrame(SIM.raf); simBtn(); closePops(); map.closePopup();
    recBar('Recadrage de la carte…');
    var b = L.latLngBounds(SIM.prof.pts.map(function (q) { return [q.lat, q.lon]; }));
    map.fitBounds(b, { paddingTopLeft: [70, 100], paddingBottomRight: [70, strip ? Math.round(H * 0.2) + 50 : 60], animate: false, maxZoom: 17 });
    function restore() { SIM.rec = false; map.setView(saveC, saveZ, { animate: false }); SIM.pos = 0; simRender(false); recBar(''); }
    waitTiles(10000).then(function () {
      if (REC.cancel) { restore(); return; }
      var canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
      var ctx = canvas.getContext('2d'), mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].filter(function (t) { return MediaRecorder.isTypeSupported(t); })[0] || '';
      var rec, chunks = [];
      try { rec = new MediaRecorder(canvas.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 6000000 } : {}); }
      catch (e) { restore(); toast('Enregistrement impossible : ' + (e.message || e)); return; }
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        restore();
        if (REC.cancel) { toast('Enregistrement annulé.'); return; }
        showVideo(new Blob(chunks, { type: rec.mimeType || mime || 'video/webm' }), rec.mimeType || mime);
      };
      var HOLD0 = 700, RUN = SIM.dur * 1000, HOLD1 = 1000, t0 = null;
      drawSimFrame(ctx, W, H, 0, strip); rec.start(200);
      (function loop(ts) {
        if (REC.cancel) { rec.stop(); return; }
        if (t0 === null) t0 = ts;
        var e = ts - t0, f = Math.max(0, Math.min(1, (e - HOLD0) / RUN));
        drawSimFrame(ctx, W, H, f * SIM.tot, strip);
        recBar('Enregistrement… ' + Math.min(100, Math.round(Math.max(0, e) / (HOLD0 + RUN + HOLD1) * 100)) + ' %');
        if (e >= HOLD0 + RUN + HOLD1) { rec.stop(); return; }
        requestAnimationFrame(loop);
      })(performance.now());
    });
  }
  function showVideo(blob, mime) {
    if (REC.url) URL.revokeObjectURL(REC.url);
    REC.url = URL.createObjectURL(blob);
    var ext = /mp4/.test(mime) ? 'mp4' : 'webm', base = (S.name || SIM.label || 'scoutmap').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scoutmap';
    REC.name = base + '-simulation-' + new Date().toISOString().slice(0, 10) + '.' + ext;
    $('#vid-preview').src = REC.url;
    $('#vid-info').textContent = REC.name + ' · ' + (blob.size / 1048576).toFixed(1).replace('.', ',') + ' Mo · format ' + ext.toUpperCase() + (ext === 'webm' ? ' (lisible dans les navigateurs, VLC…)' : '');
    openDlg('dlg-video-done');
    var v = $('#vid-preview'); v.play && v.play().catch(function () { /* lecture automatique refusée */ });
  }
  function closeVideo() { var d = $('#dlg-video-done'); if (d.open) d.close(); $('#vid-preview').removeAttribute('src'); if (REC.url) { URL.revokeObjectURL(REC.url); REC.url = null; } }
  $('#sim-video').addEventListener('click', function () { $('#vid-dur').textContent = SIM.dur + ' s'; openDlg('dlg-video'); });
  $('#vid-cancel').addEventListener('click', function () { $('#dlg-video').close(); });
  $('#vid-go').addEventListener('click', function () { $('#dlg-video').close(); exportVideo($('#vid-profile').checked); });
  $('#rec-cancel').addEventListener('click', function () { REC.cancel = true; });
  $('#vid-save').addEventListener('click', function () {
    var a = document.createElement('a'); a.href = REC.url; a.download = REC.name; document.body.appendChild(a); a.click(); a.remove();
    toast('Vidéo enregistrée : ' + REC.name);
    $('#dlg-video-done').close(); setTimeout(closeVideo, 3000);
  });
  $('#vid-discard').addEventListener('click', function () { closeVideo(); toast('Vidéo non enregistrée.'); });
  $('#dlg-video-done').addEventListener('close', function () { $('#vid-preview').pause && $('#vid-preview').pause(); });

