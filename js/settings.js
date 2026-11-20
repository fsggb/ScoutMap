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
    '<div class="set-card"><h3>Ma position et boussole</h3><p>Un appui sur le bouton de position affiche votre point, la carte au nord. Sur téléphone, un deuxième appui fait tourner la carte dans la direction où vous regardez (comme l’application Cartes IGN) ; le bouton <b>N</b> remet le nord en haut. Un troisième appui arrête le suivi.</p></div>';
  $('#set-update', page).addEventListener('click', function () { if (SM.forceUpdate) SM.forceUpdate(); });
  $('#set-ntf-test', page).addEventListener('click', function () { SM.toast('Voici une notification : elle va se ranger dans le bouton Notifications.'); });

  // 3. hors connexion
  sec('offline').innerHTML =
    '<div class="set-card"><h3>Enregistrer une carte</h3><p>Par défaut, la carte IGN SCAN 25 couvrant une feuille A0 au 1 : 25 000 (21 × 30 km), avec la meilleure netteté, centrée sur le milieu de l’écran. Un cadre sur la carte montre la zone ; déplacez la carte pour recadrer.</p>' +
    '<button type="button" class="btn-primary sm" id="set-off-open">' + ic('download') + 'Choisir la zone sur la carte…</button></div>' +
    '<div class="set-card"><h3>Cartes enregistrées sur cet appareil</h3><div id="set-off-list"></div></div>' +
    '<div class="set-card"><h3>Application</h3><p>Installée, ScoutMap a son icône, s’ouvre en plein écran et démarre sans réseau.</p><button type="button" class="btn-ghost sm" data-install>' + ic('download') + 'Installer l’application</button></div>';
  $('#set-off-open', page).addEventListener('click', function () { close(); if (SM.openOffline) SM.openOffline(); });
  $$('[data-install]', page).forEach(function (b) { b.addEventListener('click', function () { if (SM.install) SM.install(); }); });

  // 4. version et nouveautés (lues dans CHANGELOG.md)
  sec('about').innerHTML = '<div class="set-card"><h3>Version</h3><p id="set-version">…</p></div><div class="set-card"><h3>Historique des versions</h3><div id="set-changelog" class="set-log">Chargement…</div></div>';
  var logDone = false;
  function loadLog() {
    if (logDone) return; logDone = true;
    $('#set-version', page).textContent = 'ScoutMap ' + (SM.version || '') + (SM.build && SM.build !== 'locale' ? ' (publication ' + SM.build + ')' : '');
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
    if (k === 'offline' && SM.offListHtml) $('#set-off-list', page).innerHTML = SM.offListHtml();
    if (k === 'about') loadLog();
  }
  function open(k) {
    page.hidden = false; document.body.classList.add('set-open');
    var rb = $('#rail-settings'); if (rb) rb.classList.add('on');
    show(k || (S.mode && ['route', 'az', 'game'].indexOf(S.mode) >= 0 && cur === 'general' ? S.mode : cur));
  }
  function close() {
    if (page.hidden) return;
    page.hidden = true; document.body.classList.remove('set-open');
    var rb = $('#rail-settings'); if (rb) rb.classList.remove('on');
  }
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
  SM.settings = { open: open, close: close, isOpen: function () { return !page.hidden; } };
})();
