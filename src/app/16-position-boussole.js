  /* ==== src/app/16-position-boussole.js : ma position, direction (boussole) et carte orientée ==== */
  // ---------- Ma position (utile sur téléphone) ----------
  (function locate() {
    var gLoc = L.layerGroup().addTo(map);
    // Recadrer : la carte ne bouge jamais d'elle-même quand on pose un point ; ce bouton ajuste la vue sur le tracé.
    $('#fit-all').addEventListener('click', function () {
      var b = null;
      layersList().forEach(function (l) { var x = layerBounds(l.key); if (x && x.isValid()) b = b ? b.extend(x) : L.latLngBounds(x.getSouthWest(), x.getNorthEast()); });
      if (b) fit(b, b.getNorthEast().equals(b.getSouthWest()) ? { maxZoom: 16 } : { padding: [70, 70], maxZoom: 17 }); else toast('Rien à cadrer : posez d’abord des points.');
    });
    // Ma position en continu : un 1er clic démarre le suivi (la carte suit les déplacements), un clic quand la carte suit l'arrête ;
    // si on déplace la carte à la main, le suivi continue mais la carte ne bouge plus : un clic la recentre.
    var watchId = null, follow = false, circ = null, dot = null, firstFix = true, lastHeading = null;
    var btn = $('#locate');
    function paint() {
      btn.classList.toggle('on', watchId !== null); btn.classList.toggle('free', watchId !== null && !follow);
      btn.title = watchId === null ? 'Ma position : afficher et suivre mes déplacements' : follow ? 'Arrêter le suivi de ma position' : 'Recentrer la carte sur ma position';
      btn.setAttribute('aria-pressed', watchId !== null ? 'true' : 'false');
      btn.classList.toggle('orient', !!(typeof CMP !== 'undefined' && CMP.orient));
      if (watchId !== null && follow && typeof CMP !== 'undefined') btn.title = CMP.orient ? 'Arrêter le suivi de ma position' : (CMP.live ? 'Orienter la carte dans ma direction' : 'Arrêter le suivi de ma position');
    }
    function stop() { if (watchId !== null) { try { watchId(); } catch (e) { /* déjà arrêté */ } } watchId = null; follow = false; gLoc.clearLayers(); circ = dot = null; prevFix = null; CMP.why = false; setOrient(false); compassOff(); paint(); }
    /* ---- Direction (boussole du téléphone) et carte orientée, comme l'application Cartes IGN :
       1er appui : position, carte au nord ; 2e appui (téléphone avec boussole) : la carte tourne pour suivre la direction du téléphone ;
       3e appui : arrêt. Le bouton « N » remet le nord en haut ; faire glisser la carte la remet aussi au nord. */
    var CMP = { h: null, live: false, src: '', orient: false, rot: 0, on: false, status: '', why: false }, prevFix = null;
    function bearingOf(a, b) { var r = Math.PI / 180, y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r), x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r); return (Math.atan2(y, x) / r + 360) % 360; }
    function screenAngle() { return (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (typeof window.orientation === 'number' ? window.orientation : 0); }
    function onOrient(e) {
      var h = null;
      if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) h = e.webkitCompassHeading;   // iPhone : cap magnétique direct
      else if ((e.type === 'deviceorientationabsolute' || e.absolute === true) && typeof e.alpha === 'number' && e.alpha !== null) h = 360 - e.alpha;   // Android : orientation absolue (par rapport au nord)
      else if (e.type === 'deviceorientation' && CMP.src === 'cmp') return;                                             // relatif : ignoré quand l'absolu fonctionne
      if (h === null) return;
      h = (h + screenAngle() + 360) % 360;
      // lissage (moyenne circulaire) : la flèche ne tremble pas
      if (CMP.h === null || CMP.src !== 'cmp') CMP.h = h; else { var d = ((h - CMP.h + 540) % 360) - 180; CMP.h = (CMP.h + d * 0.25 + 360) % 360; }
      CMP.live = true; CMP.src = 'cmp'; paintHeading();
    }
    function compassOn() {
      if (CMP.on) return Promise.resolve(true);
      if (typeof window.DeviceOrientationEvent === 'undefined') { CMP.status = 'absent'; return Promise.resolve(false); }
      // les deux événements sont écoutés : certains Android n'envoient que « deviceorientation » (avec absolute = true), d'autres que la version absolue
      var go = function () {
        CMP.on = true; CMP.status = 'attente';
        window.addEventListener('deviceorientationabsolute', onOrient, true); window.addEventListener('deviceorientation', onOrient, true);
        setTimeout(function () { if (CMP.on && !CMP.live) CMP.status = 'muet'; }, 2500);   // aucun signal : pas de boussole (ordinateur) ou capteurs bloqués
        return true;
      };
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {   // iPhone / iPad : accord demandé au toucher
        var ios = /iphone|ipad|ipod|macintosh/i.test(navigator.userAgent) && 'ontouchend' in document;
        return DeviceOrientationEvent.requestPermission().then(function (r) { if (r === 'granted' || !ios) return go(); CMP.status = 'refus'; return false; }, function () { if (ios) { CMP.status = 'refus'; return false; } return go(); });
      }
      return Promise.resolve(go());
    }
    // explication quand la carte ne peut pas suivre la direction du téléphone
    function compassWhy() {
      if (CMP.status === 'refus') return 'Boussole refusée : sur iPhone, Réglages › Safari › « Mouvement et orientation », puis rechargez la page.';
      if (CMP.status === 'absent' || CMP.status === 'muet') return isMobile() ? 'Aucune boussole ne répond : vérifiez que les capteurs de mouvement sont autorisés pour ce site (Chrome : ⋮ › Paramètres › Paramètres des sites › Capteurs de mouvement).' : 'Pas de boussole sur un ordinateur : la direction apparaîtra quand vous marcherez (téléphone conseillé).';
      return 'La boussole s’initialise : réessayez dans un instant.';
    }
    window.SMCompass = { test: function () { return compassOn().then(function () { return new Promise(function (ok) { setTimeout(function () { ok(CMP.live ? 'ok' : compassWhy()); }, 1500); }); }); }, state: function () { return { live: CMP.live, status: CMP.status, heading: CMP.h }; } };
    function compassOff() { if (!CMP.on) return; CMP.on = false; CMP.live = false; CMP.h = null; window.removeEventListener('deviceorientationabsolute', onOrient, true); window.removeEventListener('deviceorientation', onOrient, true); }
    var raf = 0;
    function paintHeading() {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        var el = dot && dot.getElement(), cone = el && el.querySelector('.loc-cone');
        if (cone) { cone.hidden = CMP.h === null; if (CMP.h !== null) cone.style.transform = 'rotate(' + CMP.h + 'deg)'; }
        if (CMP.orient && CMP.h !== null) setRot(-CMP.h);
      });
    }
    // rotation de la carte : le calque des tuiles et des tracés tourne autour du centre ; les boutons et l'échelle restent droits
    var rotWrap = null, origC2P = map.mouseEventToContainerPoint, origTPB = L.GridLayer.prototype._getTiledPixelBounds;
    function setRot(deg) {
      if (!rotWrap) {
        rotWrap = document.createElement('div'); rotWrap.className = 'map-rot';
        var mp = map.getPane('mapPane'); mp.parentNode.insertBefore(rotWrap, mp); rotWrap.appendChild(mp);
      }
      var d = ((deg - CMP.rot + 540) % 360) - 180; CMP.rot = CMP.rot + d;   // chemin le plus court (pas de tour complet à 0°/360°)
      rotWrap.style.transform = CMP.rot ? 'rotate(' + CMP.rot + 'deg)' : '';
      map._smRot = CMP.rot;
      var nb = $('#north-btn'); if (nb) { nb.hidden = !CMP.rot && !CMP.orient; nb.firstElementChild.style.transform = 'rotate(' + CMP.rot + 'deg)'; }
    }
    // tuiles : on charge aussi les coins (la vue tournée dépasse le rectangle de la carte)
    L.GridLayer.prototype._getTiledPixelBounds = function (center) {
      var b = origTPB.call(this, center); if (!this._map || !this._map._smRot) return b;
      var sz = b.getSize(), pad = Math.ceil((Math.sqrt(sz.x * sz.x + sz.y * sz.y) - Math.min(sz.x, sz.y)) / 2) + 64;
      return L.bounds(b.min.subtract([pad, pad]), b.max.add([pad, pad]));
    };
    // un clic sur la carte tournée tombe au bon endroit
    map.mouseEventToContainerPoint = function (e) {
      var p = origC2P.call(this, e); if (!this._smRot) return p;
      var c = this.getSize().divideBy(2), a = -this._smRot * Math.PI / 180, dx = p.x - c.x, dy = p.y - c.y;
      return L.point(c.x + dx * Math.cos(a) - dy * Math.sin(a), c.y + dx * Math.sin(a) + dy * Math.cos(a));
    };
    function setOrient(on) {
      CMP.orient = !!on;
      document.body.classList.toggle('map-oriented', CMP.orient);
      map.eachLayer(function (l) { if (l instanceof L.Renderer) { l.options.padding = CMP.orient ? 0.6 : 0.1; if (l._update && l._map) l._update(); } });
      if (CMP.orient) { if (map.dragging) map.dragging.disable(); if (CMP.h !== null) setRot(-CMP.h); }
      else { if (map.dragging) map.dragging.enable(); setRot(0); }
      map.fire('moveend');
      paint();
    }
    var nb0 = document.createElement('button'); nb0.type = 'button'; nb0.id = 'north-btn'; nb0.hidden = true; nb0.title = 'Remettre le nord en haut'; nb0.setAttribute('aria-label', 'Remettre le nord en haut');
    nb0.innerHTML = '<span class="nb-needle"><i></i><b>N</b></span>';
    btn.parentNode.insertBefore(nb0, btn);
    nb0.addEventListener('click', function () { setOrient(false); toast('Carte orientée au nord.'); });
    // glisser la carte tournée : retour au nord, carte libre (on reprend la main)
    map.getContainer().addEventListener('touchmove', function (e) { if (CMP.orient && e.touches && e.touches.length === 1) { setOrient(false); follow = false; paint(); } }, { passive: true });
    map.getContainer().addEventListener('mousedown', function () { if (CMP.orient) { setOrient(false); follow = false; paint(); } });
    // La position vient du service filtré SMGeo (js/position.js), commun avec le partage en direct : plus de saut de plusieurs kilomètres, plus de recentrage intempestif
    function onFix(pos) {
      var c = [pos.lat, pos.lon], acc = pos.acc || 0;
      if (!dot) {
        circ = L.circle(c, { radius: acc, color: '#2563eb', weight: 1, fillColor: '#2563eb', fillOpacity: 0.1, interactive: false }).addTo(gLoc);
        dot = L.marker(c, { interactive: false, zIndexOffset: 4000, icon: L.divIcon({ className: 'pin-wrap loc-wrap', html: '<div class="loc-cone" hidden></div><div class="loc-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(gLoc);
        paintHeading();
      } else { circ.setLatLng(c); circ.setRadius(acc); dot.setLatLng(c); }
      // sans boussole : la direction vient du déplacement (au moins 8 m parcourus)
      if (!CMP.live && prevFix && SMGeo.dist(prevFix[0], prevFix[1], c[0], c[1]) > Math.max(8, acc / 2)) { CMP.h = bearingOf(prevFix, c); CMP.src = 'gps'; paintHeading(); prevFix = c; }
      else if (!prevFix) prevFix = c;
      if (CMP.orient && follow) { map.panTo(c, { animate: true, duration: 0.5 }); return; }
      if (firstFix) { firstFix = false; map.setView(c, Math.max(map.getZoom(), zoomFor(Math.max(25000, acc * 12), c[0])), { animate: true }); toast(pos.coarse ? 'Position approximative (≈ ' + Math.round(acc) + ' m) : sur ordinateur, elle vient du réseau. Sur téléphone, en extérieur, elle sera bien plus précise.' : 'Position trouvée (précision ≈ ' + Math.round(acc) + ' m). Elle se met à jour quand vous bougez.'); }
      else if (follow && !map.getBounds().pad(-0.3).contains(c)) map.panTo(c, { animate: true, duration: 0.6 });      // la carte ne bouge que si le point approche du bord
    }
    function onErr(code) {
      if (code === 'denied') { toast('Position refusée : autorisez la localisation dans votre navigateur.'); stop(); }
      else if (code === 'absent') { toast('La localisation n’est pas disponible sur cet appareil.'); stop(); }
      else if (watchId !== null && firstFix) toast('Je cherche encore votre position… (en extérieur, c’est plus rapide)');
    }
    btn.addEventListener('click', function () {
      if (!navigator.geolocation || !window.SMGeo) { toast('La localisation n’est pas disponible sur cet appareil.'); return; }
      if (watchId !== null) {
        if (follow && !CMP.orient && CMP.live) { setOrient(true); if (dot) map.panTo(dot.getLatLng(), { animate: true }); toast('Carte orientée dans votre direction. Touchez « N » pour remettre le nord en haut.'); return; }
        // 2e appui sans boussole active : on la (re)demande (le toucher permet l'accord sur iPhone) ; sinon on explique pourquoi, sans arrêter le suivi
        if (follow && !CMP.orient && !CMP.why) {
          compassOn().then(function () {
            setTimeout(function () {
              if (CMP.live) { setOrient(true); toast('Carte orientée dans votre direction. Touchez « N » pour remettre le nord en haut.'); }
              else { CMP.why = true; toast(compassWhy(), { kind: 'warn' }); paint(); }
            }, 1200);
          });
          return;
        }
        if (follow) { stop(); toast('Suivi de votre position arrêté.'); return; }
        follow = true; paint(); if (dot) map.panTo(dot.getLatLng(), { animate: true }); return;
      }
      toast('Recherche de votre position…'); firstFix = true; follow = true;
      watchId = SMGeo.subscribe(onFix, onErr);
      compassOn().then(function () { paint(); });   // (au toucher : l'iPhone demande l'accord pour la boussole)
      paint();
    });
    // un déplacement manuel de la carte (souris ou doigt) libère la carte, mais le point continue de bouger
    map.on('dragstart', function () { if (watchId !== null && follow) { follow = false; paint(); } });
  })();

