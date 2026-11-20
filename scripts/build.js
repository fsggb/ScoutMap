#!/usr/bin/env node
// Assemble js/app.js à partir des parties de src/app/ (dans l'ordre de leur numéro).
// Les parties partagent la même portée : elles forment ensemble UNE fonction (l'« IIFE » de l'application),
// ouverte dans 00-etat.js et refermée dans la dernière partie. On les modifie dans src/app/, jamais dans js/app.js.
//   node scripts/build.js           → écrit js/app.js
//   node scripts/build.js --check   → vérifie que js/app.js est à jour (utilisé par les tests)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'src', 'app');
const OUT = path.join(ROOT, 'js', 'app.js');

function assemble() {
  const parts = fs.readdirSync(DIR).filter((f) => /^\d\d-.+\.js$/.test(f)).sort();
  if (!parts.length) throw new Error('aucune partie dans src/app/');
  return '/* FICHIER ASSEMBLÉ par scripts/build.js à partir de src/app/ : ne pas le modifier ici (les changements seraient perdus). */\n' +
    parts.map((f) => fs.readFileSync(path.join(DIR, f), 'utf8')).join('');
}
if (require.main === module) {
  const out = assemble();
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== out) { console.error('js/app.js n’est pas à jour : lancez « node scripts/build.js » (et ne modifiez pas js/app.js à la main).'); process.exit(1); }
    console.log('js/app.js est à jour.');
  } else {
    fs.writeFileSync(OUT, out);
    console.log('js/app.js assemblé (' + out.split('\n').length + ' lignes).');
  }
}
module.exports = { assemble };
