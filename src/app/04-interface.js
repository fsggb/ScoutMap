  /* ==== src/app/04-interface.js : échelle, notifications, sélection, outils, panneau, barre latérale, accueil ==== */
  // ---------- Échelle ----------
  var MPP0 = 156543.03392, PXM = 0.00026458333;
  var SCALES = [25000, 50000];                       // échelles prédéfinies de l'itinéraire et des azimuts
  var GAME_SCALES = [1000, 2000, 5000, 10000, 25000, 50000];   // le grand jeu travaille à des échelles bien plus grandes
  function scalesNow() { return S.mode === 'game' ? GAME_SCALES : SCALES; }
  function scaleAt(z, lat) { return MPP0 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z) / PXM; }
  function zoomFor(sc, lat) { return Math.log(MPP0 * Math.cos(lat * Math.PI / 180) / (sc * PXM)) / Math.LN2; }
  function curScale() { var c = map.getCenter(); return scaleAt(map.getZoom(), c.lat); }
  function fit(bounds, opts) { map.fitBounds(bounds, opts); }
  function setScale(sc, center) {
    var c = center ? L.latLng(center[0], center[1]) : map.getCenter();
    map.setView(c, Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), zoomFor(sc, c.lat))), { animate: true });
  }
  function niceScale(sc) {
    for (var i = 0; i < SCALES.length; i++) if (Math.abs(sc / SCALES[i] - 1) < 0.004) return SCALES[i];
    var step = sc < 3000 ? 10 : sc < 30000 ? 100 : sc < 300000 ? 1000 : 10000;
    return Math.round(sc / step) * step;
  }
  function updateScaleUI() {
    var sc = niceScale(curScale());
    $('#scale-val').textContent = '1 : ' + sp(sc);
    $$('#scale-list button').forEach(function (b) { b.classList.toggle('on', +b.dataset.s === sc); });
  }
  map.on('zoom move', updateScaleUI);
  map.on('zoomend', function () {
    updateScaleUI();
    { var o = wantOff(); if (o !== curOff) { curOff = o; buildTiles(); } }
  });
  $('#zoom-in').addEventListener('click', function () { map.zoomIn(); });
  $('#zoom-out').addEventListener('click', function () { map.zoomOut(); });
  var SCALE_DESC = { 1000: 'Terrain de camp, bâtiment', 2000: 'Grand terrain, domaine', 5000: 'Village, grand domaine', 10000: 'Commune', 25000: 'Secteur, vallée', 50000: 'Grande zone, massif' };
  function sizeIdea(sc) {   // ordre de grandeur : 1 cm sur la carte et surface d'une feuille A4 (zone imprimable 19 × 27,7 cm)
    var cm = sc / 100, w = sc * 0.19, h = sc * 0.277, f = function (m) { return m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',') + ' km'; };
    return '1 cm = ' + f(cm) + ' · une feuille A4 ≈ ' + f(w) + ' × ' + f(h);
  }
  window.SM_sizeIdea = sizeIdea;
  function renderScaleList() { $('#scale-list').innerHTML = scalesNow().map(function (s) { return '<button data-s="' + s + '"><b>1 : ' + sp(s) + '</b>' + (SCALE_DESC[s] ? '<em>' + esc(SCALE_DESC[s]) + '</em>' : '') + '<small>' + esc(sizeIdea(s)) + '</small></button>'; }).join(''); updateScaleUI(); }
  renderScaleList(); window.SM_renderScaleList = renderScaleList;
  $('#scale-list').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setScale(+b.dataset.s); });
  $('#scale-custom').addEventListener('input', function () { var v = +this.value, n = $('#scale-idea'); if (v >= 200) { n.textContent = sizeIdea(v); n.hidden = false; } else n.hidden = true; });
  $('#scale-custom').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { var v = +this.value; if (v >= 200) { setScale(v); this.value = ''; } }
  });

  // ---------- Utilitaires UI ----------
  /* Notifications : une carte apparaît (comme sur un téléphone), puis se rétrécit et rentre dans le bouton Notifications,
     où elle reste consultable (liste « Récentes »). opt : { kind: 'info'|'ok'|'warn'|'bad', action: { label, fn }, sticky: true } */
  var NHIST = NHIST || [], NUNREAD = NUNREAD || 0;   // (déclarées ainsi : une notification peut arriver avant cette ligne)
  function ntfHost() {
    var h = document.getElementById('ntf-host');
    if (!h) { h = document.createElement('div'); h.id = 'ntf-host'; h.setAttribute('aria-live', 'polite'); document.body.appendChild(h); }
    return h;
  }
  function ntfKind(msg) { return /impossible|erreur|échec|indisponible|injoignable|refus/i.test(msg) ? 'bad' : /attention|trop |manque|hors connexion/i.test(msg) ? 'warn' : /enregistr|terminé|copié|prêt|installée|de retour/i.test(msg) ? 'ok' : 'info'; }
  function ntfStow(card) {
    if (!card || card._gone) return; card._gone = true; clearTimeout(card._t);
    var bell = document.getElementById('rail-notif'), r = card.getBoundingClientRect(), b = bell && bell.getBoundingClientRect();
    var done = function () { if (card.parentNode) card.parentNode.removeChild(card); if (bell) { bell.classList.remove('ntf-pulse'); void bell.offsetWidth; bell.classList.add('ntf-pulse'); } };
    if (!b || !b.width || !card.animate || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { card.classList.add('out'); setTimeout(done, 250); return; }
    var dx = b.left + b.width / 2 - (r.left + r.width / 2), dy = b.top + b.height / 2 - (r.top + r.height / 2);
    var a = card.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1, borderRadius: '14px' },
      { transform: 'translate(' + dx * 0.35 + 'px,' + dy * 0.35 + 'px) scale(.55)', opacity: 0.9, borderRadius: '22px', offset: 0.45 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.06)', opacity: 0.15, borderRadius: '50%' }
    ], { duration: 650, easing: 'cubic-bezier(.5,0,.75,.2)', fill: 'forwards' });
    a.onfinish = done;
  }
  function toast(msg, opt) {
    msg = String(msg == null ? '' : msg); if (!msg) return;
    opt = opt || {};
    var kind = opt.kind || ntfKind(msg), host = ntfHost();
    /* Trois niveaux : « important » (ce qui change le tracé ou demande une vérification : point sans chemin, tunnel, vol d'oiseau,
       distance dépassée…) reste affiché jusqu'à ce qu'on le ferme ; « discret » (simple information : point posé sur l'église…)
       passe vite ; le niveau normal entre les deux. */
    var level = opt.level || (opt.sticky ? 'normal' : kind === 'bad' ? 'important' : 'normal');
    if (level === 'important' && kind === 'info') kind = 'warn';
    // le même message déjà affiché : on relance simplement son minuteur
    var same = Array.prototype.filter.call(host.children, function (c) { return c._msg === msg && !c._gone; })[0];
    if (same) { clearTimeout(same._t); if (!same._sticky) same._t = setTimeout(function () { ntfStow(same); }, 4200); return; }
    NHIST.unshift({ text: msg, kind: kind, t: Date.now(), level: level }); if (NHIST.length > 40) NHIST.length = 40;
    NUNREAD++; renderNotes();
    var card = document.createElement('div'); card.className = 'ntf ntf-' + kind + ' ntf-' + level; card.setAttribute('role', level === 'important' ? 'alert' : 'status'); card._msg = msg; card._sticky = !!opt.sticky || level === 'important';
    card.innerHTML = '<span class="ntf-ic">' + ic(kind === 'ok' ? 'check' : kind === 'info' ? 'bell' : 'alert') + '</span><span class="ntf-t">' + (level === 'important' ? '<b class="ntf-lv">À vérifier</b>' : '') + '<span></span></span>' +
      (opt.action ? '<button type="button" class="ntf-a"></button>' : '') + '<button type="button" class="ntf-x" aria-label="Ranger dans les notifications">' + ic('x') + '</button>';
    card.querySelector('.ntf-t > span').textContent = msg;
    // glisser la carte vers la droite (ou la gauche) la fait disparaître, comme sur un téléphone ; elle reste dans la liste
    (function swipe() {
      var x0 = null, y0 = 0, dx = 0, pid = null;
      card.addEventListener('pointerdown', function (e) { if (e.target.closest('button')) return; x0 = e.clientX; y0 = e.clientY; dx = 0; pid = e.pointerId; card.style.transition = 'none'; clearTimeout(card._t); });
      card.addEventListener('pointermove', function (e) {
        if (x0 === null || e.pointerId !== pid) return; dx = e.clientX - x0;
        if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(e.clientY - y0)) { try { card.setPointerCapture(pid); } catch (er) { /* ignoré */ } e.preventDefault(); }
        card.style.transform = 'translateX(' + dx + 'px)'; card.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 260));
      });
      function end() {
        if (x0 === null) return; x0 = null; card.style.transition = '';
        if (Math.abs(dx) > 70) { card._gone = true; clearTimeout(card._t); card.style.transform = 'translateX(' + (dx > 0 ? 420 : -420) + 'px)'; card.style.opacity = '0'; setTimeout(function () { if (card.parentNode) card.parentNode.removeChild(card); }, 220); return; }
        card.style.transform = ''; card.style.opacity = '';
        if (!card._sticky) card._t = setTimeout(function () { ntfStow(card); }, 2500);
      }
      card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
    })();
    if (opt.action) { var ab = card.querySelector('.ntf-a'); ab.textContent = opt.action.label; ab.addEventListener('click', function () { ntfStow(card); opt.action.fn(); }); }
    card.querySelector('.ntf-x').addEventListener('click', function () { ntfStow(card); });
    card.addEventListener('mouseenter', function () { clearTimeout(card._t); });
    card.addEventListener('mouseleave', function () { if (!card._sticky) card._t = setTimeout(function () { ntfStow(card); }, 2000); });
    host.appendChild(card);
    requestAnimationFrame(function () { card.classList.add('in'); });
    // trois cartes au plus à l'écran : la plus ancienne se range
    var live = Array.prototype.filter.call(host.children, function (c) { return !c._gone; });
    if (live.length > 3) ntfStow(live[0]);
    if (!card._sticky) card._t = setTimeout(function () { ntfStow(card); }, level === 'discret' ? 2200 : Math.min(9000, 3200 + msg.length * 25));
    return card;
  }
  function pin(label, cls, wrap) {
    return L.divIcon({ className: 'pin-wrap' + (wrap ? ' ' + wrap : ''), html: '<div class="pin ' + (cls || '') + '">' + esc(label) + '</div>', iconSize: [28, 28], iconAnchor: [14, 14] });
  }
  function ll(p) { return L.latLng(p[0], p[1]); }
  function fmtP(p) { return G.formatCoord('wgs', p[0], p[1]); }
  function lastPoint() { var a = S.az.pts; return a.length ? a[a.length - 1] : null; }
  function openDlg(id) { var d = $('#' + id); if (!d.open) d.showModal(); }
  $$('[data-close-dlg]').forEach(function (b) { b.addEventListener('click', function () { b.closest('dialog').close(); }); });

  // ---------- Sélection de points (carte ↔ panneau) ----------
  var SEL = null;                                    // { k: 'route'|'az'|'meas', i }
  var routeMarkers = [], azMarkers = [], measMarkers = [];
  function select(k, i, scrollRow) {
    SEL = k ? { k: k, i: i } : null;
    // Sélection depuis la carte : on quitte tout champ de saisie, pour que Suppr retire le point et non du texte.
    if (k && scrollRow) { var a = document.activeElement; if (a && /^(input|select|textarea)$/i.test(a.tagName)) a.blur(); }
    applySel(scrollRow);
  }
  function applySel(scrollRow) {
    function mark(list, k) { list.forEach(function (m, i) { var el = m.getElement && m.getElement(); if (el) el.classList.toggle('sel', !!SEL && SEL.k === k && SEL.i === i); }); }
    mark(routeMarkers, 'route'); mark(azMarkers, 'az'); mark(measMarkers, 'meas');
    var row = null;
    $$('#wps li[data-i]').forEach(function (li) { var on = !!SEL && SEL.k === 'route' && +li.dataset.i === SEL.i; li.classList.toggle('sel', on); if (on) row = li; });
    $$('#az-table tr[data-i]').forEach(function (tr) {
      var want = SEL && SEL.k === 'az' ? Math.max(1, SEL.i) : -1, on = +tr.dataset.i === want; tr.classList.toggle('sel', on); if (on) row = tr;
    });
    if (row && scrollRow && row.scrollIntoView) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function deleteSelected() {
    if (!SEL) return false;
    var k = SEL.k, i = SEL.i;
    if (k === 'route') { removeWp(i); select(S.route.wps.length ? 'route' : null, Math.min(i, S.route.wps.length - 1)); }
    else if (k === 'az') {
      var n = S.az.pts.length, closed = azClosed();
      if (closed && (i === 0 || i === n - 1)) { S.az.pts.splice(n - 1, 1); S.az.pts.splice(0, 1); } else S.az.pts.splice(i, 1);
      renderAz(); persist(); select(S.az.pts.length ? 'az' : null, Math.min(i, S.az.pts.length - 1));
    } else if (k === 'meas') { S.meas.pts.splice(i, 1); renderMeas(); persist(); select(S.meas.pts.length ? 'meas' : null, Math.min(i, S.meas.pts.length - 1)); }
    return true;
  }
  function panToIfHidden(latlng) { if (!map.getBounds().pad(-0.1).contains(latlng)) map.panTo(latlng); }

  // ---------- Outils, panneau, rail ----------
  function setTool(t) {
    RT.tool = t;
    var c = map.getContainer();
    c.classList.toggle('tool-draw', t !== 'pan' && t !== 'game'); c.classList.toggle('tool-pan', t === 'pan'); c.classList.toggle('tool-game', t === 'game');
    renderRouteMarkers(); renderAz(); updateHint(); updateEditUi();
    if (window.SM && SM.game && SM.game.onTool) SM.game.onTool(t);
  }
  // Verrou : en mode Édition (stylo) un clic sur la carte pose un point ; verrouillé (cadenas), la carte ne fait que se déplacer.
  function updateEditUi() {
    var on = RT.tool !== 'pan';
    $$('[data-edit]').forEach(function (b) {
      b.classList.toggle('on', on);
      b.innerHTML = ic(on ? 'edit' : 'lock') + '<span>' + (on ? 'Édition' : 'Verrouillé') + '</span>';
      b.title = on ? 'Édition : un clic sur la carte pose un point. Cliquez ici pour verrouiller (la carte ne fait alors que se déplacer).' : 'Verrouillé : cliquer sur la carte ne pose rien. Cliquez ici pour modifier.';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  $$('[data-edit]').forEach(function (b) { b.addEventListener('click', function () { setTool(RT.tool === 'pan' ? S.rail : 'pan'); }); });
  function updateRailMode() {
    var info = MODE_INFO[S.mode || 'route'];
    $('#rail-mode-l').textContent = info.label; $('#rail-mode use').setAttribute('href', '#i-' + info.icon);
  }
  var SUB = null;   // sous-panneau affiché à la place des outils : 'notif' (alertes) ou 'settings' (paramètres)
  function showSub(name) {
    SUB = name || null; if (SUB) S.panelOpen = true;
    $$('.pane').forEach(function (pn) { pn.hidden = pn.dataset.pane !== (SUB || S.rail); });
    $$('.rail-btn[data-rail]').forEach(function (b) { b.classList.toggle('on', b.dataset.rail === 'mode' ? !SUB : b.dataset.rail === SUB); });
    $$('[data-set]').forEach(function (d) { d.hidden = d.dataset.set !== S.mode; });
    if (SUB === 'notif') renderNotes();
    if (SUB === 'library') renderMyLayers();
    applyPanel(); updateHint();
  }
  // ----- Alertes : une liste unique (au lieu de bandeaux dans le panneau), avec un compteur sur le bouton
  var NOTES = NOTES || {};
  // Une alerte sur le tracé (tunnel, route nationale, vol d'oiseau…) qui apparaît ou change est aussi montrée tout de suite, en notification importante.
  var NOTE_LOUD = { nat: 1, off: 1, tunnel: 1 };
  function setNote(key, text, kind, action) {
    var prev = NOTES[key] && NOTES[key].text;
    if (text) NOTES[key] = { text: text, kind: kind || 'warn', action: action || null }; else delete NOTES[key];
    renderNotes();
    if (text && !prev && NOTE_LOUD[key]) toast(text, { kind: kind || 'warn', level: 'important' });
  }
  function hhmm(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function renderNotes() {
    var ks = Object.keys(NOTES || {}), ul = $('#notes-list'), b = $('#notif-badge');
    if (SUB === 'notif' && S.panelOpen) NUNREAD = 0;
    var n = ks.length + NUNREAD;
    if (b) { b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n); }
    if (!ul) return;
    ul.innerHTML = ks.map(function (k) { var n = NOTES[k]; return '<li class="note-' + n.kind + '">' + ic(n.kind === 'info' ? 'bell' : 'alert') + '<span>' + esc(n.text) + '</span>' + (n.action ? '<button type="button" class="btn-primary sm" data-note-act="' + esc(k) + '">' + esc(n.action.label) + '</button>' : '') + '</li>'; }).join('');
    $('#notes-empty').hidden = !!ks.length;
    var rl = $('#ntf-recent');
    if (rl) {
      rl.innerHTML = NHIST.map(function (h) { return '<li class="ntf-row ntf-' + h.kind + '"><time>' + hhmm(h.t) + '</time><span>' + esc(h.text) + '</span></li>'; }).join('');
      $('#ntf-recent-box').hidden = !NHIST.length;
    }
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-note-act]'); if (a) { var n = NOTES[a.dataset.noteAct]; if (n && n.action) n.action.fn(); return; }
    if (e.target.closest('#ntf-clear')) { NHIST = []; NUNREAD = 0; renderNotes(); }
  });
  function setMode(m) {
    if (m === S.mode) { showHome(false); return; }
    if (SIM.open) simClose(true);
    select(null);
    if (window.SM && SM.game && SM.game.leave) SM.game.leave();
    S.mode = m; showHome(false); renderScaleList();
    applyVis(); renderStored(); renderLayerList(); refreshProfile(); updateRailMode(); applyDock();
    if (window.SM && SM.game) SM.game.render();
    persist();
  }
  function setRail(r) {
    if (r !== 'sim' && SIM.open) simClose(true);
    if (TYPES.indexOf(r) >= 0) setMode(r);
    else if (!S.mode) { showHome(true); return; }
    S.rail = r; S.panelOpen = true; SUB = null;
    $$('.pane').forEach(function (p) { p.hidden = p.dataset.pane !== r; });
    $$('.rail-btn[data-rail]').forEach(function (b) { b.classList.toggle('on', b.dataset.rail === 'mode'); });
    $$('[data-set]').forEach(function (d) { d.hidden = d.dataset.set !== S.mode; });
    updateRailMode();
    applyPanel();
    setTool(TYPES.indexOf(r) >= 0 ? r : 'pan');
    if (r === 'layers') renderLayerList();
    persist();
  }
  function applyPanel() {
    $('#app').classList.toggle('nopanel', !S.panelOpen);
    setTimeout(function () { map.invalidateSize(); drawProfile(); }, 220);
  }
  function togglePanel() { S.panelOpen = !S.panelOpen; applyPanel(); persist(); }
  $$('.rail-btn[data-rail]').forEach(function (b) {
    b.addEventListener('click', function () {
      var r = b.dataset.rail;
      if (r === 'home') { showHome(true); return; }
      if (r === 'notif' || r === 'settings' || r === 'share' || r === 'library') { if (SUB === r && !S.panelOpen) { S.panelOpen = true; applyPanel(); persist(); return; } showSub(SUB === r ? null : r); return; }
      // bouton de l'application en cours : revient aux outils (ou rouvre le panneau)
      if (SUB) { showSub(null); return; }
      if (!S.panelOpen) { S.panelOpen = true; applyPanel(); persist(); return; }
      if (RT.tool === 'pan' && TYPES.indexOf(S.rail) >= 0) setTool(S.rail); else togglePanel();
    });
  });
  // bouton Panneau : depuis Notifications, Tracés ou Partage, il ramène d'abord aux outils du travail en cours ; sinon il ouvre ou ferme le panneau
  $('#rail-toggle').addEventListener('click', function () { if (SUB && S.panelOpen) { showSub(null); return; } togglePanel(); });
  $('#panel-close').addEventListener('click', function () { S.panelOpen = false; applyPanel(); persist(); });

  // ---------- Accueil : choix du type de travail ----------
  function showHome(show) {
    var h = $('#home'); if (!h) return;
    h.hidden = !show;
    if (show) { if (window.SM && SM.game && SM.game.closeWizard) SM.game.closeWizard(); renderHome(); if (SIM.open) simClose(true); closePops(); hideCtx(); map.closePopup(); }
    updateHint();
  }
  function startType(t) {
    if (!$('#home').hidden) { newProject(t); return; }
    setRail(t);
    if (isMobile()) { S.panelOpen = false; applyPanel(); persist(); }
  }

  function hintText() {
    var r = S.rail, n = S.route.wps.length;
    if (r === 'route') {
      if (S.route.loop) return n === 0 ? 'Boucle : cliquez sur la carte pour poser le départ.' : 'Ajoutez des points de passage : le retour au départ est automatique.';
      if (n === 0) return 'Cliquez sur la carte pour poser le départ (A).';
      if (n === 1) return 'Cliquez pour poser l’arrivée.';
      return 'Cliquez pour prolonger (ou sur le tracé pour insérer) · clic sur A : boucle · Suppr : retirer le point choisi.';
    }
    if (r === 'az') return S.az.pts.length < 1 ? 'Cliquez pour poser le premier point.' : S.az.pts.length > 2 ? 'Cliquez pour ajouter un point · clic sur le point 1 : fermer · Suppr : retirer le point choisi.' : 'Cliquez pour ajouter un point.';
    return 'Cliquez pour poser les sommets · Suppr : retirer le point choisi.';
  }
  function updateHint() {
    var el = $('#toolhint'), r = S.rail;
    if (!S.mode || VIEWER || ($('#home') && !$('#home').hidden)) { el.hidden = true; return; }
    el.classList.toggle('is-game', r === 'game');
    if (r === 'game' && window.SM && SM.game) {
      el.hidden = false; $('#hint-ic').innerHTML = '<use href="#i-flag"/>';
      $('#hint-txt').textContent = SM.game.hint(); $('#hint-btn').textContent = SM.game.hintBtn(); $('#hint-btn').hidden = !SM.game.hintBtn();
      return;
    }
    if (r !== 'route' && r !== 'az' && r !== 'meas') { el.hidden = true; return; }
    el.hidden = false; $('#hint-btn').hidden = false;
    $('#hint-ic').innerHTML = '<use href="#i-' + { route: 'route', az: 'compass', meas: 'ruler' }[r] + '"/>';
    if (RT.tool === 'pan') { $('#hint-txt').textContent = 'Mode déplacement : la carte se déplace sans poser de point.'; $('#hint-btn').textContent = 'Reprendre le tracé'; }
    else { $('#hint-txt').textContent = hintText(); $('#hint-btn').textContent = 'Terminer'; }
  }
  $$('[data-start]').forEach(function (b) { b.addEventListener('click', function () { newProject(b.dataset.start); }); });
  $('#home-open').addEventListener('click', function () { $('#file-gpx').click(); });
  $('.brand').addEventListener('click', function (e) { if (VIEWER) return; e.preventDefault(); showHome(true); });
  $('#proj-rows').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-a]'), li = e.target.closest('li[data-id]'); if (!b || !li) return;
    var id = +li.dataset.id, ent = projList().filter(function (x) { return x.id === id; })[0]; if (!ent) return;
    if (b.dataset.a === 'open') { loadProject(ent.data, ent.id); }
    else if (b.dataset.a === 'dl') { exportHtml(ent.data, ent.name); }
    else if (b.dataset.a === 'del') { if (confirm('Supprimer « ' + ent.name + ' » de ce navigateur ?')) { projStore(projList().filter(function (x) { return x.id !== id; })); renderHome(); } }
  });
  $('#wps-toggle').addEventListener('click', function () { S.wpsCollapsed = !S.wpsCollapsed; applyWpsCollapse(); persist(); });
  function applyWpsCollapse() {
    var c = !!S.wpsCollapsed;
    ['#wps', '#wps-empty', '#wps-help'].forEach(function (s) { $(s).classList.toggle('collapsed', c); });
    $('#wps-toggle').innerHTML = ic(c ? 'chev-down' : 'chev-up'); $('#wps-toggle').title = c ? 'Afficher la liste des points' : 'Réduire la liste des points';
  }
  $('#hint-btn').addEventListener('click', function () { if (S.rail === 'game' && window.SM && SM.game) { SM.game.hintAction(); return; } setTool(RT.tool === 'pan' ? S.rail : 'pan'); });

