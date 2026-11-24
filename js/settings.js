/* ScoutMap : page Réglages en pleine page (pas une fenêtre), rangée par catégories comme les paramètres de Claude :
   un menu à gauche, le contenu à droite. Les réglages existants (itinéraire, azimuts, grand jeu) y sont déplacés tels quels,
   avec leurs boutons et leurs effets. La barre latérale reste visible. */
(function () {
  'use strict';
  var SM = window.SM; if (!SM || window.SM_VIEWER) return;
  var S = SM.S;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function ic(n) { return '<svg class="ic" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }

  var CATS = [
    { k: 'general', t: 'Général', i: 'gear' },
    { k: 'route', t: 'Itinéraire', i: 'route' },
    { k: 'az', t: 'Azimuts', i: 'compass' },
    { k: 'game', t: 'Grand jeu', i: 'flag' },
    { k: 'offline', t: 'Hors connexion', i: 'download' },
    { k: 'about', t: 'Version et nouveautés', i: 'help' }
  ];
  var page = document.createElement('div'); page.className = 'setpage'; page.id = 'setpage'; page.hidden = true;
  page.innerHTML = '<div class="setpage-in"><nav class="set-nav" aria-label="Catégories de réglages"><h1>Réglages</h1>' +
    CATS.map(function (c) { return '<button type="button" class="set-cat" data-cat="' + c.k + '">' + ic(c.i) + '<span>' + c.t + '</span></button>'; }).join('') +
    '</nav><div class="set-body">' + CATS.map(function (c) { return '<section class="set-sec" data-sec="' + c.k + '" hidden><h2>' + c.t + '</h2><div class="set-c"></div></section>'; }).join('') +
    '</div><button type="button" class="ibtn set-close" aria-label="Fermer les réglages" title="Fermer (Échap)">' + ic('x') + '</button></div>';
  document.body.appendChild(page);
  function sec(k) { return $('[data-sec="' + k + '"] .set-c', page); }

  // 1. réglages déjà présents dans le panneau : déplacés ici (les éléments gardent leurs écouteurs)
  var pane = $('.pane[data-pane="settings"]');
  if (pane) {
    $$('[data-set]', pane).forEach(function (blk) {
      var k = blk.getAttribute('data-set'); if (!blk.children.length) { blk.remove(); return; }
      blk.removeAttribute('data-set'); blk.hidden = false; blk.classList.add('set-card');
      var h = $('h3.sub', blk); if (h && (h.textContent === 'Itinéraire' || h.textContent === 'Azimuts' || h.textContent === 'Grand jeu')) h.remove();
      if (k === 'game') blk.classList.add('set-game');
      sec(k === 'game' ? 'game' : k).appendChild(blk);
    });
  }
  sec('game').insertAdjacentHTML('afterbegin', '<p class="set-hint" id="set-game-hint">Ces réglages concernent le grand jeu ouvert. Ouvrez un grand jeu depuis l’accueil pour les modifier.</p>');

  // 2. général
  sec('general').innerHTML =
    '<div class="set-card"><h3>Mise à jour</h3><p>ScoutMap vérifie toute seule s’il existe une nouvelle version ; une notification propose alors de recharger.</p>' +
    '<button type="button" class="btn-ghost sm" id="set-update">' + ic('download') + 'Forcer la mise à jour maintenant</button></div>' +
    '<div class="set-card"><h3>Notifications</h3><p>Les messages de l’application apparaissent un instant puis se rangent dans le bouton <b>Notifications</b> de la barre latérale, où on les retrouve.</p>' +
    '<button type="button" class="btn-ghost sm" id="set-ntf-test">' + ic('bell') + 'Essayer une notification</button></div>' +
    '<div class="set-card"><h3>Bouton Retour</h3><p>Le bouton Retour du navigateur ou du téléphone ne fait plus quitter ScoutMap : il ferme l’aperçu, la fenêtre ou le menu ouvert, sinon il ramène à l’accueil. Pour quitter, fermez l’onglet.</p></div>' +
    '<div class="set-card"><h3>Ma position et boussole</h3><p>Un appui sur le bouton de position affiche votre point, la carte au nord. Sur téléphone, un deuxième appui fait tourner la carte dans la direction où vous regardez (comme l’application Cartes IGN) ; le bouton <b>N</b> remet le nord en haut. Un troisième appui arrête le suivi.</p>' +
    '<button type="button" class="btn-ghost sm" id="set-cmp-test">' + ic('compass') + 'Tester la boussole de cet appareil</button><p class="set-hint" id="set-cmp-res"></p></div>';
  $('#set-update', page).addEventListener('click', function () { if (SM.forceUpdate) SM.forceUpdate(); });
  $('#set-cmp-test', page).addEventListener('click', function () {
    var r = $('#set-cmp-res', page); r.textContent = 'Test en cours : tenez le téléphone à plat et tournez-le doucement…';
    if (!window.SMCompass) { r.textContent = 'Boussole indisponible dans cette version.'; return; }
    SMCompass.test().then(function (res) {
      var st = SMCompass.state();
      r.innerHTML = res === 'ok' ? '<span class="ok">✓ Boussole active : direction ' + Math.round(st.heading) + '° (nord = 0°).</span>' : SM.esc(res);
    });
  });
  $('#set-ntf-test', page).addEventListener('click', function () { SM.toast('Voici une notification : elle va se ranger dans le bouton Notifications.'); });

  // 3. hors connexion
  sec('offline').innerHTML =
    '<div class="set-card"><h3>Enregistrer une carte</h3><p>Par défaut, la carte IGN SCAN 25 couvrant une feuille A0 au 1 : 25 000 (21 × 30 km), avec la meilleure netteté, centrée sur le milieu de l’écran. Un cadre sur la carte montre la zone ; déplacez la carte pour recadrer.</p>' +
    '<button type="button" class="btn-primary sm" id="set-off-open">' + ic('download') + 'Choisir la zone sur la carte…</button></div>' +
    '<div class="set-card"><h3>Cartes enregistrées sur cet appareil</h3><div id="set-off-list"></div></div>' +
    '<div class="set-card"><h3>Installer l’application</h3><div id="set-off-install"></div></div>' +
    '<div class="set-card"><h3>Démarrage sans réseau</h3><p id="set-off-ready">…</p><p class="set-hint">Sans réseau, ScoutMap affiche les cartes enregistrées (contour vert sur la carte), ouvre vos tracés, suit votre position GPS et imprime. Le calcul d’un chemin, l’altitude, la recherche d’un lieu et le partage en direct demandent du réseau ; les points posés en « ligne droite » fonctionnent partout.</p></div>';
  $('#set-off-open', page).addEventListener('click', function () { close(); if (SM.openOffline) SM.openOffline(); });
  function refreshOffline() {
    if (page.hidden || cur !== 'offline') return;
    if (SM.offListHtml) $('#set-off-list', page).innerHTML = SM.offListHtml();
    if (SM.offInstallHtml) $('#set-off-install', page).innerHTML = SM.offInstallHtml();
    if (SM.offAppReady) SM.offAppReady().then(function (ok) { $('#set-off-ready', page).innerHTML = ok ? '<span class="ok">✓ L’application est prête à démarrer sans réseau sur cet appareil.</span>' : 'L’application se prépare pour le hors connexion : rechargez la page une fois avec du réseau.'; });
  }

  // 4. version et nouveautés (lues dans CHANGELOG.md)
  sec('about').innerHTML = '<div class="set-card"><h3>Version</h3><p id="set-version">…</p></div><div class="set-card"><h3>Historique des versions</h3><div id="set-changelog" class="set-log">Chargement…</div></div>';
  var logDone = false;
  function loadLog() {
    if (logDone) return; logDone = true;
    $('#set-version', page).textContent = 'ScoutMap ' + (SM.appVersion || '') + (SM.build && SM.build !== 'locale' ? ' (publication ' + SM.build + ')' : '');
    fetch('CHANGELOG.md', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(); return r.text(); }).then(function (t) {
      var h = SM.esc(t).replace(/^# .*$/m, '').replace(/^## (.*)$/gm, '<h4>$1</h4>').replace(/^### (.*)$/gm, '<h5>$1</h5>').replace(/^- (.*)$/gm, '<li>$1</li>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
      h = h.replace(/(<li>[\s\S]*?<\/li>)(?=\s*(?:<h[45]>|$))/g, '<ul>$1</ul>').replace(/\n{2,}/g, '\n');
      $('#set-changelog', page).innerHTML = h;
    }).catch(function () { logDone = false; $('#set-changelog', page).textContent = 'Historique indisponible hors connexion.'; });
  }

  // navigation
  var cur = 'general';
  try { var sv = localStorage.getItem('scoutmap.setcat'); if (CATS.some(function (c) { return c.k === sv; })) cur = sv; } catch (e) { /* ignoré */ }
  function show(k) {
    cur = k; try { localStorage.setItem('scoutmap.setcat', k); } catch (e) { /* ignoré */ }
    $$('.set-cat', page).forEach(function (b) { b.classList.toggle('on', b.dataset.cat === k); b.setAttribute('aria-current', b.dataset.cat === k ? 'page' : 'false'); });
    $$('.set-sec', page).forEach(function (s) { s.hidden = s.dataset.sec !== k; });
    if (k === 'game') { var on = S.mode === 'game'; $('#set-game-hint', page).hidden = on; $$('.set-game', page).forEach(function (g) { g.hidden = !on; }); }
    if (k === 'offline') refreshOffline();
    if (k === 'about') loadLog();
  }
  function open(k) {
    page.hidden = false; document.body.classList.add('set-open');
    // seul le bouton Réglages est allumé dans la barre latérale tant que la page est ouverte
    railOn = $$('#rail .rail-btn.on').filter(function (b) { return b.id !== 'rail-settings'; });
    railOn.forEach(function (b) { b.classList.remove('on'); });
    var rb = $('#rail-settings'); if (rb) rb.classList.add('on');
    show(k || (S.mode && ['route', 'az', 'game'].indexOf(S.mode) >= 0 && cur === 'general' ? S.mode : cur));
  }
  function close() {
    if (page.hidden) return;
    page.hidden = true; document.body.classList.remove('set-open');
    var rb = $('#rail-settings'); if (rb) rb.classList.remove('on');
    railOn.forEach(function (b) { b.classList.add('on'); }); railOn = [];
  }
  var railOn = [];
  page.addEventListener('click', function (e) {
    var c = e.target.closest('.set-cat'); if (c) { show(c.dataset.cat); return; }
    if (e.target.closest('.set-close')) close();
    var del = e.target.closest('[data-odel]'); if (del && SM.offRemove) { if (confirm('Supprimer cette carte enregistrée ?')) SM.offRemove(+del.dataset.odel, function () { show('offline'); }); }
    var see = e.target.closest('[data-oshow]'); if (see && SM.offShow) { close(); SM.offShow(+see.dataset.oshow); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !page.hidden) { e.stopPropagation(); close(); } }, true);
  // le bouton Réglages de la barre latérale ouvre la page (au lieu du panneau) ; les autres boutons la referment
  var rail = $('#rail');
  if (rail) rail.addEventListener('click', function (e) {
    var b = e.target.closest('.rail-btn'); if (!b) return;
    if (b.dataset.rail === 'settings') { e.stopImmediatePropagation(); if (page.hidden) open(); else close(); return; }
    close();
    // depuis l'accueil (barre latérale visible) : un bouton du travail en cours ramène à la carte
    var home = $('#home'); if (home && !home.hidden && b.dataset.rail !== 'home' && S.mode && SM.showHome) SM.showHome(false);
  }, true);
  // ---- Valeurs par défaut des nouveaux tracés et de l'impression (enregistrées sur l'appareil) ----
  var D = SM.DEF;
  if (D) {
    var F = {
      route: [
        ['loop', 'seg', 'Type de parcours', [[false, 'Aller simple'], [true, 'Boucle']]],
        ['opt', 'seg', 'Optimisation', [['fastest', 'Le plus rapide'], ['shortest', 'Le plus court']]],
        ['maxOn', 'check', 'Limiter la distance totale'],
        ['maxKm', 'num', 'Distance maximale', { min: 1, max: 200, step: 1, unit: 'km' }],
        ['speed', 'num', 'Allure de marche', { min: 1, max: 8, step: 0.5, unit: 'km/h' }],
        ['freeOrder', 'check', 'Ordre de passage libre (boucle la plus courte par les points choisis)'],
        ['avoidMotorway', 'check', 'Éviter les autoroutes'],
        ['noBack', 'check', 'Éviter de repasser par le même chemin'],
        ['snapChurch', 'check', 'Poser le point sur l’église du village quand la carte est dézoomée'],
        ['flagNat', 'check', 'Signaler les routes nationales']
      ],
      points: [
        ['style', 'seg', 'Forme des points posés sur la carte', [['epingle', 'Épingle'], ['pastille', 'Pastille numérotée'], ['point', 'Point simple']]]
      ],
      az: [
        ['unit', 'seg', 'Unité', [['deg', 'Degrés'], ['grd', 'Grades'], ['mil', 'Millièmes']]],
        ['ref', 'seg', 'Référence', [['true', 'Nord géographique'], ['mag', 'Nord magnétique']]],
        ['decl', 'num', 'Déclinaison magnétique (Est +)', { min: -30, max: 30, step: 0.1, unit: '°' }]
      ],
      print: [
        ['paper', 'seg', 'Papier', [['A4', 'A4'], ['A3', 'A3']]],
        ['sharp', 'seg', 'Netteté des cartes imprimées', [['auto', 'Automatique'], ['1', 'Rapide'], ['2', 'Maximale']]],
        ['tscale', 'seg', 'Échelle des cartes', [[10000, '1 : 10 000'], [25000, '1 : 25 000'], [50000, '1 : 50 000']]],
        ['line', 'seg', 'Tracé sur les cartes de l’itinéraire', [[false, 'Points seulement'], [true, 'Affiché']]],
        ['roadmap', 'check', 'Feuille de route'],
        ['maps', 'check', 'Cartes du parcours (feuilles numérotées)'],
        ['onesheet', 'check', 'Carte générale sur une seule feuille']
      ]
    };
    var TITLE = { points: 'Apparence des points', route: 'Pour chaque nouvel itinéraire', az: 'Pour chaque nouveau relevé d’azimuts', print: 'Choix proposés à l’impression' };
    function defCard(k) {
      var h = '<div class="set-card set-def" data-def="' + k + '"><h3>' + TITLE[k] + '</h3><p>Ces valeurs s’appliquent aux prochains ' + (k === 'print' ? 'documents imprimés (vous pouvez toujours les changer au moment d’imprimer)' : 'tracés ; le tracé ouvert garde ses propres réglages') + '.</p>';
      F[k].forEach(function (f) {
        var v = D[k][f[0]], id = 'def-' + k + '-' + f[0];
        if (f[1] === 'check') h += '<label class="check"><input type="checkbox" id="' + id + '" data-f="' + f[0] + '"' + (v ? ' checked' : '') + '> ' + f[2] + '</label>';
        else if (f[1] === 'num') h += '<label class="set-row"><span>' + f[2] + '</span><span class="num"><input type="number" id="' + id + '" data-f="' + f[0] + '" min="' + f[3].min + '" max="' + f[3].max + '" step="' + f[3].step + '" value="' + v + '"> ' + f[3].unit + '</span></label>';
        else h += '<div class="set-row"><span>' + f[2] + '</span><div class="seg" role="radiogroup">' + f[3].map(function (o) { return '<button type="button" role="radio" data-f="' + f[0] + '" data-v="' + JSON.stringify(o[0]).replace(/"/g, '&quot;') + '" aria-checked="' + (v === o[0]) + '" class="' + (v === o[0] ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div></div>';
      });
      return h + '<button type="button" class="linkbtn" data-def-reset="' + k + '">Revenir aux valeurs d’origine</button></div>';
    }
    function mountDefs() {
      ['points', 'route', 'az', 'print'].forEach(function (k) {
        var host = sec(k === 'print' ? 'print' : k === 'points' ? 'general' : k), old = $('[data-def="' + k + '"]', page);
        if (old) old.outerHTML = defCard(k); else host.insertAdjacentHTML('afterbegin', defCard(k));
      });
    }
    // une catégorie Impression, placée avant Hors connexion
    var nav = $('.set-nav', page), offBtn = $('[data-cat="offline"]', nav);
    nav.insertBefore((function () { var b = document.createElement('button'); b.type = 'button'; b.className = 'set-cat'; b.dataset.cat = 'print'; b.innerHTML = ic('printer') + '<span>Impression</span>'; return b; })(), offBtn);
    var ps = document.createElement('section'); ps.className = 'set-sec'; ps.dataset.sec = 'print'; ps.hidden = true; ps.innerHTML = '<h2>Impression</h2><div class="set-c"></div>';
    $('.set-body', page).insertBefore(ps, $('[data-sec="offline"]', page));
    CATS.splice(4, 0, { k: 'print', t: 'Impression', i: 'printer' });
    // les réglages du tracé ouvert gardent leur place, sous un titre clair
    ['route', 'az'].forEach(function (k) { var c = $('.set-card:not(.set-def)', sec(k)); if (c) c.insertAdjacentHTML('afterbegin', '<h3>' + (k === 'route' ? 'Itinéraire ouvert' : 'Azimuts ouverts') + '</h3>'); });
    mountDefs();
    page.addEventListener('change', function (e) {
      var inp = e.target.closest('.set-def [data-f]'); if (!inp) return;
      var k = inp.closest('.set-def').dataset.def, f = inp.dataset.f;
      if (inp.type === 'checkbox') D[k][f] = inp.checked;
      else if (inp.type === 'number') { var n = parseFloat(inp.value); if (isFinite(n)) D[k][f] = Math.min(+inp.max, Math.max(+inp.min, n)); }
      SM.saveDefaults(); if (SM.applyPointStyle) SM.applyPointStyle(); SM.toast('Valeur par défaut enregistrée.', { kind: 'ok' });
    });
    page.addEventListener('click', function (e) {
      var b = e.target.closest('.set-def .seg button[data-f]');
      if (b) { var k = b.closest('.set-def').dataset.def; D[b.closest('.set-def').dataset.def][b.dataset.f] = JSON.parse(b.dataset.v); SM.saveDefaults(); if (SM.applyPointStyle) SM.applyPointStyle(); $$('button[data-f="' + b.dataset.f + '"]', b.parentNode).forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); SM.toast('Valeur par défaut enregistrée.', { kind: 'ok' }); return; }
      var r = e.target.closest('[data-def-reset]');
      if (r) { var kk = r.dataset.defReset; Object.keys(SM.DEF_BASE[kk]).forEach(function (f) { D[kk][f] = SM.DEF_BASE[kk][f]; }); SM.saveDefaults(); if (SM.applyPointStyle) SM.applyPointStyle(); mountDefs(); SM.toast('Valeurs d’origine rétablies.', { kind: 'ok' }); }
    });
  }

  SM.settings = { open: open, close: close, isOpen: function () { return !page.hidden; }, refreshOffline: refreshOffline };
})();
