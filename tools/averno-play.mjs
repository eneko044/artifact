// Dev harness for Averno: opens averno/dev.html headless, runs scripted steps and saves
// screenshots.  node tools/averno-play.mjs <outdir> '<json steps>'
// Steps: {click}, {key}, {down}, {up}, {type}, {wait}, {shot}, {eval}, {game:true} (wait for the engine),
// {mouse:[dx,dy]} (relative mouse motion through the engine bridge).
import { chromium } from 'playwright-core';
const out = process.argv[2] || '/tmp/shots';
const steps = JSON.parse(process.argv[3] || '[]');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: +(process.env.VW || 1280), height: +(process.env.VH || 800) }, hasTouch: !!process.env.TOUCH, isMobile: !!process.env.TOUCH, ignoreHTTPSErrors: true });
const p = await ctx.newPage();
if (process.env.NOWASM) await p.addInitScript(() => { const M = WebAssembly.Module; WebAssembly.Module = function () { throw new WebAssembly.CompileError('blocked by CSP (test)'); }; WebAssembly.Module.prototype = M.prototype; });
const t0 = Date.now();
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text().slice(0, 300)); });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(`http://localhost:${process.env.PORT || 8791}/dev.html`);
await p.waitForLoadState('networkidle');
for (const s of steps) {
  if (s.eval) { const r = await p.evaluate(s.eval); if (r !== undefined) console.log('eval:', JSON.stringify(r).slice(0, 4000)); }
  if (s.click) await p.click(s.click);
  if (s.tapAt) await p.touchscreen.tap(...s.tapAt);
  if (s.key) await p.keyboard.press(s.key);
  if (s.down) await p.keyboard.down(s.down);
  if (s.up) await p.keyboard.up(s.up);
  if (s.type) await p.keyboard.type(s.type, { delay: 80 });
  if (s.game) { await p.waitForFunction(() => window.__averno?.engine() && document.getElementById('loader').hidden, null, { timeout: 120000 }); console.log('engine running at', ((Date.now() - t0) / 1000).toFixed(1), 's'); }
  if (s.until) await p.waitForFunction(s.until, null, { timeout: 60000 });
  if (s.drag) { const [sel, dx, dy, ms] = s.drag; const r = await p.locator(sel).boundingBox(); const x = r.x + r.width / 2, y = r.y + r.height / 2; await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + dx, y + dy, { steps: 5 }); await p.waitForTimeout(ms || 500); await p.mouse.up(); }
  if (s.mouse) await p.evaluate(([dx, dy]) => window.__averno.engine()._web_mouse_move(dx, dy), s.mouse);
  if (s.wait) await p.waitForTimeout(s.wait);
  if (s.state) console.log('state:', await p.evaluate(() => window.__averno.state()));
  if (s.shot) { await p.screenshot({ path: `${out}/${s.shot}.png`, timeout: 60000, fullPage: !!s.full }); console.log('shot', s.shot); }
}
await b.close();
