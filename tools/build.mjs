// Bundles the game into a single self-contained page (assets stay as sibling files).
import { build } from 'esbuild';
import fs from 'node:fs';
const root = new URL('../game/', import.meta.url).pathname;
const res = await build({
  entryPoints: [root + 'src/main.js'],
  bundle: true, format: 'iife', minify: !process.env.DEBUG, write: false, target: 'es2020',
  legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const tpl = fs.readFileSync(root + 'index.template.html', 'utf8');
const page = tpl.replace('/*__APP__*/', () => js);
fs.writeFileSync(root + 'index.html', page);
// Local preview wrapper with the skeleton the artifact host adds at publish time.
fs.writeFileSync(root + 'dev.html', `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${page}</body></html>`);
console.log('index.html', (page.length / 1024).toFixed(0), 'KB');
