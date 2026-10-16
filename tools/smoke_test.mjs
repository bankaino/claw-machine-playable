// smoke_test.mjs — plays a built single-file playable headless, like a QA tester on a phone would.
//   node tools/smoke_test.mjs [dist/default/applovin.html] [--shots dir]
// Mobile viewport + touch, a stub MRAID container that records mraid.open, a drag that mows for a few seconds, a tap
// on the persistent CTA. Fails (exit 1) on: page errors, any network request other than mraid.js, no grab started,
// CTA not reaching mraid.open, fps below 50.
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs'; import { pathToFileURL } from 'node:url';
const req = createRequire(import.meta.url);
const { chromium } = req(process.env.PLAYWRIGHT || 'playwright');
const file = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'dist/default/applovin.html');
const si = process.argv.indexOf('--shots'), shots = si > 0 ? process.argv[si + 1] : 'frames/smoke'; fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [], external = []; let touchFail = '';
ctx.on('request', (r) => { const u = r.url(); if (!u.startsWith('data:') && !u.startsWith('file:')) external.push(u); });
await ctx.route('**/mraid.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: `
  window.mraid = { _l: {}, opened: [], getState: () => 'default', isViewable: () => true,
    addEventListener(k, f) { (this._l[k] = this._l[k] || []).push(f); }, open(u) { this.opened.push(u); } };` }));
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(pathToFileURL(file).href);
try { await p.waitForFunction(() => window.__ready, null, { timeout: 20000 }); }
catch (e) { console.log(JSON.stringify({ file: path.basename(file), fails: ['did not boot: ' + (errors.join(' | ') || e.message)] })); await browser.close(); process.exit(1); }
await p.waitForTimeout(600); await p.screenshot({ path: path.join(shots, '0_start.png') });
const box = await p.locator('canvas').boundingBox(), VIEW = await p.evaluate(() => SIM.VIEW);
const V = (x, y) => [box.x + x / VIEW.W * box.width, box.y + y / VIEW.H * box.height];
// play like a thumb on a phone: grab the lever, push it toward a capsule, release, tap the button — twice
const lay = await p.evaluate(() => SIM.LAYOUT), K = await p.evaluate(() => SIM.K);
const [ax, ay] = V(lay.LEV.x, lay.LEV.y);
for (let round = 0; round < 2; round++) {
  await p.mouse.move(ax, ay); await p.mouse.down();
  const [px, py] = V(lay.LEV.x + (round ? -0.9 : 0.5) * K.LEV_RANGE, lay.LEV.y); await p.mouse.move(px, py, { steps: 6 }); await p.waitForTimeout(round ? 900 : 500);
  await p.mouse.up(); await p.waitForTimeout(250);
  const [bx, by] = V(lay.BTN.x, lay.BTN.y); await p.mouse.click(bx, by); await p.waitForTimeout(round ? 1300 : 900);
  if (!round) await p.screenshot({ path: path.join(shots, '1_grab.png') });
}
// a real touch drag (touch events, not the mouse): the lever must follow the finger and let go when it lifts
{ await p.waitForTimeout(2500); const cdp = await ctx.newCDPSession(p), st0 = await p.evaluate(() => ({ x: SCENE.state.cl.x, busy: !!SCENE.state.cy }));
  const [tx, ty] = V(lay.LEV.x, lay.LEV.y), t = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await t('touchStart', tx, ty); for (let i = 1; i <= 12; i++) { await t('touchMove', tx + i * 4, ty); await p.waitForTimeout(40); }
  const mid = await p.evaluate(() => ({ d: SCENE.state.lev.d, grab: SCENE.state.lev.grab }));
  await t('touchEnd'); await p.waitForTimeout(700);
  const after = await p.evaluate(() => ({ d: SCENE.state.lev.d, grab: SCENE.state.lev.grab, x: SCENE.state.cl.x, busy: !!SCENE.state.cy }));
  if (!st0.busy && !(mid.d > 0.2)) touchFail = 'touch drag did not move the lever (d=' + mid.d + ')';
  if (after.grab || Math.abs(after.d) > 0.05) touchFail = 'lever stuck after the finger lifted (d=' + after.d + ', grab=' + after.grab + ')'; }
const money = await p.evaluate(() => SCENE.state && SCENE.state.tries);
const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }));
// no persistent CTA bar: fast-forward the 30 s box, wait for the endcard, then tap its CTA
await p.evaluate(() => { const s = SCENE.state; for (let i = 0; s && i < 120 * 32 && s.end < 0; i++) SIM.step(s, {}); });   // an idle player: the time box runs out
await p.waitForFunction(() => SCENE.state && SCENE.state.end >= 0, null, { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(1500);
await p.screenshot({ path: path.join(shots, '1b_endcard.png') });
await p.evaluate(() => { SCENE.state.endWhy = 'timeout'; }); await p.waitForTimeout(500);                     // the lost-in-time endcard of this variant
await p.screenshot({ path: path.join(shots, '1c_lost.png') });
// tap the endcard CTA
const cta = await p.evaluate(() => (SCENE.hit || []).find((b) => b.id === 'cta'));
if (cta) { const [cx, cy] = V(cta.x + cta.w / 2, cta.y + cta.h / 2); await p.mouse.click(cx, cy); }
const opened = await p.evaluate(() => (window.mraid && window.mraid.opened) || []);
await p.screenshot({ path: path.join(shots, '2_after_cta.png') });
await browser.close();
const fails = [];
if (errors.length) fails.push('page errors: ' + errors.join(' | '));
const ext = external.filter((u) => !u.endsWith('/mraid.js')); if (ext.length) fails.push('external requests: ' + ext.join(', '));
if (!(money > 0)) fails.push('the button never started a grab (tries=' + money + ')');
if (touchFail) fails.push(touchFail);
if (!opened.length) fails.push('CTA did not call mraid.open');
if (fps < 50) fails.push('fps ' + fps);
console.log(JSON.stringify({ file: path.basename(file), view: VIEW, money, fps, cta: opened[0] || null, fails }));
process.exit(fails.length ? 1 : 0);
