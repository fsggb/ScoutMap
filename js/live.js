/* ScoutMap : jeu en direct — positions partagées, chat et lien/QR code pour inviter les autres chefs.
   Les échanges passent par une base Firebase (Google) mais sont chiffrés (AES-GCM) avec une clé qui n'est que dans le lien : la base ne voit rien de lisible.
   Seul le chef qui a créé le salon peut modifier le jeu ; les autres le reçoivent en lecture seule. */
(function () {
  'use strict';
  var SM = window.SM, S = SM.S, map = SM.map, esc = SM.esc;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var CFG = window.SM_FIREBASE || null;
  var FB = 'https://www.gstatic.com/firebasejs/10.12.5/';
  var COLORS = ['#c0262d', '#2563eb', '#1a7f37', '#d97706', '#7a3db8', '#0e7490', '#d6336c', '#a16207', '#4d7c0f', '#475569'];
  var ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
  var st = { room: null, key: null, ck: null, owner: false, uid: null, name: '', sharing: false, db: null, people: {}, markers: {}, offset: 0, unread: 0, panelOpen: false, watch: null, lastSend: 0, lastFix: null, lastGame: '', timers: [], refs: [], fbp: null, closed: false };
  var gLive = L.layerGroup().addTo(map);
  try { st.name = localStorage.getItem('scoutmap.live.name') || ''; } catch (e) { /* ignoré */ }

  // ---------- Utilitaires ----------
  function rand(n) { var a = crypto.getRandomValues(new Uint8Array(n)), s = ''; for (var i = 0; i < n; i++) s += ALPHA[a[i] % ALPHA.length]; return s; }
  function b64u(buf) { var s = '', u = new Uint8Array(buf); for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function importKey(k) { return crypto.subtle.importKey('raw', unb64u(k), 'AES-GCM', false, ['encrypt', 'decrypt']); }
  function enc(obj) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, st.ck, new TextEncoder().encode(JSON.stringify(obj))).then(function (ct) {
      var out = new Uint8Array(12 + ct.byteLength); out.set(iv); out.set(new Uint8Array(ct), 12); return b64u(out);
    });
  }
  function dec(str) {
    var u = unb64u(str);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, st.ck, u.slice(12)).then(function (b) { return JSON.parse(new TextDecoder().decode(b)); });
  }
  function colorOf(uid) { var h = 0; for (var i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0; return COLORS[h % COLORS.length]; }
  function now() { return Date.now() + st.offset; }
  function ago(t) {
    var s = Math.max(0, Math.round((now() - t) / 1000));
    return s < 5 ? 'à l’instant' : s < 60 ? 'il y a ' + s + ' s' : s < 3600 ? 'il y a ' + Math.round(s / 60) + ' min' : 'il y a ' + Math.round(s / 3600) + ' h';
  }
  function hhmm(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function toast(m) { SM.toast(m); }
  function roomRef() { return st.db.ref('rooms/' + st.room); }
  function linkOf() { return location.href.split('#')[0].split('?')[0] + '?salle=' + st.room + '#k=' + st.key; }
  function configured() { return !!(CFG && CFG.apiKey && CFG.databaseURL); }

  // ---------- Firebase (chargé seulement quand on en a besoin) ----------
  function script(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('Chargement impossible')); }; document.head.appendChild(s); }); }
  function fb() {
    if (st.fbp) return st.fbp;
    st.fbp = script(FB + 'firebase-app-compat.js').then(function () { return script(FB + 'firebase-auth-compat.js'); }).then(function () { return script(FB + 'firebase-database-compat.js'); }).then(function () {
      firebase.initializeApp(CFG); return firebase.auth().signInAnonymously();
    }).then(function (cred) {
      st.uid = cred.user.uid; st.db = firebase.database();
      st.db.ref('.info/serverTimeOffset').on('value', function (v) { st.offset = v.val() || 0; });
    }).catch(function (e) { st.fbp = null; throw e; });
    return st.fbp;
  }

  // ---------- Interface ----------
  var btn, panel, dlg;
  function build() {
    if (panel) return;
    btn = document.createElement('button'); btn.id = 'live-btn'; btn.type = 'button'; btn.hidden = true; btn.title = 'Salon : chefs connectés et messages'; btn.setAttribute('aria-label', 'Salon');
    btn.innerHTML = '<svg class="ic"><use href="#i-people"/></svg><i class="lv-badge" hidden></i>';
    var z = $('.zoomctl'); if (z) z.appendChild(btn); else document.body.appendChild(btn);
    btn.addEventListener('click', function () { togglePanel(); });
    panel = document.createElement('div'); panel.id = 'live-panel'; panel.hidden = true;
    panel.innerHTML =
      '<div class="lv-head"><b id="lv-title">Salon</b><span id="lv-count"></span><button type="button" class="ibtn" id="lv-x" aria-label="Fermer"><svg class="ic"><use href="#i-x"/></svg></button></div>' +
      '<label class="lv-share"><input type="checkbox" id="lv-sharing"><span>Je partage ma position</span></label>' +
      '<div class="lv-people" id="lv-people"></div>' +
      '<div class="lv-chat" id="lv-chat" aria-live="polite"></div>' +
      '<form class="lv-form" id="lv-form"><input id="lv-msg" type="text" maxlength="400" placeholder="Écrire aux autres chefs…" autocomplete="off"><button type="submit" class="btn-primary sm">Envoyer</button></form>' +
      '<div class="lv-foot"><button type="button" class="btn-ghost sm" id="lv-invite"><svg class="ic"><use href="#i-people"/></svg>Inviter</button><button type="button" class="btn-ghost sm" id="lv-meet" title="Ouvre un appel Google Meet et envoie le lien dans le salon">Appel vocal</button><button type="button" class="btn-ghost sm danger" id="lv-end"></button></div>';
    ($('.stage') || document.body).appendChild(panel);
    dlg = document.createElement('dialog'); dlg.id = 'dlg-live'; dlg.className = 'dlg-live'; document.body.appendChild(dlg);
    $('#lv-x').addEventListener('click', function () { togglePanel(false); });
    $('#lv-sharing').addEventListener('change', function () { this.checked ? startSharing() : stopSharing(); });
    $('#lv-form').addEventListener('submit', function (e) { e.preventDefault(); var i = $('#lv-msg'), m = i.value.trim(); if (m) { sendChat(m); i.value = ''; } });
    $('#lv-invite').addEventListener('click', showInvite);
    $('#lv-end').addEventListener('click', endOrLeave);
    $('#lv-meet').addEventListener('click', function () { var w = window.open('https://meet.google.com/new', '_blank'); sendChat('📞 Appel vocal : ouvrez Google Meet (meet.google.com) et rejoignez le code que je vous envoie.'); if (!w) toast('Autorisez l’ouverture de fenêtres pour lancer Meet.'); });
    $('#lv-people').addEventListener('click', function (e) { var r = e.target.closest('[data-u]'); if (!r) return; var p = st.people[r.dataset.u]; if (p) map.setView([p.lat, p.lon], Math.max(map.getZoom(), 15), { animate: true }); });
  }
  function togglePanel(on) {
    st.panelOpen = on === undefined ? !st.panelOpen : on; panel.hidden = !st.panelOpen;
    if (st.panelOpen) { st.unread = 0; badge(); var c = $('#lv-chat'); c.scrollTop = c.scrollHeight; renderPeople(); }
  }
  function badge() { var b = $('.lv-badge', btn); b.hidden = !st.unread; b.textContent = st.unread > 9 ? '9+' : st.unread; }
  function dlgOpen(html) { dlg.innerHTML = html + '<button class="dlg-x" type="button" data-x aria-label="Fermer"><svg class="ic"><use href="#i-x"/></svg></button>'; $('[data-x]', dlg).addEventListener('click', function () { dlg.close(); }); if (!dlg.open) dlg.showModal(); return dlg; }

  // ---------- Création et accès ----------
  function askName(title, okLabel, cb) {
    var d = dlgOpen('<h2>' + esc(title) + '</h2><p class="dlg-sub">Votre prénom s’affichera à côté de votre position et de vos messages.</p>' +
      '<label class="pdf-name">Prénom <input id="lv-name" type="text" maxlength="24" autocomplete="given-name" value="' + esc(st.name) + '"></label>' +
      '<div class="dlg-actions"><button class="btn-ghost" id="lv-cancel" type="button">Annuler</button><button class="btn-primary" id="lv-ok" type="button">' + esc(okLabel) + '</button></div>');
    var i = $('#lv-name', d); setTimeout(function () { i.focus(); i.select(); }, 50);
    function go() { var n = i.value.trim(); if (!n) { i.focus(); return; } st.name = n; try { localStorage.setItem('scoutmap.live.name', n); } catch (e) { /* ignoré */ } d.close(); cb(n); }
    $('#lv-ok', d).addEventListener('click', go); i.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    $('#lv-cancel', d).addEventListener('click', function () { d.close(); });
  }
  // Le chef qui crée le salon
  function start() {
    build();
    if (!configured()) { dlgOpen('<h2>Jeu en direct</h2><p class="dlg-sub">Le partage en direct n’est pas encore activé sur ce site : il manque la configuration du service (Firebase).</p><div class="dlg-actions"><button class="btn-primary" type="button" data-x2>Compris</button></div>'); $('[data-x2]', dlg).addEventListener('click', function () { dlg.close(); }); return; }
    if (!window.crypto || !crypto.subtle) { toast('Le partage en direct demande une connexion sécurisée (https).'); return; }
    if (st.room) { showInvite(); return; }
    if (!S.game.shapes.length) { toast('Dessinez d’abord quelque chose sur la carte du jeu, puis partagez-le.'); return; }
    askName('Partager ce jeu en direct', 'Créer le salon', function () {
      toast('Création du salon…');
      fb().then(function () { st.room = rand(16); st.key = b64u(crypto.getRandomValues(new Uint8Array(16))); return importKey(st.key); }).then(function (k) {
        st.ck = k; st.owner = true;
        return roomRef().child('owner').set(st.uid);
      }).then(function () { return roomRef().update({ created: firebase.database.ServerValue.TIMESTAMP }); }).then(function () { return publishGame(); }).then(function () {
        active(); showInvite(); startSharing(); try { sessionStorage.setItem('scoutmap.live', JSON.stringify({ room: st.room, key: st.key, owner: true })); } catch (e) { /* ignoré */ }
      }).catch(function (e) { st.room = null; toast('Impossible de créer le salon : ' + (e && e.message ? e.message : 'service indisponible') + '.'); });
    });
  }
  // Un chef qui arrive par le QR code
  function join(room, key) {
    build();
    if (!configured()) { toast('Le partage en direct n’est pas activé sur ce site.'); return; }
    st.room = room; st.key = key;
    importKey(key).then(function (k) { st.ck = k; }).catch(function () { st.room = null; toast('Lien incomplet : scannez de nouveau le QR code.'); });
    askName('Rejoindre le jeu en direct', 'Rejoindre', function () {
      toast('Connexion au salon…');
      fb().then(function () { return roomRef().child('owner').once('value'); }).then(function (v) {
        if (!v.exists()) throw new Error('Ce salon n’existe plus.');
        active(); return loadGame();
      }).then(function () { startSharing(); }).catch(function (e) { toast(e && e.message ? e.message : 'Connexion impossible.'); });
    });
  }
  function active() {
    btn.hidden = false; $('#lv-title').textContent = 'Salon · ' + (S.game.name || 'Grand jeu'); $('#lv-end').textContent = st.owner ? 'Terminer le salon' : 'Quitter';
    $('#lv-invite').hidden = false;
    listen(); togglePanel(true);
    st.timers.push(setInterval(function () { renderPeople(); }, 5000));
    if (st.owner) st.timers.push(setInterval(function () { publishGame(); }, 4000));
  }

  // ---------- Le jeu (envoyé par le chef, reçu en lecture seule par les autres) ----------
  function snapshot() { return { app: 'ScoutMap', v: 1, name: S.game.name || S.name || 'Grand jeu', rail: 'game', base: S.base, ov: S.ov, route: { wps: [] }, az: { pts: [] }, tracks: [], game: S.game }; }
  function publishGame() {
    if (!st.owner || !st.room) return Promise.resolve();
    var js = JSON.stringify(snapshot()); if (js === st.lastGame) return Promise.resolve(); st.lastGame = js;
    return enc(snapshot()).then(function (e) { return roomRef().update({ game: e, gameT: firebase.database.ServerValue.TIMESTAMP }); }).catch(function () { st.lastGame = ''; });
  }
  function loadGame(first) {
    return roomRef().child('game').once('value').then(function (v) {
      if (!v.exists()) throw new Error('Le chef n’a encore rien partagé.');
      return dec(v.val());
    }).then(function (data) {
      if (data.name) $('#lv-title').textContent = 'Salon · ' + data.name;
      SM.loadProject(data, null, { keepView: !!st.loaded }); st.loaded = true;
    }).catch(function (e) { if (e && e.name === 'OperationError') throw new Error('Lien incorrect (clé invalide) : scannez de nouveau le QR code.'); throw e; });
  }

  // ---------- Écoute du salon ----------
  function listen() {
    var r = roomRef(), t0 = now();
    function on(ref, ev, fn) { ref.on(ev, fn); st.refs.push([ref, ev, fn]); }
    on(r.child('pos'), 'value', function (snap) {
      var v = snap.val() || {}, ids = Object.keys(v), left = ids.length, next = {};
      if (!left) { st.people = {}; renderPeople(); return; }
      ids.forEach(function (u) {
        dec(v[u].d).then(function (d) { d.t = v[u].t; d.u = u; next[u] = d; }).catch(function () { /* donnée illisible : ignorée */ }).then(function () { if (--left === 0) { st.people = next; renderPeople(); } });
      });
    });
    on(r.child('chat').orderByChild('t').limitToLast(80), 'child_added', function (snap) {
      var m = snap.val(); dec(m.d).then(function (d) { addChat(d, m.t, snap.key); }).catch(function () { /* ignoré */ });
    });
    on(r.child('closed'), 'value', function (v) { if (v.val() && !st.owner) finish('Le chef a terminé le salon.'); });
    if (!st.owner) on(r.child('gameT'), 'value', function () { if (st.loaded) loadGame().catch(function () { /* ignoré */ }); });
  }
  var seen = {};
  function addChat(d, t, key) {
    if (seen[key]) return; seen[key] = 1;
    var box = $('#lv-chat'), mine = d.u === st.uid, el = document.createElement('div');
    el.className = 'lv-msg' + (mine ? ' mine' : '');
    el.innerHTML = '<span class="lv-who" style="color:' + esc(d.c || '#475569') + '">' + esc(d.n || '?') + '</span> <time>' + hhmm(t || now()) + '</time><div>' + esc(d.m) + '</div>';
    box.appendChild(el); box.scrollTop = box.scrollHeight;
    if (!mine && !st.panelOpen && (now() - (t || 0)) < 30000) { st.unread++; badge(); }
  }
  function sendChat(m) {
    if (!st.room) return;
    enc({ u: st.uid, n: st.name, c: colorOf(st.uid), m: m.slice(0, 400) }).then(function (e) { return roomRef().child('chat').push({ d: e, t: firebase.database.ServerValue.TIMESTAMP }); }).catch(function () { toast('Message non envoyé.'); });
  }

  // ---------- Positions ----------
  function startSharing() {
    if (!navigator.geolocation) { toast('La localisation n’est pas disponible sur cet appareil.'); return; }
    if (st.watch !== null) return;
    st.sharing = true; $('#lv-sharing').checked = true;
    st.watch = navigator.geolocation.watchPosition(function (pos) {
      var c = pos.coords; st.lastFix = { lat: +c.latitude.toFixed(6), lon: +c.longitude.toFixed(6), acc: Math.round(c.accuracy || 0) };
      var t = Date.now(); if (t - st.lastSend < 2500) return; sendPos();
    }, function (e) {
      if (e && e.code === 1) { toast('Position refusée : autorisez la localisation pour la partager.'); stopSharing(); }
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
    st.hb = setInterval(function () { if (st.lastFix && Date.now() - st.lastSend > 12000) sendPos(); }, 6000);
  }
  function sendPos() {
    if (!st.lastFix || !st.room || !st.sharing) return; st.lastSend = Date.now();
    enc({ n: st.name, c: colorOf(st.uid), lat: st.lastFix.lat, lon: st.lastFix.lon, acc: st.lastFix.acc }).then(function (e) {
      return roomRef().child('pos/' + st.uid).set({ d: e, t: firebase.database.ServerValue.TIMESTAMP });
    }).catch(function () { /* hors réseau : on réessaie au prochain point */ });
  }
  function stopSharing() {
    st.sharing = false; if ($('#lv-sharing')) $('#lv-sharing').checked = false;
    if (st.watch !== null) { navigator.geolocation.clearWatch(st.watch); st.watch = null; }
    clearInterval(st.hb);
    if (st.room && st.db) roomRef().child('pos/' + st.uid).remove().catch(function () { /* ignoré */ });
  }
  function renderPeople() {
    if (!panel) return;
    var ids = Object.keys(st.people).sort(function (a, b) { return a === st.uid ? -1 : b === st.uid ? 1 : (st.people[a].n || '').localeCompare(st.people[b].n || ''); });
    $('#lv-count').textContent = ids.length ? ids.length + ' en ligne' : '';
    $('#lv-people').innerHTML = ids.length ? ids.map(function (u) {
      var p = st.people[u], old = now() - p.t > 90000;
      return '<button type="button" class="lv-p' + (old ? ' old' : '') + '" data-u="' + esc(u) + '"><i style="background:' + esc(p.c) + '">' + esc((p.n || '?').charAt(0).toUpperCase()) + '</i><b>' + esc(p.n || '?') + (u === st.uid ? ' (moi)' : '') + '</b><small>' + ago(p.t) + ' · ±' + p.acc + ' m</small></button>';
    }).join('') : '<p class="lv-none">Personne ne partage sa position pour l’instant.</p>';
    // marqueurs
    Object.keys(st.markers).forEach(function (u) { if (!st.people[u]) { gLive.removeLayer(st.markers[u]); delete st.markers[u]; } });
    ids.forEach(function (u) {
      var p = st.people[u], old = now() - p.t > 90000, html = '<div class="lv-pin' + (old ? ' old' : '') + '" style="background:' + esc(p.c) + '">' + esc((p.n || '?').charAt(0).toUpperCase()) + '</div><span class="lv-tag">' + esc(p.n || '?') + '</span>';
      if (st.markers[u]) { st.markers[u].setLatLng([p.lat, p.lon]); st.markers[u].setIcon(L.divIcon({ className: 'lv-wrap', html: html, iconSize: [0, 0] })); }
      else st.markers[u] = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'lv-wrap', html: html, iconSize: [0, 0] }), zIndexOffset: 3500, title: p.n }).addTo(gLive);
    });
  }

  // ---------- Inviter (QR code) ----------
  function showInvite() {
    if (!st.room) return;
    var url = linkOf(), qr = qrcode(0, 'M'); qr.addData(url); qr.make();
    var d = dlgOpen('<h2>Inviter les autres chefs</h2><p class="dlg-sub">Ils scannent ce QR code avec l’appareil photo de leur téléphone : ils arrivent sur le jeu, saisissent leur prénom et partagent leur position. Tout est chiffré, et seul vous pouvez modifier le jeu.</p>' +
      '<div class="lv-qr">' + qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }) + '</div>' +
      '<input class="lv-link" id="lv-link" type="text" readonly value="' + esc(url) + '" aria-label="Lien du salon">' +
      '<div class="dlg-actions"><button class="btn-ghost" id="lv-copy" type="button">Copier le lien</button>' + (navigator.share ? '<button class="btn-ghost" id="lv-share" type="button">Envoyer…</button>' : '') + '<button class="btn-primary" id="lv-done" type="button">Terminé</button></div>');
    $('#lv-copy', d).addEventListener('click', function () { var i = $('#lv-link', d); i.select(); try { navigator.clipboard.writeText(url).then(function () { toast('Lien copié.'); }, function () { document.execCommand('copy'); toast('Lien copié.'); }); } catch (e) { document.execCommand('copy'); toast('Lien copié.'); } });
    var sh = $('#lv-share', d); if (sh) sh.addEventListener('click', function () { navigator.share({ title: 'Jeu en direct', text: 'Rejoins le jeu en direct sur ScoutMap', url: url }).catch(function () { /* annulé */ }); });
    $('#lv-done', d).addEventListener('click', function () { d.close(); });
  }

  // ---------- Fin ----------
  function endOrLeave() {
    if (!st.room) return;
    if (!confirm(st.owner ? 'Terminer le salon ? Les autres chefs seront déconnectés et les positions effacées.' : 'Quitter le salon ?')) return;
    var r = roomRef(), p = st.owner ? r.update({ closed: true }).then(function () { return r.remove(); }) : Promise.resolve();
    stopSharing(); p.catch(function () { /* ignoré */ }).then(function () { finish(st.owner ? 'Salon terminé.' : 'Vous avez quitté le salon.'); });
  }
  function finish(msg) {
    stopSharing(); st.refs.forEach(function (x) { try { x[0].off(x[1], x[2]); } catch (e) { /* ignoré */ } }); st.refs = [];
    st.timers.forEach(clearInterval); st.timers = [];
    gLive.clearLayers(); st.markers = {}; st.people = {}; seen = {};
    if (btn) btn.hidden = true; if (panel) panel.hidden = true;
    st.room = null; st.key = null; st.owner = false; st.lastGame = ''; if ($('#lv-chat')) $('#lv-chat').innerHTML = '';
    try { sessionStorage.removeItem('scoutmap.live'); } catch (e) { /* ignoré */ }
    toast(msg);
  }

  // ---------- Branchements ----------
  SM.live = { start: start, join: join, active: function () { return !!st.room; } };
  var P; try { P = new URLSearchParams(location.search); } catch (e) { P = null; }
  var room = P && P.get('salle'), km = /[#&]k=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (room && km) { build(); setTimeout(function () { join(room, km[1]); }, 400); }
  else if (room) { build(); setTimeout(function () { toast('Lien incomplet : scannez de nouveau le QR code (il manque la clé).'); }, 600); }
  var gb = $('#game-live'); if (gb) gb.addEventListener('click', start);
})();
