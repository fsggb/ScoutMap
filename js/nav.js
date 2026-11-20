/* ScoutMap : le bouton « Retour » du navigateur (ou du téléphone) ne fait jamais quitter l'application.
   On garde toujours une étape d'historique « en réserve » : un retour ferme ce qui est ouvert (aperçu d'impression, fenêtre,
   menu, panneau sur téléphone) ou, à défaut, ramène à l'accueil ; puis la réserve est remise en place.
   Pour vraiment quitter, on ferme l'onglet. */
(function () {
  'use strict';
  if (!window.history || !history.pushState) return;
  var SM = window.SM || {};
  function $(s) { return document.querySelector(s); }
  function visible(el) { return !!el && !el.hidden && el.offsetParent !== null; }
  function esc() { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); }

  // Ce qu'un retour ferme, du plus au-dessus au plus en dessous. Renvoie true si quelque chose a été fermé.
  function closeTop() {
    // 1. aperçu d'impression : retour à la fenêtre de choix (comme Échap)
    if (document.body.classList.contains('doc-open')) { esc(); return true; }
    // 2. fenêtres (dialog) : la dernière ouverte
    var dl = document.querySelectorAll('dialog[open]');
    if (dl.length) { var d = dl[dl.length - 1]; try { d.close(); } catch (e) { d.removeAttribute('open'); } return true; }
    // 3. menus et fenêtres flottantes
    var pops = Array.prototype.filter.call(document.querySelectorAll('.pop, #dropdown, #ctxmenu'), visible);
    if (pops.length) { esc(); pops.forEach(function (p) { if (visible(p) && p.classList.contains('pop')) p.hidden = true; }); return true; }
    // 4. panneau latéral ouvert sur téléphone
    var app = $('#app');
    if (app && !app.classList.contains('nopanel') && window.matchMedia && matchMedia('(max-width:860px)').matches) { var pc = $('#panel-close'); if (pc) { pc.click(); return true; } }
    // 5. un travail ouvert : retour à l'accueil
    var home = $('#home');
    if (home && (home.hidden || document.getElementById('gwz')) && !window.SM_VIEWER) { var hb = $('.rail-btn[data-rail="home"]'); if (hb) { hb.click(); return true; } }
    return false;
  }

  var armed = false;
  function arm() { try { history.pushState({ sm: 'garde' }, '', location.href); armed = true; } catch (e) { /* ignoré */ } }
  window.addEventListener('popstate', function () {
    if (!armed) return;
    var closed = closeTop();
    arm();
    if (!closed && SM.toast) SM.toast('Pour quitter ScoutMap, fermez l’onglet.');
  });
  // Un navigateur n'accepte d'empiler l'historique qu'après un premier geste de la personne : on arme au premier clic ou toucher.
  function first() { if (!armed) arm(); window.removeEventListener('pointerdown', first, true); window.removeEventListener('keydown', first, true); }
  window.addEventListener('pointerdown', first, true); window.addEventListener('keydown', first, true);
  SM.navCloseTop = closeTop;   // pour les tests
})();
