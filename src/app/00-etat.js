/* ScoutMap : application cartographique FSGGB (Géoplateforme IGN). */
(function () {
  'use strict';
  /* ==== src/app/00-etat.js : ouverture de l'application, état (S), palettes, tracés neufs (valeurs par défaut), historique ==== */
  var G = Geo;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = G.esc;
  var GP = 'https://data.geopf.fr';
  var KEY = 'scoutmap.v3';
  var VIEWER = !!window.SM_VIEWER;   // page web exportée : lecture seule, sans panneau ni menus
  function ic(n, c) { return '<svg class="ic' + (c ? ' ' + c : '') + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
  function sp(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function arr(v) { return Array.isArray(v) ? v : (v == null ? [] : [v]); }

  // ---------- État ----------
  /* Chaque tracé est un calque. S.route / S.az / S.meas sont les calques en cours d'édition ;
     S.layers contient les autres calques (itinéraires, azimuts, mesures déjà tracés). */
  var ROUTE_PAL = ['#000761', '#0e7490', '#7a3db8', '#d97706', '#1a7f37', '#2563eb'];
  var AZ_PAL = ['#c6a24e', '#d97706', '#7a3db8', '#0e7490', '#b4232c'];
  var MEAS_PAL = ['#2563eb', '#0e7490', '#7a3db8', '#d97706'];
  var LSEL = [], LSELLAST = null;   // identifiants sélectionnés (Ctrl ou Maj pour en choisir plusieurs)
  var LIBT = { route: { one: 'itinéraire', many: 'Itinéraires', neu: 'Nouvel itinéraire' }, az: { one: 'parcours', many: 'Azimuts', neu: 'Nouveau parcours' } };
  var uidc = 0;
  function nid() { return Date.now() * 100 + (uidc++ % 100); }
  /* Valeurs par défaut des nouveaux tracés, réglables dans Réglages (enregistrées sur l'appareil). */
  var DEF_BASE = {
    route: { loop: true, opt: 'fastest', freeOrder: true, maxOn: false, maxKm: 10, avoidMotorway: true, noBack: true, snapChurch: true, flagNat: true, speed: 5 },
    az: { unit: 'deg', ref: 'true', decl: 0 },
    print: { paper: 'A4', tscale: 25000, line: false, roadmap: true, maps: true, onesheet: false }
  };
  var DEF = (function () {
    var d = JSON.parse(JSON.stringify(DEF_BASE));
    try { var s = JSON.parse(localStorage.getItem('scoutmap.defaults') || 'null'); if (s) Object.keys(d).forEach(function (k) { if (s[k] && typeof s[k] === 'object') Object.keys(d[k]).forEach(function (f) { if (s[k][f] !== undefined && typeof s[k][f] === typeof d[k][f]) d[k][f] = s[k][f]; }); }); } catch (e) { /* valeurs d'usine */ }
    return d;
  })();
  function saveDefaults() { try { localStorage.setItem('scoutmap.defaults', JSON.stringify(DEF)); } catch (e) { /* ignoré */ } }
  function freshRoute(prev, n) {
    var r = DEF.route;
    return { id: nid(), name: 'Itinéraire ' + n, color: ROUTE_PAL[(n - 1) % ROUTE_PAL.length], opt: r.opt, loop: r.loop, freeOrder: r.freeOrder,
      maxOn: r.maxOn, maxKm: r.maxKm, avoidMotorway: r.avoidMotorway, noBack: r.noBack, snapChurch: r.snapChurch, flagNat: r.flagNat, wps: [] };
  }
  function freshAz(prev, n) {
    return { id: nid(), name: 'Azimuts ' + n, color: AZ_PAL[(n - 1) % AZ_PAL.length], pts: [], unit: prev ? prev.unit : DEF.az.unit, ref: prev ? prev.ref : DEF.az.ref, decl: prev ? prev.decl : DEF.az.decl };
  }
  function freshMeas(prev, n) {
    return { id: nid(), name: 'Mesure ' + n, color: MEAS_PAL[(n - 1) % MEAS_PAL.length], mode: prev ? prev.mode : 'dist', pts: [] };
  }
  var GAME_PAL = ['#c0262d', '#2563eb', '#1a7f37', '#d97706', '#7a3db8'];
  function freshGame(prev, n) { return { id: nid(), name: 'Grand jeu ' + n, color: GAME_PAL[(n - 1) % GAME_PAL.length], shapes: [] }; }
  var FRESH = { route: freshRoute, az: freshAz, meas: freshMeas, game: freshGame };
  var TYPES = ['route', 'az', 'game'];
  var MODE_INFO = { route: { label: 'Itinéraire', icon: 'route' }, az: { label: 'Azimuts', icon: 'compass' }, meas: { label: 'Mesure', icon: 'ruler' }, game: { label: 'Grand jeu', icon: 'flag' } };
  var S = {
    name: '', pid: 0, mode: null, rail: 'route', panelOpen: true,
    ver: 5, base: 'scan25', ov: { contour: false, shade: false, slope: false, cadastre: false, hiking: true, lidar: false },
    detail: 'auto', speed: DEF.route.speed, profileSrc: 'route', dockOpen: true, dockH: 230,
    vis: { route: true, az: true, meas: true, game: true }, grid: { type: 'none' },
    route: freshRoute(null, 1), az: freshAz(null, 1), meas: freshMeas(null, 1), game: freshGame(null, 1), layers: [],
    gameStyle: { fill: '#c0262d', alpha: 0.35, stroke: '#c0262d', linked: true, weight: 3, size: 18, fontColor: '#12142b', dash: false },
    tracks: [], view: { c: [46.6, 2.5], z: 5.6 }
  };
  try {
    var raw = localStorage.getItem(KEY), old = false;
    if (!raw) { raw = localStorage.getItem('scoutmap.v2') || localStorage.getItem('scoutmap.v1'); old = true; }
    var saved = JSON.parse(raw || 'null');
    if (saved) {
      if (old) { delete saved.detail; delete saved.snap; if (saved.speed === 4) delete saved.speed; }
      ['route', 'az', 'meas', 'game', 'vis', 'ov', 'gameStyle', 'grid'].forEach(function (k) { if (saved[k]) Object.assign(S[k], saved[k]); });
      ['name', 'pid', 'mode', 'rail', 'panelOpen', 'base', 'detail', 'speed', 'profileSrc', 'dockOpen', 'dockH', 'tracks', 'view'].forEach(function (k) { if (saved[k] !== undefined) S[k] = saved[k]; });
      if (Array.isArray(saved.layers)) S.layers = saved.layers.filter(function (l) { return l && l.data && l.type && FRESH[l.type]; });
      if (['route', 'az', 'game'].indexOf(S.rail) < 0) S.rail = 'route';
      if ((saved.ver || 0) < 4) { S.base = 'otm'; S.ov.hiking = true; }   // nouveaux réglages par défaut
      if ((saved.ver || 0) < 5) S.base = 'scan25';                        // le SCAN 25 devient le fond par défaut
      S.ver = 6; if ((saved.ver || 0) < 5) S.layers = [];
      if (!S.view || !S.view.c) S.view = { c: [46.6, 2.5], z: 5.6 };
      delete S.route.profile;
    }
  } catch (e) { /* stockage indisponible */ }
  if (TYPES.indexOf(S.mode) < 0) S.mode = 'route';
  if (!S.pid) S.pid = nid();
  // Clé SCAN 25 : celle de l'appareil (collée dans l'appli) ou, à défaut, celle injectée au déploiement par le secret GitHub SCAN25_KEY.
  var SCAN25_BUILD = '__SCAN25_KEY__';
  function scan25Src() {
    var v = '', t = ''; try { v = (localStorage.getItem('scoutmap.scan25key') || '').trim(); t = localStorage.getItem('scouthub.token') || ''; } catch (e) { /* ignoré */ }
    return v || (/^[0-9a-f]{32}$/i.test(SCAN25_BUILD) ? SCAN25_BUILD : '') || 'hub';   // « hub » : tuiles demandées au serveur ScoutHub (clé IGN gardée côté serveur), sans connexion nécessaire
  }
  var SCAN25_OK = /^(hub|[0-9a-f]{32}|https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec)$/i;
  if (['plan', 'ortho', 'otm', 'osm', 'osmfr', 'cyclosm', 'etat'].indexOf(S.base) < 0 && !(S.base === 'scan25' && SCAN25_OK.test(scan25Src()))) S.base = 'otm';
  if (TYPES.indexOf(S.rail) >= 0 && S.mode && S.rail !== S.mode) S.rail = S.mode;
  if (!S.game.shapes) S.game.shapes = [];
  S.layers.forEach(function (l) { if (l.type === 'game' && !l.data.shapes) l.data.shapes = []; });
  function isMobile() { return !!(window.matchMedia && window.matchMedia('(max-width:860px)').matches); }
  if (isMobile() && !saved) { S.panelOpen = false; S.dockOpen = false; }
  ['route', 'az', 'meas', 'game'].forEach(function (k) { if (!S[k].id) S[k].id = nid(); });
  S.layers.forEach(function (l) { if (!l.data.id) l.data.id = nid(); });
  // ---------- Historique (annuler / rétablir) ----------
  var H = { undo: [], redo: [], lastKey: null, lastSnap: null, lastT: 0, ready: false };
  function hKey() {
    return JSON.stringify([S.route, S.az, S.meas, S.game, S.layers.map(function (l) { return { t: l.type, v: l.vis, d: l.data }; }), S.vis, S.tracks],
      function (k, v) { return k === 'place' ? undefined : v; });
  }
  function hSnap() { return JSON.stringify({ route: S.route, az: S.az, meas: S.meas, game: S.game, layers: S.layers, vis: S.vis, tracks: S.tracks, res: RT.route }); }
  function hButtons() {
    var u = document.getElementById('btn-undo'), r = document.getElementById('btn-redo');
    if (u) u.disabled = !H.undo.length; if (r) r.disabled = !H.redo.length;
  }
  // Appelée après chaque modification : les modifications rapprochées (frappe, glissement) forment une seule étape.
  function hTrack() {
    if (!H.ready) return;
    var k = hKey(); if (k === H.lastKey) return;
    var now = Date.now();
    if (H.lastSnap && now - H.lastT > 500) { H.undo.push(H.lastSnap); if (H.undo.length > 60) H.undo.shift(); }
    H.redo = []; H.lastT = now; H.lastKey = k; H.lastSnap = hSnap(); hButtons();
  }
  var saveTimer;
  function persist() {
    updateHint(); hTrack();
    clearTimeout(saveTimer);
    if (VIEWER) return;
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* quota */ }
      projAutosave();
    }, 250);
  }

  var RT = { route: null, elevCache: {}, routeCtl: null, tool: 'pan' };

