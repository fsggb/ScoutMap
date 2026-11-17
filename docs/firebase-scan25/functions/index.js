const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { tile } = require('./tile');

const KEY = defineSecret('SCAN25_KEY');   // la clé IGN reste dans Secret Manager, jamais dans le code ni dans le navigateur

exports.scan25 = onRequest(
  { region: 'europe-west1', secrets: [KEY], memory: '256MiB', concurrency: 80, maxInstances: 20, timeoutSeconds: 30 },
  (req, res) => tile(req, res, KEY.value())
);
