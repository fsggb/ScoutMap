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
  // ---------- Lignes à motif : une petite illustration répétée le long du tracé (palissade, barbelés, haie…) ----------
  var MOTIMG = {}, MOTL = [];
  function motifImg(id) {
    var m = window.SM_MOTIFS && window.SM_MOTIFS[id]; if (!m) return null;
    var im = MOTIMG[id];
    if (!im) { im = MOTIMG[id] = new Image(); im.onload = function () { im._ok = 1; MOTL.slice().forEach(function (l) { l.redraw(); }); }; im.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(m.svg); }
    return im;
  }
  function motifUri(id) { var m = window.SM_MOTIFS && window.SM_MOTIFS[id]; return m ? 'data:image/svg+xml;utf8,' + encodeURIComponent(m.svg) : ''; }
  var MotifLine = L.Layer.extend({
    initialize: function (s) { this._s = s; },
    onAdd: function (m) {
      var pn = m.getPane('motifs') || m.createPane('motifs'); pn.style.zIndex = 360; pn.style.pointerEvents = 'none';
      this._cv = L.DomUtil.create('canvas', 'gmotif-cv', pn); this._cv.style.position = 'absolute';
      m.on('moveend zoomend resize', this.redraw, this); m.on('zoomstart', this._hide, this); MOTL.push(this); this.redraw();
      if (!window.SM_MOTIFS) loadArt().then(function () { this.redraw(); }.bind(this)).catch(function () { /* hors ligne */ });
    },
    onRemove: function (m) {
      m.off('moveend zoomend resize', this.redraw, this); m.off('zoomstart', this._hide, this); MOTL = MOTL.filter(function (x) { return x !== this; }, this);
      if (this._cv && this._cv.parentNode) this._cv.parentNode.removeChild(this._cv); this._cv = null;
    },
    _hide: function () { if (this._cv) this._cv.style.opacity = 0; },
    redraw: function () {
      var m = this._map, cv = this._cv, s = this._s; if (!m || !cv || !s) return;
      var id = String(s.deco || '').replace('motif:', ''), im = motifImg(id), def = window.SM_MOTIFS && window.SM_MOTIFS[id];
      var sz = m.getSize(), pad = 0.25, w = Math.round(sz.x * (1 + 2 * pad)), h = Math.round(sz.y * (1 + 2 * pad)), dpr = Math.min(2, window.devicePixelRatio || 1);
      L.DomUtil.setPosition(cv, m.containerPointToLayerPoint([-sz.x * pad, -sz.y * pad]));
      cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.style.opacity = 1;
      var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      if (!im || !im._ok || !def) return;
      var ox = sz.x * pad, oy = sz.y * pad, lat0 = m.getCenter().lat, mpp = 156543.03392 * Math.cos(lat0 * Math.PI / 180) / Math.pow(2, m.getZoom());
      var pxmm = ((s._sc || D().scale || 10000) / 1000) / mpp, hpx = Math.max(9, Math.min(160, 5.8 * (s.weight || 4) / 4 * pxmm)), wpx = hpx * def.w / def.h * 0.94;
      var pts = s.pts.map(function (ll) { var q = m.latLngToContainerPoint(L.latLng(ll[0], ll[1])); return [q.x + ox, q.y + oy]; });
      var next = wpx / 2, run = 0;
      for (var i = 0; i < pts.length - 1; i++) {
        var a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy); if (!len) continue;
        var ang = Math.atan2(dy, dx); if (Math.abs(ang) > Math.PI / 2) ang += ang > 0 ? -Math.PI : Math.PI;
        while (next <= run + len) {
          var t = (next - run) / len, x = a[0] + dx * t, y = a[1] + dy * t;
          if (x > -wpx && y > -wpx && x < w + wpx && y < h + wpx) { ctx.save(); ctx.globalAlpha = opv(s); ctx.translate(x, y); ctx.rotate(ang); ctx.shadowColor = '#fff'; ctx.shadowBlur = Math.max(3, hpx * 0.14); ctx.drawImage(im, -wpx / 2, -hpx * 0.86, wpx, hpx); ctx.drawImage(im, -wpx / 2, -hpx * 0.86, wpx, hpx); ctx.shadowBlur = 0; ctx.drawImage(im, -wpx / 2, -hpx * 0.86, wpx, hpx); ctx.restore(); }
          next += wpx;
        }
        run += len;
      }
    }
  });
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
    return { color: s.stroke, weight: s.weight, opacity: opv(s), fillColor: tex ? 'url(#' + texId(s) + ')' : s.fill, fillOpacity: (tex ? 1 : s.alpha) * opv(s), dashArray: da, lineJoin: 'round', lineCap: 'round' };
  }
  function opv(s) { return s.op == null ? 1 : s.op; }
  function arrowIcon(s, ang) {
    var sz = 14 + s.weight * 3;
    return L.divIcon({ className: 'g-icon', iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2],
      html: '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" style="transform:rotate(' + ang.toFixed(1) + 'deg);opacity:' + opv(s) + '"><path d="M12 1L22 22L12 17L2 22Z" fill="' + s.stroke + '" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>' });
  }
  function crossIcon(s) {
    var sz = 18 + s.weight * 4, sw = (s.weight * 1.3 + 1) * 24 / sz;
    return L.divIcon({ className: 'g-icon', iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2],
      html: '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" fill="none" stroke-linecap="round" style="opacity:' + opv(s) + '"><path d="M4 4L20 20M20 4L4 20" stroke="#fff" stroke-width="' + (sw + 2.2) + '"/><path d="M4 4L20 20M20 4L4 20" stroke="' + s.stroke + '" stroke-width="' + sw + '"/></svg>' });
  }
  var FONTS = { arial: 'Arial,Helvetica,sans-serif', verdana: 'Verdana,Geneva,sans-serif', tahoma: 'Tahoma,Geneva,sans-serif', trebuchet: '\'Trebuchet MS\',Helvetica,sans-serif', georgia: 'Georgia,serif',
    times: '\'Times New Roman\',Times,serif', palatino: '\'Palatino Linotype\',\'Book Antiqua\',Palatino,serif', comic: '\'Comic Sans MS\',\'Comic Sans\',\'Chalkboard SE\',cursive', courier: '\'Courier New\',Courier,monospace',
    impact: 'Impact,\'Arial Narrow Bold\',sans-serif', algerian: 'Algerian,\'Cinzel Decorative\',serif', lobster: 'Lobster,\'Brush Script MT\',cursive', caveat: 'Caveat,\'Segoe Script\',cursive' };
  var LEGACY = { sans: 'arial', serif: 'georgia', hand: 'comic', title: 'impact', mono: 'courier' };
  function fontKey(s) { var k = (s && s.font) || 'arial'; k = LEGACY[k] || k; return FONTS[k] ? k : 'arial'; }
  function textIcon(s) {
    var bg = s.alpha > 0 ? rgba(s.fill, s.alpha) : 'transparent', bw = Math.round(s.weight / 2);
    return L.divIcon({ className: 'g-icon', iconSize: [0, 0],
      html: '<div class="gtext" title="Double-clic : modifier le texte" style="' + ((s.rot || s.op != null) ? 'transform:translate(-50%,-50%) rotate(' + (s.rot || 0) + 'deg);opacity:' + opv(s) + ';' : '') + 'background:' + bg + ';color:' + s.fontColor + ';font-size:' + s.size + 'px;font-family:' + FONTS[fontKey(s)] + ';text-align:' + (s.align || 'center') + ';font-weight:' + (s.bold ? 700 : 400) + ';font-style:' + (s.italic ? 'italic' : 'normal') + ';text-decoration:' + (s.underline ? 'underline' : 'none') + ';border:' + bw + 'px solid ' + (bw ? s.stroke : 'transparent') + '">' + (esc(s.text || '') || '&nbsp;').replace(/\n/g, '<br>') + '</div>' });
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
  function isArt(id) { return typeof id === 'string' && (id.indexOf('om:') === 0 || id.indexOf('img:') === 0); }
  function artUri(id, col) {
    if (id.indexOf('img:') === 0) { var im = (D().images || []).filter(function (x) { return x.id === id.slice(4); })[0]; return im ? im.uri : ''; }
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
    if (s.rot) svg = '<span style="display:block;width:' + px + 'px;height:' + px + 'px;transform:rotate(' + s.rot + 'deg)">' + svg + '</span>';
    var cap = px < 22 ? '' : (s.text || (D().captions ? s.name : ''));
    var lab = cap ? '<span class="gstamp-l" style="color:' + esc(s.fontColor) + ';font-size:' + s.size + 'px;font-family:' + FONTS[fontKey(s)] + ';font-weight:' + (s.bold ? 700 : 400) + ';font-style:' + (s.italic ? 'italic' : 'normal') + ';text-decoration:' + (s.underline ? 'underline' : 'none') + '">' + esc(cap).replace(/\n/g, '<br>') + '</span>' : '';
    return L.divIcon({ className: 'g-icon', iconSize: [px, px], iconAnchor: [px / 2, px / 2], html: '<div class="gstamp" style="width:' + px + 'px;height:' + px + 'px' + (s.op != null && s.op < 1 ? ';opacity:' + s.op : '') + '">' + svg + lab + '</div>' });
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
    if (s.kind === 'line' && String(s.deco || '').indexOf('motif:') === 0 && motifUri(s.deco.slice(6))) return '<i class="gl-mo" style="background-image:url(&quot;' + motifUri(s.deco.slice(6)) + '&quot;)"></i>';
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
    var ls = [], ob = {}, inter = !!(o.stored || (o.active && o.select && !s.locked));
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
        var mot = s.kind === 'line' && String(s.deco || '').indexOf('motif:') === 0;
        if (mot) { var ml = new MotifLine(s).addTo(group); ls.push(ml); st = Object.assign({}, st, { weight: 1.4, opacity: 0.45, dashArray: null }); }
        function addX(o) { var oo = Object.assign({}, o); oo.opacity = (o.opacity == null ? 1 : o.opacity) * opv(s); var l = L.polyline(s.pts, Object.assign({ interactive: false, lineCap: 'round', lineJoin: 'round', opacity: 1, fill: false }, oo)).addTo(group); ls.push(l); ob.extra.push(l); }
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
    d.shapes.forEach(function (s, i) { if (s.hidden) return; var ob = out[s.id] = buildShape(s, group, o); if (ob && ob.marker && ob.marker.setZIndexOffset) ob.marker.setZIndexOffset(i * 10); });
    return out;
  }
  // Charge les ressources (icônes, illustrations, motifs de lignes) avant l'impression ou l'export
  function ready(d) {
    return Promise.all([loadThemes().catch(function () { /* hors ligne */ }), loadArt().catch(function () { /* hors ligne */ })]).then(function () {
      var ids = {}; (d.shapes || []).forEach(function (s) { if (s.deco && String(s.deco).indexOf('motif:') === 0) ids[s.deco.slice(6)] = 1; });
      return Promise.all(Object.keys(ids).map(function (id) {
        return new Promise(function (res) { var im = motifImg(id); if (!im || im._ok) return res(); var t = setTimeout(res, 5000); im.addEventListener('load', function () { clearTimeout(t); res(); }); });
      }));
    }).then(function () { return new Promise(function (r) { setTimeout(r, 250); }); });
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
  var lastTh = null;
  function render() {
    if (lastTh !== D().theme) { lastTh = D().theme; if ($('#gstamps')) { loadThemes().then(function () { renderThemes(); }).catch(function () { /* hors ligne */ }); } }
    if (SM.gameGuide) SM.gameGuide();
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
  var SHIFT = false;
  document.addEventListener('keydown', function (e) { SHIFT = e.shiftKey; }); document.addEventListener('keyup', function (e) { SHIFT = e.shiftKey; });
  map.on('zoomend', function () { var q = selShape(); if (q && (q.kind === 'stamp' || q.kind === 'text') && S.mode === 'game') updateHandles(); });
  // Cadre façon traitement de texte : 8 poignées pour agrandir ou réduire, une poignée ronde pour faire pivoter (Maj : par pas de 15°)
  // Curseur de redimensionnement adapté à la direction réelle de la poignée (tient compte de la rotation de l'élément)
  function curFor(k, rot) {
    var a = (Math.atan2(k[1], k[0]) * 180 / Math.PI + rot + 360) % 180;           // direction de la poignée par rapport au centre, modulo 180°
    var names = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];
    return names[Math.round(a / 45) % 4];
  }
  function frameHandles(s) {
    var ob = live[s.id]; if (!ob || !ob.marker) return;
    var kind = s.kind, hs = [];
    function dims() {
      if (kind === 'stamp') { var px = stampPx(s, L.latLng(s.pts[0][0], s.pts[0][1]), map); return [px / 2 + 2, px / 2 + 2]; }
      var el = ob.marker.getElement(), t = el && el.querySelector('.gtext'); return t ? [t.offsetWidth / 2 + 4, t.offsetHeight / 2 + 4] : [40, 16];
    }
    function C() { return map.latLngToLayerPoint(L.latLng(s.pts[0][0], s.pts[0][1])); }
    function at(ox, oy) { var c = C(), a = (s.rot || 0) * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a); return map.layerPointToLatLng(L.point(c.x + ox * cs - oy * sn, c.y + ox * sn + oy * cs)); }
    var poly = L.polygon([[0, 0], [0, 0], [0, 0]], { color: '#000761', weight: 1.6, dashArray: '5 4', fill: false, interactive: false }).addTo(gHandles);
    var link = L.polyline([[0, 0], [0, 0]], { color: '#000761', weight: 1.4, interactive: false }).addTo(gHandles);
    function layout(skip) {
      var d = dims(), hw = d[0], hh = d[1];
      poly.setLatLngs([at(-hw, -hh), at(hw, -hh), at(hw, hh), at(-hw, hh)]); link.setLatLngs([at(0, -hh), at(0, -hh - 26)]);
      hs.forEach(function (h) { if (h.m === skip) return; h.m.setLatLng(h.rot ? at(0, -hh - 26) : at(h.k[0] * hw, h.k[1] * hh)); });
      hs.forEach(function (h) { var el = h.m.getElement(); if (!el) return; el.style.setProperty('cursor', h.rot ? 'grab' : curFor(h.k, s.rot || 0), 'important'); });
    }
    function repaint() { if (kind === 'stamp') ob.marker.refresh(); else ob.marker.setIcon(textIcon(s)); }
    [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [1, 0], [0, 1], [-1, 0]].forEach(function (k) {
      var m = hmark([0, 0], 'frm', 11), d0 = 1, st = 1; hs.push({ k: k, m: m });
      m.on('dragstart', function () { var d = dims(); d0 = Math.hypot(k[0] * d[0], k[1] * d[1]); st = kind === 'stamp' ? (s.mm || D().stampMm || 16) : s.size; });
      m.on('drag', function () {
        var c = C(), q = map.latLngToLayerPoint(m.getLatLng()), f = Math.hypot(q.x - c.x, q.y - c.y) / Math.max(1, d0);
        if (kind === 'stamp') s.mm = Math.max(4, Math.min(120, Math.round(st * f))); else s.size = Math.max(6, Math.min(160, Math.round(st * f)));
        repaint(); layout(m);
      });
      m.on('dragend', function () { SM.persist(); renderPane(); updateHandles(); });
    });
    var rm = hmark([0, 0], 'frm rot', 15); hs.push({ rot: 1, m: rm });
    rm.on('drag', function () {
      var c = C(), q = map.latLngToLayerPoint(rm.getLatLng()), a = Math.atan2(q.x - c.x, -(q.y - c.y)) * 180 / Math.PI;
      if (SHIFT) a = Math.round(a / 15) * 15; s.rot = Math.round(a) || 0; repaint(); layout(rm);
    });
    rm.on('dragend', function () { SM.persist(); renderPane(); updateHandles(); });
    layout();
  }
  function updateHandles() {
    gHandles.clearLayers();
    var s = selShape(); if (!s || !selectTool() || S.mode !== 'game') return;
    var outl = null;
    (function () {
      var o1 = { color: '#ffffff', weight: 4.5, opacity: 0.85, fill: false, interactive: false }, o2 = { color: '#000761', weight: 1.6, dashArray: '6 4', fill: false, interactive: false }, mk;
      if (s.kind === 'polygon') mk = function (o) { return L.polygon(s.pts, o); };
      else if (s.kind === 'rect') mk = function (o) { return L.rectangle(s.pts, o); };
      else if (s.kind === 'circle') mk = function (o) { return L.circle(s.pts[0], Object.assign({ radius: Math.max(1, s.r || 1) }, o)); };
      else if (s.kind === 'line' || s.kind === 'arrow') mk = function (o) { return L.polyline(s.pts, o); };
      if (!mk) return;
      outl = [mk(o1).addTo(gHandles), mk(o2).addTo(gHandles)];
    })();
    function geom() {
      updateGeom(s);
      if (outl) outl.forEach(function (l) { if (s.kind === 'rect') l.setBounds(s.pts); else if (s.kind === 'circle') { l.setLatLng(s.pts[0]); l.setRadius(Math.max(1, s.r || 1)); } else l.setLatLngs(s.pts); });
    }
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
    } else if (s.kind === 'stamp' || s.kind === 'text') {
      frameHandles(s);
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
    insertShape(s); SELID = s.id;
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
    else if (e.key === 'Escape') { if (GT !== 'select') { PRE = null; setGT('select'); } }
    else if (!e.shiftKey && KEYS[e.key.toLowerCase()]) { PRE = null; setGT(KEYS[e.key.toLowerCase()]); }
  });
  var KEYS = { v: 'select', p: 'polygon', r: 'rect', c: 'circle', l: 'line', a: 'arrow', x: 'cross', t: 'text' };

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
  // Ordre par défaut : terrains tout en dessous, puis lignes, bases et images, pictogrammes, croix, textes au-dessus
  function rank(s) {
    if (s.kind === 'polygon' || s.kind === 'rect' || s.kind === 'circle') return 0;
    if (s.kind === 'line') return 1; if (s.kind === 'arrow') return 1.5;
    if (s.kind === 'stamp') return (String(s.icon).indexOf('om:hero-') === 0 || String(s.icon).indexOf('img:') === 0) ? 2 : 3;
    if (s.kind === 'cross') return 3.5; return 4;
  }
  function insertShape(s) { var a = D().shapes, i = a.length, r = rank(s); while (i > 0 && rank(a[i - 1]) > r) i--; a.splice(i, 0, s); }
  function autoOrder() { var a = D().shapes.map(function (x, i) { return [x, i]; }); a.sort(function (u, v) { return rank(u[0]) - rank(v[0]) || u[1] - v[1]; }); D().shapes = a.map(function (x) { return x[0]; }); SM.persist(); render(); renderList(); }
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
      var sw = s.kind === 'stamp' && isArt(s.icon) && artUri(s.icon, s.tc) ? '<span class="gsw img" style="background-image:url(&quot;' + artUri(s.icon, s.tc) + '&quot;)"></span>' : '<span class="gsw" style="background:' + (s.kind === 'line' || s.kind === 'arrow' || s.kind === 'cross' || s.kind === 'stamp' ? s.stroke : rgba(s.fill, Math.max(0.25, s.alpha || 0.25))) + ';border-color:' + s.stroke + '"></span>';
      return '<li draggable="true" data-id="' + s.id + '" class="' + (s.id === SELID ? 'sel ' : '') + (s.hidden ? 'off ' : '') + (s.locked ? 'lk' : '') + '"><span class="gdrag" title="Glisser pour changer la superposition" aria-hidden="true">⋮⋮</span>' + sw +
        '<span class="gt">' + ic(KINDS[s.kind].icon) + ' ' + esc(s.name && s.kind !== 'text' ? s.name : labelOf(s)) + (s.op != null && s.op < 1 ? '<small>' + Math.round(s.op * 100) + ' %</small>' : '') + '</span>' +
        '<button class="ibtn' + (s.hidden ? ' off' : '') + '" data-act="vis" data-id="' + s.id + '" title="' + (s.hidden ? 'Afficher' : 'Masquer') + '" aria-label="Afficher ou masquer">' + ic(s.hidden ? 'eye-off' : 'eye') + '</button>' +
        '<button class="ibtn' + (s.locked ? ' on' : '') + '" data-act="lock" data-id="' + s.id + '" title="' + (s.locked ? 'Déverrouiller' : 'Verrouiller (non sélectionnable sur la carte)') + '" aria-label="Verrouiller">' + ic('lock') + '</button>' +
        '<button class="ibtn" data-act="up" data-id="' + s.id + '" title="Monter d’un cran (passer au-dessus)" aria-label="Monter d’un cran">' + ic('fwd') + '</button><button class="ibtn" data-act="down" data-id="' + s.id + '" title="Descendre d’un cran (passer en dessous)" aria-label="Descendre d’un cran">' + ic('bwd') + '</button>' +
        '<button class="ibtn danger" data-del="' + s.id + '" title="Supprimer" aria-label="Supprimer">' + ic('x') + '</button></li>';
    }).join('');
  }
  // ---------- Thèmes ----------
  var STAMP = null, GCAT = 'all';
  var SCALES = [[1000, '1 : 1 000', 'Terrain de camp, bâtiment'], [2000, '1 : 2 000', 'Grand terrain, domaine'], [5000, '1 : 5 000', 'Village, grand domaine'], [10000, '1 : 10 000', 'Commune'], [25000, '1 : 25 000', 'Secteur, vallée']];
  function themeById(id) { return (window.SM_THEMES || []).filter(function (t) { return t.id === id; })[0]; }
  // ---------- Effets sur la carte (parchemin, froissé, plié, bords vieillis, noir et blanc, délavé) ----------
  var FXM = {
    parch: { n: 'Parchemin', d: 'Teinte ancienne, fibres et taches discrètes', v: 0.6 },
    crumple: { n: 'Papier froissé', d: 'Froissures en relief', v: 0.5 },
    fold: { n: 'Carte pliée', d: 'Plis marqués, presque déchirés', v: 0.75 },
    edge: { n: 'Bords vieillis', d: 'Bords sombres et abîmés', v: 0.6 },
    bw: { n: 'Noir et blanc', d: 'Photocopie en niveaux de gris', v: 1 },
    fade: { n: 'Délavé', d: 'Couleurs adoucies', v: 0.5 }
  };
  var SVGH = 'xmlns="http://www.w3.org/2000/svg"';
  var FXS = {
    fiber: '<svg ' + SVGH + ' width="300" height="300"><filter id="f" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="7" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .42 0 0 0 0 .27 0 0 0 0 .1 1.5 0 0 0 -.66"/></filter><rect width="300" height="300" filter="url(#f)"/></svg>',
    stains: '<svg ' + SVGH + ' width="1200" height="800" preserveAspectRatio="none"><filter id="f" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".004 .006" numOctaves="4" seed="11"/><feColorMatrix values="0 0 0 0 .47 0 0 0 0 .3 0 0 0 0 .09 1.9 0 0 0 -.88"/></filter><rect width="1200" height="800" filter="url(#f)"/></svg>',
    crumpleD: '<svg ' + SVGH + ' width="900" height="700" preserveAspectRatio="none"><filter id="f" x="0" y="0" width="100%" height="100%"><feTurbulence type="turbulence" baseFrequency=".007 .012" numOctaves="3" seed="4"/><feDiffuseLighting surfaceScale="7" diffuseConstant="1.1" lighting-color="#fff" result="l"><feDistantLight azimuth="45" elevation="52"/></feDiffuseLighting><feColorMatrix in="l" values="0 0 0 0 .1 0 0 0 0 .08 0 0 0 0 .05 -2.4 0 0 0 1.62"/></filter><rect width="900" height="700" filter="url(#f)"/></svg>',
    crumpleL: '<svg ' + SVGH + ' width="900" height="700" preserveAspectRatio="none"><filter id="f" x="0" y="0" width="100%" height="100%"><feTurbulence type="turbulence" baseFrequency=".007 .012" numOctaves="3" seed="4"/><feDiffuseLighting surfaceScale="7" diffuseConstant="1.1" lighting-color="#fff" result="l"><feDistantLight azimuth="45" elevation="52"/></feDiffuseLighting><feColorMatrix in="l" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 2.6 0 0 0 -1.95"/></filter><rect width="900" height="700" filter="url(#f)"/></svg>',
    fold: '<svg ' + SVGH + ' viewBox="0 0 1000 700" preserveAspectRatio="none"><defs><filter id="w" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="2" seed="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="7"/></filter><filter id="m" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".02 .06" numOctaves="2" seed="9"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 4 0 0 0 -1.4"/></filter><mask id="k"><rect width="1000" height="700" fill="#fff"/><rect width="1000" height="700" filter="url(#m)" opacity=".9"/></mask></defs><g filter="url(#w)" fill="none" stroke-linecap="round" vector-effect="non-scaling-stroke"><g mask="url(#k)"><path d="M333 0V700M666 0V700M0 350H1000" stroke="#3a2a10" stroke-opacity=".45" stroke-width="1.6" vector-effect="non-scaling-stroke"/><path d="M336 0V700M669 0V700M0 353H1000" stroke="#fff" stroke-opacity=".7" stroke-width="2.4" vector-effect="non-scaling-stroke"/></g><path d="M333 0V34M333 666V700M666 0V34M666 666V700M0 350H30M970 350H1000" stroke="#2b1c08" stroke-opacity=".7" stroke-width="2.4" vector-effect="non-scaling-stroke"/><path d="M330 12L336 20L331 30M663 14L669 22L664 32M330 688L336 680L331 670M663 686L669 678L664 668M14 347L22 353L32 348M986 347L978 353L968 348" stroke="#2b1c08" stroke-opacity=".8" stroke-width="1.4" vector-effect="non-scaling-stroke"/></g></svg>',
    edge: '<svg ' + SVGH + ' viewBox="0 0 1000 700" preserveAspectRatio="none"><defs><filter id="r" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="3" seed="5" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="40"/><feGaussianBlur stdDeviation="3"/></filter></defs><rect x="-20" y="-20" width="1040" height="740" fill="none" stroke="#4a2c0c" stroke-width="64" filter="url(#r)" stroke-opacity=".85"/></svg>'
  };
  function svgUrl(x) { return 'url("data:image/svg+xml;utf8,' + encodeURIComponent(x) + '")'; }
  function fxLayers(k) {
    if (k === 'parch') return [['radial-gradient(ellipse at center, rgba(255,236,190,0) 55%, rgba(120,72,18,.34) 100%)', '100% 100%', 'no-repeat'], [svgUrl(FXS.stains), '100% 100%', 'no-repeat'], [svgUrl(FXS.fiber), '300px 300px', 'repeat']];
    if (k === 'crumple') return [[svgUrl(FXS.crumpleD), '100% 100%', 'no-repeat'], [svgUrl(FXS.crumpleL), '100% 100%', 'no-repeat']];
    if (k === 'fold') return [[svgUrl(FXS.fold), '100% 100%', 'no-repeat']];
    if (k === 'edge') return [[svgUrl(FXS.edge), '100% 100%', 'no-repeat'], ['radial-gradient(ellipse at center, rgba(0,0,0,0) 62%, rgba(80,45,10,.35) 100%)', '100% 100%', 'no-repeat']];
    return null;
  }
  function fxOf(d) { var f = d && d.fx; if (!f && d && d.parch) f = { parch: d.parchLevel == null ? 0.62 : d.parchLevel }; return f || {}; }
  function fxFilter(fx) {
    var f = [];
    if (fx.parch != null) f.push('sepia(' + (fx.parch * 0.95).toFixed(2) + ') saturate(.88) contrast(1.04) brightness(1.03)');
    if (fx.bw != null) f.push('grayscale(' + fx.bw + ') contrast(1.1)');
    if (fx.fade != null) f.push('saturate(' + (1 - fx.fade * 0.75).toFixed(2) + ') brightness(1.06) contrast(' + (1 - fx.fade * 0.2).toFixed(2) + ')');
    return f.join(' ');
  }
  function paintFx(host, fx) {
    host.innerHTML = '';
    Object.keys(FXM).forEach(function (k) {
      if (fx[k] == null) return; var L2 = fxLayers(k); if (!L2) return;
      var dv = document.createElement('div');
      dv.style.backgroundImage = L2.map(function (x) { return x[0]; }).join(','); dv.style.backgroundSize = L2.map(function (x) { return x[1]; }).join(','); dv.style.backgroundRepeat = L2.map(function (x) { return x[2]; }).join(',');
      dv.style.opacity = Math.max(0.05, Math.min(1, fx[k])); host.appendChild(dv);
    });
  }
  function applyFx(el, d) {
    var fx = fxOf(d), tp = el.querySelector('.leaflet-tile-pane'); if (tp) tp.style.filter = fxFilter(fx);
    var host = null; for (var i = 0; i < el.children.length; i++) if (el.children[i].classList && el.children[i].classList.contains('gfx')) host = el.children[i];
    var any = Object.keys(fx).some(function (k) { return fxLayers(k); });
    if (!any) { if (host) host.remove(); return; }
    if (!host) { host = document.createElement('div'); host.className = 'gfx'; el.appendChild(host); }
    paintFx(host, fx);
  }
  function applyParch() { if (S.mode === 'game') applyFx(map.getContainer(), D()); else clearFx(); }
  function clearFx() { var el = map.getContainer(), tp = el.querySelector('.leaflet-tile-pane'); if (tp) tp.style.filter = ''; var h = el.querySelector(':scope > .gfx'); if (h) h.remove(); }
  var SAMPLE = '<svg viewBox="0 0 96 58" preserveAspectRatio="none"><rect width="96" height="58" fill="#f1efe4"/><path d="M0 40C20 34 40 46 96 36V58H0Z" fill="#cfe3b7"/><path d="M60 0C56 20 70 30 66 58" stroke="#f2d27a" stroke-width="3" fill="none"/><path d="M0 18C30 12 50 26 96 14" stroke="#7fb5e6" stroke-width="2" fill="none"/><rect x="14" y="22" width="8" height="6" fill="#b9a98f"/><rect x="26" y="26" width="6" height="5" fill="#b9a98f"/><circle cx="80" cy="44" r="6" fill="#9fcf86"/></svg>';
  var BASEQ = ['plan', 'ortho', 'otm', 'osm', 'etat', 'cassini'], BASEN = { plan: 'Plan IGN', ortho: 'Photo aérienne', otm: 'Topo', osm: 'OpenStreetMap', etat: 'État-major (1820)', cassini: 'Cassini (XVIIIe)' };
  function renderFx() { var lx = $('#gfx-list'); if (!lx) return; var fx = D().fx; if (!fx) { fx = D().fx = Object.assign({}, fxOf(D())); } renderFxInto(lx, fx); }
  function renderFxInto(lx, fx) {
    lx.innerHTML = Object.keys(FXM).map(function (k) {
      var on = fx[k] != null, m = FXM[k];
      return '<div class="gfxt' + (on ? ' on' : '') + '" data-k="' + k + '"><button type="button" class="gfxt-b" data-fx="' + k + '" role="checkbox" aria-checked="' + (on ? 'true' : 'false') + '"><span class="gfxck" aria-hidden="true"></span><span class="gfxp"><span class="gfxp-m">' + SAMPLE + '</span><span class="gfx"></span></span><b>' + esc(m.n) + '</b><small>' + esc(m.d) + '</small></button>' +
        (on && k !== 'bw' ? '<label class="gfxt-s"><span>Intensité</span><input type="range" min="10" max="100" step="5" value="' + Math.round(fx[k] * 100) + '" data-fxv="' + k + '" aria-label="Intensité : ' + esc(m.n) + '"></label>' : '') + '</div>';
    }).join('');
    $$('.gfxt', lx).forEach(function (t) {
      var k = t.dataset.k, one = {}; one[k] = 0.9; if (k === 'bw') one[k] = 1;
      var m = $('.gfxp-m', t), h = $('.gfxp .gfx', t); m.style.filter = fxFilter(one); paintFx(h, one);
    });
  }
  function fxInit() {
    var lx = $('#gfx-list'); if (!lx) return;
    lx.addEventListener('click', function (e) {
      var b = e.target.closest('[data-fx]'); if (!b) return; var k = b.dataset.fx, fx = D().fx || (D().fx = Object.assign({}, fxOf(D())));
      if (fx[k] != null) delete fx[k]; else fx[k] = FXM[k].v; delete D().parch;
      SM.persist(); applyParch(); renderFx();
    });
    lx.addEventListener('input', function (e) { var r = e.target.closest('[data-fxv]'); if (!r) return; var fx = D().fx; fx[r.dataset.fxv] = +r.value / 100; SM.persist(); applyParch(); });
    var t = $('#gtabs [data-gtab=fx]'); if (t) t.addEventListener('click', renderFx);
  }
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
    D().theme = id; D().parch = false; D().fx = {}; S.base = th.base; Object.keys(S.ov).forEach(function (k) { S.ov[k] = false; });
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
  function scaleBtns(sel) { var L2 = SCALES.slice(); if (sel && !L2.some(function (x) { return x[0] === sel; })) { L2.push([sel, '1 : ' + Number(sel).toLocaleString('fr-FR'), 'Échelle actuelle']); L2.sort(function (a, b) { return a[0] - b[0]; }); } return L2.map(function (x) { return '<button type="button" data-sc="' + x[0] + '" class="' + (sel === x[0] ? 'on' : '') + '"><b>' + x[1] + '</b><small>' + x[2] + '</small><i class="sc-idea">' + esc(window.SM_sizeIdea ? window.SM_sizeIdea(x[0]) : '') + '</i></button>'; }).join(''); }
  function stampBtns(list, color) {
    return list.map(function (e) {
      var im = e.art ? (artUri(e.i) ? '<img src="' + artUri(e.i) + '" width="46" height="46" alt="">' : '<span class="gst-ph"></span>') : e.flag ? flagSvg(e.col, 44) : ico(e.i, color, 44);
      return '<button type="button" class="gst' + (e.art ? ' art' : '') + (STAMP && STAMP.i === e.i && STAMP.l === e.l ? ' on' : '') + '" data-i="' + esc(e.i) + '" data-l="' + esc(e.l) + '" data-col="' + esc(e.col || '') + '" data-art="' + (e.art ? 1 : '') + '" data-hero="' + (e.hero ? 1 : '') + '" data-flag="' + (e.flag ? 1 : '') + '" title="' + esc(e.l) + '">' + im + '<span>' + esc(e.l) + '</span></button>';
    }).join('');
  }
  var ZPV = 0;
  function zonePreview(z) {
    var id = 'zpv' + (++ZPV), f = z.f, a = Math.max(0.3, z.a || 0.35), tex = z.x && TEXG[z.x];
    var fill = tex ? 'url(#' + id + ')' : f;
    return '<svg class="gz-pv" viewBox="0 0 84 44" preserveAspectRatio="none" aria-hidden="true"><defs>' + (tex ? '<pattern id="' + id + '" patternUnits="userSpaceOnUse" width="28" height="28"><rect width="28" height="28" fill="' + f + '" fill-opacity="' + Math.min(1, a) + '"/>' + TEXG[z.x](shade(f, 0.5)) + '</pattern>' : '') + '</defs>' +
      '<rect x="1" y="1" width="82" height="42" rx="6" fill="' + fill + '" fill-opacity="' + (tex ? 1 : Math.max(a, 0.5)) + '" stroke="' + shade(f, 0.7) + '" stroke-width="1.6"' + (z.d ? ' stroke-dasharray="5 3"' : '') + '/></svg>';
  }
  function zoneTiles(list) {
    return list.map(function (z) { return '<button type="button" class="gz gzt' + (PRE && !PRE.ln && PRE.l === z.l && PRE.f === z.f ? ' on' : '') + '" data-z="' + esc(z.l) + '|' + z.f + '" title="' + esc(z.l) + '">' + zonePreview(z) + '<span>' + esc(z.l) + '</span></button>'; }).join('');
  }
  function zoneBtns(list) { return list.map(function (z) { return '<button type="button" class="gz' + (PRE && !PRE.ln && PRE.l === z.l && PRE.f === z.f ? ' on' : '') + '" data-z="' + esc(z.l) + '|' + z.f + '" title="' + esc(z.l) + '"><i style="background:' + z.f + ';opacity:' + (0.4 + z.a) + '"></i><span>' + esc(z.l) + '</span></button>'; }).join(''); }
  function motifBtns(ids) {
    return ids.filter(function (id) { return window.SM_MOTIFS && window.SM_MOTIFS[id]; }).map(function (id) {
      var m = window.SM_MOTIFS[id];
      return '<button type="button" class="gz gl gm' + (PRE && PRE.ln && PRE.x === 'motif:' + id ? ' on' : '') + '" data-mo="' + id + '" title="' + esc(m.n) + '"><i style="background-image:url(&quot;' + motifUri(id) + '&quot;);background-size:auto 100%;background-repeat:repeat-x;background-position:left bottom"></i><span>' + esc(m.n) + '</span></button>';
    }).join('');
  }
  function lineBtns(list) { return list.map(function (l) { return '<button type="button" class="gz gl" data-ln="' + l.k + '" title="' + esc(l.l) + '"><i style="background:' + l.f + ';height:' + Math.max(4, Math.min(9, l.w)) + 'px"></i><span>' + esc(l.l) + '</span></button>'; }).join(''); }
  // ---------- Mes images et blasons ----------
  function images() { return D().images || (D().images = []); }
  function renderImages() {
    var box = $('#gimgs'); if (!box) return;
    var l = images();
    box.innerHTML = l.map(function (e) {
      return '<button type="button" class="gst art" data-i="img:' + esc(e.id) + '" data-l="' + esc(e.name) + '" data-art="1"><img src="' + e.uri + '" width="46" height="46" alt="" style="object-fit:contain"><span>' + esc(e.name) + '</span><span class="gimg-x" data-del="' + esc(e.id) + '" title="Retirer cette image" role="button" aria-label="Retirer cette image">×</span></button>';
    }).join('') || '<p class="gtab-help">Aucune image pour l’instant.</p>';
  }
  function addImage(name, uri) { images().push({ id: 'i' + SM.nid(), name: name, uri: uri }); SM.persist(); renderImages(); renderTeams(); }
  function fileToImage(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onerror = function () { rej(); };
      fr.onload = function () {
        var im = new Image();
        im.onerror = function () { rej(); };
        im.onload = function () {
          var k = Math.min(1, 320 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/png'));
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  var BLA = {
    parts: [['plain', 'Uni'], ['parti', 'Parti (moitié droite)'], ['coupe', 'Coupé (moitié basse)'], ['ecartele', 'Écartelé (4 cases)'], ['bande', 'Bande'], ['chevron', 'Chevron'], ['croix', 'Croix']],
    charges: [['none', 'Aucun'], ['etoile', 'Étoile'], ['lys', 'Fleur de lys'], ['soleil', 'Soleil'], ['tour', 'Tour'], ['croix', 'Croix'], ['couronne', 'Couronne']]
  };
  function blasonSvg(o) {
    var sh = 'M8 8H92V62C92 92 70 108 50 114C30 108 8 92 8 62Z', c1 = o.c1, c2 = o.c2, c3 = o.c3, f = '';
    if (o.part === 'parti') f = '<rect x="50" y="0" width="60" height="130" fill="' + c2 + '"/>';
    else if (o.part === 'coupe') f = '<rect x="0" y="60" width="110" height="70" fill="' + c2 + '"/>';
    else if (o.part === 'ecartele') f = '<rect x="50" y="0" width="60" height="60" fill="' + c2 + '"/><rect x="0" y="60" width="50" height="70" fill="' + c2 + '"/>';
    else if (o.part === 'bande') f = '<path d="M0 22L22 0L110 88L88 110Z" fill="' + c2 + '"/>';
    else if (o.part === 'chevron') f = '<path d="M-5 100L50 40L105 100V120H-5Z" fill="' + c2 + '"/><path d="M-5 100L50 40L105 100" fill="none" stroke="' + c2 + '" stroke-width="0"/>';
    else if (o.part === 'croix') f = '<rect x="40" y="0" width="20" height="130" fill="' + c2 + '"/><rect x="0" y="48" width="110" height="20" fill="' + c2 + '"/>';
    var ch = '', t = 'transform="translate(50 56)"';
    if (o.ch === 'etoile') ch = '<g ' + t + '><path d="M0 -20L5.9 -6.5L20.5 -6.2L9.2 3.2L13 17.5L0 9.5L-13 17.5L-9.2 3.2L-20.5 -6.2L-5.9 -6.5Z" fill="' + c3 + '" stroke="#2f2216" stroke-width="2"/></g>';
    else if (o.ch === 'soleil') ch = '<g ' + t + '><g stroke="' + c3 + '" stroke-width="4" stroke-linecap="round">' + [0, 45, 90, 135, 180, 225, 270, 315].map(function (a) { return '<path d="M0 -15V-23" transform="rotate(' + a + ')"/>'; }).join('') + '</g><circle r="12" fill="' + c3 + '" stroke="#2f2216" stroke-width="2"/></g>';
    else if (o.ch === 'croix') ch = '<g ' + t + '><path d="M-5 -22H5V-5H22V5H5V22H-5V5H-22V-5H-5Z" fill="' + c3 + '" stroke="#2f2216" stroke-width="2"/></g>';
    else if (o.ch === 'tour') ch = '<g ' + t + '><path d="M-14 22V-8H-18V-20H-10V-14H-4V-20H4V-14H10V-20H18V-8H14V22Z" fill="' + c3 + '" stroke="#2f2216" stroke-width="2" stroke-linejoin="round"/><path d="M-5 22V8a5 5 0 0 1 10 0V22Z" fill="#2f2216"/></g>';
    else if (o.ch === 'couronne') ch = '<g ' + t + '><path d="M-22 14L-26 -12L-12 -2L0 -18L12 -2L26 -12L22 14Z" fill="' + c3 + '" stroke="#2f2216" stroke-width="2" stroke-linejoin="round"/><rect x="-22" y="14" width="44" height="6" fill="' + c3 + '" stroke="#2f2216" stroke-width="2"/></g>';
    else if (o.ch === 'lys') ch = '<g ' + t + ' fill="' + c3 + '" stroke="#2f2216" stroke-width="2" stroke-linejoin="round"><path d="M0 -24C-8 -14 -8 -2 0 8C8 -2 8 -14 0 -24Z"/><path d="M-6 4C-20 -6 -26 4 -20 12C-16 16 -8 12 -4 8Z"/><path d="M6 4C20 -6 26 4 20 12C16 16 8 12 4 8Z"/><rect x="-12" y="8" width="24" height="5" rx="1.5"/><path d="M-5 13L-8 22H8L5 13Z"/></g>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120"><defs><clipPath id="bc"><path d="' + sh + '"/></clipPath></defs><path d="' + sh + '" fill="' + c1 + '"/><g clip-path="url(#bc)">' + f + '</g>' + ch + '<path d="' + sh + '" fill="none" stroke="#2f2216" stroke-width="3.5" stroke-linejoin="round"/></svg>';
  }
  function blasonDialog() {
    var dlg = $('#dlg-blason');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'dlg-blason'; dlg.className = 'dlg-live'; document.body.appendChild(dlg); }
    var o = { part: 'parti', ch: 'lys', c1: '#2563eb', c2: '#f1ede0', c3: '#e0a800', name: 'Blason' };
    function opts(list, cur) { return list.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === cur ? ' selected' : '') + '>' + x[1] + '</option>'; }).join(''); }
    dlg.innerHTML = '<h2>Créer un blason</h2><div class="gbl"><div class="gbl-p" id="gbl-p"></div><div class="gbl-f">' +
      '<label>Nom <input id="gbl-name" type="text" maxlength="30" value="Blason"></label>' +
      '<label>Division <select id="gbl-part">' + opts(BLA.parts, o.part) + '</select></label>' +
      '<label>Figure <select id="gbl-ch">' + opts(BLA.charges, o.ch) + '</select></label>' +
      '<div class="gbl-c"><label>Couleur 1 <input id="gbl-c1" type="color" value="' + o.c1 + '"></label><label>Couleur 2 <input id="gbl-c2" type="color" value="' + o.c2 + '"></label><label>Figure <input id="gbl-c3" type="color" value="' + o.c3 + '"></label></div></div></div>' +
      '<div class="dlg-actions"><button class="btn-ghost" id="gbl-no" type="button">Annuler</button><button class="btn-primary" id="gbl-ok" type="button">Ajouter à mes images</button></div>';
    function upd() { o.name = $('#gbl-name', dlg).value || 'Blason'; o.part = $('#gbl-part', dlg).value; o.ch = $('#gbl-ch', dlg).value; o.c1 = $('#gbl-c1', dlg).value; o.c2 = $('#gbl-c2', dlg).value; o.c3 = $('#gbl-c3', dlg).value; $('#gbl-p', dlg).innerHTML = blasonSvg(o); }
    $$('select,input', dlg).forEach(function (e) { e.addEventListener('input', upd); e.addEventListener('change', upd); });
    $('#gbl-no', dlg).addEventListener('click', function () { dlg.close(); });
    $('#gbl-ok', dlg).addEventListener('click', function () { upd(); addImage(o.name, 'data:image/svg+xml;utf8,' + encodeURIComponent(blasonSvg(o))); dlg.close(); SM.toast('Blason ajouté : cliquez-le dans « Mes images » puis sur la carte.'); });
    upd(); dlg.showModal();
  }
  function imagesInit() {
    var box = $('#gimgs'); if (!box) return;
    box.addEventListener('click', function (e) {
      var x = e.target.closest('[data-del]');
      if (x) {
        e.stopPropagation(); var id = x.dataset.del, used = D().shapes.some(function (sh) { return sh.icon === 'img:' + id; });
        if (used && !confirm('Cette image est utilisée sur la carte : la retirer la fera disparaître. Continuer ?')) return;
        D().images = images().filter(function (im) { return im.id !== id; }); D().shapes = D().shapes.filter(function (sh) { return sh.icon !== 'img:' + id; });
        SM.persist(); render(); renderImages(); renderTeams(); SM.renderLayerList(); return;
      }
      var b = e.target.closest('button[data-i]'); if (!b) return;
      STAMP = { i: b.dataset.i, l: b.dataset.l, col: '', art: true, flag: false, hero: false }; PRE = null; if (S.mode !== 'game') SM.setMode('game'); setGT('stamp'); renderThemes(); renderPane();
    });
    var f = $('#gimg-file');
    f.addEventListener('change', function () {
      var file = f.files && f.files[0]; if (!file) return;
      fileToImage(file).then(function (uri) { addImage((file.name || 'Image').replace(/\.[a-z0-9]+$/i, '').slice(0, 30), uri); SM.toast('Image ajoutée : cliquez-la dans « Mes images » puis sur la carte.'); }).catch(function () { SM.toast('Image illisible : essayez un fichier PNG ou JPEG.'); });
      f.value = '';
    });
    $('#gimg-bl').addEventListener('click', blasonDialog);
  }
  // ---------- Équipes et bases ----------
  var TCOL = ['#c0262d', '#2563eb', '#1a7f37', '#e0a800', '#7c3aed', '#ea580c'];
  function teams() { return D().teams || (D().teams = []); }
  function heroList() { var th = themeById(D().theme), a = th && window.SM_ART_THEMES ? (window.SM_ART_THEMES[th.id] || []).filter(function (e) { return e.hero; }) : []; a = a.length ? a : [{ i: 'om:1F3F0', l: 'Base', art: 1, hero: 1 }]; return a.concat(images().map(function (im) { return { i: 'img:' + im.id, l: 'Mon image : ' + im.name, art: 1, hero: 1 }; })); }
  function heroFor(t) { var l = heroList(); return l.filter(function (e) { return e.i === t.base; })[0] || l[0]; }
  function heroOf() { var th = themeById(D().theme), a = th && window.SM_ART_THEMES && (window.SM_ART_THEMES[th.id] || []).filter(function (e) { return e.hero; })[0]; return a || { i: 'om:1F3F0', l: 'Base', art: 1, hero: 1 }; }
  function renderTeams() {
    var box = $('#gteams'); if (!box) return;
    if (!window.SM_ART && themeById(D().theme)) loadArt().then(renderTeams).catch(function () { /* hors ligne */ });
    var hs = heroList(), tl = teams();
    box.innerHTML = tl.map(function (t) {
      var nb = D().shapes.filter(function (x) { return x.team === t.id && x.kind === 'stamp'; }).length, on = STAMP && STAMP.team === t.id;
      return '<div class="gteam" data-t="' + t.id + '"><div class="gteam-h"><label class="gteam-c" title="Couleur de l’équipe"><input type="color" value="' + esc(t.color) + '" data-tc><i style="background:' + esc(t.color) + '"></i></label>' +
        '<input class="gteam-n" type="text" maxlength="24" value="' + esc(t.name) + '" aria-label="Nom de l’équipe" data-tn><button type="button" class="ibtn" data-tdel title="Supprimer l’équipe" aria-label="Supprimer l’équipe"><svg class="ic"><use href="#i-trash"/></svg></button></div>' +
        (hs.length > 1 ? '<label class="gteam-s">Image de la base <select data-tb aria-label="Image de la base">' + hs.map(function (e) { return '<option value="' + esc(e.i) + '"' + (heroFor(t).i === e.i ? ' selected' : '') + '>' + esc(e.l) + '</option>'; }).join('') + '</select></label>' : '') +
        '<div class="gteam-b"><button type="button" class="btn-ghost sm' + (on && STAMP.hero ? ' on' : '') + '" data-tbase title="Cliquez sur la carte pour poser la base de cette équipe (étirez pour choisir sa taille)">' + (artUri(heroFor(t).i, t.color) ? '<img src="' + artUri(heroFor(t).i, t.color) + '" alt="">' : '') + 'Poser la base</button>' +
        '<button type="button" class="btn-ghost sm' + (on && !STAMP.hero ? ' on' : '') + '" data-tstart title="Poser un point de départ pour une patrouille de cette équipe">' + flagSvg(t.color, 20) + 'Poser un départ</button></div>' +
        (nb ? '<p class="gteam-i">' + nb + ' élément' + (nb > 1 ? 's' : '') + ' sur la carte</p>' : '') + '</div>';
    }).join('') || '<p class="gtab-help">Aucune équipe pour l’instant. Ajoutez-en une, donnez-lui un nom et une couleur, puis posez sa base et ses départs sur la carte.</p>';
  }
  function teamPlace(id, hero) {
    var t = teams().filter(function (x) { return x.id === id; })[0]; if (!t) return;
    if (hero && !window.SM_ART && themeById(D().theme)) { loadArt().then(function () { teamPlace(id, hero); }).catch(function () { /* hors ligne */ }); return; }
    var h = heroFor(t);
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
      if (e.target.matches('[data-tb]')) { t.base = e.target.value; SM.persist(); renderTeams(); return; }
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
    box.addEventListener('change', function (e) { if (e.target.matches('[data-tb]')) { var row = e.target.closest('.gteam'), t = teams().filter(function (x) { return x.id === row.dataset.t; })[0]; if (t) { t.base = e.target.value; SM.persist(); renderTeams(); } } else if (e.target.matches('[data-tc]')) renderTeams(); });
  }
  function renderThemes() {
    if (!$('#gstamps')) return;
    renderTeams(); renderImages();
    var th = themeById(D().theme), perso = D().theme === 'perso';
    // réglages du jeu (panneau Réglages)
    if ($('#gscale')) {
      $('#gscale').innerHTML = scaleBtns(D().scale || 0);
      $('#gs-st-size').textContent = (D().stampMm || 16) + ' mm'; $('#gcaptions').checked = !!D().captions;
      $('#gtheme-info').textContent = th ? 'Thème : ' + th.name + '. Il se choisit à la création du jeu ; pour en changer, créez un nouveau grand jeu.' : perso ? 'Jeu personnalisé (sans thème).' : 'Aucun thème choisi pour ce jeu.';
      $('#gtheme-choose').hidden = !!D().themeLocked;
      $('#gcredit').textContent = 'Icônes : game-icons.net (CC BY 3.0) · ' + (window.SM_CREDITS || []).join(', ') + ' — Illustrations en couleur : OpenMoji (CC BY-SA 4.0), openmoji.org';
    }
    // palette (onglet Poser)
    var artL = th && window.SM_ART_THEMES ? (window.SM_ART_THEMES[th.id] || []) : [];
    if (!window.SM_ART && th) loadArt().then(function () { renderThemes(); }).catch(function () { /* hors ligne */ });
    if (!window.SM_ART && !th) loadArt().then(function () { renderThemes(); }).catch(function () { /* hors ligne */ });
    var FLAGS = [['#c0262d', 'rouge'], ['#2563eb', 'bleu'], ['#1a7f37', 'vert'], ['#e0a800', 'jaune']].map(function (f) { return { i: 'flag', l: 'Équipe ' + f[1], c: 'Repères', col: f[0], flag: 1 }; });
    var commons = FLAGS.concat(window.SM_ART_COMMON || [], window.SM_COMMON || []);
    function sortL(a) { return a.slice().sort(function (x, y) { return String(x.l || '').localeCompare(String(y.l || ''), 'fr'); }); }
    var fold = {}; try { fold = JSON.parse(localStorage.getItem('scoutmap.gsec') || '{}'); } catch (e) { fold = {}; }
    function sec(name, list, color, hint) {
      if (!list.length) return '';
      return '<details class="gsec"' + (fold[name] === false ? '' : ' open') + ' data-sec="' + esc(name) + '"><summary><span>' + esc(name) + '</span><small>' + list.length + '</small></summary>' + (hint ? '<p class="gsec-h">' + esc(hint) + '</p>' : '') + '<div class="gstamps">' + stampBtns(list, color) + '</div></details>';
    }
    function fam(t) { return '<h3 class="gfam">' + esc(t) + '</h3>'; }
    var html = '';
    if (th) {
      var heroes = artL.filter(function (e) { return e.hero; }), illus = sortL(artL.filter(function (e) { return !e.hero; }));
      if (heroes.length || illus.length) html += fam('Illustrations en couleur') + sec('Bases', heroes, th.color, 'Grandes images détaillées : cliquez puis étirez sur la carte pour choisir la taille.') + sec('Illustrations', illus, th.color);
      html += fam('Repères') + sec('Repères du jeu', commons, '#12142b');
      html += fam('Pictogrammes') + th.cats.map(function (c) { return sec(c, sortL(th.el.filter(function (e) { return e.c === c; })), th.color); }).join('');
    } else if (window.SM_THEMES) html = fam('Repères') + sec('Repères du jeu', commons, '#12142b');
    else html = '<p class="gtab-help">Chargement…</p>';
    $('#gcats').hidden = true; $('#gcats').innerHTML = '';
    $('#gstamps').innerHTML = html;
    $('#gth-name').textContent = th ? th.name : '';
    var zl = [], zseen = {}; (th ? th.z : []).concat(window.SM_ZONES || []).forEach(function (z) { var k = z.l + z.f; if (!zseen[k]) { zseen[k] = 1; zl.push(z); } });
    var zt = zl.filter(function (z) { return z.x; }), zp = zl.filter(function (z) { return !z.x; });
    $('#gzones').innerHTML = '<h4 class="gsec-t">Terrains à motif</h4>' + zoneTiles(zt) + (zp.length ? '<h4 class="gsec-t">Zones unies</h4>' + zoneTiles(zp) : '');
    var mids = th && window.SM_MOTIF_THEMES ? (window.SM_MOTIF_THEMES[th.id] || []) : (window.SM_MOTIF_COMMON || []);
    $('#glines').innerHTML = '<h4 class="gsec-t">Traits simples</h4>' + lineBtns(th ? th.ln : []) + (mids.length ? '<h4 class="gsec-t">Lignes illustrées (motif répété)</h4>' + motifBtns(mids) : '');
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
      S.vis.game = true; SM.ensureVisible('game'); insertShape(s);
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

  // ---------- Assistant de création : thème, échelle, fond de carte — étape par étape, à la place de la carte ----------
  function wizard() {
    loadThemes().then(function () {
      var host = $('#mapwrap'), old = $('#gwz'); if (old) old.remove();
      var ov = document.createElement('div'); ov.id = 'gwz'; ov.className = 'gwz'; host.appendChild(ov); document.body.classList.add('gw-open');
      var pick = { sc: D().scale || 5000, th: D().theme || 'moyenage', base: null, name: (D().name && D().name !== 'Grand jeu 1' ? D().name : '') }, step = 1, pm = null, pl = null, pmk = [], center = map.getCenter();
      var STEPS = ['Thème', 'Échelle et fond de carte', 'Effets (facultatif)'];
      pick.fx = {};
      function thNow() { return themeById(pick.th); }
      function baseNow() { var th = thNow(), b = pick.base || (th ? th.base : S.base); return SM.LAYERS[b] ? b : 'otm'; }
      function sample(th) {
        var out = [], seen = {};
        (th && th.el || []).forEach(function (e) { if (!seen[e.c] && out.length < 4) { seen[e.c] = 1; out.push(e); } });
        if (out.length < 4) (window.SM_COMMON || []).slice(0, 4 - out.length).forEach(function (e) { out.push(e); });
        return out;
      }
      function killMap() { if (pm) { pm.remove(); pm = null; } pl = null; pmk = []; }
      function preview() {
        var th = thNow(), el = $('#gw-map', ov); if (!el) return;
        if (!pm) pm = L.map(el, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, zoomSnap: 0, zoomAnimation: false });
        var base = baseNow();
        if (pl && pl._k !== base) { pm.removeLayer(pl); pl = null; }
        if (!pl) { pl = SM.tile(base, 1).addTo(pm); pl._k = base; }
        pm.invalidateSize(); pm.setView(center, SM.zoomFor(pick.sc, center.lat), { animate: false });
        pmk.forEach(function (m) { pm.removeLayer(m); }); pmk = [];
        var w = el.clientWidth || 300, h = el.clientHeight || 300, spots = [[.27, .3], [.68, .27], [.34, .68], [.72, .7]];
        sample(th).forEach(function (e, i) {
          var ll = pm.containerPointToLatLng([w * spots[i][0], h * spots[i][1]]), color = th ? th.color : '#12142b';
          var st = { icon: e.i, stroke: color, text: '', size: 12, fontColor: color, font: 'arial', _sc: pick.sc, mm: D().stampMm || 16 };
          pmk.push(new StampMarker(ll, st, { icon: stampIcon(st, 30), interactive: false }).addTo(pm));
        });
        if (step === 3) applyFx(el, { fx: pick.fx });
        var cap = $('#gw-cap', ov); if (cap) cap.textContent = '1 : ' + pick.sc.toLocaleString('fr-FR') + ' · les éléments mesurent ' + (D().stampMm || 16) + ' mm sur le papier à cette échelle';
      }
      function baseOpts() {
        var th = thNow(), rec = th ? th.base : null, cur = baseNow(), M = window.SM_baseMeta, h = '';
        M.groups.forEach(function (g) {
          var o = g[1].filter(function (k) { return SM.LAYERS[k]; }).map(function (k) {
            var f = M.fit(k, pick.sc, center.lat), t = SM.LAYERS[k].label + (M.year[k] ? ' (' + M.year[k] + ')' : '') + (k === rec ? ' — conseillé pour ce thème' : '') + (f.ok ? '' : ' — déconseillé à cette échelle');
            return '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + esc(t) + '</option>';
          }).join('');
          if (o) h += '<optgroup label="' + esc(g[0]) + '">' + o + '</optgroup>';
        });
        return h;
      }
      function baseWarn() {
        var M = window.SM_baseMeta, f = M.fit(baseNow(), pick.sc, center.lat); if (f.ok) return '';
        return '<p class="gwz-warn">⚠ ' + esc(SM.LAYERS[baseNow()].label) + ' : ' + esc(f.text) + '. <button type="button" id="gw-base-fix" class="gwz-lk">Passer au Plan IGN</button> ou <button type="button" id="gw-base-photo" class="gwz-lk">à la photo aérienne</button></p>';
      }
      function refreshBase() {
        var sel = $('#gw-base', ov); if (sel) sel.innerHTML = baseOpts(); var w = $('#gw-warn', ov); if (w) { w.innerHTML = baseWarn(); var a = $('#gw-base-fix', ov), b2 = $('#gw-base-photo', ov); if (a) a.addEventListener('click', function () { pick.base = 'plan'; refreshBase(); preview(); }); if (b2) b2.addEventListener('click', function () { pick.base = 'ortho'; refreshBase(); preview(); }); }
      }
      function baseSel() {
        var th = thNow(), rec = th ? th.base : null, cur = baseNow();
        var keys = Object.keys(SM.LAYERS).filter(function (k) { return SM.LAYERS[k].base; });
        keys.sort(function (a, b) { return (b === rec) - (a === rec); });
        return '<label class="gwz-bs">Fond de carte <select id="gw-base">' + baseOpts() + '</select></label><div id="gw-warn">' + baseWarn() + '</div>';
      }
      function draw() {
        killMap();
        var body, foot;
        if (step === 1) body = '<label class="gwz-name">Nom du jeu <input id="gw-name" type="text" maxlength="60" placeholder="Ex. Domaine de Henriques, Camp de Pâques…" autocomplete="off" value="' + esc(pick.name) + '"></label><h2>Choisissez le thème du jeu</h2><p class="gwz-sub">Il donne les illustrations, les couleurs, les bases et les lignes (palissades, barbelés…). Il ne pourra plus être changé ensuite.</p><div class="gwz-themes">' + themeCards(pick.th) + '</div>';
        else if (step === 3) body = '<div class="gwz-cols"><div><h2>Effets sur la carte</h2><p class="gwz-sub">Facultatif : donnez un style à la carte. L’aperçu à droite se met à jour tout de suite. Rien n’est appliqué par défaut, et vous pourrez tout régler plus tard dans l’onglet Effets.</p><div class="gfx-grid" id="gw-fx"></div></div><div class="gwz-r"><div id="gw-map"></div><p id="gw-cap"></p></div></div>';
        else body = '<div class="gwz-cols"><div><h2>Échelle de départ</h2><p class="gwz-sub">Elle règle la taille des éléments sur le papier. Vous pourrez zoomer et dézoomer librement ensuite.</p><div class="gscale gwz-sc">' + scaleBtns(pick.sc) + '</div><p class="gwz-note"><b>À savoir :</b> la taille des éléments dépend de cette échelle de départ. Ils gardent la même taille sur le papier (en millimètres) : si vous changez d’échelle plus tard, ils paraîtront plus gros ou plus petits sur la carte.</p><h2 class="gwz-h2b">Fond de carte</h2><p class="gwz-sub">Un fond adapté au thème est déjà choisi : changez-le seulement si vous préférez. La photo aérienne est souvent plus pratique pour repérer les haies, chemins et bâtiments ; elle se change aussi plus tard dans l’onglet Effets.</p>' + baseSel() + '</div><div class="gwz-r"><div id="gw-map"></div><p id="gw-cap"></p></div></div>';
        foot = '<button type="button" class="btn-ghost" id="gwz-cancel">Annuler</button><span class="gwz-fill"></span>' + (step > 1 ? '<button type="button" class="btn-ghost" id="gwz-back">Retour</button>' : '') +
          (step === 3 ? '<button type="button" class="btn-ghost" id="gwz-skip">Passer cette étape</button>' : '') + (step < 3 ? '<button type="button" class="btn-primary" id="gwz-next">Suivant</button>' : '<button type="button" class="btn-primary" id="gwz-go">Créer le grand jeu</button>');
        ov.innerHTML = '<div class="gwz-top"><b>Nouveau grand jeu</b><ol class="gwz-steps">' + STEPS.map(function (n, k) { return '<li class="' + (k + 1 === step ? 'on' : k + 1 < step ? 'done' : '') + '"><i>' + (k + 1) + '</i>' + n + '</li>'; }).join('') + '</ol></div><div class="gwz-body">' + body + '</div><div class="gwz-foot">' + foot + '</div>';
        $$('[data-th]', ov).forEach(function (b) { b.addEventListener('click', function () { pick.th = b.dataset.th; pick.base = null; $$('[data-th]', ov).forEach(function (x) { x.classList.toggle('on', x === b); }); }); });
        $$('[data-sc]', ov).forEach(function (b) { b.addEventListener('click', function () { pick.sc = +b.dataset.sc; $$('[data-sc]', ov).forEach(function (x) { x.classList.toggle('on', x === b); }); refreshBase(); preview(); }); });
        var nm = $('#gw-name', ov); if (nm) { nm.addEventListener('input', function () { pick.name = nm.value; }); nm.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); var nx2 = $('#gwz-next', ov); if (nx2) nx2.click(); } }); setTimeout(function () { nm.focus(); }, 80); }
        refreshBase();
        function dbl(e) { var nx4 = $('#gwz-next', ov); if (!nx4) return; e.preventDefault(); nx4.click(); }
        $$('[data-th]', ov).forEach(function (b) { b.addEventListener('dblclick', dbl); });
        $$('[data-sc]', ov).forEach(function (b) { b.addEventListener('dblclick', dbl); });
        var gb = $('#gw-base', ov); if (gb) gb.addEventListener('change', function () { pick.base = gb.value; preview(); });
        $('#gwz-cancel', ov).addEventListener('click', function () { killMap(); ov.remove(); document.body.classList.remove('gw-open'); setTab('tools'); renderThemes(); });
        var bk = $('#gwz-back', ov); if (bk) bk.addEventListener('click', function () { step--; draw(); });
        var nx = $('#gwz-next', ov); if (nx) nx.addEventListener('click', function () { if (step === 1 && !pick.name.trim()) { var n3 = $('#gw-name', ov); if (n3) { n3.focus(); n3.classList.add('bad'); SM.toast('Donnez d’abord un nom au jeu.'); } return; } step++; draw(); });
        var fxh = $('#gw-fx', ov);
        if (fxh) {
          renderFxInto(fxh, pick.fx);
          fxh.addEventListener('click', function (e) { var b = e.target.closest('[data-fx]'); if (!b) return; var k = b.dataset.fx; if (pick.fx[k] != null) delete pick.fx[k]; else pick.fx[k] = FXM[k].v; renderFxInto(fxh, pick.fx); var me = $('#gw-map', ov); if (me) applyFx(me, { fx: pick.fx }); });
          fxh.addEventListener('input', function (e) { var r = e.target.closest('[data-fxv]'); if (r) { pick.fx[r.dataset.fxv] = +r.value / 100; var me = $('#gw-map', ov); if (me) applyFx(me, { fx: pick.fx }); } });
        }
        var skip = $('#gwz-skip', ov); if (skip) skip.addEventListener('click', function () { pick.fx = {}; var g2 = $('#gwz-go', ov); if (g2) g2.click(); });
        var go = $('#gwz-go', ov);
        if (go) go.addEventListener('click', function () {
          killMap(); ov.remove(); document.body.classList.remove('gw-open'); if (pick.name.trim()) { D().name = pick.name.trim(); var gn = $('#game-name'); if (gn) gn.value = D().name; } setScale(pick.sc); applyTheme(pick.th); D().fx = Object.assign({}, pick.fx); delete D().parch; applyParch();
          var th = thNow(), b = baseNow(); if (th && b !== th.base) { S.base = b; if (SM.applyLayers) SM.applyLayers(); SM.persist(); }
          setTab('tools'); setTimeout(function () { try { map.invalidateSize(); } catch (e) { /* ignoré */ } }, 50);
        });
        if (step > 1) setTimeout(preview, 60);
      }
      draw();
    }).catch(function () { setTab('tools'); });
  }
  // ---------- Palette d'outils flottante, sous-onglets de la bibliothèque, recherche, guide de démarrage ----------
  var SUB = 'elements', QUERY = '';
  var TOOLTIPS = { select: 'Sélection (V) : cliquer, déplacer, modifier', polygon: 'Zone (P) : cliquez les sommets, double-clic pour finir', rect: 'Rectangle (R) : deux clics', circle: 'Cercle (C) : centre puis rayon', line: 'Ligne (L) : cliquez les points, double-clic pour finir', arrow: 'Flèche (A) : deux clics', cross: 'Croix (X) : un clic', text: 'Texte (T) : un clic' };
  (function proUi() {
    var pal = $('#gpalette'), src = $('#gtools-src'); if (!pal || !src) return;
    var g = document.createElement('div'); g.className = 'gtools'; g.id = 'gtools';
    $$('button', src).forEach(function (b) { b.title = TOOLTIPS[b.dataset.gt] || b.title; b.setAttribute('aria-label', TOOLTIPS[b.dataset.gt] || ''); g.appendChild(b); });
    var rp = document.createElement('button'); rp.type = 'button'; rp.id = 'gkeep-btn'; rp.title = 'Répéter : poser plusieurs fois de suite le même élément'; rp.setAttribute('aria-label', rp.title);
    rp.innerHTML = '<svg class="ic"><use href="#i-loop"/></svg><span>Répéter</span>';
    rp.addEventListener('click', function () { var c = $('#gs-keep'); c.checked = !c.checked; rp.classList.toggle('on', c.checked); });
    var sp = document.createElement('i'); sp.className = 'gpal-sep'; g.appendChild(sp); g.appendChild(rp);
    src.remove(); pal.appendChild(g);
    var gp = document.querySelector('.pane[data-pane=game]');
    function fit() { pal.classList.remove('two'); var mw = $('#mapwrap'); if (!mw || pal.hidden) return; if (pal.offsetHeight > mw.clientHeight - 84 - 150) pal.classList.add('two'); }
    window.addEventListener('resize', fit); if (window.ResizeObserver && $('#mapwrap')) new ResizeObserver(fit).observe($('#mapwrap'));
    function sync() { var on = !!(gp && !gp.hidden); pal.hidden = !on; setTimeout(fit, 80); }
    if (gp) new MutationObserver(sync).observe(gp, { attributes: true, attributeFilter: ['hidden'] }); sync();
    // sous-onglets : une seule section visible à la fois, sans défilement
    var tp = document.querySelector('[data-gtabp=tools]'); if (!tp) return;
    var secs = {};
    var dets = $$('details.gdet', tp);
    function det(txt) { return dets.filter(function (d) { return d.querySelector('summary').textContent.indexOf(txt) === 0; })[0]; }
    secs.teams = [det('Équipes')]; secs.zones = [det('Terrains')]; secs.lines = [det('Lignes')]; secs.images = [det('Mes images')];
    var elems = []; var n = $('#gactive');
    [$('#gcats'), $('#gstamps'), det('Repères')].forEach(function (e) { if (e) elems.push(e); });
    var h3 = tp.querySelector('h3.sub'); if (h3) elems.unshift(h3);
    secs.elements = elems;
    var bar = document.createElement('nav'); bar.className = 'gsub'; bar.id = 'gsub'; bar.setAttribute('role', 'tablist'); bar.setAttribute('aria-label', 'Contenu de l’onglet Poser');
    bar.innerHTML = [['elements', 'Icônes', 'g-stamp'], ['teams', 'Équipes', 'people'], ['zones', 'Terrains', 'g-polygon'], ['lines', 'Lignes', 'g-line'], ['images', 'Images', 'upload']].map(function (x) { return '<button type="button" role="tab" data-sub="' + x[0] + '"><svg class="ic"><use href="#i-' + x[2] + '"/></svg><span>' + x[1] + '</span></button>'; }).join('');
    var search = document.createElement('div'); search.className = 'gsearch'; search.id = 'gsearch'; search.innerHTML = '<input type="search" id="gsearch-in" placeholder="Chercher un élément (château, drapeau…)" aria-label="Chercher un élément" autocomplete="off">';
    var guide = document.createElement('div'); guide.className = 'gguide'; guide.id = 'gguide'; guide.hidden = true;
    guide.innerHTML = '<b>Pour démarrer</b><ol><li><button type="button" data-sub="teams">Créez vos équipes et posez leurs bases</button></li><li><button type="button" data-sub="lines">Tracez les limites (palissades, barbelés…)</button></li><li><button type="button" data-sub="elements">Posez les chefs, objectifs et repères</button></li><li>Partagez le jeu en direct (bouton « Partager », à droite de la carte)</li></ol><button type="button" class="gguide-x" id="gguide-x" aria-label="Masquer ce guide">Masquer</button>';
    var wrap = document.createElement('div'); wrap.className = 'gposer'; var cont = document.createElement('div'); cont.className = 'gposer-c';
    while (tp.firstChild) cont.appendChild(tp.firstChild);
    cont.insertBefore(search, cont.firstChild); cont.insertBefore(guide, cont.firstChild);
    wrap.appendChild(bar); wrap.appendChild(cont); tp.appendChild(wrap);
    Object.keys(secs).forEach(function (k) { secs[k].forEach(function (e) { if (e && e.tagName === 'DETAILS') { e.open = true; e.classList.add('gsubd'); } }); });
    function applyQuery() {
      var q = QUERY.trim().toLowerCase();
      $$('#gstamps .gst').forEach(function (b) { var t = ((b.dataset.l || '') + ' ' + (b.textContent || '')).toLowerCase(); b.hidden = !!q && t.indexOf(q) < 0; });
      $$('#gstamps .gsec').forEach(function (d) { var any = $$('.gst', d).some(function (b) { return !b.hidden; }); d.hidden = !any; if (q && any) d.open = true; });
      $$('#gstamps .gfam').forEach(function (f) { var n = f.nextElementSibling, any = false; while (n && !n.classList.contains('gfam')) { if (n.classList.contains('gsec') && !n.hidden) any = true; n = n.nextElementSibling; } f.hidden = !any; });
    }
    function showSub(k) {
      SUB = k; if (!secs[k]) SUB = k = 'elements';
      $$('#gsub button').forEach(function (b) { var on = b.dataset.sub === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
      Object.keys(secs).forEach(function (kk) { secs[kk].forEach(function (e) { if (e) e.hidden = kk !== k; }); });
      $('#gsearch').hidden = k !== 'elements';
      applyQuery();
    }
    SM.gameSub = function (k) { showSub(k); renderGuide(); }; SM.gameGuide = function () { renderGuide(); };
    function renderGuide() { var gd = $('#gguide'); if (gd) { var off = false; try { off = localStorage.getItem('scoutmap.guide.off') === '1'; } catch (e) { /* ignoré */ } gd.hidden = off || (D().shapes || []).length > 0 || (D().teams || []).length > 0; } }
    bar.addEventListener('click', function (e) { var b = e.target.closest('[data-sub]'); if (b) showSub(b.dataset.sub); });
    guide.addEventListener('click', function (e) { var b = e.target.closest('button[data-sub]'); if (b) showSub(b.dataset.sub); });
    $('#gguide-x').addEventListener('click', function () { try { localStorage.setItem('scoutmap.guide.off', '1'); } catch (er) { /* ignoré */ } renderGuide(); });
    $('#gsearch-in').addEventListener('input', function () { QUERY = this.value; applyQuery(); });
    // après chaque rendu de la bibliothèque (le panneau est reconstruit), on remet l'onglet et le filtre
    var oldRT = renderThemes;
    renderThemes = function () { oldRT(); showSub(SUB); renderGuide(); };
    showSub('elements'); renderGuide();
  })();
  // ---------- Barre de style en bas de la carte (comme dans un logiciel de dessin) ----------
  (function styleBar() {
    var bar = $('#gbar'), st = $('#gstyle'); if (!bar || !st) return;
    var pane = st.parentNode, tg = $('#gs-target'), act = $('#gs-actions');
    var t = document.createElement('div'); t.className = 'gbar-t'; if (tg) t.appendChild(tg);
    ['#gpal', '#gpal-custom'].forEach(function (q) { var e = $(q); if (e) document.body.appendChild(e); });   // la palette de couleurs ne doit pas rester dans le volet masqué
    st.insertBefore(t, st.firstChild); if (act) st.appendChild(act); bar.appendChild(st);
    if (pane && pane.dataset.gtabp === 'style') pane.hidden = true;
    var gp = document.querySelector('.pane[data-pane=game]');
    function sync() { var on = !!gp && !gp.hidden; bar.hidden = !on; setTimeout(function () { try { map.invalidateSize(); } catch (e) { /* ignoré */ } }, 60); }
    if (gp) { new MutationObserver(sync).observe(gp, { attributes: true, attributeFilter: ['hidden'] }); }
    sync();
    if (window.ResizeObserver && $('#mapwrap')) new ResizeObserver(function () { try { map.invalidateSize(); } catch (e) { /* ignoré */ } }).observe($('#mapwrap'));
  })();
  (function wireThemes() {
    var tl = $('#gtabs [data-gtab=tools]'); if (tl) tl.addEventListener('click', function () { loadThemes().then(renderThemes); });
    $('#gscale').addEventListener('click', function (e) { var b = e.target.closest('button[data-sc]'); if (b) setScale(+b.dataset.sc); });
    $('#gtheme-choose').addEventListener('click', function () { wizard(); });
    fxInit();
    $('#gcaptions').addEventListener('change', function () { D().captions = this.checked; SM.persist(); render(); });
    $('#gcats').addEventListener('click', function (e) { var b = e.target.closest('button[data-c]'); if (b) { GCAT = b.dataset.c; renderThemes(); } });
    function pick(e) {
      var b = e.target.closest('button[data-i]'); if (!b) return;
      STAMP = { i: b.dataset.i, l: b.dataset.l, col: b.dataset.col || '', art: !!b.dataset.art, flag: !!b.dataset.flag, hero: !!b.dataset.hero }; PRE = null; if (S.mode !== 'game') SM.setMode('game'); setGT('stamp'); renderThemes(); renderPane();
    }
    $('#gstamps').addEventListener('click', pick); $('#gcommon').addEventListener('click', pick);
    $('#gstamps').addEventListener('toggle', function (e) { var d = e.target; if (!d.classList || !d.classList.contains('gsec') || $('#gsearch-in').value) return; var f = {}; try { f = JSON.parse(localStorage.getItem('scoutmap.gsec') || '{}'); } catch (er) { f = {}; } f[d.dataset.sec] = d.open; try { localStorage.setItem('scoutmap.gsec', JSON.stringify(f)); } catch (er) { /* ignoré */ } }, true); teamsInit(); imagesInit();
    $('#gzones').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-z]'); if (!b) return;
      var th = themeById(D().theme), all = (th ? th.z : []).concat(window.SM_ZONES || []), key = b.dataset.z.split('|');
      var z = all.filter(function (x) { return x.l === key[0] && x.f === key[1]; })[0]; if (!z) return;
      setGT(ZSHAPE); PRE = z; STAMP = null; setTab('tools'); renderThemes(); renderPane();
    });
    $('#glines').addEventListener('click', function (e) {
      var mb = e.target.closest('button[data-mo]');
      if (mb) { var mm = window.SM_MOTIFS[mb.dataset.mo]; setGT('line'); PRE = { ln: true, k: 'm_' + mb.dataset.mo, l: mm.n, f: '#3f2a1a', w: 4, x: 'motif:' + mb.dataset.mo }; STAMP = null; setTab('tools'); renderThemes(); renderPane(); return; }
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
    $('#gs-op').addEventListener('input', function () { var q = selShape(); if (!q) return; q.op = +this.value / 100; $('#gs-op-v').textContent = this.value + ' %'; refreshStyle(q); SM.persist(); });
    function rot(d) { var q = selShape(); if (!q) return; q.rot = d === 0 ? 0 : (((Math.round(((q.rot || 0) + d) / 15) * 15 + 180) % 360) + 360) % 360 - 180; refreshStyle(q); SM.persist(); renderPane(); updateHandles(); }
    $('#gs-rot-m').addEventListener('click', function () { rot(-15); }); $('#gs-rot-p').addEventListener('click', function () { rot(15); }); $('#gs-rot-0').addEventListener('click', function () { rot(0); });
    $('#gs-tex').addEventListener('change', function () { var s = selShape(); if (!s) return; if (this.value) s.tex = this.value; else delete s.tex; if (this.value && !(s.alpha > 0)) s.alpha = 0.4; refreshStyle(s); SM.persist(); renderPane(); });
    $('#gs-name').addEventListener('input', function () { var s = selShape(); if (s) { s.name = this.value; refreshStyle(s); screenLegend.update(); SM.persist(); renderList(); } });
    // sections repliables : une seule ouverte à la fois

    loadThemes().then(renderThemes).catch(function () { /* hors ligne */ });
  })();

  // ---------- Onglets du panneau : Thèmes · Outils · Style · Éléments ----------
  var GTAB = 'tools';
  function setTab(t) {
    if (t === 'style') { closePal(); return; }          // le style est dans la barre du bas, visible en permanence
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
    $$('#gtools button[data-gt]').forEach(function (b) { b.classList.toggle('on', b.dataset.gt === GT); });
    var s = selShape(), src = s || STY, kind = s ? s.kind : (GT !== 'select' ? GT : null);
    if ($('#gtabs') && !$('#gtabs .on')) setTab(GTAB);
    $('#gs-target').textContent = s ? 'Sélection : ' + KINDS[s.kind].label.toLowerCase() : (kind ? 'Style : ' + KINDS[kind].label.toLowerCase() + 's' : 'Style par défaut');
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
      else if (f === 'text') on = isT;
      else if (f === 'opacity') on = !!s;
      else if (f === 'rot') on = !!s && (s.kind === 'stamp' || s.kind === 'text');
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
    if (s) { $('#gs-op').value = Math.round(opv(s) * 100); $('#gs-op-v').textContent = Math.round(opv(s) * 100) + ' %'; $('#gs-rot-v').textContent = (s.rot || 0) + '°'; }
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
    $('#gs-auto').addEventListener('click', function () { autoOrder(); SM.toast('Ordre automatique appliqué : terrains, lignes, bases, pictogrammes, textes.'); });
    function stepOrder(q, up) { var a = D().shapes, i = a.indexOf(q), j = up ? i + 1 : i - 1; if (i < 0 || j < 0 || j >= a.length) return; a.splice(i, 1); a.splice(j, 0, q); SM.persist(); render(); renderList(); }
    $('#gs-fwd').addEventListener('click', function () { var q = selShape(); if (q) stepOrder(q, true); });
    $('#gs-bwd').addEventListener('click', function () { var q = selShape(); if (q) stepOrder(q, false); });
    $('#gs-front').addEventListener('click', function () { var s = selShape(); if (s) reorder(s, true); });
    $('#gs-back').addEventListener('click', function () { var s = selShape(); if (s) reorder(s, false); });
    $('#gs-del').addEventListener('click', deleteSel);
    (function listDnd() {
      var ul = $('#gs-list'), drag = null;
      ul.addEventListener('dragstart', function (e) { var li = e.target.closest('li[data-id]'); if (!li) return; drag = +li.dataset.id; li.classList.add('drag'); try { e.dataTransfer.setData('text/plain', String(drag)); e.dataTransfer.effectAllowed = 'move'; } catch (er) { /* ignoré */ } });
      ul.addEventListener('dragend', function () { drag = null; $$('#gs-list li').forEach(function (l) { l.classList.remove('drag', 'ov-t', 'ov-b'); }); });
      ul.addEventListener('dragover', function (e) {
        var li = e.target.closest('li[data-id]'); if (!li || drag == null) return; e.preventDefault();
        var r = li.getBoundingClientRect(), top = e.clientY < r.top + r.height / 2;
        $$('#gs-list li').forEach(function (l) { l.classList.remove('ov-t', 'ov-b'); }); li.classList.add(top ? 'ov-t' : 'ov-b');
      });
      ul.addEventListener('drop', function (e) {
        var li = e.target.closest('li[data-id]'); if (!li || drag == null) return; e.preventDefault();
        var r = li.getBoundingClientRect(), top = e.clientY < r.top + r.height / 2, a = D().shapes, sh = shapeById(drag), tg = shapeById(+li.dataset.id);
        if (!sh || !tg || sh === tg) return;
        a.splice(a.indexOf(sh), 1); var t = a.indexOf(tg); a.splice(top ? t + 1 : t, 0, sh);       // affichage inversé : en haut de la liste = au premier plan
        SM.persist(); render(); renderList();
      });
    })();
    $('#gs-list').addEventListener('click', function (e) {
      var act = e.target.closest('[data-act]');
      if (act) {
        var q = shapeById(+act.dataset.id); if (!q) return; e.stopPropagation();
        if (act.dataset.act === 'vis') q.hidden = !q.hidden;
        else if (act.dataset.act === 'lock') q.locked = !q.locked;
        else { var a = D().shapes, i = a.indexOf(q), j = act.dataset.act === 'up' ? i + 1 : i - 1; if (j >= 0 && j < a.length) { a.splice(i, 1); a.splice(j, 0, q); } }
        SM.persist(); render(); renderList(); return;
      }
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
  function leave() { cancelDraft(); SELID = null; gHandles.clearLayers(); clearFx(); }

  SM.game = { ready: ready, applyFx: applyFx, loadArt: loadArt, theme: function () { return themeById(D().theme); }, wizard: wizard, addLegend: addLegend, loadThemes: loadThemes, rightClick: rightClick, render: render, build: build, points: points, onTool: onTool, leave: leave, hint: hint, hintBtn: hintBtn, hintAction: hintAction, escape: escape,
    hasSel: function () { return !!SELID && !!shapeById(SELID); }, deleteSel: deleteSel, addAt: addAt };
  map.getContainer().classList.add('gt-select');
  render(); SM.renderStored();
})();
