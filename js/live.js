/* ScoutMap : partage en direct d'un itinéraire, d'azimuts ou d'un grand jeu.
   Un onglet « Partage » à part entière dans le volet latéral (aucune fenêtre modale : prénom, invitation, confirmation s'affichent dans le volet) :
   bouton « Partager » (QR code / lien pour inviter), puis trois onglets façon messagerie — Discussion, Personnes (qui est connecté, qui est où), Réglages.
   Chaque personne connectée apparaît sur la carte avec son prénom. Les personnes invitées retrouvent le même volet (seul onglet de leur page).
   Les échanges passent par le serveur Cloudflare de ScoutHub (une connexion WebSocket par partage), chiffrés (AES-GCM) dans le navigateur
   avec une clé qui n'est que dans le lien : le serveur ne voit rien de lisible. Seul le chef qui a lancé le partage (ou un co-administrateur)
   modifie la carte ; les autres la reçoivent en lecture seule. */
(function () {
  'use strict';
  var SM = window.SM, S = SM.S, map = SM.map, esc = SM.esc;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var DIRECT = 'wss://scouthub.fsggb.workers.dev/direct/';
  var COLORS = ['#c0262d', '#2563eb', '#1a7f37', '#d97706', '#7a3db8', '#0e7490', '#d6336c', '#a16207', '#4d7c0f', '#475569'];
  var ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
  var ONLINE = 45000, RECENT = 15 * 60000;   // « en ligne » : signe de vie il y a moins de 45 s ; « parti récemment » : moins de 15 min
  var st = { prep: false, base: '', lastBy: 0, mode: 'game', room: null, key: null, ck: null, owner: false, admin: false, atok: null, psec: null, uid: null, name: '', share: true, geoErr: '', fix: null,
    remote: {}, markers: {}, chat: [], offset: 0, unread: 0, panelOpen: false, tab: 'chat', watch: null, lastSend: 0, timers: [], ws: null, carte: null, fini: true, essais: 0, lastGame: '', loaded: false, known: null, call: null, conn: 'ok', lastIn: Date.now(), nextTry: 0, rt: null, errs: [], out: {}, ping: null, decFail: 0, sync: { sent: 0, recv: 0 }, warned: {} };
  var gLive = L.layerGroup().addTo(map);
  try { st.name = localStorage.getItem('scoutmap.live.name') || ''; st.share = localStorage.getItem('scoutmap.live.share') !== '0'; } catch (e) { /* ignoré */ }
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
  function colorOf(uid) { var h = 0; for (var i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0; return COLORS[h % COLORS.length]; }
  function initial(n) { return esc(String(n || '?').trim().charAt(0).toUpperCase() || '?'); }
  function now() { return Date.now() + st.offset; }
  function ago(t) {
    var s = Math.max(0, Math.round((now() - t) / 1000));
    return s < 10 ? 'à l’instant' : s < 60 ? 'il y a ' + s + ' s' : s < 3600 ? 'il y a ' + Math.round(s / 60) + ' min' : 'il y a ' + Math.round(s / 3600) + ' h';
  }
  function hhmm(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function toast(m) { SM.toast(m); }
  function canEdit() { return !!(st.owner || st.admin); }
  function linkOf() { return location.href.split('#')[0].split('?')[0] + '?direct=' + st.room + '#k=' + st.key; }
  function adminLink() { return linkOf() + '&a=' + st.atok; }
  function inviteLink() { return st.prep && st.atok ? location.href.split('#')[0].split('?')[0] + '?direct=' + st.room + '&prep=1#k=' + st.key + '&a=' + st.atok : linkOf(); }
  function configured() { return typeof WebSocket !== 'undefined'; }
  // Mots selon ce qui est partagé
  function quoi() { return st.mode === 'az' ? 'les azimuts' : st.mode === 'route' ? 'l’itinéraire' : 'le grand jeu'; }
  function Quoi() { var q = quoi(); return q.charAt(0).toUpperCase() + q.slice(1); }
  function copy(t, ok) { try { navigator.clipboard.writeText(t).then(function () { toast(ok); }, function () { toast('Copie impossible : sélectionnez le lien à la main.'); }); } catch (e) { toast('Copie impossible : sélectionnez le lien à la main.'); } }

  // ---------- Connexion au serveur Cloudflare (WebSocket, reconnexion automatique) ----------
  // Messages reçus : etat (à la connexion), carte, pos (signe de vie + position), sanspos (départ), msg, fin, revoque, absent.
  function envoi(o) { if (st.ws && st.ws.readyState === 1) { try { st.ws.send(JSON.stringify(o)); return true; } catch (e) { return false; } } return false; }
  function logErr(m) { st.errs.push(new Date().toTimeString().slice(0, 8) + ' ' + m); if (st.errs.length > 8) st.errs.shift(); }
  function connect(opts) {
    return new Promise(function (ok, ko) {
      var premier = true, ws;
      try { ws = new WebSocket(DIRECT + st.room); } catch (e) { ko(new Error('Connexion impossible')); return; }
      st.ws = ws; st.fini = false;
      ws.onopen = function () { ws.send(JSON.stringify({ t: 'bonjour', uid: st.uid, creer: !!(opts && opts.creer), proprio: st.psec || undefined, adm: st.atok || (opts && opts.adm) || undefined })); };
      ws.onmessage = function (e) {
        st.lastIn = Date.now();
        var m; try { m = JSON.parse(e.data); } catch (x) { return; }
        if (m.t === 'absent') { if (premier) { premier = false; st.fini = true; ws.close(); ko(new Error('Ce partage est terminé ou n’existe plus.')); } else finish('Le partage est terminé.'); return; }
        if (m.t === 'etat') {
          st.essais = 0; st.conn = 'ok'; netUI(); st.offset = (m.maintenant || Date.now()) - Date.now(); st.owner = !!m.proprio; st.admin = !!m.admin && !m.proprio;
          if (m.admRefuse && !m.admin) { st.atok = null; toast('Lien administrateur refusé ou révoqué : vous suivez ' + quoi() + ' en lecture seule.'); }
          if (m.carte) st.carte = { d: m.carte, at: m.carteT };
          decodeAll(m.pos || {}).then(function () { if (SM.chat) SM.chat.load(m.chat || []); beat(true); if (SM.chat) SM.chat.resend(); });
          if (!st.owner || st.admin) st.lastGame = '';      // après une reconnexion, la carte est renvoyée si elle a changé
          if (premier) { premier = false; ok(m); } else if (!st.owner) carteRecue();
          return;
        }
        if (m.t === 'carte') { st.carte = { d: m.d, at: m.at }; carteRecue(); return; }
        if (m.t === 'pos') { decodeOne(m.u, m.d, m.at); return; }
        if (m.t === 'sanspos') { var gone = st.remote[m.u]; if (gone) gone.t = Math.min(gone.t, now() - ONLINE - 1); renderPeople(); return; }
        if (m.t === 'msg') { if (SM.chat) SM.chat.onMsg(m); return; }
        if (m.t === 'media') { if (SM.chat) SM.chat.onMedia(m); return; }
        if (m.t === 'ok') { if (SM.chat) SM.chat.onOk(m); return; }
        if (m.t === 'sig') { if (SM.appel) SM.appel.sig(m); return; }
        if (m.t === 'turn') { if (SM.appel) SM.appel.turn(m); return; }
        if (m.t === 'pong') { var rtt = Date.now() - (+m.c || Date.now()); st.ping = rtt; if (m.maintenant && rtt >= 0 && rtt < 4000) st.offset = m.maintenant - (Date.now() - rtt / 2); return; }
        if (m.t === 'erreur') { logErr('serveur : ' + (m.m || m.r || 'refus')); if (m.m) toast('Le serveur a refusé : ' + m.m); return; }
        if (m.t === 'fin') { if (!st.owner) finish('Le partage a été terminé par la personne qui l’avait lancé.'); return; }
        if (m.t === 'revoque') { st.admin = false; st.atok = null; saveSession(); renderSettings(); toast('Votre lien administrateur a été révoqué : vous suivez ' + quoi() + ' en lecture seule.'); }
      };
      ws.onerror = function () { /* l'événement close suit */ };
      ws.onclose = function () {
        if (premier) { premier = false; ko(new Error('Service de partage injoignable.')); return; }
        if (st.ws !== ws) return;
        lost('connexion fermée');
      };
    });
  }
  // Connexion perdue (veille, changement de réseau, coupure) : on réessaie sans jamais abandonner, de plus en plus lentement jusqu'à 20 s
  function lost(why) {
    if (st.fini || !st.room) return;
    if (st.conn === 'ok') logErr('connexion perdue (' + why + ')');
    st.conn = 'retry'; retry(false);
  }
  function retry(maintenant) {
    if (st.fini || !st.room) return;
    if (st.rt) { if (!maintenant) return; clearTimeout(st.rt); st.rt = null; }
    var attente = maintenant ? 0 : Math.min(20000, 1000 * Math.pow(2, Math.min(st.essais, 5))); st.essais++;
    st.nextTry = Date.now() + attente; netUI();
    st.rt = setTimeout(function () {
      st.rt = null; if (st.fini || !st.room) return;
      killWs();
      connect().then(function () { /* 'etat' remet conn = ok */ }, function (e) { logErr('reconnexion : ' + ((e && e.message) || 'échec')); retry(false); });
    }, attente);
  }
  function killWs() { var w = st.ws; st.ws = null; if (w) { w.onclose = null; w.onmessage = null; w.onerror = null; try { w.close(); } catch (e) { /* ignoré */ } } }
  // Connexion « à moitié morte » (réseau mobile, veille) : le navigateur croit encore être connecté, mais plus rien n'arrive.
  // Chaque appareil reçoit en écho son propre signe de vie toutes les 10 s : sans rien reçu depuis 35 s, on repart de zéro.
  function watchdog() {
    if (!st.room || st.fini || st.rt) return;
    if (!st.ws || st.ws.readyState > 1) { lost('connexion absente'); return; }
    if (st.ws.readyState === 1 && Date.now() - st.lastIn > 35000) { logErr('aucune réponse du serveur depuis 35 s'); st.conn = 'retry'; killWs(); retry(true); }
  }
  function wake() {      // retour sur la page, retour du réseau : on vérifie tout de suite
    if (!st.room || st.fini) return;
    if (!st.ws || st.ws.readyState > 1) { st.conn = 'retry'; retry(true); return; }
    envoi({ t: 'ping', c: Date.now() }); beat(true);
    setTimeout(function () { if (st.room && !st.fini && st.ws && Date.now() - st.lastIn > 9000) { logErr('pas de réponse au retour sur la page'); st.conn = 'retry'; killWs(); retry(true); } }, 5000);
  }
  window.addEventListener('online', function () { if (st.room) { logErr('réseau revenu'); wake(); } });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') wake(); });
  function netUI() {
    var el = $('#lv-net'); if (!el) return;
    if (st.conn === 'ok' || !st.room) { el.hidden = true; return; }
    var s2 = Math.max(0, Math.ceil((st.nextTry - Date.now()) / 1000));
    el.hidden = false; el.innerHTML = '<span><b>Connexion perdue.</b> ' + (s2 > 0 ? 'Nouvelle tentative dans ' + s2 + ' s.' : 'Reconnexion…') + ' Vos messages seront envoyés dès le retour.</span><button type="button" class="btn-ghost sm" id="lv-netgo">Réessayer</button>';
    var b = $('#lv-netgo'); if (b) b.onclick = function () { st.essais = 0; retry(true); };
  }
  // Participants connus : gardés sur l'appareil (jusqu'à 90 min d'absence) pour que « reçu » et « lu » concernent TOUTES les personnes du partage, même celles dont la connexion est coupée un moment
  var ROSTER_MS = 90 * 60000, rosterT = null;
  function rosterInit() { if (st.rosterFor === st.room) return; st.rosterFor = st.room; try { st.roster = JSON.parse(localStorage.getItem('scoutmap.live.roster.' + st.room) || '{}') || {}; } catch (e) { st.roster = {}; } }
  function rosterSave() { if (rosterT) return; rosterT = setTimeout(function () { rosterT = null; try { if (st.room) localStorage.setItem('scoutmap.live.roster.' + st.room, JSON.stringify(st.roster)); } catch (e) { /* ignoré */ } }, 1500); }
  function roster() {
    rosterInit(); var out = {}, t = now();
    Object.keys(st.roster).forEach(function (u) { var r = st.roster[u]; if (u !== st.uid && t - (r.seen || 0) < ROSTER_MS) out[u] = r; });
    return out;
  }
  // Une présence reçue : ignorée si plus ancienne que celle déjà connue (le déchiffrement est asynchrone : l'ordre d'arrivée n'est pas garanti)
  function apply(u, p, at) {
    if (u === st.uid || !p || typeof p !== 'object') return;
    rosterInit();
    if (p.bye) { delete st.remote[u]; delete st.roster[u]; rosterSave(); return; }
    var prev = st.remote[u];
    if (prev && prev.t > at) { var r0 = st.roster[u]; if (r0) { r0.rd = Math.max(r0.rd || 0, p.rd || 0); r0.dv = Math.max(r0.dv || 0, p.dv || 0); } return; }
    if (!isFinite(p.lat) || !isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) { delete p.lat; delete p.lon; delete p.acc; }
    if (p.lat == null && p.sh !== 0 && prev && prev.lat != null) { p.lat = prev.lat; p.lon = prev.lon; p.acc = prev.acc; }       // pas encore de nouveau point : on garde le dernier (sauf si la personne a masqué sa position)
    p.t = at; st.remote[u] = p;
    var r = st.roster[u] || (st.roster[u] = { first: at });
    r.n = p.n || r.n; r.c = p.c || r.c; r.seen = Math.max(r.seen || 0, at); r.rd = Math.max(r.rd || 0, p.rd || 0); r.dv = Math.max(r.dv || 0, p.dv || 0);
    rosterSave();
  }
  function decodeOne(u, d, at) {
    return dec(d).then(function (p) { apply(u, p, at); renderPeople(); if (SM.chat) SM.chat.refresh(); }).catch(function () { /* illisible : ignorée */ });
  }
  function decodeAll(raw) {
    var ids = Object.keys(raw);
    return Promise.all(ids.map(function (u) { return dec(raw[u].d).then(function (p) { apply(u, p, raw[u].at); }).catch(function () { /* ignorée */ }); })).then(function () { renderPeople(); });
  }
  // Carte encore vide chez le chef : on n'échoue pas, elle s'affichera dès qu'elle sera publiée
  function attenteCarte(e) { if (e && /Rien n/.test(e.message || '')) { toast('Le partage est lancé, mais rien n’est encore posé sur la carte : elle apparaîtra dès que la personne qui partage aura dessiné.'); return; } throw e; }
  function carteRecue() {
    if (!st.loaded && !st.owner) { loadGame().catch(function () { /* ignoré */ }); return; }
    if (canEdit()) { mergeIn(); return; }
    loadGame().catch(function () { /* ignoré */ });
  }
  /* Préparation à plusieurs : la carte reçue est fusionnée avec mes propres changements (js/fusion.js) au lieu de les écraser,
     puis appliquée sans interrompre ce que je suis en train de faire ; ma version fusionnée repart aux autres au prochain envoi. */
  var mergeBusy = false;
  function mergeIn() {
    if (!st.carte || mergeBusy) return; mergeBusy = true;
    dec(st.carte.d).then(function (theirs) {
      var mine = snapshot(), base = null; try { base = st.base ? JSON.parse(st.base) : null; } catch (e) { base = null; }
      if (theirs.rail && theirs.rail !== st.mode && (theirs.rail === 'route' || theirs.rail === 'az' || theirs.rail === 'game')) { st.mode = theirs.rail; renderSettings(); }
      var merged = window.SMMerge ? SMMerge.merge3(base, mine, theirs) : theirs, mj = JSON.stringify(merged);
      if (mj !== JSON.stringify(mine) && SM.applyShared) {
        SM.applyShared(merged);
        if (theirs.by && theirs.by !== st.name && Date.now() - st.lastBy > 15000) { st.lastBy = Date.now(); toast('Carte mise à jour par ' + theirs.by + '.'); }
      }
      st.base = JSON.stringify(theirs); st.lastGame = st.base;     // ce que les autres ont : si ma version fusionnée diffère, elle leur sera envoyée
      st.loaded = true; st.sync.recv = Date.now();
    }).catch(function () { /* illisible : ignorée */ }).then(function () { mergeBusy = false; });
  }

  // ---------- Panneau : Personnes / Discussion / Réglages ----------
  var btn, panel, floating = false;
  function modeNow() { return S.mode === 'az' ? 'les azimuts' : S.mode === 'route' ? 'l’itinéraire' : S.mode === 'game' ? 'le grand jeu' : ''; }
  // Logo du bouton « Envoyer par WhatsApp » : dessin original (bulle de discussion avec combiné), pastille verte cerclée d'or aux couleurs FSGGB
  var WA_LOGO = '<svg class="lv-logo" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14.2" fill="#008069" stroke="#c6a24e" stroke-width="2.2"/><path d="M16 6.6a9.4 9.4 0 0 0-8.1 14.2l-1.4 4.8 5-1.3A9.4 9.4 0 1 0 16 6.6z" fill="#fff"/><path transform="translate(10.3 9.3) scale(.48)" d="M6 3.5h3.2l1.5 4-2 1.3a11.5 11.5 0 0 0 6.5 6.5l1.3-2 4 1.5V18a2.5 2.5 0 0 1-2.7 2.5C10.5 20 4 13.5 3.5 6.2A2.5 2.5 0 0 1 6 3.5z" fill="#008069"/></svg>';
  function ico(n) { return '<svg class="ic" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
  function build() {
    if (panel) return;
    panel = document.createElement('div'); panel.id = 'live-panel';
    panel.innerHTML =
      '<div class="lv-idle" id="lv-idle"></div>' +
      '<div class="lv-live" id="lv-live" hidden>' +
      '<header class="lv-top"><div class="lv-row"><span class="lv-av" aria-hidden="true">' + ico('people') + '</span>' +
      '<div class="lv-ttl"><b id="lv-title">Partage en direct</b><small id="lv-count"></small></div>' +
      '<button type="button" class="lv-ib" id="lv-callbtn" title="Lancer un appel vocal" aria-label="Lancer un appel vocal">' + ico('phone') + '</button>' +
      '<button type="button" class="lv-ib" id="lv-invite" title="Inviter des personnes" aria-label="Inviter des personnes">' + ico('user-add') + '</button>' +
      '<button type="button" class="lv-ib lv-x" id="lv-x" title="Fermer le volet" aria-label="Fermer le volet">' + ico('x') + '</button></div>' +
      '<div class="lv-tabs" role="tablist">' +
      '<button type="button" role="tab" data-lt="chat" class="on" aria-selected="true">Discussion<i class="lv-tb" id="lv-tb" hidden></i></button>' +
      '<button type="button" role="tab" data-lt="people" aria-selected="false">Personnes</button>' +
      '<button type="button" role="tab" data-lt="settings" aria-selected="false">Réglages</button></div></header>' +
      '<div class="lv-net" id="lv-net" hidden></div>' +
      '<div class="lv-notifbar" id="lv-notifbar" hidden></div>' +
      '<div class="lv-callbar" id="lv-callbar" hidden></div>' +
      '<div class="lv-body">' +
      '<section class="lv-pane lv-pane-chat" data-lp="chat"><div id="wa-host"></div></section>' +
      '<section class="lv-pane lv-scroll" data-lp="people" hidden>' +
      '<p class="lv-sync" id="lv-sync"></p>' +
      '<label class="lv-pos"><input type="checkbox" id="lv-sharing"><span class="lv-sw"></span><span class="lv-post"><b>Montrer ma position sur la carte</b><small id="lv-geo"></small></span></label>' +
      '<div class="lv-people" id="lv-people"></div>' +
      '<button type="button" class="lv-btn" id="lv-all">' + ico('target') + 'Voir tout le monde sur la carte</button></section>' +
      '<section class="lv-pane lv-scroll" data-lp="settings" hidden><div id="lv-set"></div></section>' +
      '<section class="lv-view" id="lv-invview" hidden></section></div></div>';
    var host = $('#live-host'); if (host) host.appendChild(panel); else ($('.stage') || document.body).appendChild(panel);
    $('#lv-x').addEventListener('click', function () { var c = $('#panel-close'); if (c) c.click(); else togglePanel(false); setTimeout(function () { if (SM.appel) SM.appel.maj(); }, 60); });
    $('#lv-invite').addEventListener('click', showInvite);
    $('#lv-callbtn').addEventListener('click', function () { if (SM.appel) SM.appel.start(); });
    $('#lv-sharing').addEventListener('change', function () { setShare(this.checked); });
    $('#lv-all').addEventListener('click', showAll);
    $$('.lv-tabs [data-lt]').forEach(function (t) { t.addEventListener('click', function () { setTab(t.dataset.lt); }); });
    function personne(e) {
      if (e.target.closest('[data-retry]')) { startGeo(true); return; }
      var r = e.target.closest('[data-u]'); if (!r) return;
      var p = everyone()[r.dataset.u]; if (!p) return;
      if (p.lat != null) { map.setView([p.lat, p.lon], Math.max(map.getZoom(), 15), { animate: true }); if (window.innerWidth <= 860) togglePanel(false); }
      else toast(r.dataset.u === st.uid ? (st.geoErr ? geoText() : 'Votre position n’est pas partagée.') : (p.n || 'Cette personne') + ' ne partage pas sa position.');
    }
    $('#lv-people').addEventListener('click', personne);
    $('#lv-people').addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-u]')) { e.preventDefault(); personne(e); } });
    var rb = $('#rail-share'); if (rb) rb.addEventListener('click', function () { setTimeout(onOpen, 0); });
    ['#panel-close', '#rail-toggle'].forEach(function (q) { var b = $(q); if (b) b.addEventListener('click', function () { setTimeout(function () { if (SM.appel) SM.appel.maj(); }, 60); }); });
    renderIdle();
  }
  // Écran d'accueil de l'onglet « Partage » tant qu'aucun partage n'est en cours
  function renderIdle() {
    var el = $('#lv-idle'); if (!el) return;
    var q = modeNow();
    el.hidden = false;
    if (window.SM_LIVE_ROOM) {      // page d'un invité qui n'a pas (encore) rejoint
      el.innerHTML = '<div class="lv-wel"><span class="lv-bigav">' + ico('people') + '</span><h3>Partage en direct</h3><p class="lv-lead">Vous n’avez pas rejoint ce partage.</p><button type="button" class="lv-big" id="lv-rejoin">Rejoindre</button></div>';
      var rj = $('#lv-rejoin'); if (rj) rj.addEventListener('click', function () { location.reload(); });
      return;
    }
    el.innerHTML = '<div class="lv-wel"><span class="lv-bigav">' + ico('people') + '</span>' +
      '<h3>Partager ' + (q || 'la carte') + ' en direct</h3>' +
      '<ul><li>Les personnes invitées scannent un QR code ou ouvrent un lien : rien à installer.</li><li>Tout le monde se voit sur la carte, avec son prénom.</li><li>Une discussion et des appels vocaux sont inclus.</li></ul>' +
      '<button type="button" class="lv-big" id="lv-startbtn">' + ico('people') + 'Sur le terrain : je dirige, les autres suivent</button>' +
      '<button type="button" class="lv-big lv-big2" id="lv-prepbtn">' + ico('edit') + 'Préparer à plusieurs : tout le monde modifie</button>' +
      '<p class="lv-note">' + (q ? '' : 'La carte est vide pour l’instant : ce que vous poserez (itinéraire, azimuts, grand jeu) apparaîtra chez les autres. ') + 'Tout est chiffré : seules les personnes qui ont le lien peuvent lire.</p></div>';
    var b = $('#lv-startbtn'); if (b) b.addEventListener('click', function () { start(false); });
    var b2 = $('#lv-prepbtn'); if (b2) b2.addEventListener('click', function () { start(true); });
  }
  function isOpen() { return !!(SM.subOpen && SM.subOpen() === 'share' && S.panelOpen !== false); }
  function onOpen() { if (SM.appel) SM.appel.maj(); if (!st.room) return; if (st.tab === 'chat' && SM.chat) SM.chat.open(); renderPeople(); }
  function setTab(k) {
    st.tab = k; closeInvite();
    $$('.lv-tabs [data-lt]').forEach(function (t) { var on = t.dataset.lt === k; t.classList.toggle('on', on); t.setAttribute('aria-selected', String(on)); });
    $$('.lv-pane').forEach(function (p) { p.hidden = p.dataset.lp !== k; });
    if (k === 'chat' && SM.chat) SM.chat.open();
    if (k !== 'chat' && SM.chat) SM.chat.close();
    if (k === 'settings') renderSettings();
    if (k === 'people') renderPeople();
  }
  function togglePanel(on) {
    var open = isOpen(), want = on === undefined ? !open : on;
    if (want && !open) SM.showSub('share');
    else if (!want && open) { var pc = $('#panel-close'); if (window.innerWidth <= 860 && pc) pc.click(); else SM.showSub(null); }
    if (isOpen()) onOpen(); else if (SM.appel) SM.appel.maj();
  }
  function badge() {
    var n = st.unread > 9 ? '9+' : st.unread, r = $('#share-badge'), t = $('#lv-tb');
    [r, t].forEach(function (e) { if (e) { e.hidden = !st.unread; e.textContent = n; } });
    var base = document.title.replace(/^\(\d+\+?\)\s/, '');
    if (st.unread && document.visibilityState === 'hidden') document.title = '(' + n + ') ' + base; else if (document.title !== base) document.title = base;
  }
  // Notifications : invitation (une fois) et carte de réglages
  function notifBar() {
    var el = $('#lv-notifbar'), N = SM.notif; if (!el) return;
    var g = N ? N.get() : null;
    if (!g || g.perm !== 'default' || g.asked || !st.room) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = '<span>' + ico('bell') + 'Être prévenu (notification et vibration) quand un message ou un appel arrive ?</span><span class="lv-cb-a"><button type="button" class="lv-cbb green" id="lv-nbon">Activer</button><button type="button" class="lv-cbb" id="lv-nbno">Plus tard</button></span>';
    $('#lv-nbon').addEventListener('click', function () { N.request().then(function (r) { notifBar(); if ($('#lv-set')) renderSettings(); toast(r === 'granted' ? 'Notifications activées.' : r === 'denied' ? 'Notifications refusées : vous pourrez les autoriser dans les réglages du navigateur.' : 'Notifications non disponibles ici.'); }); });
    $('#lv-nbno').addEventListener('click', function () { N.dismissAsk(); notifBar(); });
  }
  function notifCard() {
    var N = SM.notif; if (!N) return '';
    var g = N.get(), note = g.perm === 'unsupported' ? 'Les notifications ne sont pas disponibles dans ce navigateur.' : g.perm === 'denied' ? 'Refusées dans le navigateur : autorisez-les dans les réglages du site (icône à gauche de l’adresse).' : 'Quand ScoutMap est en arrière-plan, le système vous prévient (et fait vibrer sur Android).';
    return '<div class="lv-card"><b>Notifications et vibrations</b>' +
      '<label class="lv-pos"><input type="checkbox" id="lv-nvib"' + (g.vib ? ' checked' : '') + '><span class="lv-sw"></span><span class="lv-post"><b>Vibrer</b><small>' + (g.canVibrate ? 'Pour les messages, et plusieurs fois pour un appel, comme un téléphone.' : 'Non disponible sur cet appareil (iPhone) ou ce navigateur.') + '</small></span></label>' +
      '<label class="lv-pos"><input type="checkbox" id="lv-nsys"' + (g.sys ? ' checked' : '') + (g.perm === 'unsupported' || g.perm === 'denied' ? ' disabled' : '') + '><span class="lv-sw"></span><span class="lv-post"><b>Notifications du système</b><small>' + note + '</small></span></label>' +
      '<button type="button" class="lv-btn" id="lv-ntest">' + ico('bell') + 'Tester</button></div>';
  }
  function bindNotifCard() {
    var N = SM.notif; if (!N || !$('#lv-nvib')) return;
    $('#lv-nvib').addEventListener('change', function () { N.setVib(this.checked); });
    $('#lv-nsys').addEventListener('change', function () { var box = this; N.setSys(box.checked).then(function (r) { if (r === 'denied') toast('Notifications refusées : autorisez-les dans les réglages du navigateur.'); renderSettings(); notifBar(); }); });
    $('#lv-ntest').addEventListener('click', function () { N.test(); toast(N.get().vib && N.get().canVibrate ? 'Vibration testée.' : 'Test envoyé.'); });
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { var b = document.title.replace(/^\(\d+\+?\)\s/, ''); if (b !== document.title) document.title = b; } });
  function closeInvite() { var v = $('#lv-invview'); if (v) v.hidden = true; }

  // ---------- Création et accès ----------
  function hasContent() { return st.mode === 'az' ? S.az.pts.length > 0 : st.mode === 'route' ? S.route.wps.length > 1 : S.game.shapes.length > 0; }
  function liveName() { return st.mode === 'az' ? (S.az.name || 'Azimuts') : st.mode === 'route' ? (S.route.name || 'Itinéraire') : (S.game.name || 'Grand jeu'); }
  function saveSession() { try { localStorage.setItem('scoutmap.live.session', JSON.stringify({ prep: st.prep, mode: st.mode, room: st.room, key: st.key, owner: st.owner, admin: st.admin, atok: st.atok, psec: st.psec, t: Date.now() })); } catch (e) { /* ignoré */ } }
  function clearSession() { try { localStorage.removeItem('scoutmap.live.session'); } catch (e) { /* ignoré */ } }
  function saveName(n) { st.name = n; try { localStorage.setItem('scoutmap.live.name', n); } catch (e) { /* ignoré */ } }
  // Prénom : demandé une seule fois (dans le volet, pas dans une fenêtre), ensuite modifiable dans Réglages
  function getName(title, okLabel, cb) {
    if (st.name) { cb(st.name); return; }
    build(); togglePanel(true);
    var el = $('#lv-idle'); $('#lv-live').hidden = true; el.hidden = false;
    el.innerHTML = '<div class="lv-wel"><span class="lv-bigav">' + ico('people') + '</span><h3>' + esc(title) + '</h3>' +
      '<p class="lv-lead">Entrez votre prénom : il s’affichera à côté de votre position et de vos messages.</p>' +
      '<label class="lv-fld lv-wide">Prénom<input id="lv-name" type="text" maxlength="24" autocomplete="given-name"></label>' +
      '<button type="button" class="lv-big" id="lv-ok">' + esc(okLabel) + '</button><button type="button" class="lv-textbtn" id="lv-cancel">Annuler</button></div>';
    var i = $('#lv-name'); setTimeout(function () { i.focus(); }, 80);
    function go() { var n = i.value.trim(); if (!n) { i.focus(); return; } saveName(n); cb(n); }
    $('#lv-ok').addEventListener('click', go); i.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    $('#lv-cancel').addEventListener('click', function () { renderIdle(); if (cb.cancel) cb.cancel(); });
  }
  // La personne qui lance le partage
  function start(prep) {
    build();
    if (prep === true || prep === false) st.prep = prep;
    if (!configured()) { toast('Ce navigateur ne permet pas le partage en direct.'); return; }
    if (!window.crypto || !crypto.subtle) { toast('Le partage en direct demande une connexion sécurisée (https).'); return; }
    if (st.room) { togglePanel(true); return; }
    st.mode = (S.mode === 'game' || S.mode === 'az' || S.mode === 'route') ? S.mode : 'game';
    var vide = S.mode !== st.mode || !hasContent();     // carte vide : simple avertissement, le partage n'est pas bloqué
    getName('Partager ' + quoi() + ' en direct', 'Lancer le partage', function () {
      toast('Lancement du partage…');
      st.room = rand(16); st.key = b64u(crypto.getRandomValues(new Uint8Array(16))); st.psec = rand(32);
      importKey(st.key).then(function (k) { st.ck = k; return connect({ creer: true }); }).then(function (m) {
        if (!m.proprio) throw new Error('création refusée');
        st.owner = true; return publishGame();
      }).then(function () {
        // préparation à plusieurs : le lien d'invitation donne à chacun le droit de modifier (lien co-administrateur, révocable dans Réglages)
        if (st.prep && !st.atok) { var tk = rand(20); if (envoi({ t: 'admtok', tk: tk })) st.atok = tk; }
        active(true); startGeo(); showInvite(); saveSession();
        if (vide) setTimeout(function () { toast('Attention : la carte est vide pour l’instant. Le partage est lancé ; ce que vous poserez sur la carte apparaîtra chez les autres.'); }, 900);
      }).catch(function (e) { st.fini = true; if (st.ws) st.ws.close(); st.room = null; renderIdle(); toast('Impossible de lancer le partage : ' + (e && e.message ? e.message : 'service indisponible') + '.'); });
    });
  }
  // Une personne qui arrive par le QR code ou le lien
  function join(room, key, atok) {
    build();
    try { if (new URLSearchParams(location.search).get('prep') === '1') st.prep = true; } catch (e) { /* ignoré */ }
    if (st.prep && !window.SM_VIEWER && SM.saveWork) SM.saveWork();
    if (!configured()) { toast('Ce navigateur ne permet pas le partage en direct.'); return; }
    st.room = room; st.key = key;
    var go = function () {
      toast('Connexion au partage…');
      importKey(key).then(function (k) { st.ck = k; return connect({ adm: atok }); }).then(function (m) {
        if (m.admin && !m.proprio) st.atok = atok;
        active(window.innerWidth > 860); return st.owner ? null : loadGame().catch(attenteCarte);
      }).then(function () { if (st.admin) { st.lastGame = JSON.stringify(snapshot()); if (!window.SM_VIEWER) SM.setMode(st.mode); toast('Vous êtes co-administrateur : vous pouvez modifier la carte.'); } startGeo(); saveSession(); })
        .catch(function (e) { if (e && e.name === 'OperationError') e = new Error('Lien incomplet : scannez de nouveau le QR code.'); st.fini = true; if (st.ws) st.ws.close(); st.room = null; renderIdle(); toast(e && e.message ? e.message : 'Connexion impossible.'); });
    };
    go.cancel = function () { st.room = null; st.key = null; };
    getName('Rejoindre le partage', 'Rejoindre', go);
  }
  // Après un rechargement de la page : reconnexion automatique
  function resume() {
    var s; try { s = JSON.parse(localStorage.getItem('scoutmap.live.session') || 'null'); } catch (e) { s = null; }
    if (!s || !s.room || !s.key || Date.now() - s.t > 3 * 86400000 || !configured() || !window.crypto || !crypto.subtle) return;
    build(); st.room = s.room; st.key = s.key; st.psec = s.psec || null; st.atok = s.atok || null; st.mode = s.mode || 'game'; st.prep = !!s.prep;
    importKey(s.key).then(function (k) { st.ck = k; return connect(); }).then(function () {
      if (s.owner && !st.owner) throw new Error('fin');
      active(window.innerWidth > 860); if (st.owner) { st.lastGame = ''; if (!window.SM_VIEWER) { SM.showHome(false); SM.setMode(st.mode); } } return st.owner ? null : loadGame().catch(attenteCarte).then(function () { if (st.admin) { st.lastGame = JSON.stringify(snapshot()); SM.setMode(st.mode); } });
    }).then(function () { startGeo(); saveSession(); toast('Partage en direct retrouvé.'); }).catch(function (e) {
      var fatal = e && /terminé|n’existe plus|^fin$/.test(e.message || '');
      st.fini = true; killWs(); st.room = null; st.key = null; st.owner = false; st.admin = false;
      if (fatal) clearSession(); else if ((s.essaisReprise = (s.essaisReprise || 0) + 1) < 8) setTimeout(resume, 6000);      // réseau absent au démarrage : on garde le partage et on réessaie
    });
  }
  // Minuterie fiable : un Worker n'est pas ralenti quand l'onglet passe en arrière-plan (sinon les autres nous voient « partis »)
  function ticker(fn, ms) {
    try {
      var url = URL.createObjectURL(new Blob(['setInterval(function(){postMessage(1)},' + ms + ')'], { type: 'text/javascript' })), w = new Worker(url);
      w.onmessage = function () { fn(); };
      return function () { w.terminate(); URL.revokeObjectURL(url); };
    } catch (e) { var id = setInterval(fn, ms); return function () { clearInterval(id); }; }
  }
  function active(show) {
    document.body.classList.add('lv-active'); $('#lv-title').textContent = liveName();
    $('#lv-idle').hidden = true; $('#lv-live').hidden = false;
    st.known = null; setTab('chat'); renderSettings(); notifBar(); if (show) togglePanel(true); else if (window.innerWidth <= 860 && isOpen()) togglePanel(false); else onOpen();
    st.timers.push(setInterval(renderPeople, 5000));
    st.timers.push(ticker(watchdog, 5000));
    st.timers.push(setInterval(function () { if (st.conn !== 'ok') netUI(); }, 1000));
    st.timers.push(ticker(function () { envoi({ t: 'ping', c: Date.now() }); }, 15000));
    st.timers.push(ticker(function () { beat(); }, 10000));
    if (canEdit()) st.timers.push(setInterval(function () { publishGame(); }, st.prep ? 1500 : 4000));
  }

  // ---------- La carte partagée (envoyée par le chef, reçue en lecture seule par les autres) ----------
  function snapshot() {
    if (st.mode === 'route') S.route.wps.forEach(function (w) { if (w.id == null) w.id = SM.nid(); });
    var snap = snapshot0();
    snap.by = st.name || '';
    if (st.mode === 'route') snap.layers = S.layers.filter(function (l) { return l.type === 'route' || l.type === 'az'; }).map(function (l) { return { type: l.type, vis: l.vis !== false, data: l.data, res: l.res || null, pid: l.pid || null }; });
    return snap;
  }
  function snapshot0() { return { app: 'ScoutMap', v: 1, name: liveName(), rail: st.mode, base: S.base, ov: S.ov, route: st.mode === 'route' ? S.route : { wps: [] }, az: st.mode === 'az' ? S.az : { pts: [] }, tracks: [], game: st.mode === 'game' ? S.game : { shapes: [] } }; }
  function publishGame() {
    if (!canEdit() || !st.room) return Promise.resolve();
    // le chef peut changer de type de travail (itinéraire, azimuts, jeu) après avoir lancé le partage : on envoie toujours celui qu'il a sous les yeux
    if ((S.mode === 'game' || S.mode === 'az' || S.mode === 'route') && S.mode !== st.mode) { st.mode = S.mode; st.lastGame = ''; renderSettings(); }
    if (!hasContent()) return Promise.resolve();
    var js = JSON.stringify(snapshot()); if (js === st.lastGame) return Promise.resolve(); st.lastGame = js; st.base = js;
    return enc(snapshot()).then(function (e) { if (envoi({ t: 'carte', d: e })) st.sync.sent = Date.now(); else st.lastGame = ''; }).catch(function () { st.lastGame = ''; logErr('envoi de la carte impossible'); });
  }
  function loadGame(first, mine) {
    return Promise.resolve().then(function () {
      if (!st.carte) throw new Error('Rien n’a encore été partagé.');
      return dec(st.carte.d);
    }).then(function (data) {
      if (mine) { var js = JSON.stringify(data); if (st.lastGame && js === st.lastGame) return; }
      if (data.name) $('#lv-title').textContent = data.name;
      if (data.rail === 'az' || data.rail === 'game' || data.rail === 'route') { st.mode = data.rail; renderSettings(); }
      SM.loadProject(data, null, { keepView: !!st.loaded }); st.loaded = true; st.sync.recv = Date.now(); if (st.admin) { st.lastGame = JSON.stringify(snapshot()); st.base = JSON.stringify(data); }
    }).catch(function (e) { if (e && e.name === 'OperationError') throw new Error('Lien incorrect (clé invalide) : scannez de nouveau le QR code.'); throw e; });
  }

  // ---------- Ma position (affichée tout de suite sur la carte, indépendamment du serveur) ----------
  function geoText() {
    if (!st.share) return 'Masquée : les autres ne voient pas où vous êtes.';
    if (st.geoErr === 'denied') return 'Autorisation refusée : autorisez la localisation dans les réglages du navigateur.';
    if (st.geoErr === 'absent') return 'La localisation n’est pas disponible sur cet appareil.';
    if (st.geoErr === 'timeout') return 'Position introuvable pour l’instant (essayez à l’extérieur).';
    return st.fix ? (st.fix.coarse ? 'Position approximative (±' + st.fix.acc + ' m) : sur ordinateur, elle vient du réseau.' : 'Partagée (précision ±' + st.fix.acc + ' m).') : 'Recherche de votre position…';
  }
  function startGeo(force) {
    if (!st.share) return;
    if (!window.SMGeo || !navigator.geolocation) { st.geoErr = 'absent'; renderPeople(); return; }
    if (st.unGeo) { if (!force) return; st.unGeo(); st.unGeo = null; }
    st.geoErr = '';
    st.unGeo = SMGeo.subscribe(function (f) {
      var first = !st.fix; st.geoErr = ''; st.fix = { lat: f.lat, lon: f.lon, acc: f.acc, coarse: !!f.coarse };
      renderPeople(); if (first || Date.now() - st.lastSend > 4000) beat(true);
    }, function (code) {
      if (code === 'timeout' && st.fix) return;                       // un point en retard n'efface pas la position qu'on a déjà
      st.geoErr = code; if (code === 'denied' || code === 'absent') { if (st.unGeo) { st.unGeo(); st.unGeo = null; } }
      renderPeople(); beat(true);
    });
  }
  function stopGeo() { if (st.unGeo) { st.unGeo(); st.unGeo = null; } st.fix = null; st.geoErr = ''; }
  function setShare(on) {
    st.share = !!on; try { localStorage.setItem('scoutmap.live.share', on ? '1' : '0'); } catch (e) { /* ignoré */ }
    if (on) startGeo(true); else stopGeo();
    renderPeople(); beat(true);
  }
  // Signe de vie (toutes les 10 s) et position : la même enveloppe chiffrée, avec ou sans coordonnées
  function beat(force) {
    if (!st.room || !st.ck || !st.name) return;
    if (!force && Date.now() - st.lastSend < 8000) return;
    st.lastSend = Date.now();
    var o = { n: st.name, c: colorOf(st.uid), v: SM.version || '' };
    o.sh = st.share ? 1 : 0;
    if (st.share && st.fix) { o.lat = st.fix.lat; o.lon = st.fix.lon; o.acc = st.fix.acc; }
    if (SM.chat) SM.chat.presence(o);
    enc(o).then(function (e) { envoi({ t: 'pos', d: e }); }).catch(function () { /* hors réseau : prochain signe de vie */ });
  }

  // ---------- Personnes ----------
  function everyone() {
    var out = {}; Object.keys(st.remote).forEach(function (u) { if (u !== st.uid) out[u] = st.remote[u]; });
    out[st.uid] = { n: st.name, c: colorOf(st.uid), t: now(), me: true };
    if (st.share && st.fix) { out[st.uid].lat = st.fix.lat; out[st.uid].lon = st.fix.lon; out[st.uid].acc = st.fix.acc; }
    return out;
  }
  var rpT = null;
  function renderPeople() { if (rpT) return; rpT = setTimeout(function () { rpT = null; renderPeopleNow(); }, 100); }       // plusieurs demandes rapprochées = un seul rendu
  function renderPeopleNow() {
    if (!panel || !st.room) return;
    var bounds = map.getBounds(), all = everyone(), t = now(), ids = Object.keys(all).filter(function (u) { return u === st.uid || t - all[u].t < RECENT; });
    function on(u) { return u === st.uid || t - all[u].t < ONLINE; }
    ids.sort(function (a, b) { return a === st.uid ? -1 : b === st.uid ? 1 : (on(b) - on(a)) || (all[a].n || '').localeCompare(all[b].n || ''); });
    var nOn = ids.filter(on).length;
    $('#lv-count').textContent = nOn + ' en ligne'; if (SM.chat && SM.chat.refresh) SM.chat.refresh();
    var rc = $('#share-count'); if (rc) { rc.hidden = false; rc.textContent = String(nOn); rc.title = nOn + (nOn > 1 ? ' personnes connectées' : ' personne connectée'); }
    var sh = $('#lv-sharing'); if (sh) sh.checked = st.share;
    var g = $('#lv-geo'); if (g) g.textContent = geoText();
    $('#lv-people').innerHTML = ids.map(function (u) {
      var p = all[u], online = on(u), me = u === st.uid, dist = !me && p.lat != null && st.fix ? fmtDist(distM(st.fix.lat, st.fix.lon, p.lat, p.lon)) : '', hors = !me && p.lat != null && !bounds.contains([p.lat, p.lon]);
      var ver = !me && online && p.v !== SM.version ? ' · ⚠ ' + (p.v ? 'autre version du site' : 'ancienne version : à recharger') : '';
      var state = me ? (st.geoErr && st.share ? '<button type="button" class="lv-retry" data-retry>Réessayer</button>' : '') : online ? (p.lat != null ? 'en ligne' + (dist ? ' · à ' + dist : ' · position partagée') + (hors ? ' · hors de l’écran' : '') : 'en ligne · position non partagée') + ver : 'parti ' + ago(p.t);
      return '<div class="lv-p' + (online ? '' : ' old') + '" role="button" tabindex="0" data-u="' + esc(u) + '"><i class="' + (online ? 'on' : '') + '" style="background:' + esc(p.c || colorOf(u)) + '">' + initial(p.n) + '</i><span class="lv-pn"><b>' + esc(p.n || '?') + (me ? ' (moi)' : '') + '</b><small>' + (me ? (p.lat != null ? 'sur la carte' : 'pas sur la carte') : state) + '</small></span>' + (me ? state : '') + (p.lat != null ? '<svg class="ic lv-loc"><use href="#i-target"/></svg>' : '') + '</div>';
    }).join('');
    if (SM.appel) SM.appel.maj();
    syncLine();
    if ($('#lv-diag') && $('#lv-diag').open) { var pre = $('#lv-diagtxt'); if (pre) pre.textContent = diagText(); }
    // annonces discrètes : « Marie a rejoint »
    if (st.known === null) { st.known = {}; ids.forEach(function (u) { st.known[u] = 1; }); }
    else ids.forEach(function (u) { if (!st.known[u]) { st.known[u] = 1; if (u !== st.uid && on(u) && all[u].n) toast(all[u].n + ' a rejoint le partage.'); } });
    ids.forEach(function (u) { var p = all[u]; if (u !== st.uid && on(u) && p.lat != null && !st.warned[u] && !bounds.contains([p.lat, p.lon])) { st.warned[u] = 1; toast((p.n || 'Une personne') + ' est ' + (st.fix ? 'à ' + fmtDist(distM(st.fix.lat, st.fix.lon, p.lat, p.lon)) : 'hors de l’écran') + ' : touchez son nom dans la liste pour la voir.'); } });
    // marqueurs sur la carte
    Object.keys(st.markers).forEach(function (u) { if (ids.indexOf(u) < 0 || all[u].lat == null) { gLive.removeLayer(st.markers[u]); delete st.markers[u]; } });
    ids.forEach(function (u) {
      var p = all[u]; if (p.lat == null) return;
      var html = '<div class="lv-pin' + (on(u) ? '' : ' old') + (u === st.uid ? ' me' : '') + '" style="background:' + esc(p.c || colorOf(u)) + '">' + initial(p.n) + '</div><span class="lv-tag">' + esc(u === st.uid ? (p.n || '') + ' (moi)' : (p.n || '?')) + '</span>';
      var mk = st.markers[u];
      if (mk && mk._lvHtml === html) { var cur = mk.getLatLng(); if (cur.lat !== p.lat || cur.lng !== p.lon) mk.setLatLng([p.lat, p.lon]); return; }       // rien n'a changé : on ne touche pas au marqueur
      var icon = L.divIcon({ className: 'lv-wrap', html: html, iconSize: [0, 0] });
      if (mk) { mk.setLatLng([p.lat, p.lon]); mk.setIcon(icon); mk._lvHtml = html; }
      else st.markers[u] = L.marker([p.lat, p.lon], { icon: icon, zIndexOffset: u === st.uid ? 4000 : 3500, title: p.n || '' }).addTo(gLive), st.markers[u]._lvHtml = html;
    });
  }
  function distM(a, b, c, d) { var R = 6371000, r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return R * Math.sqrt(x * x + y * y); }
  function fmtDist(m) { return m < 950 ? Math.round(m / 10) * 10 + ' m' : (m < 10000 ? (m / 1000).toFixed(1).replace('.', ',') : Math.round(m / 1000)) + ' km'; }
  // État de la carte partagée : on voit tout de suite si elle arrive (ou part) bien
  function syncLine() {
    var el = $('#lv-sync'); if (!el) return;
    var t = st.owner || st.admin ? st.sync.sent : st.sync.recv, s2 = t ? Math.max(0, Math.round((Date.now() - t) / 1000)) : 0;
    var ago2 = s2 < 5 ? 'à l’instant' : s2 < 90 ? 'il y a ' + s2 + ' s' : 'il y a ' + Math.round(s2 / 60) + ' min';
    el.textContent = st.owner || st.admin ? (t ? 'Carte partagée : dernière mise à jour envoyée ' + ago2 + '.' : 'Rien à envoyer pour l’instant : ce que vous poserez sur la carte sera partagé.') : (t ? 'Carte reçue ' + ago2 + '.' : 'En attente de la carte de la personne qui partage…');
  }
  function diagText() {
    var t = Date.now(), all = everyone(), nOn = Object.keys(all).filter(function (u) { return u === st.uid || now() - all[u].t < ONLINE; }).length;
    var c = SM.appel && SM.appel.etat ? SM.appel.etat() : null;
    return ['Version du site : ' + (SM.version || '?'), 'Navigateur : ' + (navigator.userAgent || '').replace(/\s+/g, ' ').slice(0, 120),
      'Connexion : ' + (st.conn === 'ok' ? 'établie' : 'perdue (essai ' + st.essais + ')') + ' · prise : ' + (st.ws ? ['en cours', 'ouverte', 'fermeture', 'fermée'][st.ws.readyState] : 'aucune'),
      'Dernier message du serveur : il y a ' + Math.round((t - st.lastIn) / 1000) + ' s · aller-retour : ' + (st.ping != null ? st.ping + ' ms' : 'inconnu'),
      'Rôle : ' + (st.owner ? 'chef' : st.admin ? 'co-administrateur' : 'lecture seule') + ' · type : ' + st.mode + ' · décalage d’horloge : ' + Math.round(st.offset / 1000) + ' s',
      'Personnes vues : ' + Object.keys(all).length + ' (en ligne : ' + nOn + ') · messages illisibles : ' + st.decFail,
      'Ma position : ' + (!st.share ? 'masquée' : st.geoErr ? 'erreur ' + st.geoErr : st.fix ? 'ok ±' + st.fix.acc + ' m' : 'en recherche'),
      'Carte : envoyée ' + (st.sync.sent ? Math.round((t - st.sync.sent) / 1000) + ' s' : 'jamais') + ' · reçue ' + (st.sync.recv ? Math.round((t - st.sync.recv) / 1000) + ' s' : 'jamais'),
      'Messages en attente d’envoi : ' + (SM.chat ? SM.chat.pending() : 0),
      'Appel : ' + (c ? JSON.stringify(c).slice(0, 220) : 'indisponible'),
      'Erreurs récentes : ' + (st.errs.length ? '\n  ' + st.errs.join('\n  ') : 'aucune')].join('\n');
  }
  function showAll() {
    var pts = []; Object.keys(st.markers).forEach(function (u) { pts.push(st.markers[u].getLatLng()); });
    if (!pts.length) { toast('Personne ne partage sa position pour l’instant.'); return; }
    if (pts.length === 1) { map.setView(pts[0], Math.max(map.getZoom(), 15)); return; }
    map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 17 });
    if (window.innerWidth <= 860) togglePanel(false);
  }

  // ---------- Réglages ----------
  function renderSettings() {
    var el = $('#lv-set'); if (!el || !st.room) return;
    var droits = st.prep ? 'Préparation à plusieurs : toutes les personnes invitées modifient la carte. Les changements faits en même temps sont fusionnés (chacun garde ses ajouts) et arrivent chez les autres en une ou deux secondes. ' + (st.owner ? 'Pour reprendre la main seul, révoquez le lien co-administrateur ci-dessous.' : '') : st.owner ? 'Vous dirigez le partage : vos modifications de la carte sont envoyées aux autres en quelques secondes.' : st.admin ? 'Vous êtes co-administrateur : vous pouvez modifier la carte comme la personne qui a lancé le partage.' : 'Vous suivez ' + quoi() + ' en lecture seule.';
    el.innerHTML =
      '<div class="lv-card"><label class="lv-fld">Mon prénom<span class="lv-fr"><input id="lv-nm" type="text" maxlength="24" value="' + esc(st.name) + '" autocomplete="given-name"><button type="button" class="lv-btn" id="lv-nms">Enregistrer</button></span></label></div>' +
      '<p class="lv-role">' + esc(droits) + '</p>' +
      notifCard() +
      (st.owner ? '<div class="lv-card"><b>Co-administrateur</b><p>Pour quelqu’un de confiance qui doit pouvoir modifier la carte avec vous.</p><div class="lv-acts"><button class="lv-btn" id="lv-acopy" type="button">' + ico('copy') + 'Copier le lien</button><button class="lv-btn" id="lv-arev" type="button">Révoquer</button></div></div>' : '') +
      '<details class="lv-diag" id="lv-diag"><summary>État technique (en cas de problème)</summary><pre id="lv-diagtxt"></pre><button type="button" class="lv-btn" id="lv-diagcopy">' + ico('copy') + 'Copier pour l’envoyer</button></details>' +
      '<div class="lv-end" id="lv-endbox"><button type="button" class="lv-btn danger" id="lv-end">' + (st.owner ? 'Terminer le partage pour tout le monde' : 'Quitter le partage') + '</button></div>';
    bindNotifCard();
    function saveNm() { var n = $('#lv-nm').value.trim(); if (!n) return; saveName(n); beat(true); renderPeople(); toast('Prénom enregistré.'); }
    $('#lv-nms').addEventListener('click', saveNm); $('#lv-nm').addEventListener('keydown', function (e) { if (e.key === 'Enter') saveNm(); });
    $('#lv-end').addEventListener('click', function () {      // confirmation dans le volet (pas de fenêtre)
      $('#lv-endbox').innerHTML = '<p>' + (st.owner ? 'Terminer le partage ? Tout le monde sera déconnecté et les positions effacées.' : 'Quitter le partage ?') + '</p><div class="lv-acts"><button type="button" class="lv-btn danger" id="lv-end2">' + (st.owner ? 'Oui, terminer' : 'Oui, quitter') + '</button><button type="button" class="lv-btn" id="lv-end0">Annuler</button></div>';
      $('#lv-end2').addEventListener('click', function () { endOrLeave(true); }); $('#lv-end0').addEventListener('click', renderSettings);
    });
    var dg = $('#lv-diag'); function fillDiag() { var pre = $('#lv-diagtxt'); if (pre) pre.textContent = diagText(); }
    if (dg) { dg.addEventListener('toggle', fillDiag); $('#lv-diagcopy').addEventListener('click', function () { fillDiag(); copy($('#lv-diagtxt').textContent, 'État technique copié.'); }); }
    var ac = $('#lv-acopy');
    if (ac) {
      ac.addEventListener('click', function () {
        if (st.atok) { copy(adminLink(), 'Lien co-administrateur copié.'); return; }
        var tk = rand(20);
        if (envoi({ t: 'admtok', tk: tk })) { st.atok = tk; saveSession(); copy(adminLink(), 'Lien co-administrateur copié.'); } else toast('Impossible de créer le lien : connexion en cours de rétablissement.');
      });
      $('#lv-arev').addEventListener('click', function () { if (envoi({ t: 'revoquer' })) { st.atok = null; saveSession(); toast('Lien co-administrateur révoqué.'); } else toast('Révocation impossible pour le moment.'); });
    }
  }

  // ---------- Inviter (QR code) : vue dans le volet, pas une fenêtre ----------
  function showInvite() {
    if (!st.room) return;
    build(); togglePanel(true);
    var url = inviteLink(), qr = qrcode(0, 'M'); qr.addData(url); qr.make();
    var texte = 'Suis ' + quoi() + ' en direct sur ScoutMap : ' + url, v = $('#lv-invview');
    v.innerHTML = '<div class="lv-vh"><button type="button" class="lv-ib dark" id="lv-vback" aria-label="Retour" title="Retour">' + ico('chev-left') + '</button><b>Inviter des personnes</b></div>' +
      '<div class="lv-vc"><p class="lv-lead">Faites scanner ce code avec l’appareil photo d’un téléphone, ou envoyez le lien. La personne saisit son prénom et apparaît aussitôt sur la carte. Elle voit ' + quoi() + ' en lecture seule.</p>' +
      '<div class="lv-qr">' + qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }) + '</div>' +
      '<div class="lv-linkrow"><input class="lv-link" id="lv-link" type="text" readonly value="' + esc(url) + '" aria-label="Lien du partage en direct"><button type="button" class="lv-btn" id="lv-copy">' + ico('copy') + 'Copier</button></div>' +
      '<div class="lv-acts"><a class="lv-btn" id="lv-wa" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(texte) + '">' + WA_LOGO + 'Envoyer par WhatsApp</a>' +
      (navigator.share ? '<button type="button" class="lv-btn" id="lv-share">' + ico('share') + 'Autres applications…</button>' : '') + '</div></div>';
    v.hidden = false;
    $('#lv-vback').addEventListener('click', closeInvite);
    $('#lv-copy').addEventListener('click', function () { copy(url, 'Lien copié.'); });
    $('#lv-link').addEventListener('focus', function () { this.select(); });
    var sh = $('#lv-share'); if (sh) sh.addEventListener('click', function () { navigator.share({ title: Quoi() + ' en direct', text: 'Suis ' + quoi() + ' en direct sur ScoutMap', url: url }).catch(function () { /* annulé */ }); });
  }

  // ---------- Fin ----------
  function endOrLeave(ok) {
    if (!st.room || !ok) return;
    stopGeo();
    var moi = st.owner, fin = function () { setTimeout(function () { finish(moi ? 'Partage terminé.' : 'Vous avez quitté le partage.'); }, moi ? 300 : 0); };
    enc({ n: st.name, c: colorOf(st.uid), bye: 1 }).then(function (e) { envoi({ t: 'pos', d: e }); }).catch(function () { /* ignoré */ }).then(function () { envoi({ t: 'sanspos' }); if (moi) envoi({ t: 'fin' }); fin(); });
  }
  function finish(msg) {
    if (SM.appel) SM.appel.fin();
    stopGeo(); st.fini = true; if (st.rt) { clearTimeout(st.rt); st.rt = null; } killWs(); st.conn = 'ok'; if (SM.chat) SM.chat.reset(); st.carte = null; st.loaded = false; st.warned = {}; netUI();
    st.timers.forEach(function (t) { if (typeof t === 'function') t(); else clearInterval(t); }); st.timers = [];
    gLive.clearLayers(); st.markers = {}; st.remote = {}; st.unread = 0; st.known = null;
    st.panelOpen = false; document.body.classList.remove('lv-open', 'lv-active'); closeInvite();
    if ($('#lv-live')) { $('#lv-live').hidden = true; $('#lv-idle').hidden = false; renderIdle(); } var rc = $('#share-count'); if (rc) rc.hidden = true; badge();
    try { localStorage.removeItem('scoutmap.live.roster.' + st.room); } catch (e) { /* ignoré */ } st.roster = {}; st.rosterFor = null;
    st.room = null; st.key = null; st.owner = false; st.admin = false; st.atok = null; st.psec = null; st.lastGame = '';
    clearSession();
    toast(msg);
  }

  // ---------- Branchements ----------
  SM.live = { start: start, join: join, active: function () { return !!st.room; } };
  // Interface interne pour appel.js (appels vocaux) : état du partage, chiffrement, envoi, annonces
  SM.liveApi = { st: st, enc: enc, dec: dec, envoi: envoi, toast: toast, esc: esc, colorOf: colorOf, everyone: everyone, initial: initial, isOpen: isOpen, togglePanel: togglePanel,
    beat: beat, badge: badge, now: now, roster: roster, apply: apply, rand: rand, logErr: logErr, copy: copy, setTab: setTab, hhmm: hhmm, liveName: liveName, retry: function () { st.essais = 0; if (st.conn !== 'ok') retry(true); },
    center: function (lat, lon) { map.setView([lat, lon], Math.max(map.getZoom(), 16), { animate: true }); if (window.innerWidth <= 860) togglePanel(false); }, fix: function () { return st.fix; } };
  var P; try { P = new URLSearchParams(location.search); } catch (e) { P = null; }
  var room = P && P.get('direct'), km = /[#&]k=([A-Za-z0-9_-]+)/.exec(location.hash);
  var am = /[#&]a=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (room && km) { build(); setTimeout(function () { join(room, km[1], am && am[1]); }, 400); }
  else if (!room && P && P.get('salle')) setTimeout(function () { toast('Ce lien date de l’ancien système de partage, qui n’existe plus : demandez un nouveau QR code.'); }, 600);
  else if (!room) setTimeout(resume, 800);
  else if (room) { build(); setTimeout(function () { toast('Lien incomplet : scannez de nouveau le QR code (il manque la clé).'); }, 600); }
  build();
})();
