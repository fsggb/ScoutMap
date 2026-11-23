/* ScoutMap : localisation filtrée, UNE SEULE pour toute l'application (bouton « Ma position » et partage en direct).
   Pourquoi : sur ordinateur, la position vient du Wi-Fi ou de l'adresse IP et « saute » de plusieurs kilomètres d'un point à l'autre ;
   deux suivis séparés et non filtrés faisaient sauter le repère et recentrer la carte. Ici :
   - un seul watchPosition, partagé par tous ceux qui s'abonnent (SMGeo.subscribe) ;
   - un filtre de Kalman pondéré par la précision annoncée (un point imprécis ne déplace presque rien) ;
   - une zone morte : un point à l'intérieur de l'incertitude actuelle ne bouge pas le repère ;
   - un point très imprécis (réseau, > 300 m) est ignoré tant qu'on en a un bon récent ;
   - un saut improbable (plus vite que 90 km/h, ou hors de la zone d'incertitude pour un point grossier) n'est accepté que s'il est confirmé
     par le point suivant (4 points groupés pour un point grossier) ; sinon il est jeté. */
(function () {
  'use strict';
  var R = 6371000, RAD = Math.PI / 180, Q = 4;            // Q : vitesse (m/s) dont l'incertitude grandit avec le temps
  var subs = [], watch = null, K = null, last = null, pend = null, lastEmit = null, errs = 0;
  function dist(a, b, c, d) { var x = (d - b) * RAD * Math.cos((a + c) / 2 * RAD), y = (c - a) * RAD; return R * Math.sqrt(x * x + y * y); }
  function valid(la, lo) { return isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180; }
  function reset(raw, acc, t) { K = { lat: raw.lat, lon: raw.lon, v: acc * acc, t: t }; pend = null; }
  function emit(force) {
    if (!K) return;
    var acc = Math.max(3, Math.round(Math.sqrt(K.v))), fix = { lat: +K.lat.toFixed(6), lon: +K.lon.toFixed(6), acc: acc, t: K.t, coarse: acc > 500 }, now = Date.now();
    if (!force && lastEmit && dist(lastEmit.lat, lastEmit.lon, fix.lat, fix.lon) < 2 && Math.abs(lastEmit.acc - fix.acc) < Math.max(5, 0.25 * lastEmit.acc) && now - lastEmit.at < 8000) return;
    lastEmit = { lat: fix.lat, lon: fix.lon, acc: fix.acc, at: now }; last = fix;
    subs.slice().forEach(function (s) { try { s.fn(fix); } catch (e) { /* un abonné fautif n'arrête pas les autres */ } });
  }
  function feed(lat, lon, accuracy, t) {
    if (!valid(lat, lon)) return;
    var acc = Math.max(5, Math.min(+accuracy || 100, 100000)), raw = { lat: lat, lon: lon };
    t = t || Date.now();
    if (!K) { reset(raw, acc, t); emit(true); return; }
    var dt = Math.max(0, (t - K.t) / 1000), d = dist(K.lat, K.lon, lat, lon), kacc = Math.sqrt(K.v + dt * Q * Q);
    // 1. point très imprécis (réseau, IP) alors qu'on en a un bon et récent : ignoré
    if (acc > 300 && acc > 4 * kacc && dt < 600) return;
    // 2. saut improbable : trop loin pour la vitesse et l'incertitude, ou point grossier hors de sa propre zone d'incertitude
    var maxD = 3 * (kacc + acc) + 25 * Math.max(dt, 1), coarse = acc > 300;
    if (d > maxD || (coarse && d > 2 * acc)) {
      // un point précis doit être confirmé par le suivant ; un point grossier (réseau) par 4 points consécutifs groupés au même endroit
      var need = coarse ? 4 : 2;
      if (pend && t - pend.t < 120000 && dist(pend.lat, pend.lon, lat, lon) < (coarse ? acc : 2 * (acc + pend.acc) + 30)) {
        pend.n++; pend.lat = lat; pend.lon = lon; pend.acc = acc; pend.t = t;
        if (pend.n >= need) { reset(raw, acc, t); emit(true); }
      } else pend = { lat: lat, lon: lon, acc: acc, t: t, n: 1 };
      return;
    }
    pend = null;
    // 3. zone morte : dans l'incertitude, et pas plus précis que ce que l'on a : le repère ne bouge pas
    if (acc >= 0.8 * kacc && d < (coarse ? 2 : 0.8) * acc) return;      // (l'incertitude continue de grandir avec le temps : un vrai déplacement finit toujours par passer)
    // 4. Kalman : on se rapproche du nouveau point à proportion de sa précision
    K.v += dt * Q * Q;
    var kg = K.v / (K.v + acc * acc);
    K.lat += kg * (lat - K.lat); K.lon += kg * (lon - K.lon); K.v = (1 - kg) * K.v; K.t = t;
    emit(false);
  }
  function onPos(p) { errs = 0; var c = p && p.coords; if (c) feed(c.latitude, c.longitude, c.accuracy, p.timestamp || Date.now()); }
  function onErr(e) {
    errs++;
    var code = e && e.code === 1 ? 'denied' : e && e.code === 3 ? 'timeout' : 'absent';
    if (code === 'denied') stopWatch();
    subs.slice().forEach(function (s) { try { if (s.err) s.err(code); } catch (x) { /* ignoré */ } });
  }
  function startWatch() {
    if (watch !== null) return;
    if (!navigator.geolocation) { setTimeout(function () { onErr({ code: 2 }); }, 0); return; }
    watch = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  }
  function stopWatch() { if (watch !== null) { try { navigator.geolocation.clearWatch(watch); } catch (e) { /* ignoré */ } watch = null; } }
  function subscribe(fn, err) {
    var s = { fn: fn, err: err }; subs.push(s);
    if (last && Date.now() - lastEmit.at < 30000) setTimeout(function () { if (subs.indexOf(s) >= 0) { try { fn(last); } catch (e) { /* ignoré */ } } }, 0);
    startWatch();
    return function () {
      var i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1);
      if (!subs.length) { stopWatch(); K = null; last = null; lastEmit = null; pend = null; }
    };
  }
  /* Cap du téléphone (0 = nord, 90 = est) à partir de l'orientation absolue (alpha, beta, gamma en degrés, norme W3C)
     et de la rotation de l'écran. Fonctionne à plat comme tenu incliné ou droit : on additionne la direction du haut de l'écran
     et celle du dos du téléphone, projetées à l'horizontale (l'une prend le relais quand l'autre devient verticale).
     Renvoie null si le téléphone est tenu dans une position où aucune direction n'est fiable. */
  function heading(alpha, beta, gamma, screenAngle) {
    if (alpha == null || beta == null || gamma == null) return null;
    var r = Math.PI / 180, cZ = Math.cos(alpha * r), sZ = Math.sin(alpha * r), cX = Math.cos(beta * r), sX = Math.sin(beta * r), cY = Math.cos(gamma * r), sY = Math.sin(gamma * r);
    var th = (screenAngle || 0) * r, ct = Math.cos(th), st = Math.sin(th);
    // axes du téléphone dans le repère (est, nord) : x (côté droit), y (haut), -z (dos)
    var xE = cZ * cY - sZ * sX * sY, xN = sZ * cY + cZ * sX * sY;
    var yE = -sZ * cX, yN = cZ * cX;
    var bE = -cZ * sY - sZ * sX * cY, bN = -sZ * sY + cZ * sX * cY;
    // haut de l'écran selon la rotation de l'écran (paysage)
    var uE = ct * yE + st * xE, uN = ct * yN + st * xN;
    var E = uE + bE, N = uN + bN;
    if (Math.sqrt(E * E + N * N) < 0.15) return null;
    return (Math.atan2(E, N) / r + 360) % 360;
  }
  window.SMGeo = { heading: heading, subscribe: subscribe, last: function () { return last; }, active: function () { return watch !== null; }, feed: feed, dist: dist };      // feed : pour les tests
})();
