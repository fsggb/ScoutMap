// Génère les affiches : titre (global / par application) et cartes de parties.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/tmp/claude-0/-home-user/53c51b4b-3207-568d-98c6-f0c8e2ce75ec/scratchpad/voice/';
const LOGO = 'file:///home/user/scoutmap/assets/fsggb.png';
const CSS = `html,body{margin:0;width:1280px;height:720px;background:#000761;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Georgia,'Times New Roman',serif;color:#fff}
img{height:360px;width:auto;margin-top:-10px}h1{margin:26px 0 6px;font-size:56px;font-weight:600;letter-spacing:.5px;text-align:center}
p{margin:0;font-family:Inter,Arial,sans-serif;font-size:22px;color:#c6a24e;letter-spacing:.5px;text-align:center}
.num{font-family:Inter,Arial,sans-serif;font-size:20px;letter-spacing:6px;color:#c6a24e;text-transform:uppercase;margin-top:22px}
.part img{height:300px}.part h1{margin-top:14px}.big{font-size:130px;line-height:1;font-weight:700;color:#c6a24e;margin:0}`;
const html = (cls, inner) => `<!doctype html><meta charset="utf-8"><style>${CSS}</style><body class="${cls}">${inner}</body>`;
const LIST = [
  ['poster-global', 'title', 'Tutoriel ScoutMap', 'Fédération des Scouts et Guides Godefroy de Bouillon'],
  ['poster-route', 'title', 'Tutoriel : l’itinéraire', 'ScoutMap · Fédération des Scouts et Guides Godefroy de Bouillon'],
  ['poster-az', 'title', 'Tutoriel : les azimuts', 'ScoutMap · Fédération des Scouts et Guides Godefroy de Bouillon'],
  ['poster-game', 'title', 'Tutoriel : le grand jeu', 'ScoutMap · Fédération des Scouts et Guides Godefroy de Bouillon']
];
const PARTS = ['Prise en main', 'L’itinéraire', 'Enregistrer et imprimer', 'Les azimuts', 'Le grand jeu', 'Pour aller plus loin'];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  for (const [name, , t, s] of LIST) {
    fs.writeFileSync(OUT + 'tmp.html', html('', `<img src="${LOGO}"><h1>${t}</h1><p>${s}</p>`)); await p.goto('file://' + OUT + 'tmp.html'); await p.waitForTimeout(500);
    await p.screenshot({ path: OUT + name + '.png' });
  }
  for (let k = 0; k < PARTS.length; k++) {
    fs.writeFileSync(OUT + 'tmp.html', html('part', `<img src="${LOGO}"><div class="num">Partie</div><div class="big">${k + 1}</div><h1>${PARTS[k]}</h1>`)); await p.goto('file://' + OUT + 'tmp.html'); await p.waitForTimeout(500);
    await p.screenshot({ path: OUT + 'part' + (k + 1) + '.png' });
  }
  await b.close();
})();
