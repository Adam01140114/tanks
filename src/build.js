const fs = require('fs'), path = require('path');
const rd = f => fs.readFileSync(__dirname + '/' + f, 'utf8');
// mission 20 came through with an empty floor; give the two invisible tanks some cover to sneak around
const patch = `
{ const g = MISSIONS[19].g.split('');
  const put = (c, r, ch) => { g[r * 22 + c] = ch; };
  for (const [c, r] of [[6,3],[6,4],[6,5],[15,11],[15,12],[15,13],[10,8],[11,8],[6,11],[6,12],[6,13],[15,3],[15,4],[15,5]]) put(c, r, '2');
  for (const [c, r] of [[9,8],[12,8]]) put(c, r, 'b');
  MISSIONS[19].g = g.join(''); }
// mission 1 carried a stray full-width wall along its bottom rows
{ const g = MISSIONS[0].g.split(''); for (let i = 12 * 22; i < 14 * 22; i++) g[i] = '.'; MISSIONS[0].g = g.join(''); }
`;
// phones opened from the co-op QR code become controllers instead of loading the game
const prelude = "const ARTIFACT_URL = 'https://claude.ai/artifact/6magk5YpBRQpRVky4MeeWn';\nconst HASH = (location.hash || '').slice(1).toLowerCase();\nif (/^pad-[a-z0-9]{4,12}$/.test(HASH)) { runPad(HASH.slice(4)); return; }\n";
const js = prelude + rd('data.js') + '\n' + patch + '\n' + ['core.js', 'game.js', 'net.js', 'coop.js', 'ui.js', 'pad.js'].map(rd).join('\n');
new Function('(() => {' + js + '})');
const page = rd('head.html') + '\n<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>\n<script>\n(() => {\n' + js + '\n})();\n</script>\n';
const html = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<style>[hidden]{display:none!important}</style>\n</head>\n<body>\n' + page + '</body>\n</html>\n';
fs.writeFileSync(path.join(__dirname, '..', 'index.html'), html);
console.log('wrote index.html', html.length);
