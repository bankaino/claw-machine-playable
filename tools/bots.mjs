// bots.mjs — headless casual-player model for the claw machine (no browser): node tools/bots.mjs [N=300] [--k KEY=VAL ...]
// Each bot sees the claw with a reaction delay, drags the lever proportionally to the (late) distance, taps the button when the
// claw looks aligned, and some bots rush (tap without aiming) or quit. Prints the funnel and checks the corridors from SPEC.md.
import { createRequire } from 'node:module';
const SIM = createRequire(import.meta.url)('../live/sim.js');
const { K, DT, LAYOUT: LY } = SIM;
const args = process.argv.slice(2), N = +(args.find((a) => /^\d+$/.test(a)) || 300);
for (let i = 0; i < args.length; i++) if (args[i] === '--k') { const [k, v] = args[i + 1].split('='); K[k] = isNaN(+v) ? v : +v; }
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function runBot(seed) {
  const R = rng(seed), U = (a, b) => a + (b - a) * R(), G = () => Math.sqrt(-2 * Math.log(R() + 1e-9)) * Math.cos(2 * Math.PI * R());
  const p = { react: U(0.25, 0.45), sigma: U(25, 60), d0: U(150, 320), tol: U(14, 40), start: U(0.6, 1.6), rush: R() < 0.15, quit: R() < 0.10 ? 8 : 1e9, hand: U(0.18, 0.35) };
  const S = SIM.spawn(0), hist = [], lag = Math.round(p.react / DT);
  let bias = null, aligned = -1, tapAt = -1, pressing = 0, tapped = false, rushDone = false, lastTries = 0;
  for (let i = 0; i < 40 * 120 && S.end < 0; i++) {
    const t = S.t; hist.push(S.cl.x); const obs = hist[Math.max(0, hist.length - 1 - lag)];
    const inp = { press: 0, click: 0, px: LY.LEV.x, py: LY.LEV.y };
    if (t > p.quit) { SIM.step(S, inp); continue; }
    if (S.tries !== lastTries) { lastTries = S.tries; bias = null; aligned = -1; tapAt = -1; }
    if (t > p.start && !S.cy && S.winT < 0) {
      if (p.rush && !rushDone) { if (tapAt < 0) tapAt = t + U(0.2, 0.7); if (t >= tapAt) { inp.press = 1; inp.click = 1; inp.px = LY.BTN.x; inp.py = LY.BTN.y; rushDone = true; tapAt = -1; } }
      else {
        let cap = null, bd = 1e9; for (const c of S.caps) if (c.st === 'idle') { const d = Math.abs(c.px - obs); if (d < bd) { bd = d; cap = c; } }
        if (cap) {
          if (bias === null) bias = G() * p.sigma * 0.6;
          const e = SIM.capX(cap, t) + bias - obs;
          if (tapAt >= 0) { if (t >= tapAt) { inp.press = 1; inp.click = 1; inp.px = LY.BTN.x; inp.py = LY.BTN.y; tapAt = -1; } }
          else if (Math.abs(e) > p.tol) { aligned = -1; const d = Math.sign(e) * Math.max(0.3, Math.min(1, Math.abs(e) / p.d0)); inp.press = 1; inp.px = LY.LEV.x + d * K.LEV_RANGE; if (!pressing) inp.click = 1; }
          else { if (aligned < 0) aligned = t; if (t - aligned > p.react * 0.6 && Math.abs(S.cl.v) < 40) tapAt = t + p.hand; }
        }
      }
    }
    pressing = inp.press && !(inp.px === LY.BTN.x && inp.py === LY.BTN.y) ? 1 : 0;
    SIM.step(S, inp);
  }
  const win = S.endWhy === 'win', tw = win ? S.winT - S.firstIn : null, first = S.ev.find((e) => e.k === 'got');
  return { win, tw, fails: S.tries - S.nGot, got: S.nGot, why: S.endWhy, first: first ? first.t - S.firstIn : null, slips: S.slips };
}
const med = (a) => { const s = a.filter((x) => x !== null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const R = []; for (let i = 1; i <= N; i++) R.push(runBot(i));
const wins = R.filter((r) => r.win), pct = (n) => (100 * n / N).toFixed(0) + '%', why = {}; R.forEach((r) => (why[r.why] = (why[r.why] || 0) + 1));
const stats = { win: wins.length / N, tMed: med(wins.map((r) => r.tw)), failMed: med(wins.map((r) => r.fails)), easy: wins.filter((r) => r.tw < 12).length / N, firstMed: med(R.map((r) => r.first)) };
console.log(`bots ${N}: win ${pct(wins.length)} | win time median ${stats.tMed.toFixed(1)} s | fails before win median ${stats.failMed} | win<12s ${pct(wins.filter((r) => r.tw < 12).length)} | first capsule median ${stats.firstMed.toFixed(1)} s | end ${JSON.stringify(why)} | got avg ${(R.reduce((a, r) => a + r.got, 0) / N).toFixed(2)}`);
const bad = []; if (stats.win < 0.75) bad.push('win rate < 75%'); if (!(stats.tMed >= 16 && stats.tMed <= 24)) bad.push('median win time outside 16-24 s');
if (!(stats.failMed >= 1 && stats.failMed <= 3)) bad.push('median fails outside 1-3'); if (stats.easy > 0.10) bad.push('too easy: win<12s > 10%');
console.log(bad.length ? 'CORRIDORS FAIL: ' + bad.join('; ') : 'corridors ok'); process.exit(bad.length ? 1 : 0);
