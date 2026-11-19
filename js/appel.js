/* ScoutMap : appel vocal de groupe dans le partage en direct (style conférence téléphonique).
   Quelqu'un lance un appel ; les autres voient une bannière « Rejoindre / Plus tard » et seuls ceux qui le veulent répondent. Ceux qui
   sont dans l'appel s'entendent tous en même temps (duplex, annulation d'écho du navigateur), chacun peut couper son micro, l'appel
   s'arrête quand le dernier raccroche. Audio seul.
   Technique : WebRTC en maillage (chaque appareil parle directement aux autres, 8 personnes au plus). Les messages de mise en relation
   passent par le même canal chiffré que la discussion (clé du lien : le serveur ne lit rien) ; les identifiants du relais TURN de
   Cloudflare sont demandés au serveur de partage et ne servent que si deux appareils ne peuvent pas se joindre directement. */
(function () {
  'use strict';
  var SM = window.SM, A = SM && SM.liveApi;
  if (!A || typeof RTCPeerConnection === 'undefined') return;
  var st = A.st, esc = A.esc, MAX = 8, EXPIRE = 60000, PULSE = 20000;
  var C = { on: false, mic: null, muted: false, peers: {}, roster: {}, ice: null, iceWait: [], ring: null, dismissed: {}, timers: [], wake: null, audioCtx: null, busy: false };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var PHONE = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.500h3.200l1.500 4-2 1.300a11.500 11.500 0 0 0 6.500 6.500l1.300-2 4 1.500V18a2.500 2.500 0 0 1-2.700 2.500C10.500 20 4 13.500 3.500 6.200A2.500 2.500 0 0 1 6 3.500z"/></svg>';
  var MIC = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.500 11a6.500 6.500 0 0 0 13 0M12 17.500V21"/></svg>';

  // ---------- messages de mise en relation (chiffrés) ----------
  function sig(o) { o.f = st.uid; o.n = st.name; return A.enc(o).then(function (e) { return A.envoi({ t: 'sig', d: e }); }).catch(function () { return false; }); }
  function members() { var t = Date.now(); return Object.keys(C.roster).filter(function (u) { return u === st.uid && C.on || t - C.roster[u].t < EXPIRE; }); }
  function names(ids) { return ids.map(function (u) { return u === st.uid ? 'vous' : (C.roster[u] && C.roster[u].n) || 'Quelqu’un'; }); }
  function note(u, n) { var r = C.roster[u] || (C.roster[u] = {}); r.t = Date.now(); if (n) r.n = n; return r; }

  function onSig(m) {
    A.dec(m.d).then(function (o) {
      if (!o || o.f === st.uid || (o.to && o.to !== st.uid) || typeof o.k !== 'string') return;
      var u = o.f, nom = String(o.n || '').slice(0, 24);
      if (o.k === 'ring') { if (!C.on) ring(u, nom); }
      else if (o.k === 'join') {
        note(u, nom);
        if (C.on) { sig({ k: 'here', to: u, mu: C.muted }); if (st.uid < u) offer(u, nom); }       // un seul des deux envoie l'offre : le plus petit identifiant
      }
      else if (o.k === 'here') { var r = note(u, nom); r.mu = !!o.mu; if (C.on && st.uid < u && !C.peers[u]) offer(u, nom); }
      else if (o.k === 'hb') { var h = note(u, nom); h.mu = !!o.mu; }
      else if (o.k === 'mute') { var q = note(u, nom); q.mu = !!o.mu; }
      else if (o.k === 'leave') { delete C.roster[u]; closePeer(u); if (!members().length) C.ring = null; }
      else if (o.k === 'offer' && C.on) answer(u, nom, o.s);
      else if (o.k === 'answer' && C.on) { var p = C.peers[u]; if (p && p.pc.signalingState === 'have-local-offer') p.pc.setRemoteDescription({ type: 'answer', sdp: o.s }).then(function () { flush(p); }).catch(function () { /* ignoré */ }); }
      else if (o.k === 'ice' && C.on) { var pi = C.peers[u]; if (window.SM_DEBUG) console.log('appel ice reçu', !!pi, !!(pi && pi.pc.remoteDescription), o.c && o.c.candidate && o.c.candidate.split(' ').slice(4, 8).join(' ')); if (pi && o.c) { if (pi.pc.remoteDescription) pi.pc.addIceCandidate(o.c).catch(function (er) { if (window.SM_DEBUG) console.log('appel ice erreur', er && er.message); }); else pi.pending.push(o.c); } }
      maj();
    }).catch(function (e) { if (window.SM_DEBUG) console.log('appel sig erreur', e && e.message); });
  }

  // ---------- identifiants TURN ----------
  function needIce() {
    return new Promise(function (ok) {
      if (C.ice) return ok(C.ice);
      C.iceWait.push(ok); A.envoi({ t: 'turn' });
      setTimeout(function () { if (!C.ice) { C.ice = [{ urls: ['stun:stun.cloudflare.com:3478'] }]; flushIce(); } }, 3500);   // secours : appel direct seulement
    });
  }
  function flushIce() { var w = C.iceWait; C.iceWait = []; w.forEach(function (f) { f(C.ice); }); }
  function onTurn(m) { if (Array.isArray(m.ice) && m.ice.length && !m.limite) { C.ice = m.ice; flushIce(); } }

  // ---------- connexions entre appareils ----------
  function makePeer(u, nom) {
    closePeer(u);
    var pc = new RTCPeerConnection({ iceServers: C.ice || [{ urls: ['stun:stun.cloudflare.com:3478'] }] }), p = { pc: pc, pending: [], audio: null, nom: nom };
    C.peers[u] = p;
    setTimeout(function () { if (C.peers[u] === p && !p.ok) { A.toast('Connexion audio impossible avec ' + (nom || 'un participant') + ' : le réseau bloque peut-être les appels. Essayez en Wi-Fi ou en 4G, puis relancez l’appel.'); closePeer(u); maj(); } }, 25000);
    if (C.mic) C.mic.getTracks().forEach(function (t) { pc.addTrack(t, C.mic); });
    pc.onicecandidate = function (e) { if (window.SM_DEBUG) console.log('appel ice local', e.candidate ? e.candidate.candidate.split(' ').slice(4, 8).join(' ') : 'fin'); if (e.candidate) sig({ k: 'ice', to: u, c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate }); };
    pc.ontrack = function (e) {
      if (!p.audio) { p.audio = document.createElement('audio'); p.audio.autoplay = true; p.audio.setAttribute('playsinline', ''); p.audio.hidden = true; document.body.appendChild(p.audio); }
      p.audio.srcObject = e.streams[0] || new MediaStream([e.track]); var pr = p.audio.play(); if (pr && pr.catch) pr.catch(function () { /* lecture reprise au prochain geste */ });
    };
    pc.onconnectionstatechange = function () {
      if (pc.connectionState === 'connected') { p.ok = true; maj(); }
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') { if (C.peers[u] === p) { closePeer(u); A.toast(p.ok ? 'Connexion perdue avec ' + (nom || 'un participant') + '.' : 'Connexion audio impossible avec ' + (nom || 'un participant') + ' (réseau).'); maj(); } }
      if (pc.connectionState === 'disconnected') setTimeout(function () { if (C.peers[u] === p && pc.connectionState === 'disconnected') { closePeer(u); maj(); } }, 9000);
    };
    return p;
  }
  function closePeer(u) { var p = C.peers[u]; if (!p) return; delete C.peers[u]; try { p.pc.close(); } catch (e) { /* ignoré */ } if (p.audio) { p.audio.srcObject = null; p.audio.remove(); } }
  function flush(p) { var l = p.pending; p.pending = []; l.forEach(function (c) { p.pc.addIceCandidate(c).catch(function () { /* ignoré */ }); }); }
  function offer(u, nom) {
    var p = makePeer(u, nom);
    p.pc.createOffer().then(function (o) { return p.pc.setLocalDescription(o); }).then(function () { return sig({ k: 'offer', to: u, s: p.pc.localDescription.sdp }); }).catch(function () { closePeer(u); });
  }
  function answer(u, nom, sdp) {
    if (typeof sdp !== 'string' || sdp.length > 20000) return;
    var p = makePeer(u, nom); note(u, nom);
    p.pc.setRemoteDescription({ type: 'offer', sdp: sdp }).then(function () { flush(p); return p.pc.createAnswer(); }).then(function (a) { return p.pc.setLocalDescription(a); })
      .then(function () { return sig({ k: 'answer', to: u, s: p.pc.localDescription.sdp }); }).catch(function () { closePeer(u); });
  }

  // ---------- lancer, rejoindre, raccrocher ----------
  function start() {
    if (C.on || C.busy) return;
    if (members().length) { join(); return; }                       // un appel est déjà en cours : on le rejoint
    sig({ k: 'ring' }); join(true);
  }
  function join(fresh) {
    if (C.on || C.busy) return;
    if (members().length >= MAX) { A.toast('L’appel est complet (' + MAX + ' personnes au plus).'); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { A.toast('Ce navigateur ne permet pas les appels vocaux (connexion sécurisée https nécessaire).'); return; }
    C.busy = true; maj();
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }).then(function (mic) {
      C.mic = mic; C.muted = false; C.ring = null;
      return needIce();
    }).then(function () {
      C.on = true; C.busy = false; note(st.uid, st.name);
      sig({ k: 'join' });
      C.timers.push(setInterval(function () { sig({ k: 'hb', mu: C.muted }); note(st.uid, st.name); }, PULSE));
      try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { C.wake = w; }).catch(function () { /* ignoré */ }); } catch (e) { /* ignoré */ }
      document.addEventListener('visibilitychange', onVisible);
      maj();
    }).catch(function (e) {
      C.busy = false; if (C.mic) { C.mic.getTracks().forEach(function (t) { t.stop(); }); C.mic = null; }
      A.toast(e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'Micro refusé : autorisez-le dans le navigateur pour appeler.' : e && e.name === 'NotFoundError' ? 'Aucun micro trouvé sur cet appareil.' : 'Impossible de démarrer l’appel.');
      maj();
    });
  }
  function onVisible() { if (C.on && document.visibilityState === 'visible' && navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { C.wake = w; }).catch(function () { /* ignoré */ }); }
  function hangup(silent) {
    var was = C.on; C.on = false; C.busy = false;
    if (was && !silent) sig({ k: 'leave' });
    Object.keys(C.peers).forEach(closePeer);
    if (C.mic) { C.mic.getTracks().forEach(function (t) { t.stop(); }); C.mic = null; }
    C.timers.forEach(clearInterval); C.timers = [];
    if (C.wake) { try { C.wake.release(); } catch (e) { /* ignoré */ } C.wake = null; }
    document.removeEventListener('visibilitychange', onVisible);
    delete C.roster[st.uid]; C.muted = false; maj();
  }
  function mute() {
    if (!C.mic) return; C.muted = !C.muted;
    C.mic.getAudioTracks().forEach(function (t) { t.enabled = !C.muted; });
    note(st.uid, st.name).mu = C.muted; sig({ k: 'mute', mu: C.muted }); maj();
  }

  // ---------- sonnerie ----------
  function ring(u, nom) {
    var r = note(u, nom); r.t = Date.now();
    if (C.dismissed[u] && Date.now() - C.dismissed[u] < 120000) return;
    C.ring = { u: u, n: nom || 'Quelqu’un', t: Date.now() };
    try { if (navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 250]); } catch (e) { /* ignoré */ }
    beep(3);
  }
  function beep(n) {
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; var c = C.audioCtx || (C.audioCtx = new AC()); if (c.state === 'suspended') c.resume();
      for (var i = 0; i < n; i++) [0, 0.22].forEach(function (d, k) {
        var o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + i * 1.1 + d; o.frequency.value = k ? 784 : 659; o.connect(g); g.connect(c.destination);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2); o.start(t0); o.stop(t0 + 0.22);
      });
    } catch (e) { /* son indisponible : la bannière suffit */ }
  }

  // ---------- interface ----------
  var dock;
  function ensureDock() {
    if (dock) return dock;
    dock = document.createElement('div'); dock.id = 'lv-dock'; dock.hidden = true; dock.setAttribute('role', 'region'); dock.setAttribute('aria-label', 'Appel vocal'); dock.setAttribute('aria-live', 'polite');
    dock.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ac]'); if (!b) return; var a = b.dataset.ac;
      if (a === 'join') join(); else if (a === 'later') { if (C.ring) C.dismissed[C.ring.u] = Date.now(); C.ring = null; maj(); }
      else if (a === 'mute') mute(); else if (a === 'hang') hangup();
    });
    document.body.appendChild(dock); return dock;
  }
  function who(ids) { return names(ids).map(function (n, i) { var u = ids[i], mu = (u === st.uid ? C.muted : C.roster[u] && C.roster[u].mu), pe = C.on && u !== st.uid ? C.peers[u] : null; return esc(n) + (mu ? ' (micro coupé)' : '') + (pe && !pe.ok ? ' (connexion…)' : ''); }).join(', '); }
  function maj() {
    if (!st.room) { var d0 = dock; if (d0) d0.hidden = true; var cb0 = $('#lv-callbar'); if (cb0) cb0.hidden = true; return; }
    var ids = members(), inCall = C.on, others = ids.filter(function (u) { return u !== st.uid; }), ongoing = ids.length > 0;
    // barre dans le panneau Partage
    var cb = $('#lv-callbar');
    if (cb) {
      cb.hidden = false;
      cb.innerHTML = inCall
        ? '<span class="lv-cb-t">' + PHONE + '<b>En appel</b> · ' + who(ids) + '</span><span class="lv-cb-a"><button type="button" class="btn-ghost sm" data-ac="mute">' + (C.muted ? 'Réactiver le micro' : 'Couper le micro') + '</button><button type="button" class="btn-danger sm" data-ac="hang">Raccrocher</button></span>'
        : C.busy ? '<span class="lv-cb-t">' + PHONE + 'Connexion au micro…</span>'
        : ongoing ? '<span class="lv-cb-t">' + PHONE + '<b>Appel en cours</b> · ' + who(ids) + '</span><span class="lv-cb-a"><button type="button" class="btn-primary sm" data-ac="join">Rejoindre</button></span>'
        : '<button type="button" class="btn-ghost sm lv-cb-start" data-ac="start">' + PHONE + 'Lancer un appel vocal</button>';
      cb.onclick = function (e) { var b = e.target.closest('[data-ac]'); if (!b) return; var a = b.dataset.ac; if (a === 'start') start(); else if (a === 'join') join(); else if (a === 'mute') mute(); else if (a === 'hang') hangup(); };
    }
    // bannière flottante : sonnerie, ou commandes de l'appel en cours (visibles même panneau fermé)
    var dk = ensureDock();
    if (inCall) {
      dk.hidden = false; dk.className = 'lv-dock-call';
      dk.innerHTML = '<span class="lv-dk-t">' + PHONE + '<b>Appel</b> · ' + (others.length ? who(others) : 'en attente des autres') + '</span><span class="lv-dk-a"><button type="button" data-ac="mute" aria-pressed="' + C.muted + '">' + MIC + (C.muted ? 'Micro coupé' : 'Micro') + '</button><button type="button" class="red" data-ac="hang">Raccrocher</button></span>';
    } else if (C.ring && !C.busy) {
      dk.hidden = false; dk.className = 'lv-dock-ring';
      dk.innerHTML = '<span class="lv-dk-t">' + PHONE + '<b>' + esc(C.ring.n) + '</b> lance un appel vocal</span><span class="lv-dk-a"><button type="button" class="green" data-ac="join">Rejoindre</button><button type="button" data-ac="later">Plus tard</button></span>';
    } else dk.hidden = true;
    if (dk.hidden) dk.innerHTML = '';
    // personnes dans l'appel, repérées dans la liste du panneau
    document.querySelectorAll('#lv-people .lv-p').forEach(function (b) { var u = b.dataset.u; b.classList.toggle('lv-incall', members().indexOf(u) >= 0); });
  }
  setInterval(function () { if (st.room) maj(); }, 10000);          // retire les participants disparus sans avoir raccroché

  SM.appel = { sig: onSig, turn: onTurn, maj: maj, fin: function () { C.ring = null; C.roster = {}; hangup(true); }, start: start, join: join, hangup: hangup, etat: function () { return { on: C.on, membres: members(), pairs: Object.keys(C.peers).filter(function (u) { return C.peers[u].ok; }), liens: Object.keys(C.peers).map(function (u) { return C.peers[u].pc.connectionState + '/' + C.peers[u].pc.iceConnectionState; }) }; } };
  maj();
})();
