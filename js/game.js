/* ScoutMap : type « Grand jeu » — zones, formes, flèches, croix et zones de texte, avec couleur et transparence réglables. */
(function () {
  'use strict';
  var SM = window.SM, S = SM.S, map = SM.map, G = SM.G, esc = SM.esc, ic = SM.ic, RT = SM.RT;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var KINDS = {
    polygon: { label: 'Zone', icon: 'g-polygon' }, rect: { label: 'Rectangle', icon: 'g-rect' }, circle: { label: 'Cercle', icon: 'g-circle' },
    line: { label: 'Ligne', icon: 'g-line' }, arrow: { label: 'Flèche', icon: 'g-arrow' }, cross: { label: 'Croix', icon: 'g-cross' }, text: { label: 'Texte', icon: 'g-text' }, stamp: { label: 'Élément', icon: 'g-stamp' }
  };
    var STY = S.gameStyle, VQ = (document.currentScript && document.currentScript.src.split('?')[1]) || '';
  var gHandles = L.layerGroup().addTo(map), gDraft = L.layerGroup().addTo(map);
  var GT = 'select', DR = null, SELID = null, live = {}, PRE = null, ZSHAPE = 'polygon';

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
  function newStamp(el, p) {
    var th = themeById(D().theme);
    var big = el.hero ? 40 : el.art ? 28 : el.flag ? 18 : 0, tm = el.team && (D().teams || []).filter(function (t) { return t.id === el.team; })[0];
    return { id: SM.nid(), kind: 'stamp', pts: [p], icon: el.i, name: el.l, mm: big || undefined, stroke: el.col || STY.iconColor || (th && th.color) || '#4a2c0f', fill: '#ffffff', alpha: 0, linked: false, weight: 3, dash: false,
      text: '', fontColor: STY.iconText || (th && th.color) || '#12142b', size: 14, font: (th && th.font) || STY.font || 'arial', bold: true, italic: false, underline: false, align: 'center', team: tm ? tm.id : undefined, tc: tm ? tm.color : undefined };
  }
  // ---------- Terrains (zones à motif) et lignes décorées (rivière, route, muraille…) ----------
  function shade(hex, f) {
    var n = parseInt(String(hex).slice(1), 16) || 0, c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) { return Math.round(v * f); });
    return '#' + c.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }
  var TEXG = {
    forest: function (d) { return '<g fill="' + d + '" fill-opacity=".7"><circle cx="8" cy="9" r="5"/><circle cx="21" cy="20" r="5"/></g><path d="M8 14v4M21 25v3" stroke="' + d + '" stroke-width="1.6"/>'; },
    water: function (d) { return '<path d="M0 8q3.5-4 7 0t7 0 7 0 7 0M0 22q3.5-4 7 0t7 0 7 0 7 0" fill="none" stroke="' + d + '" stroke-width="1.5" stroke-opacity=".8"/>'; },
    marsh: function (d) { return '<path d="M6 10V4M3 10l3-6M9 10L6 4M20 24v-6M17 24l3-6M23 24l-3-6M0 17h5M12 14h6M16 4h6" stroke="' + d + '" stroke-width="1.3" fill="none" stroke-opacity=".85"/>'; },
    sand: function (d) { return '<g fill="' + d + '" fill-opacity=".75"><circle cx="5" cy="6" r="1.3"/><circle cx="17" cy="4" r="1.1"/><circle cx="24" cy="13" r="1.3"/><circle cx="10" cy="17" r="1.2"/><circle cx="20" cy="24" r="1.3"/><circle cx="3" cy="25" r="1.1"/></g>'; },
    grass: function (d) { return '<path d="M5 12l1-6M7 12l-1-6M18 25l1-6M20 25l-1-6M22 10l1-5M24 10l-1-5" stroke="' + d + '" stroke-width="1.3" fill="none" stroke-opacity=".85"/>'; },
    rock: function (d) { return '<path d="M2 13l5-9 5 9zM15 25l6-10 6 10z" fill="none" stroke="' + d + '" stroke-width="1.5" stroke-opacity=".85"/>'; },
    field: function (d) { return '<path d="M0 5h28M0 14h28M0 23h28" stroke="' + d + '" stroke-width="1.2" stroke-opacity=".7"/>'; }
  };
  function texId(s) { return 'gp-' + s.tex + '-' + String(s.fill).replace('#', '') + '-' + Math.round((s.alpha || 0) * 100); }
  function ensureTex(l, s) {
    var svg = l && l._renderer && l._renderer._container; if (!svg || !s.tex || !TEXG[s.tex]) return;
    var id = texId(s); if (svg.querySelector('#' + id)) return;
    var defs = svg.querySelector('defs');
    if (!defs) { defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); svg.insertBefore(defs, svg.firstChild); }
    defs.insertAdjacentHTML('beforeend', '<pattern id="' + id + '" patternUnits="userSpaceOnUse" width="28" height="28"><rect width="28" height="28" fill="' + s.fill + '" fill-opacity="' + Math.min(1, s.alpha || 0.35) + '"/>' + TEXG[s.tex](shade(s.fill, 0.5)) + '</pattern>');
  }
  function decoDefs(s) {
    var w = s.weight, c = s.stroke;
    switch (s.deco) {
      case 'river': return { under: [{ color: shade(c, 0.7), weight: w + 2 }], over: [{ color: '#dbeafe', weight: Math.max(1, w * 0.3), opacity: 0.65 }] };
      case 'road': return { under: [{ color: '#3d2a14', weight: w + 3 }], over: [{ color: '#f5e6c8', weight: Math.max(1, w * 0.35), opacity: 0.95, dashArray: '10 8' }] };
      case 'wall': return { under: [{ color: '#2b2b2b', weight: w + 3 }], over: [{ color: '#2b2b2b', weight: w + 3, dashArray: '3 9', lineCap: 'butt' }] };
      case 'rail': return { under: [{ color: '#222', weight: w }], over: [{ color: '#fff', weight: Math.max(1, w - 2), dashArray: '9 9', lineCap: 'butt' }] };
      case 'trench': return { under: [{ color: '#2e1f0f', weight: w + 2 }], over: [{ color: '#b08d57', weight: Math.max(1, w - 2), dashArray: '3 5' }] };
    }
    return null;
  }
  function vstyle(s) {
    var da = s.dash === 'dot' ? '1 9' : s.dash ? '10 8' : null;
    if (s.deco === 'border') da = '12 6 3 6'; else if (s.deco === 'sea') da = '1 9'; else if (s.deco === 'path') da = '7 6';
    var tex = s.tex && TEXG[s.tex];
    return { color: s.stroke, weight: s.weight, opacity: 1, fillColor: tex ? 'url(#' + texId(s) + ')' : s.fill, fillOpacity: tex ? 1 : s.alpha, dashArray: da, lineJoin: 'round', lineCap: 'round' };
  }
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
  // ---------- Éléments de thème : icônes dont la taille suit l'échelle du jeu (millimètres sur le papier à cette échelle) ----------
  var themesP = null;
  function loadThemes() {
    if (window.SM_THEMES) return Promise.resolve();
    if (themesP) return themesP;
    themesP = new Promise(function (res, rej) { var sc = document.createElement('script'); sc.src = 'js/themes.js' + (VQ ? '?' + VQ : ''); sc.onload = res; sc.onerror = function () { themesP = null; rej(); }; document.head.appendChild(sc); });
    return themesP;
  }
  var artP = null, ARTURI = {};
  function loadArt() {
    if (window.SM_ART) return Promise.resolve();
    if (artP) return artP;
    artP = new Promise(function (res, rej) { var sc = document.createElement('script'); sc.src = 'js/themes-art.js' + (VQ ? '?' + VQ : ''); sc.onload = res; sc.onerror = function () { artP = null; rej(); }; document.head.appendChild(sc); });
    return artP;
  }
  function isArt(id) { return typeof id === 'string' && id.indexOf('om:') === 0; }
  function artUri(id, col) {
    var code = id.slice(3), svg = window.SM_ART && window.SM_ART[code]; if (!svg) return '';
    col = col || '#c0262d'; var key = code + col;
    return ARTURI[key] || (ARTURI[key] = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.indexOf('__C__') >= 0 ? svg.split('__C__').join(col) : svg));
  }
  function flagSvg(color, px) {
    return '<svg viewBox="0 0 24 24" width="' + px + '" height="' + px + '"><rect x="4.6" y="2" width="1.9" height="20.5" rx=".9" fill="#5a4630" stroke="#2b2b2b" stroke-width=".7"/><path d="M6.5 3.2C10 1.6 13.5 4.8 20.5 3.2V12.6C13.5 14.2 10 11 6.5 12.6Z" fill="' + color + '" stroke="#2b2b2b" stroke-width="1" stroke-linejoin="round"/></svg>';
  }
  function stampPx(s, ll, map_) {
    var z = (map_ || map).getZoom(), mpp = 156543.03392 * Math.cos(ll.lat * Math.PI / 180) / Math.pow(2, z);
    var m = (s.mm || D().stampMm || 16) * (s._sc || D().scale || 10000) / 1000;
    return Math.max(3, Math.min(2400, m / mpp));
  }
  function stampIcon(s, px) {
    var d = window.SM_ICONS && window.SM_ICONS[s.icon], sw = px < 30 ? 36 : 26;
    var svg = s.icon === 'flag' ? flagSvg(esc(s.stroke), px) : isArt(s.icon) ? (artUri(s.icon, s.tc) ? '<img src="' + artUri(s.icon, s.tc) + '" width="' + px + '" height="' + px + '" draggable="false" alt="">' : '<svg viewBox="0 0 24 24" width="' + px + '" height="' + px + '"><circle cx="12" cy="12" r="8" fill="#ccc" opacity=".6"/></svg>') : d ? '<svg viewBox="0 0 512 512" width="' + px + '" height="' + px + '"><path d="' + d + '" fill="' + esc(s.stroke) + '" stroke="#fff" stroke-width="' + sw + '" stroke-linejoin="round" paint-order="stroke"/></svg>'
      : '<svg viewBox="0 0 24 24" width="' + px + '" height="' + px + '"><circle cx="12" cy="12" r="8" fill="' + esc(s.stroke) + '" opacity=".5"/></svg>';
    var cap = px < 22 ? '' : (s.text || (D().captions ? s.name : ''));
    var lab = cap ? '<span class="gstamp-l" style="color:' + esc(s.fontColor) + ';font-size:' + s.size + 'px;font-family:' + FONTS[fontKey(s)] + ';font-weight:' + (s.bold ? 700 : 400) + ';font-style:' + (s.italic ? 'italic' : 'normal') + ';text-decoration:' + (s.underline ? 'underline' : 'none') + '">' + esc(cap).replace(/\n/g, '<br>') + '</span>' : '';
    return L.divIcon({ className: 'g-icon', iconSize: [px, px], iconAnchor: [px / 2, px / 2], html: '<div class="gstamp" style="width:' + px + 'px;height:' + px + 'px">' + svg + lab + '</div>' });
  }
  var StampMarker = L.Marker.extend({
    initialize: function (ll, s, opts) { L.Marker.prototype.initialize.call(this, ll, opts); this._s = s; this._px = 0; },
    onAdd: function (m) { L.Marker.prototype.onAdd.call(this, m); m.on('zoomend moveend', this._fit, this); this._fit(true); },
    onRemove: function (m) { m.off('zoomend moveend', this._fit, this); L.Marker.prototype.onRemove.call(this, m); },
    refresh: function () { this._fit(true); },
    _fit: function (force) {
      if (!this._map) return;
      var px = Math.round(stampPx(this._s, this.getLatLng(), this._map));
      if (force !== true && px === this._px) return;
      this._px = px; this.setIcon(stampIcon(this._s, px));
    }
  });

  // ---------- Légende : une ligne par type d'élément ou de zone nommé (écran et cartes imprimées) ----------
  function swatch(s) {
    var c = s.stroke, f = s.fill, a = s.alpha > 0 ? s.alpha : 0, da = s.dash ? ' stroke-dasharray="4 3"' : '';
    if (s.kind === 'stamp' && s.icon === 'flag') return flagSvg(esc(c), 20);
    if (s.kind === 'stamp' && isArt(s.icon)) return artUri(s.icon, s.tc) ? '<img src="' + artUri(s.icon, s.tc) + '" alt="">' : '';
    if (s.kind === 'stamp') { var d = window.SM_ICONS && window.SM_ICONS[s.icon]; return d ? '<svg viewBox="0 0 512 512"><path d="' + d + '" fill="' + esc(c) + '"/></svg>' : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="' + esc(c) + '"/></svg>'; }
    if (s.kind === 'line') return '<svg viewBox="0 0 24 14"><path d="M2 7h20" stroke="' + esc(c) + '" stroke-width="3" fill="none"' + da + '/></svg>';
    if (s.kind === 'arrow') return '<svg viewBox="0 0 24 14"><path d="M2 7h17M14 2l6 5-6 5" stroke="' + esc(c) + '" stroke-width="2.5" fill="none"/></svg>';
    if (s.kind === 'cross') return '<svg viewBox="0 0 24 14"><path d="M7 2l10 10M17 2L7 12" stroke="' + esc(c) + '" stroke-width="3" fill="none"/></svg>';
    return '<svg viewBox="0 0 24 14"><rect x="1.5" y="1.5" width="21" height="11" rx="2" fill="' + esc(f) + '" fill-opacity="' + Math.max(a, 0.15) + '" stroke="' + esc(c) + '" stroke-width="1.6"' + da + '/></svg>';
  }
  function legendEntries(d) {
    var seen = {}, out = [];
    d.shapes.forEach(function (s) {
      if (!s.name || s.kind === 'text') return;
      var k = s.kind + '|' + (s.icon || '') + '|' + s.name + '|' + (s.kind === 'stamp' ? s.stroke : s.fill + s.stroke);
      if (seen[k]) return; seen[k] = 1; out.push({ sw: swatch(s), name: s.name });
    });
    return out;
  }
  function legendHtml(d, collapsible) {
    var es = legendEntries(d); if (!es.length) return '';
    if (collapsible && d.legendOff) return '<div class="glegend-h" data-lg>Légende ▸</div>';
    return '<div class="glegend-h"' + (collapsible ? ' data-lg' : '') + '>Légende' + (collapsible ? ' ▾' : '') + '</div><ul class="' + (es.length > 7 ? 'two' : '') + '">' + es.map(function (e) { return '<li><span class="gl-sw">' + e.sw + '</span><span>' + esc(e.name) + '</span></li>'; }).join('') + '</ul>';
  }
  var LegendCtl = L.Control.extend({
    options: { position: 'bottomright' },
    initialize: function (d, screen) { L.Control.prototype.initialize.call(this); this._d = d; this._screen = !!screen; },
    onAdd: function () { var el = L.DomUtil.create('div', 'glegend'); this._el = el; L.DomEvent.disableClickPropagation(el); this.update(); return el; },
    update: function () {
      var d = this._d || D(), h = (this._screen && S.mode !== 'game') ? '' : legendHtml(d, this._screen);
      this._el.innerHTML = h; this._el.style.display = h ? '' : 'none';
    }
  });
  var screenLegend = new LegendCtl(null, true).addTo(map);
  screenLegend.getContainer().addEventListener('click', function (e) { if (e.target.closest('[data-lg]')) { D().legendOff = !D().legendOff; SM.persist(); screenLegend.update(); } });
  function addLegend(d, m) { var c = new LegendCtl(d, false); c.addTo(m); return c; }

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
      case 'polygon': ob.main = add(L.polygon(s.pts, st)); ensureTex(ob.main, s); break;
      case 'rect': ob.main = add(L.rectangle(s.pts, st)); ensureTex(ob.main, s); break;
      case 'circle': ob.main = add(L.circle(s.pts[0], Object.assign({ radius: Math.max(1, s.r || 1) }, st))); ensureTex(ob.main, s); break;
      case 'line': case 'arrow':
        var dd = s.kind === 'line' && s.deco && decoDefs(s); ob.extra = [];
        function addX(o) { var l = L.polyline(s.pts, Object.assign({ interactive: false, lineCap: 'round', lineJoin: 'round', opacity: 1, fill: false }, o)).addTo(group); ls.push(l); ob.extra.push(l); }
        if (dd) dd.under.forEach(addX);
        ob.main = add(L.polyline(s.pts, Object.assign({}, st, { fill: false })));
        if (dd) dd.over.forEach(addX);
        if (inter) ob.hit = add(L.polyline(s.pts, { color: '#000', opacity: 0.001, weight: s.weight + 14, lineCap: 'round', interactive: true }));
        if (s.kind === 'arrow' && s.pts.length > 1) {
          var a = s.pts[s.pts.length - 2], b = s.pts[s.pts.length - 1];
          ob.head = add(L.marker(b, { icon: arrowIcon(s, angleDeg(a, b)), interactive: inter, keyboard: false }));
        }
        break;
      case 'cross': ob.marker = add(L.marker(s.pts[0], { icon: crossIcon(s), interactive: inter, draggable: inter && !o.stored, keyboard: false })); break;
      case 'text': ob.marker = add(L.marker(s.pts[0], { icon: textIcon(s), interactive: inter, draggable: inter && !o.stored, keyboard: false })); break;
      case 'stamp': ob.marker = add(new StampMarker(s.pts[0], s, { icon: stampIcon(s, 40), interactive: inter, draggable: inter && !o.stored, keyboard: false })); if (!window.SM_ICONS) loadThemes().then(function () { if (D().shapes.indexOf(s) >= 0) render(); }).catch(function () { /* hors ligne */ }); if (isArt(s.icon) && !window.SM_ART) loadArt().then(function () { if (D().shapes.indexOf(s) >= 0) render(); }).catch(function () { /* hors ligne */ }); break;
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
      ob.main.setLatLngs(s.pts); if (ob.hit) ob.hit.setLatLngs(s.pts); (ob.extra || []).forEach(function (l) { l.setLatLngs(s.pts); });
      if (ob.head) { var a = s.pts[s.pts.length - 2], b = s.pts[s.pts.length - 1]; ob.head.setLatLng(b); ob.head.setIcon(arrowIcon(s, angleDeg(a, b))); }
    } else if (ob.marker) ob.marker.setLatLng(s.pts[0]);
  }
  function refreshStyle(s) {
    var ob = live[s.id]; if (!ob) return;
    if (s.deco) { render(); return; }
    if (s.tex && ob.main) ensureTex(ob.main, s);
    if (ob.main && ob.main.setStyle) ob.main.setStyle(vstyle(s));
    if (ob.hit) ob.hit.setStyle({ weight: s.weight + 14 });
    if (ob.head) { var a = s.pts[s.pts.length - 2], b = s.pts[s.pts.length - 1]; ob.head.setIcon(arrowIcon(s, angleDeg(a, b))); }
    if (ob.marker) { if (s.kind === 'stamp') ob.marker.refresh(); else ob.marker.setIcon(s.kind === 'text' ? textIcon(s) : crossIcon(s)); }
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
    applyParch(); screenLegend.update(); if (SM.calques) SM.calques.sync(); SM.gGame.clearLayers(); live = build(D(), SM.gGame, { active: true, select: selectTool() });
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
    } else if (s.kind === 'stamp') {
      var ob = live[s.id], half = (s.mm || D().stampMm || 16) * (D().scale || 10000) / 1000 / 2, sh = hmark(G.destination(s.pts[0], 90, half), 'round', 14);
      sh.on('drag', function () { var dm = G.haversine(s.pts[0], [sh.getLatLng().lat, sh.getLatLng().lng]) * 2; s.mm = Math.max(4, Math.min(80, Math.round(dm / ((D().scale || 10000) / 1000)))); if (ob && ob.marker) ob.marker.refresh(); });
      sh.on('dragend', function () { SM.persist(); renderPane(); updateHandles(); });
    } else if (s.kind === 'circle') {
      var rh = hmark(G.destination(s.pts[0], 90, s.r || 1), 'round', 13);
      rh.on('drag', function () { s.r = Math.max(2, G.haversine(s.pts[0], [rh.getLatLng().lat, rh.getLatLng().lng])); geom(); });
      rh.on('dragend', done);
    }
    if (s.kind !== 'cross' && s.kind !== 'text' && s.kind !== 'stamp') {
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
    if (s && PRE) {
      if (PRE.ln && s.kind === 'line') { s.stroke = PRE.f; s.weight = PRE.w; s.deco = PRE.x; s.dash = false; s.linked = false; s.name = PRE.l; }
      else if (!PRE.ln && (s.kind === 'polygon' || s.kind === 'rect' || s.kind === 'circle')) { s.fill = PRE.f; s.stroke = shade(PRE.f, 0.75); s.alpha = PRE.a; s.dash = PRE.d ? 'dash' : false; s.linked = false; s.name = PRE.l; s.weight = 2; if (PRE.x) s.tex = PRE.x; }
    }
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
    if (GT === 'stamp' && STAMP) { if (Date.now() - lastDrag > 400) placeStamp(p); return; }
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
    if (S.mode === 'game' && RT.tool !== 'game') SM.setRail('game');          // après la réouverture d'un jeu, les outils doivent toujours fonctionner
    cancelDraft(); GT = t; if (t !== 'select' && t !== 'stamp') setTab('tools'); if (t !== 'stamp') { STAMP = null; renderThemes(); } if (t === 'select' || t === 'stamp') PRE = null;
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
  function labelOf(s) { return KINDS[s.kind].label + ((s.kind === 'text' || s.kind === 'stamp') && s.text ? ' : ' + s.text.replace(/\s+/g, ' ').slice(0, 22) : ''); }
  function renderList() {
    var a = D().shapes, ul = $('#gs-list'); if (!ul) return;
    $('#gs-count').textContent = a.length ? '(' + a.length + ')' : ''; $('#gs-empty').hidden = a.length > 0;
    ul.innerHTML = a.slice().reverse().map(function (s) {
      return '<li data-id="' + s.id + '"' + (s.id === SELID ? ' class="sel"' : '') + '><span class="gsw" style="background:' + (s.kind === 'line' || s.kind === 'arrow' || s.kind === 'cross' || s.kind === 'stamp' ? s.stroke : rgba(s.fill, Math.max(0.25, s.alpha))) + ';border-color:' + s.stroke + '"></span>' +
        '<span class="gt">' + ic(KINDS[s.kind].icon) + ' ' + esc(labelOf(s)) + '</span><button class="ibtn danger" data-del="' + s.id + '" title="Supprimer" aria-label="Supprimer">' + ic('x') + '</button></li>';
    }).join('');
  }
  // ---------- Thèmes ----------
  var STAMP = null, GCAT = 'all';
  var SCALES = [[2000, '1 : 2 000', 'Terrain de camp'], [5000, '1 : 5 000', 'Quartier, petit village'], [10000, '1 : 10 000', 'Commune'], [25000, '1 : 25 000', 'Secteur, vallée'], [50000, '1 : 50 000', 'Grande zone']];
  function themeById(id) { return (window.SM_THEMES || []).filter(function (t) { return t.id === id; })[0]; }
  function applyParch() { var on = !!D().parch && S.mode === 'game'; map.getContainer().classList.toggle('parch', on); }
  function setScale(v) {
    D().scale = v; SM.persist();
    var c = map.getCenter(); map.setView(c, SM.zoomFor(v, c.lat), { animate: true });
    render(); renderThemes();
  }
  // Le thème se choisit à la création du jeu et ne change plus ensuite (le fond de carte, lui, reste modifiable avec le bouton « Fonds et infos »)
  function applyTheme(id) {
    D().themeLocked = true;
    if (id === 'perso') { D().theme = 'perso'; D().parch = false; SM.persist(); render(); renderThemes(); return; }
    var th = themeById(id); if (!th) return;
    D().theme = id; D().parch = !!th.parch; S.base = th.base; Object.keys(S.ov).forEach(function (k) { S.ov[k] = false; });
    if (SM.applyLayers) SM.applyLayers();
    STY.font = th.font; STY.iconColor = th.color; STY.iconText = th.color; STY.fill = th.fill; STY.stroke = th.fill; STY.fontColor = th.color; STY.linked = true;
    applyParch(); SM.persist(); render(); renderThemes(); renderPane();
  }
  function ico(id, color, px) { var d = window.SM_ICONS && window.SM_ICONS[id]; return d ? '<svg viewBox="0 0 512 512" width="' + (px || 34) + '" height="' + (px || 34) + '"><path d="' + d + '" fill="' + color + '"/></svg>' : ''; }
  function themeList() { return (window.SM_THEMES || []).concat([{ id: 'perso', icon: 'delapouite/flag-objective', name: 'Personnalisé', color: '#12142b', desc: 'Sans thème imposé : vous gardez les repères et formes libres.', el: [] }]); }
  function themeCards(sel) {
    return themeList().map(function (t) {
      var mini = (t.el || []).filter(function (e, i) { return i % 6 === 0; }).slice(0, 4).map(function (e) { return ico(e.i, t.color, 20); }).join('');
      return '<button type="button" data-th="' + t.id + '" class="gth' + (sel === t.id ? ' on' : '') + '"><span class="gth-ic">' + ico(t.icon, t.color, 40) + '</span><b>' + esc(t.name) + '</b><small>' + esc(t.desc) + '</small><span class="gth-mini">' + mini + '</span></button>';
    }).join('');
  }
  function scaleBtns(sel) { return SCALES.map(function (x) { return '<button type="button" data-sc="' + x[0] + '" class="' + (sel === x[0] ? 'on' : '') + '"><b>' + x[1] + '</b><small>' + x[2] + '</small></button>'; }).join(''); }
  function stampBtns(list, color) {
    return list.map(function (e) {
      var im = e.art ? (artUri(e.i) ? '<img src="' + artUri(e.i) + '" width="46" height="46" alt="">' : '<span class="gst-ph"></span>') : e.flag ? flagSvg(e.col, 44) : ico(e.i, color, 44);
      return '<button type="button" class="gst' + (e.art ? ' art' : '') + (STAMP && STAMP.i === e.i && STAMP.l === e.l ? ' on' : '') + '" data-i="' + esc(e.i) + '" data-l="' + esc(e.l) + '" data-col="' + esc(e.col || '') + '" data-art="' + (e.art ? 1 : '') + '" data-hero="' + (e.hero ? 1 : '') + '" data-flag="' + (e.flag ? 1 : '') + '" title="' + esc(e.l) + '">' + im + '<span>' + esc(e.l) + '</span></button>';
    }).join('');
  }
  function zoneBtns(list) { return list.map(function (z) { return '<button type="button" class="gz' + (PRE && !PRE.ln && PRE.l === z.l && PRE.f === z.f ? ' on' : '') + '" data-z="' + esc(z.l) + '|' + z.f + '" title="' + esc(z.l) + '"><i style="background:' + z.f + ';opacity:' + (0.4 + z.a) + '"></i><span>' + esc(z.l) + '</span></button>'; }).join(''); }
  function lineBtns(list) { return list.map(function (l) { return '<button type="button" class="gz gl" data-ln="' + l.k + '" title="' + esc(l.l) + '"><i style="background:' + l.f + ';height:' + Math.max(4, Math.min(9, l.w)) + 'px"></i><span>' + esc(l.l) + '</span></button>'; }).join(''); }
  // ---------- Équipes et bases ----------
  var TCOL = ['#c0262d', '#2563eb', '#1a7f37', '#e0a800', '#7c3aed', '#ea580c'];
  function teams() { return D().teams || (D().teams = []); }
  function heroOf() { var th = themeById(D().theme), a = th && window.SM_ART_THEMES && (window.SM_ART_THEMES[th.id] || []).filter(function (e) { return e.hero; })[0]; return a || { i: 'om:1F3F0', l: 'Base', art: 1, hero: 1 }; }
  function renderTeams() {
    var box = $('#gteams'); if (!box) return;
    if (!window.SM_ART && themeById(D().theme)) loadArt().then(renderTeams).catch(function () { /* hors ligne */ });
    var h = heroOf(), tl = teams();
    box.innerHTML = tl.map(function (t) {
      var nb = D().shapes.filter(function (x) { return x.team === t.id && x.kind === 'stamp'; }).length, on = STAMP && STAMP.team === t.id;
      return '<div class="gteam" data-t="' + t.id + '"><div class="gteam-h"><label class="gteam-c" title="Couleur de l’équipe"><input type="color" value="' + esc(t.color) + '" data-tc><i style="background:' + esc(t.color) + '"></i></label>' +
        '<input class="gteam-n" type="text" maxlength="24" value="' + esc(t.name) + '" aria-label="Nom de l’équipe" data-tn><button type="button" class="ibtn" data-tdel title="Supprimer l’équipe" aria-label="Supprimer l’équipe"><svg class="ic"><use href="#i-trash"/></svg></button></div>' +
        '<div class="gteam-b"><button type="button" class="btn-ghost sm' + (on && STAMP.hero ? ' on' : '') + '" data-tbase title="Cliquez sur la carte pour poser la base de cette équipe (étirez pour choisir sa taille)">' + (artUri(h.i, t.color) ? '<img src="' + artUri(h.i, t.color) + '" alt="">' : '') + 'Poser la base</button>' +
        '<button type="button" class="btn-ghost sm' + (on && !STAMP.hero ? ' on' : '') + '" data-tstart title="Poser un point de départ pour une patrouille de cette équipe">' + flagSvg(t.color, 20) + 'Poser un départ</button></div>' +
        (nb ? '<p class="gteam-i">' + nb + ' élément' + (nb > 1 ? 's' : '') + ' sur la carte</p>' : '') + '</div>';
    }).join('') || '<p class="gtab-help">Aucune équipe pour l’instant. Ajoutez-en une, donnez-lui un nom et une couleur, puis posez sa base et ses départs sur la carte.</p>';
  }
  function teamPlace(id, hero) {
    var t = teams().filter(function (x) { return x.id === id; })[0]; if (!t) return;
    if (hero && !window.SM_ART && themeById(D().theme)) { loadArt().then(function () { teamPlace(id, hero); }).catch(function () { /* hors ligne */ }); return; }
    var h = heroOf();
    STAMP = hero ? { i: h.i, l: 'Base ' + t.name, col: '', art: true, hero: true, team: id } : { i: 'flag', l: 'Départ ' + t.name, col: t.color, flag: true, team: id };
    PRE = null; if (S.mode !== 'game') SM.setMode('game'); setGT('stamp'); renderThemes(); renderPane(); SM.toast(hero ? 'Cliquez sur la carte (ou cliquez-étirez) pour poser la base de ' + t.name + '.' : 'Cliquez sur la carte pour poser un départ de ' + t.name + '.');
  }
  function teamsInit() {
    var box = $('#gteams'); if (!box) return;
    $('#gteam-add').addEventListener('click', function () {
      var n = teams().length; teams().push({ id: 't' + SM.nid(), name: 'Équipe ' + (n + 1), color: TCOL[n % TCOL.length] }); SM.persist(); renderTeams();
      var ins = box.querySelectorAll('[data-tn]'); if (ins.length) { var i = ins[ins.length - 1]; i.focus(); i.select(); }
    });
    box.addEventListener('click', function (e) {
      var row = e.target.closest('.gteam'); if (!row) return; var id = row.dataset.t;
      if (e.target.closest('[data-tbase]')) teamPlace(id, true);
      else if (e.target.closest('[data-tstart]')) teamPlace(id, false);
      else if (e.target.closest('[data-tdel]')) {
        var t = teams().filter(function (x) { return x.id === id; })[0]; if (!t) return;
        if (!confirm('Supprimer l’équipe « ' + t.name + ' » et ses bases / départs sur la carte ?')) return;
        D().teams = teams().filter(function (x) { return x.id !== id; }); D().shapes = D().shapes.filter(function (x) { return x.team !== id; }); SELID = null; SM.persist(); render(); renderTeams(); SM.renderLayerList();
      }
    });
    box.addEventListener('input', function (e) {
      var row = e.target.closest('.gteam'); if (!row) return; var t = teams().filter(function (x) { return x.id === row.dataset.t; })[0]; if (!t) return;
      if (e.target.matches('[data-tn]')) {
        var old = t.name; t.name = e.target.value;
        D().shapes.forEach(function (x) { if (x.team === t.id) x.name = (x.icon === 'flag' ? 'Départ ' : 'Base ') + t.name; });
        SM.persist(); render(); SM.renderLayerList();
      } else if (e.target.matches('[data-tc]')) {
        t.color = e.target.value; row.querySelector('.gteam-c i').style.background = t.color;
        D().shapes.forEach(function (x) { if (x.team === t.id) { x.tc = t.color; if (x.icon === 'flag') x.stroke = t.color; } });
        SM.persist(); render();
      }
    });
    box.addEventListener('change', function (e) { if (e.target.matches('[data-tc]')) renderTeams(); });
  }
  function renderThemes() {
    if (!$('#gstamps')) return;
    renderTeams();
    var th = themeById(D().theme), perso = D().theme === 'perso';
    // réglages du jeu (panneau Réglages)
    if ($('#gscale')) {
      $('#gscale').innerHTML = scaleBtns(D().scale || 0);
      $('#gs-st-size').textContent = (D().stampMm || 16) + ' mm'; $('#gcaptions').checked = !!D().captions; $('#gparch').checked = !!D().parch;
      $('#gtheme-info').textContent = th ? 'Thème : ' + th.name + '. Il se choisit à la création du jeu ; pour en changer, créez un nouveau grand jeu.' : perso ? 'Jeu personnalisé (sans thème).' : 'Aucun thème choisi pour ce jeu.';
      $('#gtheme-choose').hidden = !!D().themeLocked;
      $('#gcredit').textContent = 'Icônes : game-icons.net (CC BY 3.0) · ' + (window.SM_CREDITS || []).join(', ') + ' — Illustrations en couleur : OpenMoji (CC BY-SA 4.0), openmoji.org';
    }
    // palette (onglet Poser)
    var artL = th && window.SM_ART_THEMES ? (window.SM_ART_THEMES[th.id] || []) : [];
    if (!window.SM_ART && th) loadArt().then(function () { renderThemes(); }).catch(function () { /* hors ligne */ });
    var cats = th ? ['all'].concat(th.cats).concat(artL.some(function (e) { return e.hero; }) ? ['Bases'] : []).concat(artL.some(function (e) { return !e.hero; }) ? ['Illustrations'] : []) : [];
    $('#gcats').innerHTML = cats.map(function (c) { return '<button type="button" data-c="' + esc(c) + '" class="' + (GCAT === c ? 'on' : '') + '">' + (c === 'all' ? 'Tout' : esc(c)) + '</button>'; }).join('');
    $('#gcats').hidden = !th;
    var els = th ? th.el.concat(artL).filter(function (e) { return GCAT === 'all' || e.c === GCAT; }) : [];
    if (th && GCAT === 'all') els = artL.filter(function (e) { return !e.hero; }).concat(th.el);       // les illustrations en couleur d'abord
    $('#gstamps').innerHTML = th ? stampBtns(els, th.color) : '<p class="gtab-help">' + (window.SM_THEMES ? 'Jeu sans thème : utilisez les repères, les zones et les formes libres ci-dessous.' : 'Chargement…') + '</p>';
    $('#gth-name').textContent = th ? th.name : '';
    var FLAGS = [['#c0262d', 'rouge'], ['#2563eb', 'bleu'], ['#1a7f37', 'vert'], ['#e0a800', 'jaune']].map(function (f) { return { i: 'flag', l: 'Équipe ' + f[1], c: 'Repères', col: f[0], flag: 1 }; });
    $('#gcommon').innerHTML = stampBtns(FLAGS.concat(window.SM_ART_COMMON || [], window.SM_COMMON || []), '#12142b');
    $('#gzones').innerHTML = zoneBtns((th ? th.z : []).concat(window.SM_ZONES || []));
    $('#glines').innerHTML = lineBtns(th ? th.ln : []);
    $$('#gzshape button').forEach(function (b) { b.classList.toggle('on', b.dataset.zs === ZSHAPE); });
  }
  // Pose d'un élément : un clic = taille générale ; clic-glissé = on étire pour choisir la taille
  var DRG = null, drgMk = null, lastDrag = 0;
  function mmFromPx(px, ll) { var mpp = 156543.03392 * Math.cos(ll.lat * Math.PI / 180) / Math.pow(2, map.getZoom()); return Math.max(4, Math.min(80, Math.round(px * mpp / ((D().scale || 10000) / 1000)))); }
  function placeStamp(p, mm) {
    if (!STAMP) return;
    loadThemes().then(function () {
      var el = STAMP, keep = $('#gs-keep').checked, s = newStamp(el, p);
      if (mm) s.mm = mm;
      S.vis.game = true; SM.ensureVisible('game'); D().shapes.push(s);
      if (!keep) setGT('select');                       // l'outil se relâche après chaque pose (sauf « poser plusieurs fois de suite »)
      SM.persist(); render(); SM.renderLayerList();
    });
  }
  function stopDrag() { if (drgMk) { gDraft.removeLayer(drgMk); drgMk = null; } map.dragging.enable(); DRG = null; }
  map.on('mousedown', function (e) {
    if (S.mode !== 'game' || RT.tool !== 'game' || GT !== 'stamp' || !STAMP || (e.originalEvent && e.originalEvent.button)) return;
    DRG = { ll: e.latlng, pt: e.containerPoint, moved: false }; map.dragging.disable();
  });
  map.on('mousemove', function (e) {
    if (!DRG) return;
    var px = e.containerPoint.distanceTo(DRG.pt) * 2; if (px < 14) return;
    DRG.moved = true; DRG.px = px;
    var fake = { icon: STAMP.i, stroke: STAMP.col || STY.iconColor || '#4a2c0f', text: '', size: 14, fontColor: '#000', font: 'arial' };
    if (drgMk) gDraft.removeLayer(drgMk);
    drgMk = L.marker(DRG.ll, { icon: stampIcon(fake, Math.round(Math.min(px, 600))), interactive: false, opacity: 0.8 }).addTo(gDraft);
  });
  map.on('mouseup', function () {
    if (!DRG) return;
    var d = DRG; stopDrag();
    if (d.moved && d.px) { lastDrag = Date.now(); placeStamp([d.ll.lat, d.ll.lng], mmFromPx(d.px, d.ll)); }
  });
  document.addEventListener('mouseup', function () { if (DRG) stopDrag(); });

  // ---------- Assistant de création : échelle + thème, avec aperçu du rendu ----------
  function wizard() {
    loadThemes().then(function () {
      var dlg = $('#dlg-gnew');
      if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'dlg-gnew'; dlg.className = 'dlg-live gwiz'; document.body.appendChild(dlg); }
      var pick = { sc: D().scale || 10000, th: D().theme || 'moyenage' }, pm = null, pl = null, pmk = [], done = false;
      var center = map.getCenter();
      function sample(th) {
        var out = [], seen = {};
        (th && th.el || []).forEach(function (e) { if (!seen[e.c] && out.length < 4) { seen[e.c] = 1; out.push(e); } });
        if (out.length < 4) (window.SM_COMMON || []).slice(0, 4 - out.length).forEach(function (e) { out.push(e); });
        return out;
      }
      function preview() {
        var th = themeById(pick.th), el = $('#gw-map', dlg); if (!el) return;
        if (!pm) {
          pm = L.map(el, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, zoomSnap: 0, zoomAnimation: false });
        }
        var base = th ? th.base : S.base; if (!SM.LAYERS[base]) base = 'otm';
        if (pl && pl._k !== base) { pm.removeLayer(pl); pl = null; }
        if (!pl) { pl = SM.tile(base, 1).addTo(pm); pl._k = base; }
        el.classList.toggle('parch', !!(th && th.parch));
        var lat = center.lat; pm.setView(center, SM.zoomFor(pick.sc, lat), { animate: false });
        pmk.forEach(function (m) { pm.removeLayer(m); }); pmk = [];
        var w = el.clientWidth || 300, h = el.clientHeight || 300, spots = [[.27, .3], [.68, .27], [.34, .68], [.72, .7]];
        sample(th).forEach(function (e, i) {
          var ll = pm.containerPointToLatLng([w * spots[i][0], h * spots[i][1]]), color = th ? th.color : '#12142b';
          var s = { icon: e.i, stroke: color, text: '', size: 12, fontColor: color, font: 'arial', _sc: pick.sc, mm: D().stampMm || 16 };
          pmk.push(new StampMarker(ll, s, { icon: stampIcon(s, 30), interactive: false }).addTo(pm));
        });
        $('#gw-cap', dlg).textContent = '1 : ' + pick.sc.toLocaleString('fr-FR') + ' · les éléments mesurent ' + (D().stampMm || 16) + ' mm sur le papier à cette échelle';
      }
      function draw() {
        dlg.innerHTML = '<h2>Nouveau grand jeu</h2><p class="dlg-sub">Choisissez l’échelle et le thème : l’aperçu du rendu s’affiche à côté (ou en dessous sur téléphone). Le thème ne pourra plus être changé ensuite (pour un autre thème, créez un autre grand jeu).</p>' +
          '<div class="gw-cols"><div class="gw-l"><h3>1 · Échelle du jeu</h3><div class="gscale">' + scaleBtns(pick.sc) + '</div>' +
          '<h3>2 · Thème</h3><div class="gthemes">' + themeCards(pick.th) + '</div></div>' +
          '<div class="gw-r"><div id="gw-map"></div><p id="gw-cap"></p></div></div>' +
          '<div class="dlg-actions"><button class="btn-primary" id="gw-go" type="button">Créer le grand jeu</button></div>';
        pm = null; pl = null; pmk = [];
        $('#gw-go', dlg).addEventListener('click', function () { done = true; dlg.close(); setScale(pick.sc); applyTheme(pick.th); setTab('tools'); });
        $$('[data-sc]', dlg).forEach(function (b) { b.addEventListener('click', function () { pick.sc = +b.dataset.sc; $$('[data-sc]', dlg).forEach(function (x) { x.classList.toggle('on', x === b); }); preview(); }); });
        $$('[data-th]', dlg).forEach(function (b) { b.addEventListener('click', function () { pick.th = b.dataset.th; $$('[data-th]', dlg).forEach(function (x) { x.classList.toggle('on', x === b); }); preview(); }); });
        setTimeout(function () { if (pm) pm.invalidateSize(); preview(); }, 60);
      }
      dlg.onclose = function () { if (pm) { pm.remove(); pm = null; } if (!done) { setTab('tools'); renderThemes(); } };
      draw(); if (!dlg.open) dlg.showModal(); setTimeout(function () { if (pm) { pm.invalidateSize(); preview(); } }, 150);
    }).catch(function () { setTab('tools'); });
  }
  (function wireThemes() {
    var tl = $('#gtabs [data-gtab=tools]'); if (tl) tl.addEventListener('click', function () { loadThemes().then(renderThemes); });
    $('#gscale').addEventListener('click', function (e) { var b = e.target.closest('button[data-sc]'); if (b) setScale(+b.dataset.sc); });
    $('#gtheme-choose').addEventListener('click', function () { wizard(); });
    $('#gparch').addEventListener('change', function () { D().parch = this.checked; applyParch(); SM.persist(); });
    $('#gcaptions').addEventListener('change', function () { D().captions = this.checked; SM.persist(); render(); });
    $('#gcats').addEventListener('click', function (e) { var b = e.target.closest('button[data-c]'); if (b) { GCAT = b.dataset.c; renderThemes(); } });
    function pick(e) {
      var b = e.target.closest('button[data-i]'); if (!b) return;
      STAMP = { i: b.dataset.i, l: b.dataset.l, col: b.dataset.col || '', art: !!b.dataset.art, flag: !!b.dataset.flag, hero: !!b.dataset.hero }; PRE = null; if (S.mode !== 'game') SM.setMode('game'); setGT('stamp'); renderThemes(); renderPane();
    }
    $('#gstamps').addEventListener('click', pick); $('#gcommon').addEventListener('click', pick); teamsInit();
    $('#gzones').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-z]'); if (!b) return;
      var th = themeById(D().theme), all = (th ? th.z : []).concat(window.SM_ZONES || []), key = b.dataset.z.split('|');
      var z = all.filter(function (x) { return x.l === key[0] && x.f === key[1]; })[0]; if (!z) return;
      setGT(ZSHAPE); PRE = z; STAMP = null; setTab('tools'); renderThemes(); renderPane();
    });
    $('#glines').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-ln]'); if (!b) return;
      var th = themeById(D().theme), l = (th ? th.ln : []).filter(function (x) { return x.k === b.dataset.ln; })[0]; if (!l) return;
      setGT('line'); PRE = Object.assign({ ln: true }, l); STAMP = null; setTab('tools'); renderThemes(); renderPane();
    });
    $('#gzshape').addEventListener('click', function (e) { var b = e.target.closest('button[data-zs]'); if (!b) return; ZSHAPE = b.dataset.zs; if (PRE && !PRE.ln) { var z = PRE; setGT(ZSHAPE); PRE = z; } renderThemes(); renderPane(); });
    $('#gs-st-m').addEventListener('click', function () { D().stampMm = Math.max(6, (D().stampMm || 16) - 2); SM.persist(); render(); renderThemes(); });
    $('#gs-st-p').addEventListener('click', function () { D().stampMm = Math.min(60, (D().stampMm || 16) + 2); SM.persist(); render(); renderThemes(); });
    $('#gs-stamp-m').addEventListener('click', function () { var s = selShape(); if (s) setProp('mm', Math.max(4, (s.mm || D().stampMm || 16) - 2)); });
    $('#gs-stamp-p').addEventListener('click', function () { var s = selShape(); if (s) setProp('mm', Math.min(80, (s.mm || D().stampMm || 16) + 2)); });
    $('#gs-stamp-auto').addEventListener('click', function () { var s = selShape(); if (s) { delete s.mm; refreshStyle(s); SM.persist(); renderPane(); updateHandles(); } });
    $('#gs-tex').addEventListener('change', function () { var s = selShape(); if (!s) return; if (this.value) s.tex = this.value; else delete s.tex; if (this.value && !(s.alpha > 0)) s.alpha = 0.4; refreshStyle(s); SM.persist(); renderPane(); });
    $('#gs-name').addEventListener('input', function () { var s = selShape(); if (s) { s.name = this.value; refreshStyle(s); screenLegend.update(); SM.persist(); renderList(); } });
    // sections repliables : une seule ouverte à la fois
    $$('.gdet').forEach(function (d) { d.addEventListener('toggle', function () { if (d.open) $$('.gdet').forEach(function (o) { if (o !== d) o.open = false; }); }); });
    loadThemes().then(renderThemes).catch(function () { /* hors ligne */ });
  })();

  // ---------- Onglets du panneau : Thèmes · Outils · Style · Éléments ----------
  var GTAB = 'tools';
  function setTab(t) {
    if (t === 'themes') t = 'tools';
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
      else if (f === 'dash') on = !kind || (kind !== 'text' && kind !== 'cross' && kind !== 'stamp');
      else if (f === 'weight') on = kind !== 'stamp';
      else if (f === 'tex') on = !!s && (s.kind === 'polygon' || s.kind === 'rect' || s.kind === 'circle');
      else if (f === 'stampsize') on = kind === 'stamp';
      else if (f === 'legendname') on = !!s && s.kind !== 'text';
      else if (f === 'stroke' && s && s.kind === 'stamp' && isArt(s.icon)) on = false;
      else if (f === 'text') on = isT || kind === 'stamp';
      show(r, on);
    });
    $('#gb-fill-l').textContent = isT ? 'Fond' : 'Remplissage';
    $('#gb-stroke-l').textContent = isT ? 'Bordure' : (kind === 'cross' || kind === 'stamp') ? 'Couleur' : 'Contour';
    $('#gf-weight-l').textContent = isT ? 'Épaisseur de la bordure' : kind === 'cross' ? 'Taille de la croix' : 'Épaisseur du trait';
    $('#gc-fill').style.background = src.alpha > 0 ? rgba(src.fill, Math.max(0.35, src.alpha)) : '#fff';
    $('#gc-fill').classList.toggle('none', !(src.alpha > 0));
    $('#gb-fill-v').textContent = src.alpha > 0 ? colorName(src.fill) : 'Aucun';
    $('#gc-stroke').style.borderColor = src.stroke; $('#gb-stroke-v').textContent = colorName(src.stroke);
    $('#gs-weight-v').textContent = src.weight + ' px'; $('#gs-stamp-v').textContent = (src.mm || D().stampMm || 16) + ' mm' + (src.mm ? '' : ' (général)');
    if (s && document.activeElement !== $('#gs-name')) $('#gs-name').value = s.name || '';
    if ($('#gs-tex')) $('#gs-tex').value = (s && s.tex) || '';
    $('#gs-stamp-auto').hidden = !(s && s.mm);
    var ga = $('#gactive'); if (ga) { var act = GT !== 'select'; ga.hidden = !act; if (act) $('#gactive-t').textContent = PRE ? (PRE.ln ? 'Ligne « ' + PRE.l + ' » : cliquez les points, double-clic ou clic droit pour terminer.' : 'Zone « ' + PRE.l + ' » : tracez-la sur la carte.') : (GT === 'stamp' && STAMP ? 'Pose de « ' + STAMP.l + ' » : cliquez sur la carte, ou cliquez-glissez pour choisir la taille.' : 'Outil « ' + (KINDS[GT] ? KINDS[GT].label : GT) + ' » actif.'); }
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
    $('#gtools').addEventListener('click', function (e) { var b = e.target.closest('button[data-gt]'); if (b) { PRE = null; setGT(b.dataset.gt); } });
    $('#gactive-end').addEventListener('click', function () { setGT('select'); });
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
      case 'stamp': return STAMP ? 'Cliquez pour poser « ' + STAMP.l + ' » (autant de fois que vous voulez) · Échap : terminer.' : '';
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
  function onTool(t) { if (t !== 'game') cancelDraft(); applyParch(); render(); }
  function leave() { cancelDraft(); SELID = null; gHandles.clearLayers(); map.getContainer().classList.remove('parch'); }

  SM.game = { loadArt: loadArt, theme: function () { return themeById(D().theme); }, wizard: wizard, addLegend: addLegend, loadThemes: loadThemes, rightClick: rightClick, render: render, build: build, points: points, onTool: onTool, leave: leave, hint: hint, hintBtn: hintBtn, hintAction: hintAction, escape: escape,
    hasSel: function () { return !!SELID && !!shapeById(SELID); }, deleteSel: deleteSel, addAt: addAt };
  map.getContainer().classList.add('gt-select');
  render(); SM.renderStored();
})();
