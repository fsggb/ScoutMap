/* ScoutMap : lecture de coordonnées collées dans la recherche, quel que soit le format.
   Formats reconnus :
   - degrés décimaux : « 45.764, 4.8357 », « 45,764 4,8357 », « 45.764N 4.8357E », « N 45.764 E 4.8357 », « -0.57 44.84 » (inversé si besoin) ;
   - degrés minutes secondes : « 45°45'50"N 4°50'08"E », « 45 45 50 N 4 50 8 E », « N45°45.83' E4°50.14' » ;
   - Lambert 93 (mètres) : « 842000 6519000 », « X=842000 Y=6519000 » ;
   - UTM : « 31T 641000 5069000 », « 31 N 641000 5069000 » ;
   - liens : Google Maps (@lat,lon / q= / ll= / !3d!4d / place/lat,lon), OpenStreetMap (map=z/lat/lon, mlat/mlon),
     Géoportail et Cartes IGN (c=lon,lat ou lat=/lon=), « geo:lat,lon ».
   Fonction pure : SMCoords.parse(texte) → { lat, lon, fmt } ou null ; SMCoords.isShortLink(texte) pour les liens courts Google (illisibles hors navigation). */
(function (g) {
  'use strict';
  function num(s) { return parseFloat(String(s).replace(',', '.')); }
  function ok(lat, lon) { return isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0); }
  function res(lat, lon, fmt) { return ok(lat, lon) ? { lat: Math.round(lat * 1e7) / 1e7, lon: Math.round(lon * 1e7) / 1e7, fmt: fmt } : null; }
  function proj(def, x, y) {
    try { if (typeof g.proj4 !== 'function') return null; var p = g.proj4(def, 'EPSG:4326', [x, y]); return p && isFinite(p[0]) ? { lat: p[1], lon: p[0] } : null; } catch (e) { return null; }
  }
  var L93 = '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

  // ----- liens (Google Maps, OpenStreetMap, Géoportail, geo:)
  function fromUrl(t) {
    var s = t; try { s = decodeURIComponent(t); } catch (e) { /* garde le texte */ }
    var m, D = '(-?\\d{1,3}(?:\\.\\d+)?)';
    if (!/^(https?:\/\/|www\.|geo:|maps\.|google\.)/i.test(s.trim())) return null;
    if ((m = new RegExp('!3d' + D + '!4d' + D).exec(s))) return res(+m[1], +m[2], 'lien');          // point exact d'un lieu Google
    if ((m = new RegExp('[?&](?:q|query|ll|daddr|destination|center|sll)=(?:loc:)?' + D + '\\s*,\\s*' + D).exec(s))) return res(+m[1], +m[2], 'lien');
    if ((m = new RegExp('/place/' + D + '\\s*,\\s*' + D).exec(s))) return res(+m[1], +m[2], 'lien');
    if ((m = new RegExp('/search/' + D + ',\\s*\\+?' + D).exec(s))) return res(+m[1], +m[2], 'lien');
    if ((m = new RegExp('@' + D + ',' + D).exec(s))) return res(+m[1], +m[2], 'lien');               // centre de la vue Google
    if ((m = new RegExp('[?&]mlat=' + D + '&mlon=' + D).exec(s))) return res(+m[1], +m[2], 'lien'); // OpenStreetMap (marqueur)
    if ((m = new RegExp('map=\\d{1,2}(?:\\.\\d+)?/' + D + '/' + D).exec(s))) return res(+m[1], +m[2], 'lien');   // OpenStreetMap
    if ((m = new RegExp('[?&]lat=' + D + '.*?[?&](?:lon|lng)=' + D).exec(s))) return res(+m[1], +m[2], 'lien');
    if ((m = new RegExp('[?&]c=' + D + ',' + D).exec(s))) return res(+m[2], +m[1], 'lien');           // Géoportail : c=lon,lat
    if ((m = new RegExp('^geo:' + D + ',' + D, 'i').exec(s.trim()))) return res(+m[1], +m[2], 'lien');
    return null;
  }

  // ----- degrés (décimaux, minutes, secondes) avec lettres N/S/E/O/W
  var HEM = 'NSEOW';
  function dmsPart(str) {
    // un nombre de degrés, éventuellement suivi de minutes et secondes, avec une lettre d'hémisphère avant ou après
    var s = str.trim().toUpperCase().replace(/[º˚]/g, '°').replace(/[′’']/g, "'").replace(/[″”]|''/g, '"');
    var h = null, m;
    if ((m = /^([NSEOW])\s*(.*)$/.exec(s))) { h = m[1]; s = m[2]; }
    else if ((m = /^(.*?)\s*([NSEOW])$/.exec(s))) { h = m[2]; s = m[1]; }
    s = s.trim(); if (!s) return null;
    var sign = 1; if (s[0] === '-') { sign = -1; s = s.slice(1); } else if (s[0] === '+') s = s.slice(1);
    var nums = s.split(/[°'"\s:]+/).filter(Boolean);
    if (!nums.length || nums.length > 3 || nums.some(function (x) { return !/^\d+(?:[.,]\d+)?$/.test(x); })) return null;
    var v = num(nums[0]) + (nums[1] ? num(nums[1]) / 60 : 0) + (nums[2] ? num(nums[2]) / 3600 : 0);
    if (nums[1] && num(nums[1]) >= 60) return null; if (nums[2] && num(nums[2]) >= 60) return null;
    if (h === 'S' || h === 'O' || h === 'W') sign = -sign;
    return { v: sign * v, h: h, parts: nums.length };
  }
  function fromDegrees(t) {
    var s = t.trim().replace(/\s+/g, ' ');
    // séparation en deux moitiés : par « , » ou « ; » (si la virgule n'est pas décimale), ou par la lettre d'hémisphère
    var cands = [];
    var semi = s.split(/\s*;\s*/); if (semi.length === 2) cands.push(semi);
    var lettered = /^(.*?[NS])\s*,?\s*([EOW].*)$/i.exec(s) || /^([NS].*?)\s*,?\s*([EOW].*)$/i.exec(s); if (lettered) cands.push([lettered[1], lettered[2]]);
    var lettered2 = /^([EOW].*?|.*?[EOW])\s*,?\s*([NS].*|.*?[NS])$/i.exec(s); if (lettered2) cands.push([lettered2[2], lettered2[1]]);
    var comma = s.split(/\s*,\s+|\s*,(?=\s*[-+]?\d+[.]\d)|(?<=\d)\s*,\s*(?=[NSEOW-])/i); if (comma.length === 2) cands.push(comma);
    var commaPlain = s.split(','); if (commaPlain.length === 2 && /\./.test(s)) cands.push(commaPlain);
    // deux nombres séparés par une espace (« 45,764 4,8357 » ou « 45.764 4.8357 »)
    var sp = /^([-+]?\d+(?:[.,]\d+)?)\s+([-+]?\d+(?:[.,]\d+)?)$/.exec(s); if (sp) cands.push([sp[1], sp[2]]);
    var commaDec = /^([-+]?\d+,\d+)\s*[,;]\s*([-+]?\d+,\d+)$/.exec(s); if (commaDec) cands.push([commaDec[1], commaDec[2]]);
    // DMS sans séparateur : « 45°45'50"N 4°50'08"E »
    var dmsSp = /^(.+?["'NS])\s+([EOW+-]?\s*\d.*)$/i.exec(s); if (dmsSp) cands.push([dmsSp[1], dmsSp[2]]);
    for (var i = 0; i < cands.length; i++) {
      var a = dmsPart(cands[i][0]), b = dmsPart(cands[i][1]);
      if (!a || !b) continue;
      var lat = a.v, lon = b.v;
      if (a.h && /[EOW]/.test(a.h) || b.h && /[NS]/.test(b.h)) { lat = b.v; lon = a.v; }
      else if (!a.h && !b.h && Math.abs(lat) > 90 && Math.abs(lon) <= 90) { lat = b.v; lon = a.v; }
      var r = res(lat, lon, a.parts > 1 || b.parts > 1 ? 'dms' : 'dd'); if (r) return r;
    }
    return null;
  }

  // ----- Lambert 93 et UTM (mètres)
  function fromMetric(t) {
    var s = t.trim().toUpperCase().replace(/[  ]/g, ' '), m;
    // UTM : zone + bande éventuelle + est + nord
    if ((m = /^(\d{1,2})\s*([C-X])?\s*[,;]?\s*E?\s*[:=]?\s*(\d{5,7}(?:[.,]\d+)?)\s*(?:M)?\s*[,;]?\s*N?\s*[:=]?\s*(\d{6,8}(?:[.,]\d+)?)\s*M?$/.exec(s))) {
      var z = +m[1], band = m[2] || 'N', south = band !== 'N' && band < 'N';
      if (z >= 1 && z <= 60) { var p = proj('+proj=utm +zone=' + z + (south ? ' +south' : '') + ' +datum=WGS84 +units=m +no_defs', num(m[3]), num(m[4])); if (p) return res(p.lat, p.lon, 'utm'); }
    }
    // Lambert 93 : X (100 000 à 1 300 000) et Y (6 000 000 à 7 200 000), avec ou sans « X= » « Y= », espaces des milliers acceptées
    var c = s.replace(/(\d)\s(?=\d{3}\b)/g, '$1');
    if ((m = /^(?:X\s*[:=]?\s*)?(\d{6,7}(?:[.,]\d+)?)\s*M?\s*[,;\s]\s*(?:Y\s*[:=]?\s*)?(\d{7}(?:[.,]\d+)?)\s*M?$/.exec(c))) {
      var x = num(m[1]), y = num(m[2]);
      if (x > 50000 && x < 1300000 && y > 6000000 && y < 7200000) { var q = proj(L93, x, y); if (q) return res(q.lat, q.lon, 'l93'); }
    }
    return null;
  }

  function parse(text) {
    var t = String(text || '').trim(); if (!t || t.length > 2000) return null;
    return fromUrl(t) || fromMetric(t) || fromDegrees(t);
  }
  function isShortLink(text) { return /^(https?:\/\/)?(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(String(text || '').trim()); }
  function isLink(text) { return /^(https?:\/\/|www\.)/i.test(String(text || '').trim()); }
  var FMT = { dd: 'Degrés décimaux', dms: 'Degrés, minutes, secondes', l93: 'Lambert 93', utm: 'UTM', lien: 'Lien de carte' };
  g.SMCoords = { parse: parse, isShortLink: isShortLink, isLink: isLink, label: function (f) { return FMT[f] || ''; } };
})(typeof window !== 'undefined' ? window : this);
