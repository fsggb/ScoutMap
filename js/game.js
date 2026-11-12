/* ScoutMap : type « Grand jeu » — zones, formes, flèches, croix et zones de texte, avec couleur et transparence réglables. */
(function () {
  'use strict';
  var SM = window.SM, S = SM.S, map = SM.map, G = SM.G, esc = SM.esc, ic = SM.ic, RT = SM.RT;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var KINDS = {
    polygon: { label: 'Zone', icon: 'g-polygon' }, rect: { label: 'Rectangle', icon: 'g-rect' }, circle: { label: 'Cercle', icon: 'g-circle' },
    line: { label: 'Ligne', icon: 'g-line' }, arrow: { label: 'Flèche', icon: 'g-arrow' }, cross: { label: 'Croix', icon: 'g-cross' }, text: { label: 'Texte', icon: 'g-text' }
  };
    var STY = S.gameStyle;
  var gHandles = L.layerGroup().addTo(map), gDraft = L.layerGroup().addTo(map);
  var GT = 'select', DR = null, SELID = null, live = {};

  // ---------- Utilitaires ----------
  function rgba(hex, a) {
    var h = String(hex || '#000000').replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16) || 0; return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function D() { return S.game; }
  function shapeById(id) { return D().shapes.filter(function (s) { return s.id === id; })[0]; }
  function selShape() { return SELID ? shapeById(SELID) : null; }
  function mer(p) { return [p[1] * Math.PI / 180, Math.log(Math.tan(Math.PI / 4 + p[0] * Math.PI / 360))]; }
  function angleDeg(a, b) { var A = mer(a), B = mer(b); return Math.atan2(B[0] - A[0], B[1] - A[1]) * 180 / Math.PI; }
  function typing() { var a = document.activeElement; return !!a && (/^(input|select|textarea)$/i.test(a.tagName) || a.isContentEditable); }
  function newShape(kind, pts) {
    var s = { id: SM.nid(), kind: kind, pts: pts, fill: STY.fill, alpha: STY.alpha, stroke: STY.stroke, linked: STY.linked, weight: STY.weight,
      dash: (kind === 'text' || kind === 'cross') ? false : (STY.dash === true ? 'dash' : (STY.dash || false)), font: STY.font || 'arial', align: STY.align || 'center', fontColor: STY.fontColor, size: STY.size, bold: !!STY.bold, italic: !!STY.italic, underline: !!STY.underline, text: kind === 'text' ? 'Texte' : '' };
    if (kind === 'circle') s.r = 0;
    return s;
  }
  function vstyle(s) { return { color: s.stroke, weight: s.weight, opacity: 1, fillColor: s.fill, fillOpacity: s.alpha, dashArray: s.dash === 'dot' ? '1 9' : s.dash ? '10 8' : null, lineJoin: 'round', lineCap: 'round' }; }
  function arrowIcon(s, ang) {
    var sz = 14 + s.weight * 3;
    return L.divIcon({ className: 'g-icon', iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2],
      html: '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" style="transform:rotate(' + ang.toFixed(1) + 'deg)"><path d="M12 1L22 22L12 17L2 22Z" fill="' + s.stroke + '" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>' });
  }
  function crossIcon(s) {
    var sz = 18 + s.weight * 4, sw = (s.weight * 1.3 + 1) * 24 / sz;
    return L.divIcon({ className: 'g-icon', iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2],
      html: '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" fill="none" stroke-linecap="round"><path d="M4 4L20 20M20 4L4 20" stroke="#fff" stroke-width="' + (sw + 2.2) + '"/><path d="M4 4L20 20M20 4L4 20" stroke="' + s.stroke + '" stroke-width="' + sw + '"/></svg>' });
  }
  var FONTS = { arial: 'Arial,Helvetica,sans-serif', verdana: 'Verdana,Geneva,sans-serif', tahoma: 'Tahoma,Geneva,sans-serif', trebuchet: '\'Trebuchet MS\',Helvetica,sans-serif', georgia: 'Georgia,serif',
    times: '\'Times New Roman\',Times,serif', palatino: '\'Palatino Linotype\',\'Book Antiqua\',Palatino,serif', comic: '\'Comic Sans MS\',\'Comic Sans\',\'Chalkboard SE\',cursive', courier: '\'Courier New\',Courier,monospace',
    impact: 'Impact,\'Arial Narrow Bold\',sans-serif', algerian: 'Algerian,\'Cinzel Decorative\',serif', lobster: 'Lobster,\'Brush Script MT\',cursive', caveat: 'Caveat,\'Segoe Script\',cursive' };
  var LEGACY = { sans: 'arial', serif: 'georgia', hand: 'comic', title: 'impact', mono: 'courier' };
  function fontKey(s) { var k = (s && s.font) || 'arial'; k = LEGACY[k] || k; return FONTS[k] ? k : 'arial'; }
  function textIcon(s) {
    var bg = s.alpha > 0 ? rgba(s.fill, s.alpha) : 'transparent', bw = Math.round(s.weight / 2);
    return L.divIcon({ className: 'g-icon', iconSize: [0, 0],
      html: '<div class="gtext" title="Double-clic : modifier le texte" style="background:' + bg + ';color:' + s.fontColor + ';font-size:' + s.size + 'px;font-family:' + FONTS[fontKey(s)] + ';text-align:' + (s.align || 'center') + ';font-weight:' + (s.bold ? 700 : 400) + ';font-style:' + (s.italic ? 'italic' : 'normal') + ';text-decoration:' + (s.underline ? 'underline' : 'none') + ';border:' + bw + 'px solid ' + (bw ? s.stroke : 'transparent') + '">' + (esc(s.text || '') || '&nbsp;').replace(/\n/g, '<br>') + '</div>' });
  }
  function centroid(s) {
    var pts = s.kind === 'circle' ? [s.pts[0]] : s.pts, la = 0, lo = 0;
    pts.forEach(function (p) { la += p[0]; lo += p[1]; });
    return [la / pts.length, lo / pts.length];
  }
  function offsetPts(s, dx, dy) {
    function sh(p) { var q = map.latLngToLayerPoint(L.latLng(p[0], p[1])).add([dx, dy]), l = map.layerPointToLatLng(q); return [l.lat, l.lng]; }
    s.pts = s.pts.map(sh);
  }

  // ---------- Construction des formes (carte principale, calques stockés, cartes imprimées) ----------
  function buildShape(s, group, o) {
    var ls = [], ob = {}, inter = !!(o.stored || (o.active && o.select));
    function wire(l) {
      if (!inter) return;
      if (o.stored) { if (o.click) l.on('click', o.click); if (o.ctx) l.on('contextmenu', o.ctx); if (o.tip && l.bindTooltip) l.bindTooltip(o.tip, { sticky: true }); }
      else {
        l.on('click', function (e) { L.DomEvent.stopPropagation(e); select(s.id); });
        l.on('dblclick', function (e) { L.DomEvent.stop(e); if (GT !== 'select') setGT('select'); select(s.id); if (!S.panelOpen || S.rail !== 'game') SM.setRail('game'); setTab('style'); if (s.kind === 'text') editInline(s.id); });
        l.on('contextmenu', function (e) { L.DomEvent.stop(e); shapeCtx(s.id, e); });
      }
    }
    function add(l) { l.addTo(group); wire(l); ls.push(l); return l; }
    var st = Object.assign({ interactive: inter }, vstyle(s));
    switch (s.kind) {
      case 'polygon': ob.main = add(L.polygon(s.pts, st)); break;
      case 'rect': ob.main = add(L.rectangle(s.pts, st)); break;
      case 'circle': ob.main = add(L.circle(s.pts[0], Object.assign({ radius: Math.max(1, s.r || 1) }, st))); break;
      case 'line': case 'arrow':
        ob.main = add(L.polyline(s.pts, Object.assign({}, st, { fill: false })));
        if (inter) ob.hit = add(L.polyline(s.pts, { color: '#000', opacity: 0.001, weight: s.weight + 14, lineCap: 'round', interactive: true }));
        if (s.kind === 'arrow' && s.pts.length > 1) {
          var a = s.pts[s.pts.length - 2], b = s.pts[s.pts.length - 1];
          ob.head = add(L.marker(b, { icon: arrowIcon(s, angleDeg(a, b)), interactive: inter, keyboard: false }));
        }
        break;
      case 'cross': ob.marker = add(L.marker(s.pts[0], { icon: crossIcon(s), interactive: inter, draggable: inter && !o.stored, keyboard: false })); break;
      case 'text': ob.marker = add(L.marker(s.pts[0], { icon: textIcon(s), interactive: inter, draggable: inter && !o.stored, keyboard: false })); break;
    }
    if (ob.marker && inter && !o.stored) {
      ob.marker.on('dragstart', function () { select(s.id); });
      ob.marker.on('dragend', function () { var q = ob.marker.getLatLng(); s.pts[0] = [q.lat, q.lng]; SM.persist(); updateHandles(); });
    }
    ob.layers = ls;
    return ob;
  }
  function build(d, group, o) {
    o = o || {}; var out = {};
    d.shapes.forEach(function (s) { out[s.id] = buildShape(s, group, o); });
    return out;
  }
  // Tous les points d'un calque (pour cadrer la carte).
  function points(d) {
    var out = [];
    d.shapes.forEach(function (s) {
      if (s.kind === 'circle') { var c = s.pts[0]; out.push(c); [0, 90, 180, 270].forEach(function (b) { out.push(G.destination(c, b, s.r || 1)); }); }
      else s.pts.forEach(function (p) { out.push(p); });
    });
    return out;
  }

  // ---------- Mise à jour d'une forme existante (sans tout redessiner) ----------
  function updateGeom(s) {
    var ob = live[s.id]; if (!ob) return;
    if (s.kind === 'polygon') ob.main.setLatLngs(s.pts);
    else if (s.kind === 'rect') ob.main.setBounds(s.pts);
    else if (s.kind === 'circle') { ob.main.setLatLng(s.pts[0]); ob.main.setRadius(Math.max(1, s.r || 1)); }
    else if (s.kind === 'line' || s.kind === 'arrow') {
      ob.main.setLatLngs(s.pts); if (ob.hit) ob.hit.setLatLngs(s.pts);
      if (ob.head) { var a = s.pts[s.pts.length - 2], b = s.pts[s.pts.length - 1]; ob.head.setLatLng(b); ob.head.setIcon(arrowIcon(s, angleDeg(a, b))); }
    } else if (ob.marker) ob.marker.setLatLng(s.pts[0]);
  }
  function refreshStyle(s) {
    var ob = live[s.id]; if (!ob) return;
    if (ob.main && ob.main.setStyle) ob.main.setStyle(vstyle(s));
    if (ob.hit) ob.hit.setStyle({ weight: s.weight + 14 });
    if (ob.head) { var a = s.pts[s.pts.length - 2], b = s.pts[s.pts.length - 1]; ob.head.setIcon(arrowIcon(s, angleDeg(a, b))); }
    if (ob.marker) ob.marker.setIcon(s.kind === 'text' ? textIcon(s) : crossIcon(s));
    applySelStyle();
  }
  function applySelStyle() {
    Object.keys(live).forEach(function (id) {
      var ob = live[id], on = String(SELID) === id;
      [ob.main, ob.marker, ob.head].forEach(function (l) {
        var el = l && l.getElement && l.getElement(); if (el) { if (el.tagName && el.tagName.toLowerCase() === 'path') el.classList.toggle('g-sel', on); else el.classList.toggle('sel', on); }
      });
    });
  }

  // ---------- Rendu du calque en cours ----------
  function selectTool() { return RT.tool === 'game' && GT === 'select'; }
  function render() {
    SM.gGame.clearLayers(); live = build(D(), SM.gGame, { active: true, select: selectTool() });
    if (SELID && !shapeById(SELID)) SELID = null;
    applySelStyle(); updateHandles(); renderPane();
    drawDraft();
  }
  function select(id) {
    SELID = id || null; if (id && GTAB !== 'style' && S.mode === 'game') setTab('style'); applySelStyle(); updateHandles(); renderPane(); SM.persist();
  }

  // ---------- Poignées d'édition ----------
  function hmark(p, cls, size) {
    return L.marker(p, { draggable: true, keyboard: false, zIndexOffset: 5000, icon: L.divIcon({ className: 'g-handle ' + (cls || ''), iconSize: [size || 12, size || 12], html: cls && cls.indexOf('move') >= 0 ? '✥' : '' }) }).addTo(gHandles);
  }
  function updateHandles() {
    gHandles.clearLayers();
    var s = selShape(); if (!s || !selectTool() || S.mode !== 'game') return;
    function geom() { updateGeom(s); }
    function done() { SM.persist(); renderList(); updateHandles(); }
    if (s.kind === 'polygon' || s.kind === 'line' || s.kind === 'arrow') {
      var closed = s.kind === 'polygon';
      s.pts.forEach(function (p, i) {
        var m = hmark(p, '', 13);
        m.on('drag', function () { var q = m.getLatLng(); s.pts[i] = [q.lat, q.lng]; geom(); });
        m.on('dragend', done);
        m.on('contextmenu', function (e) { L.DomEvent.stop(e); vertexCtx(s, i, e); });
      });
      if (s.kind !== 'arrow') {
        var n = s.pts.length, segs = closed ? n : n - 1;
        for (var i = 0; i < segs; i++) (function (i) {
          var a = s.pts[i], b = s.pts[(i + 1) % n], idx = i + 1;
          var mid = hmark([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 'mid round', 11);
          mid.on('dragstart', function () { s.pts.splice(idx, 0, [mid.getLatLng().lat, mid.getLatLng().lng]); });
          mid.on('drag', function () { var q = mid.getLatLng(); s.pts[idx] = [q.lat, q.lng]; geom(); });
          mid.on('dragend', done);
        })(i);
      }
    } else if (s.kind === 'rect') {
      var A = s.pts[0], B = s.pts[1];
      [[A[0], A[1], B], [A[0], B[1], [B[0], A[1]]], [B[0], B[1], A], [B[0], A[1], [A[0], B[1]]]].forEach(function (c) {
        var m = hmark([c[0], c[1]], '', 13), fixed = c[2];
        m.on('drag', function () { var q = m.getLatLng(); s.pts = [fixed.slice(), [q.lat, q.lng]]; geom(); });
        m.on('dragend', done);
      });
    } else if (s.kind === 'circle') {
      var rh = hmark(G.destination(s.pts[0], 90, s.r || 1), 'round', 13);
      rh.on('drag', function () { s.r = Math.max(2, G.haversine(s.pts[0], [rh.getLatLng().lat, rh.getLatLng().lng])); geom(); });
      rh.on('dragend', done);
    }
    if (s.kind !== 'cross' && s.kind !== 'text') {
      var c = centroid(s), mv = hmark(c, 'move', 22), orig = null, start = null;
      mv.on('dragstart', function () {
        orig = JSON.parse(JSON.stringify(s.pts)); start = mv.getLatLng();
        gHandles.eachLayer(function (l) { if (l !== mv) gHandles.removeLayer(l); });
      });
      mv.on('drag', function () {
        var q = mv.getLatLng(), dla = q.lat - start.lat, dlo = q.lng - start.lng;
        s.pts = orig.map(function (p) { return [p[0] + dla, p[1] + dlo]; }); geom();
      });
      mv.on('dragend', done);
    }
  }

  // ---------- Dessin en cours ----------
  function pixDist(a, b) { var p = map.latLngToContainerPoint(L.latLng(a[0], a[1])), q = map.latLngToContainerPoint(L.latLng(b[0], b[1])); return p.distanceTo(q); }
  function drawDraft() {
    gDraft.clearLayers(); if (!DR || RT.tool !== 'game') return;
    var st = { color: STY.stroke, weight: STY.weight, opacity: 0.95, fillColor: STY.fill, fillOpacity: STY.alpha, dashArray: '7 6', interactive: false };
    var path = DR.pts.concat(DR.cur ? [DR.cur] : []);
    if (DR.kind === 'polygon') { if (path.length >= 3) L.polygon(path, st).addTo(gDraft); else if (path.length === 2) L.polyline(path, st).addTo(gDraft); }
    else if (DR.kind === 'line' || DR.kind === 'arrow') { if (path.length >= 2) L.polyline(path, st).addTo(gDraft); }
    else if (DR.kind === 'rect') { if (DR.pts.length === 1 && DR.cur) L.rectangle([DR.pts[0], DR.cur], st).addTo(gDraft); }
    else if (DR.kind === 'circle') { if (DR.pts.length === 1 && DR.cur) L.circle(DR.pts[0], Object.assign({ radius: Math.max(1, G.haversine(DR.pts[0], DR.cur)) }, st)).addTo(gDraft); }
    DR.pts.forEach(function (p, i) {
      L.circleMarker(p, { radius: i === 0 && DR.kind === 'polygon' && DR.pts.length >= 3 ? 8 : 5, color: '#000761', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(gDraft);
    });
  }
  function cancelDraft() { DR = null; gDraft.clearLayers(); }
  function finishable() { return !!DR && ((DR.kind === 'polygon' && DR.pts.length >= 3) || (DR.kind === 'line' && DR.pts.length >= 2)); }
  function finishDraft() {
    if (!DR) return;
    var d = DR, s = null;
    if (d.kind === 'polygon' && d.pts.length >= 3) s = newShape('polygon', d.pts);
    else if (d.kind === 'line' && d.pts.length >= 2) s = newShape('line', d.pts);
    else if (d.kind === 'arrow' && d.pts.length >= 2) s = newShape('arrow', d.pts);
    else if (d.kind === 'rect' && d.pts.length >= 2) s = newShape('rect', d.pts.slice(0, 2));
    else if (d.kind === 'circle' && d.pts.length >= 2) { s = newShape('circle', [d.pts[0]]); s.r = Math.max(2, G.haversine(d.pts[0], d.pts[1])); }
    cancelDraft();
    if (!s) { SM.toast('Forme incomplète : ajoutez des points.'); SM.persist(); return; }
    addShape(s);
  }
  function addShape(s, opt) {
    S.vis.game = true; SM.ensureVisible('game');
    D().shapes.push(s); SELID = s.id;
    var keep = $('#gs-keep').checked;
    if (!keep) { GT = 'select'; setTab('style'); }
    SM.persist(); render(); SM.renderLayerList();
    if (opt && opt.edit) editInline(s.id);
  }
  function addAt(kind, p) {
    if (S.mode !== 'game') SM.setMode('game');
    var wasTool = GT; GT = 'select'; var s = newShape(kind, [p]);
    addShape(s, { edit: kind === 'text' }); GT = wasTool === 'select' ? 'select' : wasTool; renderPane();
  }

  map.on('mousemove', function (e) { if (DR) { DR.cur = [e.latlng.lat, e.latlng.lng]; drawDraft(); } });
  map.on('click', function (e) {
    if (S.mode !== 'game' || RT.tool !== 'game') return;
    var p = [e.latlng.lat, e.latlng.lng];
    if (GT === 'select') { select(null); return; }
    if (GT === 'cross') { addShape(newShape('cross', [p])); return; }
    if (GT === 'text') { addShape(newShape('text', [p]), { edit: true }); return; }
    if (!DR) DR = { kind: GT, pts: [], cur: null };
    if (GT === 'polygon') {
      if (DR.pts.length >= 3 && pixDist(p, DR.pts[0]) <= 14) { finishDraft(); return; }
      DR.pts.push(p);
    } else if (GT === 'line') DR.pts.push(p);
    else { DR.pts.push(p); if (DR.pts.length >= 2) { finishDraft(); return; } }
    drawDraft(); SM.persist();
  });
  // Double-clic : termine une zone ou une ligne (le 2e clic a ajouté un doublon, on le retire).
  map.on('dblclick', function () {
    if (S.mode !== 'game' || RT.tool !== 'game' || !DR) return;
    if (DR.kind === 'polygon' || DR.kind === 'line') { DR.pts.pop(); finishDraft(); }
  });
  document.addEventListener('keydown', function (e) {
    if (S.mode !== 'game' || RT.tool !== 'game' || typing() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.body.classList.contains('doc-open') || document.querySelector('dialog[open]')) return;
    if (e.key === 'Enter' && DR) { e.preventDefault(); if (finishable()) finishDraft(); }
    else if (e.key.toLowerCase() === 'v') setGT('select');
  });

  // Clic droit pendant le dessin : on termine la forme si elle est complète, sinon on l'abandonne ; dans les deux cas retour à la sélection.
  function rightClick() {
    if (S.mode !== 'game' || RT.tool !== 'game' || GT === 'select') return false;
    if (finishable()) finishDraft(); else cancelDraft();
    if (GT !== 'select') setGT('select'); else render();
    return true;
  }
  function setGT(t) {
    cancelDraft(); GT = t; if (t !== 'select') setTab('tools');
    map.getContainer().classList.toggle('gt-select', t === 'select');
    render(); SM.persist();
  }

  // ---------- Textes ----------
  // Édition directe sur la carte (double-clic) : Entrée valide, Maj+Entrée = nouvelle ligne, Échap annule.
  function editInline(id) {
    var ob = live[id], s = shapeById(id); if (!ob || !ob.marker || !s || s.kind !== 'text') return;
    var el = ob.marker.getElement(), t = el && el.querySelector('.gtext'); if (!t || t.isContentEditable) return;
    var drag = ob.marker.dragging && ob.marker.dragging.enabled(); if (drag) ob.marker.dragging.disable();
    t.textContent = s.text || ''; t.contentEditable = 'true'; t.classList.add('editing'); t.removeAttribute('title'); t.focus();
    var r = document.createRange(); r.selectNodeContents(t); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    var done = false;
    function end(save) {
      if (done) return; done = true;
      t.removeEventListener('keydown', onKey); t.removeEventListener('blur', onBlur); t.removeEventListener('mousedown', stop); t.removeEventListener('dblclick', stop);
      var v = t.innerText.replace(/\u00a0/g, ' ').replace(/\n+$/, '');
      t.contentEditable = 'false'; t.classList.remove('editing'); window.getSelection().removeAllRanges();
      if (save) s.text = v;
      var cur = live[id]; if (drag && cur && cur.marker && cur.marker.dragging) cur.marker.dragging.enable();
      refreshStyle(s); SM.persist(); renderPane();
    }
    function stop(e) { e.stopPropagation(); }
    function onKey(e) {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); end(true); }
      else if (e.key === 'Escape') { e.preventDefault(); end(false); }
    }
    function onBlur() { end(true); }
    t.addEventListener('keydown', onKey); t.addEventListener('blur', onBlur); t.addEventListener('mousedown', stop); t.addEventListener('dblclick', stop);
  }
  function focusText() {
    if (!S.panelOpen || S.rail !== 'game') SM.setRail('game');
    setTimeout(function () { var t = $('#gs-text'); if (t) { t.focus(); t.select(); } }, 60);
  }

  // ---------- Menus contextuels ----------
  function dupShape(s) {
    var c = JSON.parse(JSON.stringify(s)); c.id = SM.nid(); offsetPts(c, 24, 24);
    D().shapes.push(c); SELID = c.id; SM.persist(); render(); SM.renderLayerList();
  }
  function reorder(s, toFront) {
    var a = D().shapes, i = a.indexOf(s); if (i < 0) return;
    a.splice(i, 1); if (toFront) a.push(s); else a.unshift(s); SM.persist(); render();
  }
  function shapeCtx(id, e) {
    select(id);
    var s = shapeById(id), ll = e.latlng, items = [];
    if (s.kind === 'text') items.push({ t: 'Modifier le texte (double-clic)', i: 'edit', a: function () { editInline(s.id); } });
    items.push({ t: 'Dupliquer', i: 'copy', a: function () { dupShape(s); } });
    items.push({ t: 'Mettre au premier plan', i: 'up', a: function () { reorder(s, true); } });
    items.push({ t: 'Mettre à l’arrière-plan', i: 'down', a: function () { reorder(s, false); } });
    if (s.kind === 'polygon' || s.kind === 'line') items.push({ t: 'Ajouter un sommet ici', i: 'pin', a: function () { addVertex(s, [ll.lat, ll.lng]); } });
    items.push({ t: 'Centrer la carte dessus', i: 'target', a: function () { map.panTo(L.latLng(centroid(s)[0], centroid(s)[1])); } });
    items.push('-', { t: 'Supprimer', i: 'trash', k: 'Suppr', danger: true, a: deleteSel });
    SM.showCtx(e.originalEvent.clientX, e.originalEvent.clientY, items);
  }
  function addVertex(s, p) {
    var n = s.pts.length, segs = s.kind === 'polygon' ? n : n - 1, best = 0, bd = Infinity;
    for (var i = 0; i < segs; i++) {
      var a = map.latLngToLayerPoint(L.latLng(s.pts[i][0], s.pts[i][1])), b = map.latLngToLayerPoint(L.latLng(s.pts[(i + 1) % n][0], s.pts[(i + 1) % n][1]));
      var d = L.LineUtil.pointToSegmentDistance(map.latLngToLayerPoint(L.latLng(p[0], p[1])), a, b); if (d < bd) { bd = d; best = i; }
    }
    s.pts.splice(best + 1, 0, p); SM.persist(); render();
  }
  function vertexCtx(s, i, e) {
    var min = s.kind === 'polygon' ? 3 : 2;
    SM.showCtx(e.originalEvent.clientX, e.originalEvent.clientY, [{ t: 'Supprimer ce sommet', i: 'trash', danger: true, dis: function () { return s.pts.length <= min; }, a: function () { s.pts.splice(i, 1); SM.persist(); render(); } }]);
  }

  // ---------- Panneau ----------
  function labelOf(s) { return KINDS[s.kind].label + (s.kind === 'text' && s.text ? ' : ' + s.text.replace(/\s+/g, ' ').slice(0, 22) : ''); }
  function renderList() {
    var a = D().shapes, ul = $('#gs-list'); if (!ul) return;
    $('#gs-count').textContent = a.length ? '(' + a.length + ')' : ''; $('#gs-empty').hidden = a.length > 0;
    ul.innerHTML = a.slice().reverse().map(function (s) {
      return '<li data-id="' + s.id + '"' + (s.id === SELID ? ' class="sel"' : '') + '><span class="gsw" style="background:' + (s.kind === 'line' || s.kind === 'arrow' || s.kind === 'cross' ? s.stroke : rgba(s.fill, Math.max(0.25, s.alpha))) + ';border-color:' + s.stroke + '"></span>' +
        '<span class="gt">' + ic(KINDS[s.kind].icon) + ' ' + esc(labelOf(s)) + '</span><button class="ibtn danger" data-del="' + s.id + '" title="Supprimer" aria-label="Supprimer">' + ic('x') + '</button></li>';
    }).join('');
  }
  // ---------- Onglets du panneau : Outils · Style · Éléments ----------
  var GTAB = 'tools';
  function setTab(t) {
    GTAB = t;
    $$('#gtabs [data-gtab]').forEach(function (b) { var on = b.dataset.gtab === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    $$('[data-gtabp]').forEach(function (p) { p.hidden = p.dataset.gtabp !== t; });
    closePal();
  }
  function show(el, on) { if (el) el.hidden = !on; }
  var NAMES = { '#ffffff': 'Blanc', '#000000': 'Noir', '#c0262d': 'Rouge', '#e8590c': 'Orange', '#e0a800': 'Jaune', '#2f9e44': 'Vert', '#0e7490': 'Turquoise', '#2563eb': 'Bleu', '#000761': 'Bleu marine', '#7a3db8': 'Violet', '#d6336c': 'Rose', '#12142b': 'Noir', '#c6a24e': 'Or', '#d97706': 'Orange', '#1a7f37': 'Vert' };
  function colorName(c) { return NAMES[String(c).toLowerCase()] || String(c).toUpperCase(); }
  function renderPane() {
    if (!$('#gtools')) return;
    $$('#gtools button').forEach(function (b) { b.classList.toggle('on', b.dataset.gt === GT); });
    var s = selShape(), src = s || STY, kind = s ? s.kind : (GT !== 'select' ? GT : null);
    if ($('#gtabs') && !$('#gtabs .on')) setTab(GTAB);
    $('#gs-target').textContent = s ? 'Élément sélectionné : ' + KINDS[s.kind].label.toLowerCase() : (kind ? 'Style des prochaines : ' + KINDS[kind].label.toLowerCase() + 's' : 'Style des prochaines formes');
    var filled = !kind || kind === 'polygon' || kind === 'rect' || kind === 'circle' || kind === 'text', isT = kind === 'text';
    $$('#gstyle [data-for]').forEach(function (r) {
      var f = r.dataset.for, on = true;
      if (f === 'fill') on = filled;
      else if (f === 'dash') on = !kind || (kind !== 'text' && kind !== 'cross');
      else if (f === 'text') on = isT;
      show(r, on);
    });
    $('#gb-fill-l').textContent = isT ? 'Fond' : 'Remplissage';
    $('#gb-stroke-l').textContent = isT ? 'Bordure' : kind === 'cross' ? 'Couleur' : 'Contour';
    $('#gf-weight-l').textContent = isT ? 'Épaisseur de la bordure' : kind === 'cross' ? 'Taille de la croix' : 'Épaisseur du trait';
    $('#gc-fill').style.background = src.alpha > 0 ? rgba(src.fill, Math.max(0.35, src.alpha)) : '#fff';
    $('#gc-fill').classList.toggle('none', !(src.alpha > 0));
    $('#gb-fill-v').textContent = src.alpha > 0 ? colorName(src.fill) : 'Aucun';
    $('#gc-stroke').style.borderColor = src.stroke; $('#gb-stroke-v').textContent = colorName(src.stroke);
    $('#gs-weight-v').textContent = src.weight + ' px';
    $$('#gs-dash button').forEach(function (b) { b.classList.toggle('on', (b.dataset.d || '') === String(src.dash === true ? 'dash' : src.dash || '')); });
    $('#gs-size-v').textContent = src.size; $('#gc-font').style.background = src.fontColor; $('#gs-font').value = fontKey(src);
    if (s && document.activeElement !== $('#gs-text')) $('#gs-text').value = s.text || '';
    ['bold', 'italic', 'underline'].forEach(function (k) { $('#gs-' + k).classList.toggle('on', !!src[k]); });
    $$('.gtb [data-al]').forEach(function (b) { b.classList.toggle('on', b.dataset.al === (src.align || 'center')); });
    show($('#gs-actions'), !!s);
    renderList();
  }
  // Applique une propriété à la forme sélectionnée et mémorise-la pour les prochaines formes.
  function setProp(prop, val) {
    var s = selShape(), tg = [STY]; if (s) tg.push(s);
    tg.forEach(function (t) {
      t[prop] = val;
      if (prop === 'fill' && t.linked) t.stroke = val;
      if (prop === 'stroke') t.linked = false;
    });
    if (s) refreshStyle(s);
    SM.persist(); renderPane();
  }

  // ---------- Nuancier (façon Word) : couleurs du thème et leurs nuances, « Aucune », « Autres couleurs » ----------
  var BASES = ['#000000', '#c0262d', '#e8590c', '#e0a800', '#2f9e44', '#0e7490', '#2563eb', '#000761', '#7a3db8', '#d6336c'];
  function mix(hex, t, w) {
    var n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) { return Math.round(v + (w - v) * t); });
    return '#' + c.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }
  function palette() {
    var rows = [[], [], [], [], [], []];
    BASES.forEach(function (c, i) {
      var col = i === 0 ? ['#ffffff', '#f2f2f2', '#d0d0d0', '#a0a0a0', '#555555', '#000000'] : [c, mix(c, .8, 255), mix(c, .6, 255), mix(c, .4, 255), mix(c, .25, 0), mix(c, .5, 0)];
      col.forEach(function (x, r) { rows[r].push(x); });
    });
    return rows;
  }
  var PAL = { prop: null, anchor: null };
  function closePal() { var p = $('#gpal'); if (p) p.hidden = true; PAL.prop = null; $$('[data-pal]').forEach(function (b) { b.classList.remove('open'); }); }
  function openPal(btn) {
    var prop = btn.dataset.pal, p = $('#gpal');
    if (PAL.prop === prop && !p.hidden) { closePal(); return; }
    closePal(); PAL.prop = prop; btn.classList.add('open');
    var s = selShape(), src = s || STY, key = prop === 'font' ? 'fontColor' : prop, cur = String(src[key]).toLowerCase(), isFill = prop === 'fill';
    var title = prop === 'fill' ? (src.kind === 'text' || (s && s.kind === 'text') ? 'Couleur de fond' : 'Couleur de remplissage') : prop === 'stroke' ? 'Couleur du contour' : 'Couleur du texte';
    p.innerHTML = '<div class="gpal-h">' + title + '</div>' +
      (isFill ? '<button type="button" class="gpal-none' + (src.alpha <= 0 ? ' on' : '') + '" data-none>' + ic('x') + 'Aucun remplissage</button>' : '') +
      '<div class="gpal-g">' + palette().map(function (row) { return row.map(function (c) { return '<button type="button" data-c="' + c + '" class="' + (c === cur ? 'on' : '') + '" style="background:' + c + '" title="' + colorName(c) + '" aria-label="' + colorName(c) + '"></button>'; }).join(''); }).join('') + '</div>' +
      '<button type="button" class="gpal-more" data-more><span class="gpal-rb"></span>Autres couleurs…</button>' +
      (isFill ? '<div class="gpal-a"><span>Transparence</span><input type="range" id="gp-alpha" min="0" max="100" step="5" value="' + Math.round(src.alpha * 100) + '" aria-label="Opacité"><b id="gp-alpha-v">' + Math.round(src.alpha * 100) + ' %</b></div><small>0 % = transparent · 100 % = plein</small>' : '');
    p.hidden = false;
    var r = btn.getBoundingClientRect(), w = p.offsetWidth, hh = p.offsetHeight;
    p.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    p.style.top = (r.bottom + 6 + hh > window.innerHeight ? Math.max(8, r.top - hh - 6) : r.bottom + 6) + 'px';
  }
  function palSet(prop, c) {
    var key = prop === 'font' ? 'fontColor' : prop;
    setProp(key, c);
    if (prop === 'fill') { var s = selShape(), src = s || STY; if (!(src.alpha > 0)) setProp('alpha', 0.4); }
  }
  (function wirePal() {
    var p = $('#gpal'), cu = $('#gpal-custom');
    p.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.c) { palSet(PAL.prop, b.dataset.c); closePal(); }
      else if (b.hasAttribute('data-none')) { setProp('alpha', 0); closePal(); }
      else if (b.hasAttribute('data-more')) { var s = selShape(), src = s || STY; cu.value = String(src[PAL.prop === 'font' ? 'fontColor' : PAL.prop]).slice(0, 7); cu.click(); }
    });
    p.addEventListener('input', function (e) { if (e.target.id === 'gp-alpha') { setProp('alpha', e.target.value / 100); $('#gp-alpha-v').textContent = e.target.value + ' %'; } });
    cu.addEventListener('input', function () { if (PAL.prop) palSet(PAL.prop, cu.value); });
    cu.addEventListener('change', closePal);
    document.addEventListener('mousedown', function (e) { if (!p.hidden && !e.target.closest('#gpal') && !e.target.closest('[data-pal]')) closePal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !p.hidden) { closePal(); e.stopPropagation(); } }, true);
    window.addEventListener('resize', closePal);
    var side = $('#panel') || document.body; side.addEventListener('scroll', closePal, true);
  })();
  function deleteSel() {
    var s = selShape(); if (!s) return false;
    D().shapes = D().shapes.filter(function (x) { return x !== s; }); SELID = null; SM.persist(); render(); SM.renderLayerList(); return true;
  }

  // ---------- Câblage du panneau ----------
  (function wire() {
    $$('#gtabs [data-gtab]').forEach(function (b) { b.addEventListener('click', function () { setTab(b.dataset.gtab); }); });
    $$('#gstyle [data-pal]').forEach(function (b) { b.addEventListener('click', function () { openPal(b); }); });
    function cur(k) { var s = selShape(); return (s || STY)[k]; }
    $('#gs-weight-m').addEventListener('click', function () { setProp('weight', Math.max(1, cur('weight') - 1)); });
    $('#gs-weight-p').addEventListener('click', function () { setProp('weight', Math.min(14, cur('weight') + 1)); });
    $('#gs-size-m').addEventListener('click', function () { setProp('size', Math.max(8, cur('size') - 2)); });
    $('#gs-size-p').addEventListener('click', function () { setProp('size', Math.min(96, cur('size') + 2)); });
    $('#gs-dash').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setProp('dash', b.dataset.d || false); });
    $('#gs-font').addEventListener('change', function () { setProp('font', this.value); });
    $$('.gtb [data-al]').forEach(function (b) { b.addEventListener('click', function () { setProp('align', b.dataset.al); }); });
    ['bold', 'italic', 'underline'].forEach(function (k) { $('#gs-' + k).addEventListener('click', function () { setProp(k, !cur(k)); }); });
    $('#gs-text').addEventListener('input', function () { var s = selShape(); if (s) { s.text = this.value; refreshStyle(s); SM.persist(); renderList(); } });
    $('#gtools').addEventListener('click', function (e) { var b = e.target.closest('button[data-gt]'); if (b) setGT(b.dataset.gt); });
    $('#gs-dup').addEventListener('click', function () { var s = selShape(); if (s) dupShape(s); });
    $('#gs-front').addEventListener('click', function () { var s = selShape(); if (s) reorder(s, true); });
    $('#gs-back').addEventListener('click', function () { var s = selShape(); if (s) reorder(s, false); });
    $('#gs-del').addEventListener('click', deleteSel);
    $('#gs-list').addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (del) { SELID = +del.dataset.del; deleteSel(); return; }
      var li = e.target.closest('li[data-id]'); if (!li) return;
      if (GT !== 'select') setGT('select');
      select(+li.dataset.id);
      var s = selShape(); if (s) { var c = centroid(s), ll = L.latLng(c[0], c[1]); if (!map.getBounds().pad(-0.1).contains(ll)) map.panTo(ll); }
    });
  })();

  // ---------- Indications ----------
  function hint() {
    if (GT === 'select') return SELID ? 'Glissez les poignées pour modifier · poignée dorée : déplacer · Suppr : supprimer · Échap : désélectionner.' : 'Cliquez une forme pour la modifier, ou choisissez un outil de dessin dans le panneau.';
    var n = DR ? DR.pts.length : 0;
    switch (GT) {
      case 'polygon': return n === 0 ? 'Zone : cliquez le premier sommet.' : n < 3 ? 'Cliquez les sommets suivants.' : 'Double-clic, Entrée ou clic sur le 1er point pour terminer la zone.';
      case 'line': return n === 0 ? 'Ligne : cliquez le départ.' : 'Cliquez les points suivants · double-clic ou Entrée pour terminer.';
      case 'rect': return n === 0 ? 'Rectangle : cliquez un coin.' : 'Cliquez le coin opposé.';
      case 'circle': return n === 0 ? 'Cercle : cliquez le centre.' : 'Cliquez pour fixer le rayon.';
      case 'arrow': return n === 0 ? 'Flèche : cliquez le départ.' : 'Cliquez la pointe de la flèche.';
      case 'cross': return 'Cliquez pour poser une croix.';
      case 'text': return 'Cliquez pour poser une zone de texte, puis tapez-la directement sur la carte.';
    }
    return '';
  }
  function hintBtn() { return finishable() ? 'Terminer' : (GT !== 'select' ? 'Sélection' : ''); }
  function hintAction() { if (finishable()) finishDraft(); else setGT('select'); }
  function escape() {
    if (DR) { cancelDraft(); SM.persist(); return true; }
    if (GT !== 'select') { setGT('select'); return true; }
    if (SELID) { select(null); return true; }
    return false;
  }
  function onTool(t) { if (t !== 'game') cancelDraft(); render(); }
  function leave() { cancelDraft(); SELID = null; gHandles.clearLayers(); }

  SM.game = { rightClick: rightClick, render: render, build: build, points: points, onTool: onTool, leave: leave, hint: hint, hintBtn: hintBtn, hintAction: hintAction, escape: escape,
    hasSel: function () { return !!SELID && !!shapeById(SELID); }, deleteSel: deleteSel, addAt: addAt };
  map.getContainer().classList.add('gt-select');
  render(); SM.renderStored();
})();
