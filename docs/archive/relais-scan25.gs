/**
 * Relais SCAN 25 pour ScoutMap (Google Apps Script).
 * La clé IGN reste dans les propriétés du script ; ScoutMap ne connaît que l'adresse du relais.
 * 1. script.google.com > Nouveau projet > coller ce code.
 * 2. Paramètres du projet > Propriétés du script > ajouter IGN_KEY = votre clé (32 caractères).
 * 3. Déployer > Nouveau déploiement > Application Web : exécuter en tant que « Moi », accès « Tout le monde ».
 * 4. Copier l'adresse …/exec et la coller dans ScoutMap (fonds de carte > SCAN 25 IGN).
 */
var LAYER = 'GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN25TOUR';

function doGet(e) {
  var p = e.parameter || {}, z = parseInt(p.z, 10), x = parseInt(p.x, 10), y = parseInt(p.y, 10);
  if (!(z >= 0 && z <= 17 && x >= 0 && y >= 0 && x < Math.pow(2, z) && y < Math.pow(2, z))) return out({ err: 'paramètres' });
  var key = 's25_' + z + '_' + x + '_' + y, cache = CacheService.getScriptCache(), hit = cache.get(key);
  if (hit) return out({ d: hit });
  var k = PropertiesService.getScriptProperties().getProperty('IGN_KEY');
  if (!k) return out({ err: 'IGN_KEY manquante' });
  var url = 'https://data.geopf.fr/private/wmts?apikey=' + encodeURIComponent(k) +
    '&SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=' + LAYER + '&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM' +
    '&TILEMATRIX=' + z + '&TILEROW=' + y + '&TILECOL=' + x;
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return out({ err: 'IGN HTTP ' + r.getResponseCode() });
  var d = Utilities.base64Encode(r.getBlob().getBytes());
  if (d.length < 95000) { try { cache.put(key, d, 21600); } catch (er) { /* trop gros : ignoré */ } }
  return out({ d: d });
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
