// Dev harness: loads the game headless, runs scripted steps and saves screenshots.
import { chromium } from 'playwright-core';
const out = process.argv[2] || '/tmp/shots';
const steps = JSON.parse(process.argv[3] || '[]');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: +(process.env.VW || 960), height: +(process.env.VH || 540) } });
await p.addInitScript(() => { try { localStorage.setItem('sector-polvo-settings', JSON.stringify({ quality: 'baja' })); } catch {} });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { const t = m.text(); if (!errs.includes(t)) { errs.push(t); console.log('[console]', m.type(), t.slice(0, 400)); } } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')));
await p.goto('http://localhost:8765/dev.html');
const t0 = Date.now();
await p.waitForFunction(() => !document.querySelector('#play').disabled, null, { timeout: 180000 });
console.log('loaded in', ((Date.now() - t0) / 1000).toFixed(1), 's');
for (const s of steps) {
  if (s.eval) { const r = await p.evaluate(s.eval); if (r !== undefined) console.log('eval:', JSON.stringify(r).slice(0, 30000)); }
  if (s.click) await p.click(s.click);
  if (s.key) await p.keyboard.press(s.key);
  if (s.down) await p.keyboard.down(s.down);
  if (s.up) await p.keyboard.up(s.up);
  if (s.wait) await p.waitForTimeout(s.wait);
  if (s.shot) { await p.screenshot({ path: `${out}/${s.shot}.png`, timeout: 180000 }); console.log('shot', s.shot); }
}
await b.close();
