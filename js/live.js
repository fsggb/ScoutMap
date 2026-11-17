/* ScoutMap : partage en direct d'un itinéraire, d'azimuts ou d'un grand jeu — positions partagées, discussion et lien/QR code
   pour inviter les autres chefs. Les échanges passent par le serveur Cloudflare de ScoutHub (une connexion WebSocket par partage),
   mais sont chiffrés (AES-GCM) avec une clé qui n'est que dans le lien : le serveur ne voit rien de lisible.
   Seul le chef qui a lancé le partage (ou un co-administrateur) peut modifier la carte ; les autres la reçoivent en lecture seule. */
(function () {
  'use strict';
  var SM = window.SM, S = SM.S, map = SM.map, esc = SM.esc;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var DIRECT = 'wss://scouthub.fsggb.workers.dev/direct/';
  var COLORS = ['#c0262d', '#2563eb', '#1a7f37', '#d97706', '#7a3db8', '#0e7490', '#d6336c', '#a16207', '#4d7c0f', '#475569'];
  var ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
  var st = { mode: 'game', av: null, room: null, key: null, ck: null, owner: false, uid: null, name: '', sharing: false, db: null, people: {}, markers: {}, offset: 0, unread: 0, panelOpen: false, watch: null, lastSend: 0, lastFix: null, lastGame: '', timers: [], ws: null, psec: null, posRaw: {}, carte: null, fini: true, essais: 0 };
  var gLive = L.layerGroup().addTo(map);
  try { st.name = localStorage.getItem('scoutmap.live.name') || ''; } catch (e) { /* ignoré */ }
  // Identifiant aléatoire de cet appareil
  try { st.uid = localStorage.getItem('scoutmap.live.uid'); if (!st.uid) { st.uid = Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(12)), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); localStorage.setItem('scoutmap.live.uid', st.uid); } } catch (e) { st.uid = 'x' + Date.now().toString(36); }

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
  // ---------- Avatar : une icône (et une couleur) choisies parmi celles du jeu ----------
  try { st.av = JSON.parse(localStorage.getItem('scoutmap.live.avatar') || 'null'); } catch (e) { st.av = null; }
  var avWait = false;
  function avInner(o) {
    var d = o && o.a && window.SM_ICONS && window.SM_ICONS[o.a];
    if (o && o.a && !d && !avWait && SM.game && SM.game.loadThemes) { avWait = true; SM.game.loadThemes().then(function () { renderPeople(); }).catch(function () { /* hors ligne */ }); }
    return d ? '<svg viewBox="0 0 512 512"><path d="' + d + '" fill="#fff"/></svg>' : esc(((o && o.n) || '?').charAt(0).toUpperCase());
  }
  function myColor() { return (st.av && st.av.c) || colorOf(st.uid); }
  function avatarDialog() {
    function open() {
      var th = SM.game && SM.game.theme && SM.game.theme(), list = (th ? th.el.filter(function (e) { return !e.art; }) : []).concat(window.SM_COMMON || []);
      var seen = {}; list = list.filter(function (e) { if (seen[e.i]) return false; seen[e.i] = 1; return !!(window.SM_ICONS && window.SM_ICONS[e.i]); });
      var cur = { a: st.av && st.av.i || '', c: myColor() };
      var d = dlgOpen('<h2>Mon avatar</h2><p class="dlg-sub">Choisissez l’icône et la couleur qui vous représentent sur la carte et dans la discussion.</p>' +
        '<div class="lv-avc" id="lv-avc">' + COLORS.map(function (c) { return '<button type="button" data-c="' + c + '" style="background:' + c + '" aria-label="Couleur"></button>'; }).join('') + '</div>' +
        '<div class="lv-avg" id="lv-avg">' + list.map(function (e) { return '<button type="button" data-i="' + esc(e.i) + '" title="' + esc(e.l) + '"><svg viewBox="0 0 512 512"><path d="' + window.SM_ICONS[e.i] + '" fill="#fff"/></svg></button>'; }).join('') + '</div>' +
        '<div class="dlg-actions"><button class="btn-ghost" id="lv-av-no" type="button">Initiale seulement</button><button class="btn-primary" id="lv-av-ok" type="button">Enregistrer</button></div>');
      function paint() { $$('#lv-avg button', d).forEach(function (b) { b.style.background = cur.c; b.classList.toggle('on', b.dataset.i === cur.a); }); $$('#lv-avc button', d).forEach(function (b) { b.classList.toggle('on', b.dataset.c === cur.c); }); }
      $('#lv-avc', d).addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { cur.c = b.dataset.c; paint(); } });
      $('#lv-avg', d).addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { cur.a = b.dataset.i; paint(); } });
      $('#lv-av-no', d).addEventListener('click', function () { cur.a = ''; paint(); });
      $('#lv-av-ok', d).addEventListener('click', function () {
        st.av = { i: cur.a, c: cur.c }; try { localStorage.setItem('scoutmap.live.avatar', JSON.stringify(st.av)); } catch (e) { /* ignoré */ }
        d.close(); paintMyAv(); st.lastSend = 0; sendPos(); renderPeople();
      });
      paint();
    }
    if (SM.game && SM.game.loadThemes) SM.game.loadThemes().then(open).catch(open); else open();
  }
  function paintMyAv() { var b = $('#lv-myav'); if (b) { b.style.background = myColor(); b.innerHTML = avInner({ a: st.av && st.av.i, n: st.name }); } }
  function colorOf(uid) { var h = 0; for (var i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0; return COLORS[h % COLORS.length]; }
  function now() { return Date.now() + st.offset; }
  function ago(t) {
    var s = Math.max(0, Math.round((now() - t) / 1000));
    return s < 5 ? 'à l’instant' : s < 60 ? 'il y a ' + s + ' s' : s < 3600 ? 'il y a ' + Math.round(s / 60) + ' min' : 'il y a ' + Math.round(s / 3600) + ' h';
  }
  function hhmm(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function toast(m) { SM.toast(m); }
  function canEdit() { return !!(st.owner || st.admin); }
  function adminLink() { return linkOf() + '&a=' + st.atok; }
  function linkOf() { return location.href.split('#')[0].split('?')[0] + '?direct=' + st.room + '#k=' + st.key; }
  function configured() { return typeof WebSocket !== 'undefined'; }
  // Mots selon ce qui est partagé : jamais « jeu » pour un itinéraire ou des azimuts
  function quoi() { return st.mode === 'az' ? 'les azimuts' : st.mode === 'route' ? 'l’itinéraire' : 'le grand jeu'; }
  function Quoi() { var q = quoi(); return q.charAt(0).toUpperCase() + q.slice(1); }

  // ---------- Connexion au serveur Cloudflare (WebSocket, reconnexion automatique) ----------
  // Messages reçus : etat (à la connexion), carte, pos, sanspos, msg, fin, revoque, absent.
  function envoi(o) { if (st.ws && st.ws.readyState === 1) { st.ws.send(JSON.stringify(o)); return true; } return false; }
  function connect(opts) {
    return new Promise(function (ok, ko) {
      var premier = true, ws;
      try { ws = new WebSocket(DIRECT + st.room); } catch (e) { ko(new Error('Connexion impossible')); return; }
      st.ws = ws; st.fini = false;
      ws.onopen = function () { ws.send(JSON.stringify({ t: 'bonjour', uid: st.uid, creer: !!(opts && opts.creer), proprio: st.psec || undefined, adm: st.atok || (opts && opts.adm) || undefined })); };
      ws.onmessage = function (e) {
        var m; try { m = JSON.parse(e.data); } catch (x) { return; }
        if (m.t === 'absent') { if (premier) { premier = false; st.fini = true; ws.close(); ko(new Error('Ce partage en direct est terminé ou n’existe plus.')); } else finish('Le partage en direct est terminé.'); return; }
        if (m.t === 'etat') {
          st.essais = 0; st.offset = (m.maintenant || Date.now()) - Date.now(); st.owner = !!m.proprio; st.admin = !!m.admin && !m.proprio;
          if (m.admRefuse && !m.admin) { st.atok = null; toast('Lien administrateur refusé ou révoqué : vous suivez ' + quoi() + ' en lecture seule.'); }
          if (m.carte) st.carte = { d: m.carte, at: m.carteT };
          st.posRaw = m.pos || {}; decodePos();
          (m.chat || []).forEach(function (c) { recuMsg(c); });
          if (premier) { premier = false; ok(m); } else if (!st.owner) { carteRecue(); }
          return;
        }
        if (m.t === 'carte') { st.carte = { d: m.d, at: m.at }; if (!st.owner) carteRecue(); return; }
        if (m.t === 'pos') { st.posRaw[m.u] = { d: m.d, at: m.at }; decodePos(); return; }
        if (m.t === 'sanspos') { delete st.posRaw[m.u]; decodePos(); return; }
        if (m.t === 'msg') { recuMsg(m); return; }
        if (m.t === 'fin') { if (!st.owner) finish('Le chef a terminé le partage en direct.'); return; }
        if (m.t === 'revoque') { st.admin = false; st.atok = null; saveSession(); roleText(); toast('Votre lien administrateur a été révoqué : vous suivez ' + quoi() + ' en lecture seule.'); }
      };
      ws.onclose = function () {
        if (premier) { premier = false; ko(new Error('Service de partage injoignable.')); return; }
        if (st.fini || !st.room || st.ws !== ws) return;
        // coupure (réseau, mise en veille) : reconnexion, de plus en plus espacée
        var attente = Math.min(30000, 1000 * Math.pow(2, st.essais++));
        setTimeout(function () { if (!st.fini && st.room && st.ws === ws) connect().catch(function () { /* nouvel essai à la prochaine coupure */ }); }, attente);
      };
    });
  }
  function decodePos() {
    var ids = Object.keys(st.posRaw), left = ids.length, next = {};
    if (!left) { st.people = {}; renderPeople(); return; }
    ids.forEach(function (u) {
      var r = st.posRaw[u];
      dec(r.d).then(function (d) { d.t = r.at; d.u = u; next[u] = d; }).catch(function () { /* illisible : ignorée */ }).then(function () { if (--left === 0) { st.people = next; renderPeople(); } });
    });
  }
  function recuMsg(m) { dec(m.d).then(function (d) { addChat(d, m.at, m.k); }).catch(function () { /* ignoré */ }); }
  function carteRecue() {
    if (!st.loaded) return;
    if (st.admin) { if (st.lastGame && JSON.stringify(snapshot()) !== st.lastGame) return; loadGame(false, true).catch(function () { /* ignoré */ }); return; }
    loadGame().catch(function () { /* ignoré */ });
  }

  // ---------- Interface ----------
  var btn, panel, dlg;
  function build() {
    if (panel) return;
    btn = document.createElement('button'); btn.id = 'live-btn'; btn.type = 'button'; btn.hidden = true; btn.title = 'Partage en direct : discussion et chefs connectés'; btn.setAttribute('aria-label', 'Partage en direct');
    btn.innerHTML = '<svg class="ic"><use href="#i-people"/></svg><i class="lv-badge" hidden></i>';
    var z = $('.zoomctl'); if (z) z.appendChild(btn); else document.body.appendChild(btn);
    btn.addEventListener('click', function () { togglePanel(); });
    panel = document.createElement('div'); panel.id = 'live-panel'; panel.hidden = true;
    panel.innerHTML =
      '<div class="lv-head"><b id="lv-title">Partage en direct</b><button type="button" class="ibtn" id="lv-x" aria-label="Fermer"><svg class="ic"><use href="#i-x"/></svg></button></div>' +
      '<div class="lv-tabs" role="tablist"><button type="button" role="tab" data-lt="chat" class="on">Discussion <i class="lv-tb" id="lv-tb" hidden></i></button><button type="button" role="tab" data-lt="people">Chefs <span id="lv-count"></span></button></div>' +
      '<p class="lv-role" id="lv-role"></p>' +
      '<a class="lv-call" id="lv-call" target="_blank" rel="noopener" hidden>📞 Appel en cours : rejoindre</a>' +
      '<div class="lv-pane" data-lp="chat"><div class="lv-chat" id="lv-chat" aria-live="polite"></div>' +
      '<form class="lv-form" id="lv-form"><input id="lv-msg" type="text" maxlength="400" placeholder="Écrire aux autres chefs…" autocomplete="off"><button type="submit" class="btn-primary sm">Envoyer</button></form></div>' +
      '<div class="lv-pane" data-lp="people" hidden><div class="lv-me"><button type="button" class="lv-myav" id="lv-myav" title="Changer mon avatar"></button><span>Mon avatar <small>(icône et couleur)</small></span><button type="button" class="btn-ghost sm" id="lv-avedit">Changer</button></div><label class="lv-share"><input type="checkbox" id="lv-sharing"><span>Je partage ma position</span></label><div class="lv-people" id="lv-people"></div></div>' +
      '<div class="lv-foot"><button type="button" class="btn-ghost sm" id="lv-invite"><svg class="ic"><use href="#i-people"/></svg>Inviter</button><button type="button" class="btn-ghost sm" id="lv-meet" title="Lancer un appel vocal Google Meet et envoyer le lien aux chefs">📞 Appel vocal</button><button type="button" class="btn-ghost sm danger" id="lv-end"></button></div>';
    ($('.stage') || document.body).appendChild(panel);
    dlg = document.createElement('dialog'); dlg.id = 'dlg-live'; dlg.className = 'dlg-live'; document.body.appendChild(dlg);
    $('#lv-x').addEventListener('click', function () { togglePanel(false); });
    $('#lv-sharing').addEventListener('change', function () { this.checked ? startSharing() : stopSharing(); });
    $('#lv-form').addEventListener('submit', function (e) { e.preventDefault(); var i = $('#lv-msg'), m = i.value.trim(); if (m) { sendChat(m); i.value = ''; } });
    $('#lv-invite').addEventListener('click', showInvite);
    $('#lv-avedit').addEventListener('click', avatarDialog); $('#lv-myav').addEventListener('click', avatarDialog);
    $('#lv-end').addEventListener('click', endOrLeave);
    $('#lv-meet').addEventListener('click', callDialog);
    $$('.lv-tabs [data-lt]').forEach(function (t) { t.addEventListener('click', function () { setLt(t.dataset.lt); }); });
    $('#lv-people').addEventListener('click', function (e) { var r = e.target.closest('[data-u]'); if (!r) return; var p = st.people[r.dataset.u]; if (p) map.setView([p.lat, p.lon], Math.max(map.getZoom(), 15), { animate: true }); });
  }
  function setLt(k) {
    st.lt = k; $$('.lv-tabs [data-lt]').forEach(function (t) { t.classList.toggle('on', t.dataset.lt === k); });
    $$('.lv-pane').forEach(function (p) { p.hidden = p.dataset.lp !== k; });
    if (k === 'chat') { st.unread = 0; badge(); var c = $('#lv-chat'); c.scrollTop = c.scrollHeight; } else renderPeople();
  }
  function togglePanel(on) {
    st.panelOpen = on === undefined ? !st.panelOpen : on; panel.hidden = !st.panelOpen; document.body.classList.toggle('lv-open', st.panelOpen);
    if (st.panelOpen) { if ((st.lt || 'chat') === 'chat') { st.unread = 0; badge(); } var c = $('#lv-chat'); c.scrollTop = c.scrollHeight; renderPeople(); }
  }
  function badge() { var b = $('.lv-badge', btn), n = st.unread > 9 ? '9+' : st.unread; b.hidden = !st.unread; b.textContent = n; var t = $('#lv-tb'); if (t) { t.hidden = !st.unread; t.textContent = n; } }
  function dlgOpen(html) { dlg.innerHTML = html + '<button class="dlg-x" type="button" data-x aria-label="Fermer"><svg class="ic"><use href="#i-x"/></svg></button>'; $('[data-x]', dlg).addEventListener('click', function () { dlg.close(); }); if (!dlg.open) dlg.showModal(); return dlg; }

  // ---------- Création et accès ----------
  function hasContent() { return st.mode === 'az' ? S.az.pts.length > 0 : st.mode === 'route' ? S.route.wps.length > 1 : S.game.shapes.length > 0; }
  function liveName() { return st.mode === 'az' ? (S.az.name || 'Azimuts') : st.mode === 'route' ? (S.route.name || 'Itinéraire') : (S.game.name || 'Grand jeu'); }
  function saveSession() { try { localStorage.setItem('scoutmap.live.session', JSON.stringify({ mode: st.mode, room: st.room, key: st.key, owner: st.owner, admin: st.admin, atok: st.atok, psec: st.psec, share: st.sharing, t: Date.now() })); } catch (e) { /* ignoré */ } }
  function clearSession() { try { localStorage.removeItem('scoutmap.live.session'); } catch (e) { /* ignoré */ } }
  function askName(title, okLabel, cb) {
    if (st.name && cb.quiet) { cb(st.name); return; }
    var d = dlgOpen('<h2>' + esc(title) + '</h2><p class="dlg-sub">Votre prénom s’affichera à côté de votre position et de vos messages.</p>' +
      '<label class="pdf-name">Prénom <input id="lv-name" type="text" maxlength="24" autocomplete="given-name" value="' + esc(st.name) + '"></label>' +
      '<div class="dlg-actions"><button class="btn-ghost" id="lv-cancel" type="button">Annuler</button><button class="btn-primary" id="lv-ok" type="button">' + esc(okLabel) + '</button></div>');
    var i = $('#lv-name', d); setTimeout(function () { i.focus(); i.select(); }, 50);
    function go() { var n = i.value.trim(); if (!n) { i.focus(); return; } st.name = n; try { localStorage.setItem('scoutmap.live.name', n); } catch (e) { /* ignoré */ } d.close(); cb(n); }
    $('#lv-ok', d).addEventListener('click', go); i.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    $('#lv-cancel', d).addEventListener('click', function () { d.close(); });
  }
  // Le chef qui lance le partage en direct
  function start() {
    build();
    if (!configured()) { toast('Ce navigateur ne permet pas le partage en direct.'); return; }
    if (!window.crypto || !crypto.subtle) { toast('Le partage en direct demande une connexion sécurisée (https).'); return; }
    if (st.room) { showInvite(); return; }
    if (S.mode !== 'game' && S.mode !== 'az' && S.mode !== 'route') { toast('Ouvrez un itinéraire, des azimuts ou un grand jeu pour le partager.'); return; }
    st.mode = S.mode;
    if (!hasContent()) { toast(st.mode === 'az' ? 'Posez d’abord des points sur la carte des azimuts, puis partagez-les.' : st.mode === 'route' ? 'Posez d’abord le départ et au moins une étape de l’itinéraire, puis partagez-le.' : 'Dessinez d’abord quelque chose sur la carte du jeu, puis partagez-le.'); return; }
    askName('Partager ' + quoi() + ' en direct', 'Lancer le partage', function () {
      toast('Lancement du partage en direct…');
      st.room = rand(16); st.key = b64u(crypto.getRandomValues(new Uint8Array(16))); st.psec = rand(32);
      importKey(st.key).then(function (k) { st.ck = k; return connect({ creer: true }); }).then(function (m) {
        if (!m.proprio) throw new Error('création refusée');
        st.owner = true; return publishGame();
      }).then(function () {
        active(); showInvite(); startSharing(); saveSession();
      }).catch(function (e) { st.fini = true; if (st.ws) st.ws.close(); st.room = null; toast('Impossible de lancer le partage en direct : ' + (e && e.message ? e.message : 'service indisponible') + '.'); });
    });
  }
  // Un chef qui arrive par le QR code
  function join(room, key, atok) {
    build();
    if (!configured()) { toast('Ce navigateur ne permet pas le partage en direct.'); return; }
    st.room = room; st.key = key;
    var go = function () {
      toast('Connexion au partage…');
      importKey(key).then(function (k) { st.ck = k; return connect({ adm: atok }); }).then(function (m) {
        if (m.admin && !m.proprio) st.atok = atok;
        active(); return st.owner ? null : loadGame();
      }).then(function () { if (st.admin) { st.lastGame = JSON.stringify(snapshot()); if (!window.SM_VIEWER) { SM.setMode(st.mode); } toast('Vous êtes co-administrateur : vous pouvez modifier la carte.'); } startSharing(); saveSession(); })
        .catch(function (e) { if (e && e.name === 'OperationError') e = new Error('Lien incomplet : scannez de nouveau le QR code.'); st.fini = true; if (st.ws) st.ws.close(); st.room = null; toast(e && e.message ? e.message : 'Connexion impossible.'); });
    };
    go.quiet = true; askName('Rejoindre le partage en direct', 'Rejoindre', go);
  }
  // Après un rechargement de la page : on se reconnecte tout seul (le chef retrouve son partage en direct, les autres aussi)
  function resume() {
    var s; try { s = JSON.parse(localStorage.getItem('scoutmap.live.session') || 'null'); } catch (e) { s = null; }
    if (!s || !s.room || !s.key || Date.now() - s.t > 3 * 86400000 || !configured() || !window.crypto || !crypto.subtle) return;
    build(); st.room = s.room; st.key = s.key; st.psec = s.psec || null; st.atok = s.atok || null; st.mode = s.mode || 'game';
    importKey(s.key).then(function (k) { st.ck = k; return connect(); }).then(function () {
      if (s.owner && !st.owner) throw new Error('fin');
      active(); if (st.owner) { st.lastGame = ''; if (hasContent() && !window.SM_VIEWER) { SM.showHome(false); SM.setMode(st.mode); } } return st.owner ? null : loadGame().then(function () { if (st.admin) { st.lastGame = JSON.stringify(snapshot()); SM.setMode(st.mode); } });
    }).then(function () { if (s.share) startSharing(); saveSession(); toast('Partage en direct retrouvé.'); }).catch(function () { st.fini = true; if (st.ws) st.ws.close(); st.room = null; st.key = null; st.owner = false; st.admin = false; clearSession(); });
  }
  function active() {
    btn.hidden = false; document.body.classList.add('lv-active'); $('#lv-title').textContent = liveName(); $('#lv-end').textContent = st.owner ? 'Terminer le partage' : 'Quitter'; $('#lv-invite').textContent = ''; $('#lv-invite').innerHTML = '<svg class="ic"><use href="#i-people"/></svg>Inviter';
    $('#lv-invite').hidden = false;
    roleText(); togglePanel(true); paintMyAv();
    st.timers.push(setInterval(function () { renderPeople(); }, 5000));
    if (canEdit()) st.timers.push(setInterval(function () { publishGame(); }, 4000));
  }

  function roleText() { var r = $('#lv-role'); if (r) r.textContent = st.owner ? 'Vous dirigez le partage : continuez à modifier la carte, les autres chefs reçoivent vos changements en quelques secondes.' : st.admin ? 'Vous êtes co-administrateur : vous pouvez modifier la carte comme le chef qui a lancé le partage.' : 'Vous suivez ' + quoi() + ' en lecture seule. Seul le chef qui l’a partagé (ou un co-administrateur) peut le modifier.'; }

  // ---------- La carte partagée (envoyée par le chef, reçue en lecture seule par les autres) ----------
  function snapshot() { return { app: 'ScoutMap', v: 1, name: liveName(), rail: st.mode, base: S.base, ov: S.ov, route: st.mode === 'route' ? S.route : { wps: [] }, az: st.mode === 'az' ? S.az : { pts: [] }, tracks: [], game: st.mode === 'game' ? S.game : { shapes: [] } }; }
  function publishGame() {
    if (!canEdit() || !st.room || !hasContent()) return Promise.resolve();
    var js = JSON.stringify(snapshot()); if (js === st.lastGame) return Promise.resolve(); st.lastGame = js;
    return enc(snapshot()).then(function (e) { if (!envoi({ t: 'carte', d: e })) st.lastGame = ''; }).catch(function () { st.lastGame = ''; });
  }
  function loadGame(first, mine) {
    return Promise.resolve().then(function () {
      if (!st.carte) throw new Error('Le chef n’a encore rien partagé.');
      return dec(st.carte.d);
    }).then(function (data) {
      if (mine) { var js = JSON.stringify(data); if (st.lastGame && js === st.lastGame) return; }
      if (data.name) $('#lv-title').textContent = data.name;
      if (data.rail === 'az' || data.rail === 'game' || data.rail === 'route') { st.mode = data.rail; roleText(); }
      SM.loadProject(data, null, { keepView: !!st.loaded }); st.loaded = true; if (st.admin) { st.lastGame = JSON.stringify(snapshot()); }
    }).catch(function (e) { if (e && e.name === 'OperationError') throw new Error('Lien incorrect (clé invalide) : scannez de nouveau le QR code.'); throw e; });
  }


  var seen = {};
  function addChat(d, t, key) {
    if (seen[key]) return; seen[key] = 1;
    var box = $('#lv-chat'), mine = d.u === st.uid, el = document.createElement('div');
    el.className = 'lv-msg' + (mine ? ' mine' : '');
    var meet = /https:\/\/meet\.google\.com\/[a-z0-9-]+/i.exec(d.m || '');
    if (meet && (now() - (t || now())) < 3 * 3600 * 1000) { st.call = meet[0]; showCall(); }
    el.innerHTML = '<i class="lv-av" style="background:' + esc(d.c || '#475569') + '">' + avInner(d) + '</i><span class="lv-who" style="color:' + esc(d.c || '#475569') + '">' + esc(d.n || '?') + '</span> <time>' + hhmm(t || now()) + '</time><div>' + linkify(d.m) + '</div>';
    box.appendChild(el); box.scrollTop = box.scrollHeight;
    if (!mine && (!st.panelOpen || st.lt === 'people') && (now() - (t || 0)) < 30000) { st.unread++; badge(); }
  }
  function linkify(s) {
    return esc(s || '').replace(/(https?:\/\/[^\s<]+)/g, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener">' + (/meet\.google\.com/.test(u) ? '📞 Rejoindre l’appel Meet' : u) + '</a>'; });
  }
  function showCall() { var a = $('#lv-call'); if (!a || !st.call) return; a.href = st.call; a.hidden = false; }
  // Appel vocal : on ouvre Google Meet, puis le lien de la réunion est collé ici et envoyé aux chefs (cliquable)
  function callDialog() {
    var d = dlgOpen('<h2>Appel vocal avec les chefs</h2><p class="dlg-sub">1. Ouvrez Google Meet et démarrez une réunion.<br>2. Copiez le lien de la réunion et collez-le ci-dessous : il sera envoyé à tous les chefs, qui n’auront qu’à cliquer dessus.</p>' +
      '<div class="dlg-actions" style="justify-content:flex-start"><a class="btn-ghost" href="https://meet.google.com/new" target="_blank" rel="noopener">1. Ouvrir Google Meet</a></div>' +
      '<input class="lv-link" id="lv-meetlink" type="url" placeholder="https://meet.google.com/abc-defg-hij" aria-label="Lien de la réunion Meet">' +
      '<div class="dlg-actions"><button class="btn-ghost" id="lv-mc" type="button">Annuler</button><button class="btn-primary" id="lv-ms" type="button">2. Envoyer le lien aux chefs</button></div>');
    var i = $('#lv-meetlink', d); i.focus();
    $('#lv-mc', d).addEventListener('click', function () { d.close(); });
    function send() {
      var v = i.value.trim(); if (!/^https?:\/\//i.test(v)) { toast('Collez le lien complet de la réunion (il commence par https://).'); return; }
      sendChat('📞 Appel vocal : ' + v); d.close(); setLt('chat'); toast('Lien envoyé aux chefs.');
    }
    $('#lv-ms', d).addEventListener('click', send); i.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
  }
  function sendChat(m) {
    if (!st.room) return;
    enc({ u: st.uid, n: st.name, c: myColor(), a: st.av && st.av.i || '', m: m.slice(0, 400) }).then(function (e) { if (!envoi({ t: 'msg', d: e })) toast('Message non envoyé : connexion en cours de rétablissement.'); }).catch(function () { toast('Message non envoyé.'); });
  }

  // ---------- Positions ----------
  function startSharing() {
    if (!navigator.geolocation) { toast('La localisation n’est pas disponible sur cet appareil.'); return; }
    if (st.watch !== null) return;
    st.sharing = true; $('#lv-sharing').checked = true; saveSession();
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
    enc({ n: st.name, c: myColor(), a: st.av && st.av.i || '', lat: st.lastFix.lat, lon: st.lastFix.lon, acc: st.lastFix.acc }).then(function (e) {
      envoi({ t: 'pos', d: e });
    }).catch(function () { /* hors réseau : on réessaie au prochain point */ });
  }
  function stopSharing() {
    st.sharing = false; if ($('#lv-sharing')) $('#lv-sharing').checked = false; if (st.room) saveSession();
    if (st.watch !== null) { navigator.geolocation.clearWatch(st.watch); st.watch = null; }
    clearInterval(st.hb);
    if (st.room) envoi({ t: 'sanspos' });
  }
  function renderPeople() {
    if (!panel) return;
    var ids = Object.keys(st.people).sort(function (a, b) { return a === st.uid ? -1 : b === st.uid ? 1 : (st.people[a].n || '').localeCompare(st.people[b].n || ''); });
    $('#lv-count').textContent = ids.length ? '(' + ids.length + ')' : '';
    $('#lv-people').innerHTML = ids.length ? ids.map(function (u) {
      var p = st.people[u], old = now() - p.t > 90000;
      return '<button type="button" class="lv-p' + (old ? ' old' : '') + '" data-u="' + esc(u) + '"><i style="background:' + esc(p.c) + '">' + avInner(p) + '</i><b>' + esc(p.n || '?') + (u === st.uid ? ' (moi)' : '') + '</b><small>' + ago(p.t) + ' · ±' + p.acc + ' m</small></button>';
    }).join('') : '<p class="lv-none">Personne ne partage sa position pour l’instant.</p>';
    // marqueurs
    Object.keys(st.markers).forEach(function (u) { if (!st.people[u]) { gLive.removeLayer(st.markers[u]); delete st.markers[u]; } });
    ids.forEach(function (u) {
      var p = st.people[u], old = now() - p.t > 90000, html = '<div class="lv-pin' + (old ? ' old' : '') + '" style="background:' + esc(p.c) + '">' + avInner(p) + '</div><span class="lv-tag">' + esc(p.n || '?') + '</span>';
      if (st.markers[u]) { st.markers[u].setLatLng([p.lat, p.lon]); st.markers[u].setIcon(L.divIcon({ className: 'lv-wrap', html: html, iconSize: [0, 0] })); }
      else st.markers[u] = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'lv-wrap', html: html, iconSize: [0, 0] }), zIndexOffset: 3500, title: p.n }).addTo(gLive);
    });
  }

  // ---------- Inviter (QR code) ----------
  function showInvite() {
    if (!st.room) return;
    var url = linkOf(), qr = qrcode(0, 'M'); qr.addData(url); qr.make();
    var d = dlgOpen('<h2>Inviter les autres chefs</h2><p class="dlg-sub">Ils scannent ce QR code avec l’appareil photo de leur téléphone : ils voient ' + quoi() + ', saisissent leur prénom et partagent leur position. Tout est chiffré ; ils suivent en lecture seule.</p>' +
      '<div class="lv-qr">' + qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }) + '</div>' +
      '<input class="lv-link" id="lv-link" type="text" readonly value="' + esc(url) + '" aria-label="Lien du partage en direct">' +
      (st.owner ? '<div class="lv-adm"><b>Lien administrateur</b><p>Pour un autre chef qui doit pouvoir modifier la carte avec vous. À n’envoyer qu’aux personnes de confiance.</p><div class="dlg-actions"><button class="btn-ghost" id="lv-acopy" type="button">Copier le lien administrateur</button><button class="btn-ghost" id="lv-arev" type="button">Révoquer</button></div></div>' : '') +
      '<div class="dlg-actions"><button class="btn-ghost" id="lv-copy" type="button">Copier le lien</button>' + (navigator.share ? '<button class="btn-ghost" id="lv-share" type="button">Envoyer…</button>' : '') + '<button class="btn-primary" id="lv-done" type="button">Terminé</button></div>');
    $('#lv-copy', d).addEventListener('click', function () { var i = $('#lv-link', d); i.select(); try { navigator.clipboard.writeText(url).then(function () { toast('Lien copié.'); }, function () { document.execCommand('copy'); toast('Lien copié.'); }); } catch (e) { document.execCommand('copy'); toast('Lien copié.'); } });
    var sh = $('#lv-share', d); if (sh) sh.addEventListener('click', function () { navigator.share({ title: Quoi() + ' en direct', text: 'Suis ' + quoi() + ' en direct sur ScoutMap', url: url }).catch(function () { /* annulé */ }); });
    $('#lv-done', d).addEventListener('click', function () { d.close(); });
    var ac = $('#lv-acopy', d);
    if (ac) {
      var cp = function (t) { try { navigator.clipboard.writeText(t).then(function () { toast('Lien administrateur copié.'); }, function () { toast('Copie impossible : sélectionnez le lien à la main.'); }); } catch (e) { toast('Copie impossible.'); } };
      ac.addEventListener('click', function () {
        if (st.atok) { cp(adminLink()); return; }
        var tk = rand(20);
        if (envoi({ t: 'admtok', tk: tk })) { st.atok = tk; saveSession(); cp(adminLink()); } else toast('Impossible de créer le lien : connexion en cours de rétablissement.');
      });
      $('#lv-arev', d).addEventListener('click', function () {
        if (envoi({ t: 'revoquer' })) { st.atok = null; saveSession(); toast('Liens administrateur révoqués.'); } else toast('Révocation impossible pour le moment.');
      });
    }
  }

  // ---------- Fin ----------
  function endOrLeave() {
    if (!st.room) return;
    if (!confirm(st.owner ? 'Terminer le partage en direct ? Les autres chefs seront déconnectés et les positions effacées.' : 'Quitter le partage en direct ?')) return;
    stopSharing(); if (st.owner) envoi({ t: 'fin' });
    var moi = st.owner; setTimeout(function () { finish(moi ? 'Partage en direct terminé.' : 'Vous avez quitté le partage en direct.'); }, moi ? 300 : 0);
  }
  function finish(msg) {
    stopSharing(); st.fini = true; if (st.ws) { try { st.ws.close(); } catch (e) { /* ignoré */ } st.ws = null; } st.posRaw = {}; st.carte = null; st.loaded = false;
    st.timers.forEach(clearInterval); st.timers = [];
    gLive.clearLayers(); st.markers = {}; st.people = {}; seen = {};
    if (btn) btn.hidden = true; if (panel) panel.hidden = true; document.body.classList.remove('lv-open', 'lv-active');
    st.room = null; st.key = null; st.owner = false; st.admin = false; st.atok = null; st.psec = null; st.lastGame = ''; if ($('#lv-chat')) $('#lv-chat').innerHTML = '';
    clearSession();
    toast(msg);
  }

  // ---------- Branchements ----------
  SM.live = { start: start, join: join, active: function () { return !!st.room; } };
  var P; try { P = new URLSearchParams(location.search); } catch (e) { P = null; }
  var room = P && (P.get('direct') || P.get('salle')), km = /[#&]k=([A-Za-z0-9_-]+)/.exec(location.hash);
  var am = /[#&]a=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (room && km) { build(); setTimeout(function () { join(room, km[1], am && am[1]); }, 400); }
  else if (!room) setTimeout(resume, 800);
  else if (room) { build(); setTimeout(function () { toast('Lien incomplet : scannez de nouveau le QR code (il manque la clé).'); }, 600); }
  var gb = $('#share-btn'); if (gb) gb.addEventListener('click', start);
  var ab = $('#az-live'); if (ab) ab.addEventListener('click', start);
})();
