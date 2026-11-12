/* ScoutMap : géométrie, projections, GPX. Aucune dépendance au DOM de l'application. */
(function (global) {
  'use strict';
  var R = 6371008.8;
  var rad = function (d) { return d * Math.PI / 180; };
  var deg = function (r) { return r * 180 / Math.PI; };

  proj4.defs('EPSG:2154', '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

  // Les points sont des paires [lat, lon].
  function haversine(a, b) {
    var p1 = rad(a[0]), p2 = rad(b[0]);
    var dp = p2 - p1, dl = rad(b[1] - a[1]);
    var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearing(a, b) {
    var p1 = rad(a[0]), p2 = rad(b[0]), dl = rad(b[1] - a[1]);
    var y = Math.sin(dl) * Math.cos(p2);
    var x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (deg(Math.atan2(y, x)) + 360) % 360;
  }
  function destination(a, brg, dist) {
    var p1 = rad(a[0]), l1 = rad(a[1]), t = rad(brg), d = dist / R;
    var p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
    var l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return [deg(p2), ((deg(l2) + 540) % 360) - 180];
  }
  function cumDist(line) {
    var out = [0];
    for (var i = 1; i < line.length; i++) out.push(out[i - 1] + haversine(line[i - 1], line[i]));
    return out;
  }
  function pathLength(line) { var c = cumDist(line); return c.length ? c[c.length - 1] : 0; }

  // Rééchantillonne une ligne en n points régulièrement espacés (distance cumulée d).
  function resample(line, n) {
    var cum = cumDist(line), total = cum[cum.length - 1];
    if (line.length < 2 || total === 0) return line.map(function (p, i) { return { lat: p[0], lon: p[1], d: cum[i] || 0 }; });
    n = Math.max(2, Math.min(n, 400));
    var out = [], j = 0;
    for (var k = 0; k < n; k++) {
      var d = total * k / (n - 1);
      while (j < cum.length - 2 && cum[j + 1] < d) j++;
      var seg = cum[j + 1] - cum[j], t = seg > 0 ? (d - cum[j]) / seg : 0;
      out.push({
        lat: line[j][0] + (line[j + 1][0] - line[j][0]) * t,
        lon: line[j][1] + (line[j + 1][1] - line[j][1]) * t,
        d: d
      });
    }
    return out;
  }

  // Surface plane en Lambert-93 (m²) ; repli sphérique hors de France.
  function areaM2(pts) {
    if (pts.length < 3) return 0;
    var xy = pts.map(function (p) { return proj4('EPSG:4326', 'EPSG:2154', [p[1], p[0]]); });
    var s = 0;
    for (var i = 0; i < xy.length; i++) {
      var a = xy[i], b = xy[(i + 1) % xy.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  }

  function utmZone(lon) { return Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1)); }
  function sp(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function dms(v, pos, neg) {
    var h = v >= 0 ? pos : neg; v = Math.abs(v);
    var d = Math.floor(v), m = Math.floor((v - d) * 60), s = ((v - d) * 60 - m) * 60;
    return d + '° ' + (m < 10 ? '0' : '') + m + '′ ' + (s < 10 ? '0' : '') + s.toFixed(1) + '″ ' + h;
  }
  function formatCoord(fmt, lat, lon) {
    try {
      if (fmt === 'dms') return dms(lat, 'N', 'S') + '  ' + dms(lon, 'E', 'O');
      if (fmt === 'l93') {
        var p = proj4('EPSG:4326', 'EPSG:2154', [lon, lat]);
        return 'X ' + sp(p[0]) + ' m   Y ' + sp(p[1]) + ' m';
      }
      if (fmt === 'utm') {
        var z = utmZone(lon), south = lat < 0;
        var q = proj4('EPSG:4326', '+proj=utm +zone=' + z + (south ? ' +south' : '') + ' +datum=WGS84 +units=m +no_defs', [lon, lat]);
        return z + (lat >= 0 ? 'N' : 'S') + '  E ' + sp(q[0]) + '  N ' + sp(q[1]);
      }
    } catch (e) { /* repli ci-dessous */ }
    return lat.toFixed(5) + ', ' + lon.toFixed(5);
  }

  // ----- Azimuts : unités et références -----
  var UNITS = {
    deg: { full: 360, label: '°', dec: 1 },
    grd: { full: 400, label: ' gr', dec: 1 },
    mil: { full: 6400, label: ' mil', dec: 0 }
  };
  function trueToUnit(trueDeg, unit, ref, decl) {
    var d = ref === 'mag' ? trueDeg - decl : trueDeg;
    d = ((d % 360) + 360) % 360;
    return d / 360 * UNITS[unit].full;
  }
  function unitToTrue(value, unit, ref, decl) {
    var d = value / UNITS[unit].full * 360;
    if (ref === 'mag') d += decl;
    return ((d % 360) + 360) % 360;
  }
  function fmtAz(v, unit) {
    var u = UNITS[unit], x = ((v % u.full) + u.full) % u.full;
    return x.toFixed(u.dec) + u.label;
  }
  function fmtDist(m) { return m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 1 : 2).replace('.', ',') + ' km' : Math.round(m) + ' m'; }
  function fmtDur(s) {
    s = Math.round(s / 60);
    var h = Math.floor(s / 60), m = s % 60;
    return h ? h + ' h ' + (m < 10 ? '0' : '') + m : m + ' min';
  }
  function fmtArea(m2) {
    if (m2 >= 1e6) return (m2 / 1e6).toFixed(2).replace('.', ',') + ' km²';
    if (m2 >= 1e4) return (m2 / 1e4).toFixed(2).replace('.', ',') + ' ha';
    return Math.round(m2) + ' m²';
  }

  // ----- GPX -----
  function esc(s) { return String(s).replace(/[<>&"']/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]; }); }
  function trkXml(name, line, ele, desc) {
    var s = '  <trk><name>' + esc(name) + '</name>' + (desc ? '<desc>' + esc(desc) + '</desc>' : '') + '<trkseg>\n';
    line.forEach(function (p, i) {
      s += '    <trkpt lat="' + p[0].toFixed(6) + '" lon="' + p[1].toFixed(6) + '">' +
        (ele && ele[i] != null ? '<ele>' + ele[i].toFixed(1) + '</ele>' : '') + '</trkpt>\n';
    });
    return s + '  </trkseg></trk>\n';
  }
  function wptXml(p, name, desc) {
    return '  <wpt lat="' + p[0].toFixed(6) + '" lon="' + p[1].toFixed(6) + '"><name>' + esc(name) + '</name>' +
      (desc ? '<desc>' + esc(desc) + '</desc>' : '') + '</wpt>\n';
  }
  function gpxDoc(body, name) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="ScoutMap FSGGB" xmlns="http://www.topografix.com/GPX/1/1">\n' +
      '  <metadata><name>' + esc(name) + '</name><time>' + new Date().toISOString() + '</time></metadata>\n' + body + '</gpx>\n';
  }
  // Lecture de KML et de GeoJSON (en plus du GPX) : renvoie { tracks: [{ name, coords, ele }], wpts: [{ lat, lon, name }] }.
  function parseKml(text, fallbackName) {
    var doc = new DOMParser().parseFromString(text, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Fichier KML illisible.');
    var tracks = [], wpts = [];
    function coordsOf(el) {
      var out = [], ele = [];
      (el.textContent || '').trim().split(/\s+/).forEach(function (s) {
        var a = s.split(',').map(parseFloat); if (isFinite(a[0]) && isFinite(a[1])) { out.push([a[1], a[0]]); ele.push(isFinite(a[2]) ? a[2] : null); }
      });
      return { c: out, e: ele };
    }
    Array.prototype.forEach.call(doc.getElementsByTagName('Placemark'), function (pm) {
      var n = pm.getElementsByTagName('name')[0], name = n ? n.textContent.trim() : '';
      Array.prototype.forEach.call(pm.getElementsByTagName('LineString'), function (ls) {
        var r = coordsOf(ls.getElementsByTagName('coordinates')[0] || ls); if (r.c.length > 1) tracks.push({ name: name || fallbackName || 'Trace', coords: r.c, ele: r.e.every(function (v) { return v != null; }) ? r.e : null });
      });
      Array.prototype.forEach.call(pm.getElementsByTagName('Point'), function (pt) {
        var r = coordsOf(pt.getElementsByTagName('coordinates')[0] || pt); if (r.c.length) wpts.push({ lat: r.c[0][0], lon: r.c[0][1], name: name });
      });
    });
    return { tracks: tracks, wpts: wpts };
  }
  function parseGeoJson(text, fallbackName) {
    var j; try { j = JSON.parse(text); } catch (e) { throw new Error('Fichier GeoJSON illisible.'); }
    var tracks = [], wpts = [];
    function line(cs, name) { var c = cs.filter(function (p) { return p.length >= 2; }).map(function (p) { return [p[1], p[0]]; }); if (c.length > 1) tracks.push({ name: name || fallbackName || 'Trace', coords: c, ele: null }); }
    function geom(g, name) {
      if (!g) return;
      if (g.type === 'LineString') line(g.coordinates, name);
      else if (g.type === 'MultiLineString') g.coordinates.forEach(function (l) { line(l, name); });
      else if (g.type === 'Polygon') g.coordinates.forEach(function (l) { line(l, name); });
      else if (g.type === 'MultiPolygon') g.coordinates.forEach(function (pl) { pl.forEach(function (l) { line(l, name); }); });
      else if (g.type === 'Point') wpts.push({ lat: g.coordinates[1], lon: g.coordinates[0], name: name || '' });
      else if (g.type === 'MultiPoint') g.coordinates.forEach(function (p) { wpts.push({ lat: p[1], lon: p[0], name: name || '' }); });
      else if (g.type === 'GeometryCollection') (g.geometries || []).forEach(function (x) { geom(x, name); });
    }
    (j.type === 'FeatureCollection' ? j.features : j.type === 'Feature' ? [j] : [{ geometry: j, properties: {} }]).forEach(function (f) {
      var pr = f.properties || {}; geom(f.geometry, pr.name || pr.nom || pr.title || '');
    });
    return { tracks: tracks, wpts: wpts };
  }

  function parseGpx(text, fallbackName) {
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Fichier GPX illisible.');
    var tracks = [], wpts = [];
    function pts(root, tag) {
      var out = [], ele = [], hasEle = false;
      root.querySelectorAll(tag).forEach(function (n) {
        var la = parseFloat(n.getAttribute('lat')), lo = parseFloat(n.getAttribute('lon'));
        if (isNaN(la) || isNaN(lo)) return;
        out.push([la, lo]);
        var e = n.querySelector('ele'), z = e ? parseFloat(e.textContent) : NaN;
        ele.push(isNaN(z) ? null : z); if (!isNaN(z)) hasEle = true;
      });
      return { line: out, ele: hasEle ? ele : null };
    }
    function nm(el, d) { var n = el.querySelector(':scope > name'); return n && n.textContent.trim() ? n.textContent.trim() : d; }
    doc.querySelectorAll('trk').forEach(function (t, i) {
      var p = pts(t, 'trkpt');
      if (p.line.length > 1) tracks.push({ name: nm(t, (fallbackName || 'Trace') + (i ? ' ' + (i + 1) : '')), coords: p.line, ele: p.ele });
    });
    doc.querySelectorAll('rte').forEach(function (t, i) {
      var p = pts(t, 'rtept');
      if (p.line.length > 1) tracks.push({ name: nm(t, 'Route ' + (i + 1)), coords: p.line, ele: p.ele });
    });
    doc.querySelectorAll('gpx > wpt').forEach(function (n) {
      var la = parseFloat(n.getAttribute('lat')), lo = parseFloat(n.getAttribute('lon'));
      if (!isNaN(la) && !isNaN(lo)) wpts.push({ lat: la, lon: lo, name: nm(n, '') });
    });
    return { tracks: tracks, wpts: wpts };
  }

  global.Geo = {
    R: R, haversine: haversine, bearing: bearing, destination: destination, cumDist: cumDist, pathLength: pathLength,
    resample: resample, areaM2: areaM2, formatCoord: formatCoord, UNITS: UNITS, trueToUnit: trueToUnit,
    unitToTrue: unitToTrue, fmtAz: fmtAz, fmtDist: fmtDist, fmtDur: fmtDur, fmtArea: fmtArea,
    esc: esc, trkXml: trkXml, wptXml: wptXml, gpxDoc: gpxDoc, parseGpx: parseGpx, parseKml: parseKml, parseGeoJson: parseGeoJson
  };
})(window);
