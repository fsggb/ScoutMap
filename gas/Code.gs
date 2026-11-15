/**
 * ScoutMap – version Google Apps Script (application web).
 * Tout le code de la carte tourne dans le navigateur ; ce fichier ne fait que servir la page.
 * Déploiement : Déployer > Nouveau déploiement > Application web
 *   (Exécuter en tant que : moi · Qui a accès : tout le monde).
 */

function doGet(e) {
  var t = HtmlService.createTemplateFromFile('Index');
  t.appUrl = ScriptApp.getService().getUrl(); // adresse /exec : sert aux liens de partage et d'« Modifier »
  return t.evaluate()
    .setTitle('ScoutMap – FSGGB')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Insère le contenu brut d'un autre fichier HTML du projet (appelé par <?!= include('…') ?>). */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
