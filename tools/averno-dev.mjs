// Writes averno/dev.html: the page wrapped in the skeleton the artifact host adds at
// publish time, for local testing (python3 -m http.server inside averno/).
import fs from 'node:fs';
const root = new URL('../averno/', import.meta.url).pathname;
const page = fs.readFileSync(root + 'index.html', 'utf8');
fs.writeFileSync(root + 'dev.html', `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${page}</body></html>`);
console.log('averno/dev.html');
