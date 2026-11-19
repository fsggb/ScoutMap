/* ScoutMap : discussion du partage en direct, avec l'apparence et les fonctions d'une messagerie de groupe comme WhatsApp.
   - bulles vertes (moi) et blanches (les autres), heure et coches : envoyé ✓, reçu ✓✓, lu ✓✓ bleues ; « Léa écrit… » ;
   - photos (galerie ou appareil photo en direct), messages vocaux, documents, position ;
   - répondre, réagir (emoji), modifier (15 min), supprimer (pour moi / pour tous), copier, infos (qui a lu).
   Tout est chiffré dans le navigateur (clé du lien) ; le serveur ne voit rien de lisible.
   « Lu / reçu » et « écrit… » voyagent dans le signe de vie chiffré de chaque personne ; modifications, suppressions et réactions sont des
   messages chiffrés comme les autres. Les photos et sons sont chiffrés puis déposés sur le serveur du partage (messages « media »). */
(function () {
  'use strict';
  var SM = window.SM, A = SM && SM.liveApi;
  if (!A) return;
  var st = A.st, esc = A.esc;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var MAXTXT = 1500, EDIT_MS = 15 * 60000, MEDIA_MAX = 650000, REC_MAX = 120, MEMBER_MS = 15 * 60000;
  var REACTS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
  var EMOJIS = ('😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😎 🤩 🥳 😏 😌 😴 🤔 🤗 🙄 😬 😮 😯 😲 😳 🥺 😢 😭 😤 😡 🤯 😱 😰 😓 🤒 🤕 🥶 🥵 😷 👍 👎 👏 🙌 👋 🤝 🙏 💪 ✌️ 🤞 👌 ❤️ 🧡 💛 💚 💙 💜 💔 🔥 ⭐ ✨ 🎉 🎶 ⛺ 🔥 🌲 ⛰️ 🧭 🗺️ 🥾 🎒 🔦 🍫 💧 ☀️ 🌧️ 🌙 ⚠️ ✅ ❌ 📍 📞 📷').split(' ');
  var C = { items: [], pend: {}, media: {}, mreq: {}, queue: [], busy: 0, reply: null, edit: null, open: false, rd: 0, dv: 0, typingAt: 0, typeKick: 0, typeT: null, kickT: null, lastKick: 0,
    rec: null, firstUnread: 0, hid: {}, built: false, aud: {}, facing: 'environment', stream: null, menuFor: null, down: 0 };
  var ICON = {
    send: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M1.1 21.76 23.8 12.03 1.1 2.3l.01 7.91 13.62 1.82-13.62 1.82z"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 15a3.2 3.2 0 0 0 3.2-3.2V5.2a3.2 3.2 0 0 0-6.4 0v6.6A3.2 3.2 0 0 0 12 15zm5.6-3.2a5.6 5.6 0 0 1-11.2 0H5a7 7 0 0 0 6 6.9V22h2v-3.3a7 7 0 0 0 6-6.9z"/></svg>',
    clip: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M16.5 6.5v9.9a4.5 4.5 0 0 1-9 0V5.7a3 3 0 0 1 6 0v9.5a1.5 1.5 0 0 1-3 0V6.5H9.1v8.7a3 3 0 0 0 6 0V5.7a4.5 4.5 0 0 0-9 0v10.7a6 6 0 0 0 12 0V6.5z"/></svg>',
    cam: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3zm3 14.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-2a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg>',
    smile: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-3.5-9a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6zm7 0a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6zM12 17.5a5 5 0 0 0 4.6-3H7.4a5 5 0 0 0 4.6 3z"/></svg>',
    chev: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7.4 9.6 12 14.2l4.6-4.6L18 11l-6 6-6-6z"/></svg>',
    reply: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M10 8V4l-8 8 8 8v-4.2c5.6 0 9.3 1.8 12 5.7-1-5.7-4.4-11-12-11.5z"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.75 3.75z"/></svg>',
    info: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11z"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
    doc: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm-1 7V3.5L18.5 9z"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
    img: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5z"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4l5.6 5.6L5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6z"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z"/></svg>',
    group: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 1.9 2 3.4V19h6v-2.5c0-2.3-4.700-3.500-7-3.500z"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>',
    flip: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M20 4h-3.2L15 2H9L7.2 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm-8 13a5 5 0 0 1-4.600-3H9l-3-3-3 3h1.700a7 7 0 0 0 12.300 1.600l-1.500-1.200A5 5 0 0 1 12 17zm5-3-1.700 0L18.300 11 21 14h-1.700a7 7 0 0 0-12.300-1.600l1.500 1.200A5 5 0 0 1 17 14z"/></svg>'
  };
  var TICK1 = '<svg viewBox="0 0 16 11" class="wa-tk"><path d="M1.5 5.8 5 9.3 11.5 2.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var TICK2 = '<svg viewBox="0 0 18 11" class="wa-tk"><path d="M1.5 5.8 5 9.3 11 2.8M7.300 8.600l1 .8 7-6.800" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CLOCK = '<svg viewBox="0 0 16 16" class="wa-tk wa-clk"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.500V8l2.500 1.500" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

  // ---------- chiffrement des fichiers ----------
  function toB64(u8) { var s = '', n = 0x8000; for (var i = 0; i < u8.length; i += n) s += String.fromCharCode.apply(null, u8.subarray(i, i + n)); return btoa(s); }
  function fromB64(b) { var s = atob(b), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function encBytes(u8) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, st.ck, u8).then(function (ct) { var o = new Uint8Array(12 + ct.byteLength); o.set(iv); o.set(new Uint8Array(ct), 12); return toB64(o); });
  }
  function decBytes(b) { var u = fromB64(b); return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, st.ck, u.slice(12)).then(function (x) { return new Uint8Array(x); }); }

  // ---------- messages reçus ----------
  function storeKey(p) { return 'scoutmap.chat.' + p + '.' + (st.room || ''); }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignoré */ } }
  function load(list) {
    if (!C.rdLoaded) { C.rd = +lsGet(storeKey('rd'), 0) || 0; try { C.hid = JSON.parse(lsGet(storeKey('hid'), '{}')) || {}; } catch (e) { C.hid = {}; } C.rdLoaded = true; }
    return Promise.all(list.map(function (m) { return onMsg(m, true); })).then(function () { recount(); render(); readNow(); });
  }
  function sortItems() { C.items.sort(function (a, b) { return a.at - b.at || (a.k < b.k ? -1 : 1); }); }
  function onMsg(m, hist) {
    return A.dec(m.d).then(function (d) {
      if (C.items.some(function (i) { return i.k === m.k; })) return;
      var mien = d.id && C.items.filter(function (i) { return i.d && i.d.id === d.id; })[0];
      if (mien) { mien.k = m.k; mien.at = m.at || mien.at; mien.etat = ''; delete C.pend[d.id]; sortItems(); if (!hist) { render(); } return; }      // écho : le serveur a bien reçu mon message
      C.items.push({ k: m.k, at: m.at || A.now(), d: d }); sortItems(); if (C.items.length > 400) C.items.shift();
      if ((m.at || 0) > C.dv) { C.dv = m.at; if (!hist) kick(); }
      if (!hist) { recount(); render(); readNow(); }
    }).catch(function () { st.decFail++; });
  }
  function isMsg(d) { return d && !d.ev; }
  function recount() {
    var n = 0; C.items.forEach(function (i) { if (isMsg(i.d) && i.d.u !== st.uid && i.at > C.rd && !C.hid[i.d.id || i.k]) n++; });
    st.unread = n; A.badge();
  }
  function visibleNow() { return C.open && A.isOpen() && document.visibilityState === 'visible' && (!document.hasFocus || document.hasFocus()); }
  function lastAt() { var t = 0; C.items.forEach(function (i) { if (i.at > t && String(i.k)[0] !== 'l') t = i.at; }); return t; }
  function readNow() {
    if (!visibleNow()) return;
    var t = lastAt(); if (t > C.rd) { C.rd = t; lsSet(storeKey('rd'), String(t)); kick(); }
    if (st.unread) { st.unread = 0; A.badge(); }
  }
  window.addEventListener('focus', readNow); document.addEventListener('visibilitychange', readNow);

  // ---------- signe de vie : lu, reçu, « écrit… » ----------
  function presence(o) {
    o.rd = C.rd; o.dv = C.dv;
    if (C.typingAt && Date.now() - C.typingAt < 5000) o.ty = A.now();
    if (C.rec) { o.ty = A.now(); o.tk = 'a'; }
  }
  function kick() {
    if (C.kickT) return;
    var wait = Math.max(0, 800 - (Date.now() - C.lastKick));
    C.kickT = setTimeout(function () { C.kickT = null; C.lastKick = Date.now(); A.beat(true); }, wait);
  }
  function members() { var all = A.everyone(), t = A.now(); return Object.keys(all).filter(function (u) { return u !== st.uid && t - all[u].t < MEMBER_MS; }); }
  function typingText() {
    var all = A.everyone(), t = A.now(), who = Object.keys(all).filter(function (u) { return u !== st.uid && all[u].ty && t - all[u].ty < 7000; });
    if (!who.length) return '';
    var rec = who.length === 1 && all[who[0]].tk === 'a', nm = who.map(function (u) { return all[u].n || 'Quelqu’un'; });
    if (rec) return nm[0] + ' enregistre un message vocal…';
    return nm.length === 1 ? nm[0] + ' écrit…' : nm.length === 2 ? nm[0] + ' et ' + nm[1] + ' écrivent…' : nm.length + ' personnes écrivent…';
  }
  function statusOf(o) {
    if (o.it.etat === 'echec') return 'echec';
    if (o.it.etat) return 'attente';
    var ms = members(); if (!ms.length) return 'envoye';
    var all = A.everyone(), rd = ms.every(function (u) { return (all[u].rd || 0) >= o.at; }), dv = ms.every(function (u) { return (all[u].dv || 0) >= o.at; });
    return rd ? 'lu' : dv ? 'recu' : 'envoye';
  }
  function tickHtml(s) { return s === 'attente' ? CLOCK : s === 'echec' ? '<span class="wa-fail">!</span>' : s === 'envoye' ? TICK1 : TICK2; }
  function refresh() {
    if (!C.built) return;
    var h = $('#lv-count'); if (h) { var tt = typingText(); h.textContent = tt || subtitle(); h.classList.toggle('typing', !!tt); }
    var by = {}; model().list.forEach(function (o) { by[o.id] = o; });
    $$('#wa-list .wa-row.out').forEach(function (r) { var o = by[r.dataset.id]; if (!o) return; var s = statusOf(o), t = $('.wa-st', r); if (t) { t.className = 'wa-st s-' + s; t.innerHTML = tickHtml(s); } });
  }
  function subtitle() {
    var all = A.everyone(), t = A.now(), ids = Object.keys(all).filter(function (u) { return u === st.uid || t - all[u].t < 45000; });
    ids.sort(function (a, b) { return a === st.uid ? 1 : b === st.uid ? -1 : (all[a].n || '').localeCompare(all[b].n || ''); });
    return ids.map(function (u) { return u === st.uid ? 'Vous' : (all[u].n || '?'); }).join(', ');
  }

  // ---------- état d'envoi, renvoi ----------
  function localItem(d) { var it = { k: 'l' + d.id, at: A.now(), d: d, etat: 'envoi' }; C.items.push(it); sortItems(); return it; }
  function itemOf(id) { return C.items.filter(function (i) { return i.d && i.d.id === id; })[0]; }
  function post(id) {
    var p = C.pend[id], it = itemOf(id); if (!p) return;
    if (p.up) { startUpload(id); return; }
    if (!A.envoi({ t: 'msg', d: p.e })) { if (it) it.etat = 'attente'; render(); return; }
    if (it) it.etat = 'envoi';
    setTimeout(function () { var x = itemOf(id); if (x && x.etat && C.pend[id] && !C.pend[id].up) { x.etat = 'echec'; x.err = 'Le serveur n’a pas confirmé l’envoi.'; A.logErr('message sans accusé de réception'); render(); } }, 9000);
  }
  function submit(d) {          // d : contenu sans identifiant ; renvoie l'élément local
    d.id = A.rand(10); d.u = st.uid; d.n = st.name; d.c = A.colorOf(st.uid);
    var it = localItem(d);
    return A.enc(d).then(function (e) { C.pend[d.id] = { e: e, t: Date.now() }; post(d.id); render(); return it; }).catch(function () { it.etat = 'echec'; A.logErr('chiffrement impossible'); render(); return it; });
  }
  function resend() { Object.keys(C.pend).forEach(function (id) { if (Date.now() - C.pend[id].t < 10 * 60000) post(id); else delete C.pend[id]; }); }
  function pending() { return Object.keys(C.pend).length; }
  function retry(id) { var it = itemOf(id); if (it) { it.etat = 'envoi'; it.err = ''; } A.retry(); post(id); render(); }

  // ---------- fichiers (photos, sons, documents) déposés chiffrés sur le serveur ----------
  function sendMedia(x, blob, meta) {
    var mid = A.rand(14), d = { x: x, mid: mid };
    Object.keys(meta || {}).forEach(function (k) { d[k] = meta[k]; });
    if (C.reply) { d.rep = C.reply; C.reply = null; renderBar(); }
    d.id = A.rand(10); d.u = st.uid; d.n = st.name; d.c = A.colorOf(st.uid);
    C.media[mid] = { url: URL.createObjectURL(blob), mime: blob.type || d.mime || '' };
    var it = localItem(d); render(); scrollEnd(true);
    return blob.arrayBuffer().then(function (buf) { return encBytes(new Uint8Array(buf)); }).then(function (b64) {
      return A.enc(d).then(function (e) { C.pend[d.id] = { e: e, t: Date.now(), up: { mid: mid, b64: b64 } }; post(d.id); });
    }).catch(function () { it.etat = 'echec'; it.err = 'Fichier impossible à préparer.'; render(); });
  }
  function startUpload(id) {
    var p = C.pend[id], it = itemOf(id); if (!p || !p.up) return;
    clearTimeout(p.upT);
    if (!A.envoi({ t: 'media', id: p.up.mid, d: p.up.b64 })) { if (it) { it.etat = 'attente'; render(); } return; }
    if (it) { it.etat = 'envoi'; }
    p.upT = setTimeout(function () { var x = itemOf(id); if (x && C.pend[id] && C.pend[id].up) { x.etat = 'echec'; x.err = 'Le serveur n’a pas confirmé la réception du fichier (le serveur du partage doit peut-être être mis à jour).'; A.logErr('fichier sans accusé de réception'); render(); } }, 25000);
  }
  function onOk(m) {
    if (m.r !== 'media') return;
    Object.keys(C.pend).forEach(function (id) { var p = C.pend[id]; if (p.up && p.up.mid === m.id) { clearTimeout(p.upT); p.up = null; post(id); } });
  }
  function onMedia(m) {
    var r = C.mreq[m.id]; if (!r) return; delete C.mreq[m.id]; C.busy = Math.max(0, C.busy - 1);
    if (m.absent || !m.d) { r.ko(new Error('absent')); pump(); return; }
    decBytes(m.d).then(function (u8) {
      var d = r.d, blob = new Blob([u8], { type: d.mime || (d.x === 'aud' ? 'audio/webm' : d.x === 'img' ? 'image/jpeg' : 'application/octet-stream') });
      C.media[m.id] = { url: URL.createObjectURL(blob), mime: blob.type }; r.ok(C.media[m.id]);
    }).catch(function () { r.ko(new Error('illisible')); }).then(pump);
  }
  function ensureMedia(d) {
    if (C.media[d.mid]) return Promise.resolve(C.media[d.mid]);
    if (C.mreq[d.mid]) return C.mreq[d.mid].p;
    var r = { d: d }; r.p = new Promise(function (ok, ko) { r.ok = ok; r.ko = ko; }); C.mreq[d.mid] = r; C.queue.push(d.mid); pump();
    r.t = setTimeout(function () { if (C.mreq[d.mid] === r) { delete C.mreq[d.mid]; C.busy = Math.max(0, C.busy - 1); r.ko(new Error('délai')); pump(); } }, 30000);
    return r.p;
  }
  function pump() {
    while (C.busy < 2 && C.queue.length) { var id = C.queue.shift(); if (!C.mreq[id]) continue; if (A.envoi({ t: 'getm', id: id })) C.busy++; else { var r = C.mreq[id]; delete C.mreq[id]; r.ko(new Error('hors ligne')); } }
  }

  // ---------- modèle d'affichage : messages + modifications, suppressions, réactions ----------
  function model() {
    var by = {}, list = [];
    C.items.forEach(function (it) {
      var d = it.d; if (!d || d.ev) return;
      var id = d.id || it.k, o = { it: it, d: d, id: id, at: it.at, u: d.u, x: d.x || 't', text: d.m || '', del: false, edited: false, re: {} };
      by[id] = o; list.push(o);
    });
    C.items.forEach(function (it) {
      var d = it.d; if (!d || !d.ev) return; var o = by[d.tg]; if (!o) return;
      if (d.ev === 'ed') { if (o.u === d.u && !o.del && it.at - o.at < EDIT_MS + 60000 && o.x === 't') { o.text = d.m || ''; o.edited = true; } }
      else if (d.ev === 'del') { if (o.u === d.u) o.del = true; }
      else if (d.ev === 're') { if (d.e) o.re[d.u] = d.e; else delete o.re[d.u]; }
    });
    return { list: list, by: by };
  }

  // ---------- affichage ----------
  function fmtText(s) {
    var parts = String(s || '').split(/(https?:\/\/[^\s<]+)/g);
    return parts.map(function (p, i) {
      if (i % 2) return '<a href="' + esc(p) + '" target="_blank" rel="noopener">' + esc(p) + '</a>';
      var h = esc(p);
      h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s.,!?)])/g, '$1<b>$2</b>').replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,!?)])/g, '$1<i>$2</i>').replace(/(^|[\s(])~([^~\n]+)~(?=$|[\s.,!?)])/g, '$1<s>$2</s>');
      return h;
    }).join('');
  }
  function onlyEmoji(t) { try { var s = String(t || '').trim(); if (!s || s.length > 24) return false; var n = (s.match(/\p{Extended_Pictographic}/gu) || []).length; return n >= 1 && n <= 3 && !/[^\p{Extended_Pictographic}‍️\s]/u.test(s); } catch (e) { return false; } }
  function dayLabel(t) {
    var d = new Date(t), n = new Date(), a = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime(), b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), j = Math.round((a - b) / 864e5);
    if (j === 0) return 'Aujourd’hui'; if (j === 1) return 'Hier';
    return d.toLocaleDateString('fr-FR', j < 7 ? { weekday: 'long' } : { day: 'numeric', month: 'long', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' });
  }
  function snippet(o) {
    if (o.del) return 'Message supprimé';
    return o.x === 'img' ? '📷 ' + (o.text || 'Photo') : o.x === 'aud' ? '🎤 Message vocal' : o.x === 'doc' ? '📄 ' + (o.d.name || 'Document') : o.x === 'loc' ? '📍 Position' : o.text;
  }
  function fmtSize(n) { return n < 1024 ? n + ' o' : n < 1048576 ? Math.round(n / 1024) + ' Ko' : (n / 1048576).toFixed(1).replace('.', ',') + ' Mo'; }
  function fmtDur(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function bars(id) { var h = 0, out = ''; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; for (var k = 0; k < 28; k++) { h = (h * 1103515245 + 12345) >>> 0; out += '<i style="height:' + (22 + (h >> 8) % 70) + '%"></i>'; } return out; }
  function bodyHtml(o) {
    var d = o.d;
    if (o.del) return '<div class="wa-del">' + (o.u === st.uid ? 'Vous avez supprimé ce message' : 'Ce message a été supprimé') + '</div>';
    var t = o.text ? '<div class="wa-tx' + (o.x === 't' && onlyEmoji(o.text) ? ' big' : '') + '">' + fmtText(o.text) + '</div>' : '';
    if (o.x === 'img') {
      var ratio = d.w && d.h ? Math.min(1.6, Math.max(0.6, d.h / d.w)) : 0.75, m = C.media[d.mid];
      return '<div class="wa-img" data-mid="' + esc(d.mid) + '" style="aspect-ratio:' + (1 / ratio).toFixed(3) + '">' + (d.th ? '<img class="wa-th" alt="" src="' + esc(d.th) + '">' : '') + (m ? '<img class="wa-ph" alt="Photo" src="' + m.url + '">' : '<span class="wa-ld"></span>') + '</div>' + t;
    }
    if (o.x === 'aud') {
      return '<div class="wa-aud" data-mid="' + esc(d.mid) + '"><button type="button" class="wa-pl" aria-label="Lire">' + ICON.play + '</button><div class="wa-wv"><div class="wa-bars">' + bars(d.mid) + '</div><div class="wa-bars on">' + bars(d.mid) + '</div></div><span class="wa-du">' + fmtDur(d.dur || 0) + '</span><button type="button" class="wa-sp" hidden>1×</button></div>';
    }
    if (o.x === 'doc') return '<div class="wa-doc" data-mid="' + esc(d.mid) + '"><span class="wa-di">' + ICON.doc + '</span><span class="wa-dn"><b>' + esc(d.name || 'Document') + '</b><small>' + fmtSize(d.size || 0) + '</small></span><button type="button" class="wa-dl" aria-label="Télécharger">⭳</button></div>' + t;
    if (o.x === 'loc') return '<div class="wa-loc" data-lat="' + d.lat + '" data-lon="' + d.lon + '"><div class="wa-map">' + ICON.pin + '</div><div class="wa-lt"><b>Position</b><small>' + (d.acc ? '±' + d.acc + ' m · ' : '') + 'toucher pour la voir sur la carte</small></div></div>';
    return t;
  }
  function quoteHtml(o, by) {
    var r = o.d.rep; if (!r) return '';
    var src = by[r.id], who = src ? (src.u === st.uid ? 'Vous' : (src.d.n || r.n)) : r.n, txt = src ? snippet(src) : r.m;
    var col = src ? (src.d.c || A.colorOf(src.u || '')) : '#06cf9c';
    return '<div class="wa-q" data-q="' + esc(r.id) + '" style="border-left-color:' + esc(col) + '"><b style="color:' + esc(col) + '">' + esc(who || '?') + '</b><span>' + esc(String(txt || '').slice(0, 120)) + '</span></div>';
  }
  function reactHtml(o) {
    var cnt = {}, mine = o.re[st.uid]; Object.keys(o.re).forEach(function (u) { cnt[o.re[u]] = (cnt[o.re[u]] || 0) + 1; });
    var ks = Object.keys(cnt); if (!ks.length) return '';
    var total = Object.keys(o.re).length;
    return '<div class="wa-re' + (mine ? ' mine' : '') + '" data-re="1">' + ks.map(function (e) { return '<span>' + esc(e) + '</span>'; }).join('') + (total > 1 ? '<em>' + total + '</em>' : '') + '</div>';
  }
  function render() {
    if (!C.built) return;
    var box = $('#wa-list'); if (!box) return;
    var m = model(), prevH = box.scrollHeight, atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80, prevTop = box.scrollTop;
    var html = '<div class="wa-lock">🔒 Les messages et fichiers sont chiffrés : seules les personnes qui ont le lien de ce partage peuvent les lire.</div>', lastDay = '', last = null, divided = false;
    m.list.forEach(function (o) {
      if (C.hid[o.id]) return;
      var dayKey = new Date(o.at).toDateString();
      if (dayKey !== lastDay) { lastDay = dayKey; html += '<div class="wa-day"><span>' + esc(dayLabel(o.at)) + '</span></div>'; last = null; }
      if (!divided && C.firstUnread && o.at > C.firstUnread && o.u !== st.uid) { divided = true; var n = m.list.filter(function (q) { return q.at > C.firstUnread && q.u !== st.uid && !C.hid[q.id]; }).length; html += '<div class="wa-day wa-unread"><span>' + n + (n > 1 ? ' messages non lus' : ' message non lu') + '</span></div>'; last = null; }
      var mine = o.u === st.uid, first = !last || last.u !== o.u || o.at - last.at > 300000, s = mine ? statusOf(o) : '';
      html += '<div class="wa-row ' + (mine ? 'out' : 'in') + (first ? ' first' : '') + (o.del ? ' deleted' : '') + '" data-id="' + esc(o.id) + '"><div class="wa-b">' +
        (o.del ? '' : '<button type="button" class="wa-chev" aria-label="Options du message">' + ICON.chev + '</button>') +
        (!mine && first ? '<div class="wa-nm" style="color:' + esc(o.d.c || A.colorOf(o.u || '')) + '">' + esc(o.d.n || '?') + '</div>' : '') +
        (o.del ? '' : quoteHtml(o, m.by)) + bodyHtml(o) +
        '<div class="wa-meta">' + (o.edited && !o.del ? '<em>modifié</em>' : '') + '<time>' + A.hhmm(o.at) + '</time>' + (mine && !o.del ? '<span class="wa-st s-' + s + '">' + tickHtml(s) + '</span>' : '') + '</div>' +
        '</div>' + (o.del ? '' : reactHtml(o)) +
        (mine && o.it.etat === 'echec' ? '<div class="wa-err">' + esc(o.it.err || 'Non envoyé') + ' <button type="button" class="wa-again" data-again="' + esc(o.id) + '">Réessayer</button></div>' : '') + '</div>';
      last = o;
    });
    if (!m.list.length) html += '<div class="wa-empty">Aucun message pour l’instant. Écrivez le premier !</div>';
    box.innerHTML = html;
    if (atBottom || C.stick) { box.scrollTop = box.scrollHeight; C.stick = false; } else { box.scrollTop = prevTop; }
    bindMedia(); updateDown();
  }
  function bindMedia() {
    var m = model();
    $$('#wa-list .wa-img').forEach(function (el) {
      if ($('.wa-ph', el)) return;
      var row = el.closest('.wa-row'), o = row && m.by[row.dataset.id]; if (!o) return;
      ensureMedia(o.d).then(function (md) { if (!el.isConnected) { render(); return; } if ($('.wa-ph', el)) return; var im = document.createElement('img'); im.className = 'wa-ph'; im.alt = 'Photo'; im.src = md.url; el.appendChild(im); var l = $('.wa-ld', el); if (l) l.remove(); }).catch(function () { var l = $('.wa-ld', el); if (l) { l.className = 'wa-ldx'; l.textContent = 'Photo indisponible'; } });
    });
    $$('#wa-list .wa-aud').forEach(function (el) { var mid = el.dataset.mid, a = C.aud[mid]; if (a && !a.paused) { el.classList.add('playing'); $('.wa-pl', el).innerHTML = ICON.pause; var sp = $('.wa-sp', el); sp.hidden = false; sp.textContent = a.playbackRate + '×'; setProg(el, a); } });
  }
  function setProg(el, a) { var on = $('.wa-bars.on', el); if (on && a.duration) on.style.clipPath = 'inset(0 ' + (100 - 100 * a.currentTime / a.duration) + '% 0 0)'; var du = $('.wa-du', el); if (du && a) du.textContent = fmtDur(a.currentTime); }
  function scrollEnd(force) { var box = $('#wa-list'); if (!box) return; if (force) C.stick = true; box.scrollTop = box.scrollHeight; }
  function updateDown() {
    var box = $('#wa-list'), b = $('#wa-down'); if (!box || !b) return;
    var far = box.scrollHeight - box.scrollTop - box.clientHeight > 160; b.hidden = !far;
    var n = st.unread; b.innerHTML = ICON.down + (n ? '<i>' + (n > 99 ? '99+' : n) + '</i>' : '');
  }

  // ---------- construction de l'interface ----------
  function build() {
    if (C.built) return; var host = $('#wa-host'); if (!host) return; C.built = true;
    host.innerHTML =
      '<div class="wa" id="wa">' +
      '<div class="wa-list" id="wa-list" aria-live="polite"></div>' +
      '<button type="button" class="wa-down" id="wa-down" hidden aria-label="Aller aux derniers messages"></button>' +
      '<div class="wa-bar" id="wa-bar" hidden></div>' +
      '<div class="wa-foot" id="wa-foot">' +
        '<div class="wa-field"><button type="button" class="wa-ib" id="wa-emo" aria-label="Émojis">' + ICON.smile + '</button><textarea id="wa-in" rows="1" maxlength="' + MAXTXT + '" placeholder="Message" aria-label="Écrire un message" enterkeyhint="send"></textarea>' +
        '<button type="button" class="wa-ib" id="wa-att" aria-label="Joindre">' + ICON.clip + '</button><button type="button" class="wa-ib" id="wa-cam" aria-label="Appareil photo">' + ICON.cam + '</button></div>' +
        '<button type="button" class="wa-go" id="wa-go" aria-label="Message vocal">' + ICON.mic + '</button></div>' +
      '<div class="wa-rec" id="wa-rec" hidden><button type="button" class="wa-ib wa-trash" id="wa-rx" aria-label="Annuler">' + ICON.trash + '</button><span class="wa-dot"></span><b id="wa-rt">0:00</b><span class="wa-rh">Enregistrement…</span><button type="button" class="wa-go" id="wa-rs" aria-label="Envoyer le message vocal">' + ICON.send + '</button></div>' +
      '<div class="wa-pop" id="wa-attm" hidden><button type="button" data-att="doc"><i style="background:#7f66ff">' + ICON.doc + '</i>Document</button><button type="button" data-att="cam"><i style="background:#ff2e74">' + ICON.cam + '</i>Appareil photo</button><button type="button" data-att="img"><i style="background:#007bfc">' + ICON.img + '</i>Photos</button><button type="button" data-att="loc"><i style="background:#02a698">' + ICON.pin + '</i>Position</button></div>' +
      '<div class="wa-pop wa-emop" id="wa-emop" hidden></div>' +
      '<div class="wa-menu" id="wa-menu" hidden></div>' +
      '<input type="file" id="wa-fimg" accept="image/*" multiple hidden><input type="file" id="wa-fcam" accept="image/*" capture="environment" hidden><input type="file" id="wa-fdoc" hidden></div>';
    var inp = $('#wa-in');
    inp.addEventListener('input', onInput);
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !(window.matchMedia && matchMedia('(pointer:coarse)').matches)) { e.preventDefault(); go(); }
      else if (e.key === 'Escape') { cancelBar(); }
    });
    $('#wa-go').addEventListener('click', function () { if (inp.value.trim() || C.edit) go(); else recStart(); });
    $('#wa-emo').addEventListener('click', function (e) { e.stopPropagation(); toggle('#wa-emop', fillEmoji); });
    $('#wa-att').addEventListener('click', function (e) { e.stopPropagation(); toggle('#wa-attm'); });
    $('#wa-cam').addEventListener('click', function () { openCamera(); });
    $('#wa-attm').addEventListener('click', function (e) { var b = e.target.closest('[data-att]'); if (!b) return; hidePops(); var k = b.dataset.att; if (k === 'doc') $('#wa-fdoc').click(); else if (k === 'img') $('#wa-fimg').click(); else if (k === 'cam') openCamera(); else if (k === 'loc') sendLoc(); });
    $('#wa-fimg').addEventListener('change', function () { var fs = Array.prototype.slice.call(this.files || []); this.value = ''; if (fs.length) preview(fs); });
    $('#wa-fcam').addEventListener('change', function () { var fs = Array.prototype.slice.call(this.files || []); this.value = ''; if (fs.length) preview(fs); });
    $('#wa-fdoc').addEventListener('change', function () { var f = this.files && this.files[0]; var g = f; this.value = ''; if (g) sendDoc(g); });
    $('#wa-rx').addEventListener('click', function () { recStop(false); });
    $('#wa-rs').addEventListener('click', function () { recStop(true); });
    $('#wa-down').addEventListener('click', function () { scrollEnd(true); readNow(); });
    $('#wa-list').addEventListener('scroll', function () { updateDown(); if (!$('#wa-down').hidden) return; readNow(); });
    $('#wa-list').addEventListener('click', onListClick);
    $('#wa-list').addEventListener('contextmenu', function (e) { var r = e.target.closest('.wa-row'); if (!r || r.classList.contains('deleted')) return; e.preventDefault(); showMenu(r.dataset.id, e.clientX, e.clientY); });
    var lp; $('#wa-list').addEventListener('touchstart', function (e) { var r = e.target.closest('.wa-row'); if (!r || r.classList.contains('deleted')) return; var t = e.touches[0]; lp = setTimeout(function () { showMenu(r.dataset.id, t.clientX, t.clientY); }, 480); }, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach(function (n) { $('#wa-list').addEventListener(n, function () { clearTimeout(lp); }, { passive: true }); });
    if (!C.glob) { C.glob = true; document.addEventListener('click', function (e) { if (!e.target.closest('.wa-pop,.wa-menu,#wa-emo,#wa-att,.wa-chev')) hidePops(); }); setInterval(function () { if (C.open && C.built) refresh(); }, 4000); }
    render(); refresh();
  }
  function onInput() {
    var inp = $('#wa-in'); inp.style.height = 'auto'; inp.style.height = Math.min(120, inp.scrollHeight) + 'px';
    var has = !!inp.value.trim() || !!C.edit, b = $('#wa-go'); b.innerHTML = has ? (C.edit ? ICON.check : ICON.send) : ICON.mic; b.setAttribute('aria-label', has ? 'Envoyer' : 'Message vocal');
    if (inp.value.trim()) { var t = Date.now(); C.typingAt = t; if (t - C.typeKick > 2500) { C.typeKick = t; kick(); } clearTimeout(C.typeT); C.typeT = setTimeout(function () { C.typingAt = 0; kick(); }, 5000); }
  }
  function go() {
    var inp = $('#wa-in'), txt = inp.value.trim(); if (!txt) return;
    C.typingAt = 0; clearTimeout(C.typeT);
    if (C.edit) { var id = C.edit; C.edit = null; submit({ ev: 'ed', tg: id, m: txt.slice(0, MAXTXT) }); }
    else { var d = { x: 't', m: txt.slice(0, MAXTXT) }; if (C.reply) { d.rep = C.reply; C.reply = null; } submit(d); C.stick = true; }
    inp.value = ''; onInput(); renderBar(); kick(); scrollEnd(true);
  }
  function renderBar() {
    var b = $('#wa-bar'); if (!b) return;
    if (C.edit) { var o = model().by[C.edit]; b.hidden = false; b.className = 'wa-bar edit'; b.innerHTML = '<div class="wa-bq"><b>Modifier le message</b><span>' + esc(o ? o.text.slice(0, 100) : '') + '</span></div><button type="button" class="wa-ib" id="wa-bx" aria-label="Annuler">' + ICON.x + '</button>'; }
    else if (C.reply) { b.hidden = false; b.className = 'wa-bar'; b.innerHTML = '<div class="wa-bq" style="border-left-color:' + esc(C.reply.col || '#06cf9c') + '"><b style="color:' + esc(C.reply.col || '#06cf9c') + '">' + esc(C.reply.n) + '</b><span>' + esc(C.reply.m) + '</span></div><button type="button" class="wa-ib" id="wa-bx" aria-label="Annuler">' + ICON.x + '</button>'; }
    else { b.hidden = true; b.innerHTML = ''; }
    var x = $('#wa-bx'); if (x) x.onclick = cancelBar;
  }
  function cancelBar() { if (C.edit) { C.edit = null; var i = $('#wa-in'); i.value = ''; onInput(); } C.reply = null; renderBar(); }
  function hidePops() { ['#wa-attm', '#wa-emop', '#wa-menu'].forEach(function (s) { var e = $(s); if (e) e.hidden = true; }); }
  function toggle(sel, fill) { var e = $(sel), was = !e.hidden; hidePops(); if (!was) { if (fill) fill(e); e.hidden = false; } }
  function fillEmoji(el) {
    if (el.dataset.f) return; el.dataset.f = 1;
    el.innerHTML = EMOJIS.map(function (e) { return '<button type="button">' + e + '</button>'; }).join('');
    el.addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (!b) return; var i = $('#wa-in'), p = i.selectionStart == null ? i.value.length : i.selectionStart; i.value = i.value.slice(0, p) + b.textContent + i.value.slice(i.selectionEnd == null ? p : i.selectionEnd); i.focus(); i.selectionStart = i.selectionEnd = p + b.textContent.length; onInput(); });
  }

  // ---------- clics dans la conversation ----------
  function onListClick(e) {
    var row = e.target.closest('.wa-row'); if (!row) return; var id = row.dataset.id, o = model().by[id];
    var ag = e.target.closest('[data-again]'); if (ag) { retry(ag.dataset.again); return; }
    if (e.target.closest('.wa-chev')) { e.stopPropagation(); var r = e.target.getBoundingClientRect(); showMenu(id, r.left, r.bottom); return; }
    if (e.target.closest('[data-re]')) { var t = e.target.closest('[data-re]').getBoundingClientRect(); reactInfo(o); return; }
    var q = e.target.closest('[data-q]'); if (q) { var tg = $('#wa-list .wa-row[data-id="' + q.dataset.q.replace(/"/g, '') + '"]'); if (tg) { tg.scrollIntoView({ block: 'center', behavior: 'smooth' }); tg.classList.add('flash'); setTimeout(function () { tg.classList.remove('flash'); }, 1400); } return; }
    if (!o || o.del) return;
    var im = e.target.closest('.wa-img'); if (im) { openViewer(o); return; }
    var pl = e.target.closest('.wa-pl, .wa-wv'); if (pl) { playAudio(o, row); return; }
    var sp = e.target.closest('.wa-sp'); if (sp) { var a = C.aud[o.d.mid]; if (a) { a.playbackRate = a.playbackRate >= 2 ? 1 : a.playbackRate >= 1.5 ? 2 : 1.5; sp.textContent = a.playbackRate + '×'; } return; }
    var dl = e.target.closest('.wa-doc'); if (dl) { downloadDoc(o); return; }
    var lc = e.target.closest('.wa-loc'); if (lc) { A.center(+lc.dataset.lat, +lc.dataset.lon); return; }
  }

  // ---------- menu d'un message ----------
  function showMenu(id, x, y) {
    var o = model().by[id]; if (!o || o.del) return; C.menuFor = id;
    var mine = o.u === st.uid, old = A.now() - o.at, menu = $('#wa-menu'), host = $('#wa').getBoundingClientRect();
    var it = [];
    it.push('<div class="wa-rx">' + REACTS.map(function (e) { return '<button type="button" data-react="' + e + '"' + (o.re[st.uid] === e ? ' class="on"' : '') + '>' + e + '</button>'; }).join('') + '</div>');
    it.push('<button type="button" data-m="reply">' + ICON.reply + 'Répondre</button>');
    if (o.text || o.x === 't') it.push('<button type="button" data-m="copy">' + ICON.copy + 'Copier</button>');
    if (mine) it.push('<button type="button" data-m="info">' + ICON.info + 'Infos</button>');
    if (mine && o.x === 't' && old < EDIT_MS) it.push('<button type="button" data-m="edit">' + ICON.edit + 'Modifier</button>');
    it.push('<button type="button" data-m="del" class="danger">' + ICON.trash + 'Supprimer</button>');
    menu.innerHTML = it.join(''); menu.hidden = false;
    var w = menu.offsetWidth || 220, h = menu.offsetHeight || 260, left = Math.min(Math.max(8, x - host.left - w / 2), host.width - w - 8), top = Math.min(Math.max(8, y - host.top + 6), host.height - h - 8);
    menu.style.left = left + 'px'; menu.style.top = top + 'px';
    menu.onclick = function (ev) {
      var r = ev.target.closest('[data-react]'); if (r) { react(id, r.dataset.react); hidePops(); return; }
      var b = ev.target.closest('[data-m]'); if (!b) return; hidePops(); var k = b.dataset.m;
      if (k === 'reply') startReply(o); else if (k === 'copy') { A.copy(o.text, 'Message copié.'); } else if (k === 'info') msgInfo(o); else if (k === 'edit') startEdit(o); else if (k === 'del') delDialog(o);
    };
  }
  function react(id, e) { var o = model().by[id]; if (!o) return; submit({ ev: 're', tg: id, e: o.re[st.uid] === e ? '' : e }); }
  function startReply(o) {
    var col = o.d.c || A.colorOf(o.u || '');
    C.edit = null; C.reply = { id: o.id, n: o.u === st.uid ? 'Vous' : (o.d.n || '?'), m: String(snippet(o) || '').slice(0, 80), col: col }; renderBar(); var i = $('#wa-in'); i.focus();
  }
  function startEdit(o) { C.reply = null; C.edit = o.id; var i = $('#wa-in'); i.value = o.text; onInput(); renderBar(); i.focus(); }
  function reactInfo(o) {
    var all = A.everyone(), l = Object.keys(o.re).map(function (u) { return '<li><span>' + esc(o.re[u]) + '</span>' + esc(u === st.uid ? 'Vous' : (all[u] && all[u].n) || 'Quelqu’un') + '</li>'; }).join('');
    modal('<h3>Réactions</h3><ul class="wa-ul">' + l + '</ul><button type="button" class="wa-mb" data-close>Fermer</button>');
  }
  function msgInfo(o) {
    var ms = members(), all = A.everyone(), lu = [], recu = [], non = [];
    ms.forEach(function (u) { var n = all[u].n || 'Quelqu’un'; if ((all[u].rd || 0) >= o.at) lu.push(n); else if ((all[u].dv || 0) >= o.at) recu.push(n); else non.push(n); });
    var sec = function (t, c, l) { return '<h4>' + c + ' ' + t + '</h4>' + (l.length ? '<ul class="wa-ul">' + l.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '<p class="wa-none">—</p>'); };
    modal('<h3>Infos du message</h3><div class="wa-mi">' + (snippet(o) ? '<div class="wa-bq">' + esc(String(snippet(o)).slice(0, 160)) + '</div>' : '') + '</div>' + sec('Lu par', TICK2.replace('wa-tk', 'wa-tk blue'), lu) + sec('Distribué à', TICK2, recu) + sec('Envoyé, pas encore reçu par', TICK1, non) + '<button type="button" class="wa-mb" data-close>Fermer</button>');
  }
  function delDialog(o) {
    var mine = o.u === st.uid, d = modal('<h3>Supprimer le message ?</h3><div class="wa-dels">' + (mine ? '<button type="button" data-d="all">Supprimer pour tous</button>' : '') + '<button type="button" data-d="me">Supprimer pour moi</button><button type="button" data-close>Annuler</button></div>');
    d.addEventListener('click', function (e) {
      var b = e.target.closest('[data-d]'); if (!b) return;
      if (b.dataset.d === 'all') submit({ ev: 'del', tg: o.id }); else { C.hid[o.id] = 1; lsSet(storeKey('hid'), JSON.stringify(C.hid)); recount(); render(); }
      d.close();
    });
  }
  // Feuilles : superposées DANS le volet « Partage » (jamais une fenêtre modale du navigateur) ; mêmes méthodes qu'une boîte de dialogue (close, addEventListener…)
  function modal(html, cls) {
    var host = $('.lv-body') || $('#live-panel') || document.body, sh = document.createElement('div'), d = document.createElement('div'), fini = false, tm, onKey;
    sh.className = 'wa-sheet' + (/wa-dark/.test(cls || '') ? ' dark' : ''); sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-label', 'Discussion');
    d.className = 'wa-dlg ' + (cls || ''); d.innerHTML = html; sh.appendChild(d); host.appendChild(sh);
    if (C.sheet && C.sheet !== d) C.sheet.close();
    C.sheet = d;
    d.close = function () {
      if (fini) return; fini = true; clearInterval(tm); document.removeEventListener('keydown', onKey, true);
      sh.remove(); if (C.sheet === d) C.sheet = null; if (d.onclose2) d.onclose2();
    };
    sh.addEventListener('click', function (e) { if (e.target === sh || e.target.closest('[data-close]')) d.close(); });
    onKey = function (e) { if (e.key === 'Escape') { e.stopPropagation(); d.close(); } };
    document.addEventListener('keydown', onKey, true);
    tm = setInterval(function () { if (!sh.getClientRects().length) d.close(); }, 1000);     // volet fermé ou onglet quitté : la feuille (et l'appareil photo) se ferment
    return d;
  }

  // ---------- photos : appareil photo en direct, aperçu avec légende ----------
  function shrink(blob, max, q) {
    return (window.createImageBitmap ? createImageBitmap(blob) : new Promise(function (ok, ko) { var u = URL.createObjectURL(blob), im = new Image(); im.onload = function () { ok(im); }; im.onerror = ko; im.src = u; })).then(function (im) {
      var w = im.width || im.naturalWidth, h = im.height || im.naturalHeight, k = Math.min(1, max / Math.max(w, h)), cw = Math.round(w * k), ch = Math.round(h * k), cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch; cv.getContext('2d').drawImage(im, 0, 0, cw, ch);
      var th = document.createElement('canvas'), tk = 28 / Math.max(cw, ch); th.width = Math.max(1, Math.round(cw * tk)); th.height = Math.max(1, Math.round(ch * tk)); th.getContext('2d').drawImage(cv, 0, 0, th.width, th.height);
      return new Promise(function (ok) { cv.toBlob(function (b) { ok({ blob: b, w: cw, h: ch, th: th.toDataURL('image/jpeg', 0.5) }); }, 'image/jpeg', q); });
    });
  }
  function prepImage(blob) {
    var tries = [[1280, 0.72], [1024, 0.65], [800, 0.6], [640, 0.55]], i = 0;
    function next() { var t = tries[i++]; return shrink(blob, t[0], t[1]).then(function (r) { if (r.blob && r.blob.size <= MEDIA_MAX) return r; if (i < tries.length) return next(); throw new Error('trop lourd'); }); }
    return next();
  }
  function preview(files) {
    files = files.filter(function (f) { return /^image\//.test(f.type || 'image/'); });
    if (!files.length) { A.toast('Choisissez une photo.'); return; }
    var first = files[0], url = URL.createObjectURL(first);
    var d = modal('<div class="wa-pv"><button type="button" class="wa-pvx" data-close aria-label="Fermer">' + ICON.x + '</button><img src="' + url + '" alt="Aperçu">' + (files.length > 1 ? '<span class="wa-pvn">' + files.length + ' photos</span>' : '') + '</div><div class="wa-pvf"><input type="text" id="wa-cap" maxlength="300" placeholder="Ajouter une légende…" autocomplete="off"><button type="button" class="wa-go" id="wa-pvs" aria-label="Envoyer">' + ICON.send + '</button></div>', 'wa-dark');
    d.onclose2 = function () { URL.revokeObjectURL(url); };
    var cap = $('#wa-cap', d); setTimeout(function () { cap.focus(); }, 60);
    function envoyer() {
      var legende = cap.value.trim(); d.close();
      files.reduce(function (p, f, i) { return p.then(function () { return prepImage(f).then(function (r) { return sendMedia('img', r.blob, { w: r.w, h: r.h, th: r.th, mime: 'image/jpeg', m: i === 0 ? legende : '' }); }).catch(function () { A.toast('Photo trop lourde ou illisible : elle n’a pas été envoyée.'); }); }); }, Promise.resolve());
    }
    $('#wa-pvs', d).addEventListener('click', envoyer); cap.addEventListener('keydown', function (e) { if (e.key === 'Enter') envoyer(); });
  }
  function openCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('#wa-fcam').click(); return; }
    var d = modal('<div class="wa-cm"><video id="wa-vid" autoplay playsinline muted></video><div class="wa-cmb"><button type="button" class="wa-cmx" data-close aria-label="Fermer">' + ICON.x + '</button><button type="button" class="wa-snap" id="wa-snap" aria-label="Prendre la photo"></button><button type="button" class="wa-cmf" id="wa-flip" aria-label="Changer de caméra">' + ICON.flip + '</button></div></div>', 'wa-dark wa-cam');
    var vid = $('#wa-vid', d);
    function stop() { if (C.stream) { C.stream.getTracks().forEach(function (t) { t.stop(); }); C.stream = null; } }
    function start() {
      stop();
      navigator.mediaDevices.getUserMedia({ video: { facingMode: C.facing, width: { ideal: 1920 } }, audio: false }).then(function (s) { C.stream = s; vid.srcObject = s; }).catch(function () { d.close(); A.toast('Appareil photo indisponible : choix d’une photo à la place.'); setTimeout(function () { $('#wa-fcam').click(); }, 200); });
    }
    d.onclose2 = stop; start();
    $('#wa-flip', d).addEventListener('click', function () { C.facing = C.facing === 'environment' ? 'user' : 'environment'; start(); });
    $('#wa-snap', d).addEventListener('click', function () {
      if (!vid.videoWidth) return; var cv = document.createElement('canvas'); cv.width = vid.videoWidth; cv.height = vid.videoHeight; cv.getContext('2d').drawImage(vid, 0, 0);
      cv.toBlob(function (b) { d.close(); if (b) { b.name = 'photo.jpg'; preview([b]); } }, 'image/jpeg', 0.92);
    });
  }
  function openViewer(o) {
    var m = C.media[o.d.mid]; if (!m) return;
    modal('<div class="wa-vw"><button type="button" class="wa-pvx" data-close aria-label="Fermer">' + ICON.x + '</button><img src="' + m.url + '" alt="Photo"><div class="wa-vc">' + esc(o.text || '') + '<small>' + esc((o.u === st.uid ? 'Vous' : o.d.n) || '') + ' · ' + A.hhmm(o.at) + '</small></div><a class="wa-vdl" href="' + m.url + '" download="photo.jpg">Enregistrer</a></div>', 'wa-dark');
  }

  // ---------- documents et position ----------
  function sendDoc(f) {
    if (f.size > MEDIA_MAX) { A.toast('Document trop lourd (' + fmtSize(f.size) + ') : 650 Ko au plus.'); return; }
    sendMedia('doc', f, { name: String(f.name || 'document').slice(0, 80), size: f.size, mime: f.type || 'application/octet-stream' });
  }
  function downloadDoc(o) {
    ensureMedia(o.d).then(function (m) { var a = document.createElement('a'); a.href = m.url; a.download = o.d.name || 'document'; document.body.appendChild(a); a.click(); a.remove(); }).catch(function () { A.toast('Document indisponible.'); });
  }
  function sendLoc() {
    var f = A.fix(); if (!f) { A.toast('Votre position n’est pas encore connue : autorisez la localisation (onglet Personnes).'); return; }
    submit({ x: 'loc', lat: f.lat, lon: f.lon, acc: f.acc }); scrollEnd(true);
  }

  // ---------- messages vocaux ----------
  function recMime() { var l = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']; if (!window.MediaRecorder) return null; for (var i = 0; i < l.length; i++) if (MediaRecorder.isTypeSupported(l[i])) return l[i]; return ''; }
  function recStart() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || recMime() === null) { A.toast('Les messages vocaux ne sont pas disponibles sur ce navigateur.'); return; }
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }).then(function (stream) {
      var mt = recMime(), mr = new MediaRecorder(stream, mt ? { mimeType: mt } : {}), r = { stream: stream, mr: mr, chunks: [], t0: Date.now(), size: 0, timer: null };
      mr.ondataavailable = function (e) { if (e.data && e.data.size) { r.chunks.push(e.data); r.size += e.data.size; if (r.size > MEDIA_MAX - 20000) recStop(true); } };
      mr.start(500); C.rec = r; $('#wa-foot').hidden = true; $('#wa-rec').hidden = false; kick();
      r.timer = setInterval(function () { var s = (Date.now() - r.t0) / 1000; $('#wa-rt').textContent = fmtDur(s); if (s >= REC_MAX) recStop(true); }, 250);
    }).catch(function (e) { A.toast(e && e.name === 'NotAllowedError' ? 'Micro refusé : autorisez-le dans le navigateur.' : 'Micro indisponible.'); });
  }
  function recStop(send) {
    var r = C.rec; if (!r) return; C.rec = null; clearInterval(r.timer);
    var dur = (Date.now() - r.t0) / 1000;
    r.mr.onstop = function () {
      r.stream.getTracks().forEach(function (t) { t.stop(); });
      if (send && dur >= 1) { var blob = new Blob(r.chunks, { type: r.mr.mimeType || 'audio/webm' }); if (blob.size > MEDIA_MAX) A.toast('Message vocal trop long.'); else sendMedia('aud', blob, { dur: Math.round(dur), mime: blob.type }); }
      else if (send) A.toast('Maintenez plus longtemps pour enregistrer un message.');
    };
    try { r.mr.stop(); } catch (e) { /* déjà arrêté */ }
    $('#wa-rec').hidden = true; $('#wa-foot').hidden = false; kick();
  }
  function playAudio(o, row) {
    var mid = o.d.mid, a = C.aud[mid];
    if (a) { if (a.paused) { stopOthers(mid); a.play(); } else a.pause(); return; }
    ensureMedia(o.d).then(function (m) {
      var au = new Audio(m.url); au.preload = 'auto'; C.aud[mid] = au; stopOthers(mid);
      var upd = function () { var el = $('#wa-list .wa-aud[data-mid="' + mid + '"]'); if (!el) return; setProg(el, au); };
      au.addEventListener('play', function () { var el = $('#wa-list .wa-aud[data-mid="' + mid + '"]'); if (el) { el.classList.add('playing'); $('.wa-pl', el).innerHTML = ICON.pause; $('.wa-sp', el).hidden = false; } });
      au.addEventListener('pause', function () { var el = $('#wa-list .wa-aud[data-mid="' + mid + '"]'); if (el) { el.classList.remove('playing'); $('.wa-pl', el).innerHTML = ICON.play; } });
      au.addEventListener('timeupdate', upd);
      au.addEventListener('ended', function () { var el = $('#wa-list .wa-aud[data-mid="' + mid + '"]'); if (el) { el.classList.remove('playing'); $('.wa-pl', el).innerHTML = ICON.play; $('.wa-bars.on', el).style.clipPath = 'inset(0 100% 0 0)'; $('.wa-du', el).textContent = fmtDur(o.d.dur || 0); $('.wa-sp', el).hidden = true; } au.currentTime = 0; au.playbackRate = 1; });
      au.play().catch(function () { A.toast('Lecture impossible.'); });
    }).catch(function () { A.toast('Message vocal indisponible.'); });
  }
  function stopOthers(mid) { Object.keys(C.aud).forEach(function (k) { if (k !== mid && !C.aud[k].paused) C.aud[k].pause(); }); }

  // ---------- ouverture, fermeture, remise à zéro ----------
  function open() {
    build(); if (!C.built) return;
    C.open = true;
    C.firstUnread = C.rd; render(); refresh(); scrollEnd(true);
    var firstU = $('#wa-list .wa-unread'); if (firstU) firstU.scrollIntoView({ block: 'center' });
    setTimeout(function () { readNow(); recount(); updateDown(); var i = $('#wa-in'); if (i && window.innerWidth > 860) i.focus(); }, 120);
  }
  function close() { C.open = false; C.firstUnread = 0; if (C.sheet) C.sheet.close(); }
  function reset() {
    Object.keys(C.media).forEach(function (k) { try { URL.revokeObjectURL(C.media[k].url); } catch (e) { /* ignoré */ } });
    Object.keys(C.aud).forEach(function (k) { try { C.aud[k].pause(); } catch (e) { /* ignoré */ } });
    if (C.rec) { try { C.rec.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* ignoré */ } clearInterval(C.rec.timer); }
    C.items = []; C.pend = {}; C.media = {}; C.mreq = {}; C.queue = []; C.busy = 0; C.aud = {}; C.reply = null; C.edit = null; C.rec = null; C.open = false; C.rd = 0; C.dv = 0; C.rdLoaded = false; C.hid = {}; C.typingAt = 0; C.firstUnread = 0;
    var h = $('#wa-host'); if (h) h.innerHTML = ''; C.built = false; st.unread = 0; A.badge();
  }

  SM.chat = { load: load, onMsg: function (m) { return onMsg(m, false); }, onMedia: onMedia, onOk: onOk, presence: presence, refresh: refresh, resend: resend, pending: pending, open: open, close: close, reset: reset };
})();
