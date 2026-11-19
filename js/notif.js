/* ScoutMap : notifications et vibrations du partage en direct.
   - message reçu : une courte vibration si la page est visible mais que la discussion n'est pas affichée ;
     une notification du système (avec vibration) si la page est en arrière-plan ;
   - appel entrant : sonnerie répétée comme un vrai téléphone (vibrations longues, pause, vibrations…) jusqu'à la réponse, 50 s au plus ;
     en arrière-plan, une notification qui se renouvelle (et fait vibrer) à chaque tour.
   Limites des navigateurs : la vibration n'existe pas sur iPhone ; elle est coupée par le navigateur quand la page est cachée (d'où la notification
   du système, qui vibre elle-même sur Android) ; une notification demande l'accord de la personne (bouton, jamais automatique). */
(function () {
  'use strict';
  var SM = window.SM; if (!SM) return;
  var KEY = 'scoutmap.live.notif', cfg = { vib: true, sys: false, asked: false };
  try { var j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && typeof j === 'object') { cfg.vib = j.vib !== false; cfg.sys = !!j.sys; cfg.asked = !!j.asked; } } catch (e) { /* valeurs par défaut */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* ignoré */ } }
  function canVibrate() { return typeof navigator.vibrate === 'function'; }
  function perm() { return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission; }
  function vibrate(p) { if (!cfg.vib || !canVibrate()) return false; try { return navigator.vibrate(p); } catch (e) { return false; } }
  function sysOn() { return cfg.sys && perm() === 'granted'; }
  function reg() { try { return navigator.serviceWorker && navigator.serviceWorker.getRegistration ? navigator.serviceWorker.getRegistration() : Promise.resolve(null); } catch (e) { return Promise.resolve(null); } }

  // notification du système (via le service worker quand il existe : seule façon qui marche sur téléphone)
  function show(title, body, tag, extra) {
    if (!sysOn()) return;
    var opt = { body: body, tag: tag, renotify: true, icon: 'assets/icon-192.png', badge: 'assets/icon-192.png', lang: 'fr', data: { url: location.href.split('#')[0] } };
    Object.keys(extra || {}).forEach(function (k) { opt[k] = extra[k]; });
    if (!cfg.vib) delete opt.vibrate;
    function viaPage() { try { var n = new Notification(title, opt); n.onclick = function () { try { window.focus(); n.close(); } catch (e) { /* ignoré */ } }; } catch (e) { /* ignoré */ } }
    reg().then(function (r) { if (r && r.showNotification) r.showNotification(title, opt).catch(viaPage); else viaPage(); }, viaPage);
  }
  function closeTag(tag) { reg().then(function (r) { if (r && r.getNotifications) r.getNotifications({ tag: tag }).then(function (l) { l.forEach(function (n) { n.close(); }); }); }).catch(function () { /* ignoré */ }); }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') closeTag('scoutmap-msg'); });

  // message reçu
  function message(who, text) {
    if (document.visibilityState === 'visible') { vibrate([70, 60, 70]); return; }
    show(String(who || 'ScoutMap').slice(0, 40), String(text || '').slice(0, 140), 'scoutmap-msg', { vibrate: [200, 100, 200] });
  }

  // sonnerie d'appel : 2 s de vibrations (3 secousses), 1 s de pause, et on recommence
  var ringT = null, ringT0 = 0, ringWho = '', ringHook = null, PATTERN = [500, 250, 500, 250, 500];
  function ringTick() {
    if (Date.now() - ringT0 > 50000) { ringStop(); return; }
    vibrate(PATTERN);
    if (ringHook) { try { ringHook(); } catch (e) { /* ignoré */ } }
    if (document.visibilityState !== 'visible') show(ringWho + ' vous appelle', 'Appel vocal ScoutMap : ouvrez la page pour rejoindre.', 'scoutmap-call', { vibrate: PATTERN, requireInteraction: true });
  }
  function ringStart(who, hook) { ringStop(); ringWho = String(who || 'Quelqu’un').slice(0, 40); ringHook = hook || null; ringT0 = Date.now(); ringTick(); if (ringT0) ringT = setInterval(ringTick, 3000); }
  function ringStop() { if (ringT) { clearInterval(ringT); ringT = null; try { if (canVibrate()) navigator.vibrate(0); } catch (e) { /* ignoré */ } closeTag('scoutmap-call'); } ringT0 = 0; }

  // réglages
  function request() {
    if (perm() === 'unsupported') return Promise.resolve('unsupported');
    if (perm() === 'granted') { cfg.sys = true; cfg.asked = true; save(); return Promise.resolve('granted'); }
    if (perm() === 'denied') return Promise.resolve('denied');
    return new Promise(function (ok) {
      var done = function (r) { cfg.asked = true; cfg.sys = r === 'granted'; save(); ok(r); };
      try { var p = Notification.requestPermission(done); if (p && p.then) p.then(done); } catch (e) { done('denied'); }
    });
  }
  SM.notif = {
    message: message, ringStart: ringStart, ringStop: ringStop, ringing: function () { return !!ringT; },
    tick: function () { vibrate(25); }, vibrate: vibrate,
    canVibrate: canVibrate, perm: perm, request: request,
    get: function () { return { vib: cfg.vib, sys: cfg.sys && perm() === 'granted', asked: cfg.asked, perm: perm(), canVibrate: canVibrate() }; },
    setVib: function (on) { cfg.vib = !!on; save(); if (on) vibrate(60); },
    setSys: function (on) { if (!on) { cfg.sys = false; save(); return Promise.resolve('off'); } return request(); },
    dismissAsk: function () { cfg.asked = true; save(); },
    test: function () { vibrate(PATTERN); show('ScoutMap', 'Notification de test : tout fonctionne.', 'scoutmap-test', { vibrate: PATTERN }); }
  };
})();
