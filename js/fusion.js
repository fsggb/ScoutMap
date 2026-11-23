/* ScoutMap : fusion des modifications faites en même temps par plusieurs personnes (préparation à plusieurs en direct).
   Fusion « à trois voies » : base = dernier état commun, mine = ma carte, theirs = la carte reçue.
   - une valeur que je n'ai pas changée prend celle reçue ; une valeur que je suis seul à avoir changée garde la mienne ;
     si les deux ont changé, la plus récente (celle reçue) l'emporte ;
   - les listes d'éléments avec un identifiant (points de l'itinéraire, formes du grand jeu…) se fusionnent élément par élément :
     mes ajouts sont gardés (insérés après leur voisin), les suppressions de chacun sont appliquées, l'ordre reçu est conservé ;
   - les autres listes (coordonnées d'une forme, par exemple) sont traitées comme une seule valeur.
   Fonction pure : SMMerge.merge3(base, mine, theirs). */
(function (g) {
  'use strict';
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function keyed(a) { return Array.isArray(a) && a.length > 0 && a.every(function (x) { return isObj(x) && x.id != null; }); }
  function mapOf(a) { var m = {}; (a || []).forEach(function (x) { if (isObj(x) && x.id != null) m[String(x.id)] = x; }); return m; }

  function mergeList(base, mine, theirs) {
    var B = mapOf(base), M = mapOf(mine), T = mapOf(theirs), out = [], placed = {};
    (theirs || []).forEach(function (t) {
      var id = String(t.id);
      if (B[id] && !M[id]) { if (same(t, B[id])) return; }          // je l'ai supprimé (et personne ne l'a modifié) : supprimé
      out.push(M[id] ? merge3(B[id], M[id], t) : t); placed[id] = true;
    });
    // mes ajouts : insérés juste après l'élément qui les précède chez moi
    (mine || []).forEach(function (m, i) {
      var id = String(m.id);
      if (placed[id] || T[id] || B[id]) return;                        // déjà là, ou supprimé par les autres
      var at = 0;
      for (var k = i - 1; k >= 0; k--) {
        var prev = String(mine[k].id), j = -1;
        for (var q = 0; q < out.length; q++) if (String(out[q].id) === prev) { j = q; break; }
        if (j >= 0) { at = j + 1; break; }
      }
      out.splice(at, 0, m); placed[id] = true;
    });
    return out;
  }
  function merge3(base, mine, theirs) {
    if (same(mine, theirs)) return theirs;
    if (base === undefined || base === null) return theirs;
    if (same(mine, base)) return theirs;          // je n'ai rien changé
    if (same(theirs, base)) return mine;          // les autres n'ont rien changé
    if (isObj(base) && isObj(mine) && isObj(theirs)) {
      var out = {}, keys = {};
      [base, mine, theirs].forEach(function (o) { Object.keys(o).forEach(function (k) { keys[k] = true; }); });
      Object.keys(keys).forEach(function (k) {
        var v = merge3(base[k], mine[k], theirs[k]);
        if (v !== undefined) out[k] = v;
      });
      return out;
    }
    if ((keyed(mine) || keyed(theirs) || keyed(base)) && Array.isArray(mine) && Array.isArray(theirs)) return mergeList(Array.isArray(base) ? base : [], mine, theirs);
    return theirs;                                // changé des deux côtés : la version reçue (la plus récente) l'emporte
  }
  g.SMMerge = { merge3: merge3 };
})(typeof window !== 'undefined' ? window : this);
