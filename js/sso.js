// Connexion unifiée ScoutHub (système partagé entre toutes les applications de la fédération : même origine
// fsggb.github.io, donc même stockage local — pas de ressaisie). Reprend exactement le fonctionnement de
// ChatGDB (chatgdb.js) : un compte en cache s'affiche tout de suite, sans attendre le serveur ; sinon le
// panneau d'invitation à se connecter. Un invité d'un partage en direct (?direct=, SM_LIVE_ROOM, voir plus
// haut dans la page) reste en lecture seule sans avoir besoin de compte : non concerné par ce fichier.
//
// OBLIGATION SUSPENDUE (27/11/2026, à la demande de l'administrateur) : le reste de ce fichier est prêt et
// inchangé, juste jamais exécuté pour l'instant (le temps que l'accès membre, fsggb/ScoutHub#26, soit déployé
// et qu'on puisse vraiment se connecter). Pour réactiver l'obligation : retirer la ligne qui suit.
(async () => {
  "use strict";
  return;   // <-- retirer cette ligne pour réactiver l'obligation de connexion
  // eslint-disable-next-line no-unreachable
  if (window.SM_LIVE_ROOM) return;
  const inviter = () => { const el = document.getElementById("sso-invite"); if (el) el.hidden = false; };
  const retour = encodeURIComponent(location.pathname + location.search);
  const lien = "/ScoutHub/index.html?connexion=1&next=" + retour;
  const bouton = document.getElementById("sso-login"); if (bouton) bouton.href = lien;
  // common.js de ScoutHub n'a pas pu se charger (blocage réseau, extension, ScoutHub indisponible...) : pas de
  // moyen de vérifier une session, donc pas d'accès — jamais l'inverse (fermé par défaut, pas ouvert par défaut).
  if (typeof Hub === "undefined") { inviter(); return; }
  try {
    const user = Hub.cachedUser() || (Hub.token ? await Hub.requireUser() : null);
    if (!user) { inviter(); return; }
    // Revérifie en tâche de fond (sans bloquer l'affichage) : une session expirée ou invalidée renvoie vers la connexion.
    Hub.call("me").then(o => { Hub.user = o.user; Hub.cacheUser(o.user); }).catch(() => Hub.toLogin());
  } catch { inviter(); }
})();
