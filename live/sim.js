// live/sim.js — CLAW MACHINE playable ad: deterministic sim, fixed 120 Hz, view pixels (1080 × H).
// Loop: drag the lever (claw follows) → tap the button (claw drops, closes, lifts, carries to the chute) → 4 capsules in 30 s
// → promo endcard. Every reaction lives here; the scene only draws. Layout comes from VIEW.H, never from 1920.
(function (root) {
  const DT = 1 / 120, L = 30.0;
  const ASPECT = typeof window !== 'undefined' && window.innerWidth ? window.innerHeight / window.innerWidth : 16 / 9;
  const VIEW = { W: 1080, H: Math.round(1080 * Math.max(16 / 9, Math.min(19.5 / 9, ASPECT))) }, WORLD = { x0: 0, y0: 0, x1: VIEW.W, y1: VIEW.H };
  const HINT = 'drag the lever · tap the button to grab · collect all 4 capsules';
  const K = {
    TOTAL: 30, PROMO_MODE: 'win',                                      // time box (s); endcard rule: win = a code only for a win (default), always = a code for everyone
    CLAW_V: 520, CLAW_TAU: 0.08, LEV_RANGE: 110, LEV_DEAD: 0.12, LEV_TAU: 0.035, LEV_GRAB: 170, BTN_R: 130,
    CAP_R: 76, CAP_BACK: 0.9, BACK_DY: 84, CTA_BAR: false, DOWN: 0.4, CLOSE: 0.18, UP: 0.35, CARRY_V: 1300, RELEASE: 0.25, FALL: 0.45, RETURN: 0.3, SLIP_AT: 0.4,
    GRAB_OK: 40, GRAB_EDGE: 80, MERCY_FAILS: 2, LATE_T: 8, LATE_MUL: 1.5,  // |dx| ≤ OK grabs, ≤ EDGE slips; mercy after 2 failures
    END_AFTER_WIN: 1.6, END_NO_INPUT: 12, END_IDLE: 10,
  };
  const PRODUCTS = ['burger', 'fries', 'cola', 'nuggets'];

  // ---------------- the layout: art-driven (machine_shell.png, 1024×1536) scaled by SC, stretched 3-slice in the window band ----------------
  const W = VIEW.W, H = VIEW.H, SC = 1.08, BM = 40, CTA_H = K.CTA_BAR ? 170 : 0;
  const SRC = { x0: 26, y0: 18, y1: 1508, hx0: 128, hx1: 896, hy0: 299, hy1: 1209, bandA: 480, bandB: 1000, sign: 70, band: 185, deck: 1395, rail0: 62, rail1: 961 };
  const NAT = (SRC.y1 - SRC.y0) * SC, GLH = Math.max(840, Math.min(1000, Math.round(H * 0.46))), EXT = Math.round(GLH - (SRC.hy1 - SRC.hy0) * SC), MT = Math.round(H - CTA_H - BM - NAT - EXT);   // window height by screen height; the rest above is the headline zone
  const SX = (W - 1024 * SC) / 2, sxv = (xs) => SX + xs * SC;                         // source x → view x
  const mapY = (ys) => MT + (Math.min(ys, SRC.bandA) - SRC.y0) * SC + (Math.max(0, Math.min(ys, SRC.bandB) - SRC.bandA)) * (SC + EXT / (SRC.bandB - SRC.bandA)) + Math.max(0, ys - SRC.bandB) * SC;   // source y → view y
  const GL = { x: Math.round(sxv(SRC.hx0)), y: Math.round(mapY(SRC.hy0)), w: Math.round((SRC.hx1 - SRC.hx0) * SC), h: Math.round(mapY(SRC.hy1) - mapY(SRC.hy0)) };   // the window opening
  const DECK = { y: Math.round(mapY(SRC.deck)) };                                      // centre line of the deck plate
  const LEV = { x: Math.round(sxv(715)), y: DECK.y - 14 }, BTN = { x: Math.round(sxv(290)), y: DECK.y + 12, r: 92 };   // the button face and the lever base sit on the plate's centre line
  const CHUTE_X = GL.x + 88, DIV_X = GL.x + 176, X0 = CHUTE_X, X1 = GL.x + GL.w - 80, HOME_X = GL.x + 402;   // home = right over the second capsule: a first blind tap on the button always grabs
  const YR = GL.y + 150, CAP_CY = GL.y + GL.h - 112, YL = CAP_CY - K.CAP_R - 20, HOLE_Y = GL.y + GL.h - 62;       // palm at rest / capsule row centre / lowest palm / round chute hole
  const LAYOUT = { GL, DECK, LEV, BTN, CHUTE_X, DIV_X, X0, X1, HOME_X, YR, YL, CAP_CY, HOLE_Y, CTA_H, SC, SRC, EXT, MT, SX, mapY, sxv,
    band: { y: Math.round(mapY(SRC.band)), x0: Math.round(sxv(90)), x1: Math.round(sxv(934)) }, sign: { y: Math.round(mapY(SRC.sign)) }, rails: [Math.round(sxv(SRC.rail0)), Math.round(sxv(SRC.rail1))] };

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ss = (e0, e1, x) => { const q = clamp((x - e0) / (e1 - e0), 0, 1); return q * q * (3 - 2 * q); };
  const CAPS0 = [[262, 12, 0.7, 0.0, 0], [402, 10, 0.9, 1.7, 1], [542, 14, 0.6, 3.1, 0], [682, 10, 0.8, 4.4, 1]].map((q) => [GL.x + q[0], q[1], q[2], q[3], q[4]]);   // x0, amplitude px, rad/s, phase, row (0 front, 1 back)
  const capX = (c, t) => c.x0 + c.A * Math.sin(c.w * t + c.ph);

  function create() {
    return { t: 0, steps: 0, wt0: 0, ev: [], end: -1, endWhy: '', lastIn: 0, firstIn: -1, winT: -9, money: 0, nGot: 0, fails: 0, tries: 0, slips: 0,
      cl: { x: HOME_X, v: 0, y: YR, open: 1 }, lev: { d: 0, grab: 0 }, cy: null, actPrev: 0, strayT: -9, hand: [LEV.x, LEV.y - 10], got: [false, false, false, false],
      caps: CAPS0.map((q, i) => { const r = q[4] ? K.CAP_R * K.CAP_BACK : K.CAP_R, by = CAP_CY - q[4] * K.BACK_DY; return { id: i, x0: q[0], A: q[1], w: q[2], ph: q[3], row: q[4], r, hd: r + 20, by, st: 'idle', t0: 0, px: q[0], py: by, off: 0, hx: 0, hy: 0 }; }) };
  }
  const spawn = (worldT) => Object.assign(create(), { wt0: worldT });
  const respawn = (S, worldT) => spawn(worldT);
  const outOfPlay = () => false;
  const timeLeft = (S) => (S.firstIn < 0 ? K.TOTAL : Math.max(0, K.TOTAL - (S.t - S.firstIn)));

  function startCycle(S) {
    const t = S.t; let tg = null, td = 1e9; for (const cp of S.caps) { if (cp.st !== 'idle') continue; const d = Math.abs(S.cl.x - capX(cp, t)); if (d < td) { td = d; tg = cp; } }
    S.cy = { ph: 'down', t0: t, xg: S.cl.x, res: '', id: -1, tgt: tg ? tg.id : -1, yl: tg ? tg.by - tg.hd : YL }; S.cl.v = 0; S.lev.grab = 0; S.tries++;
    S.lastIn = t; if (S.firstIn < 0) S.firstIn = t;
    S.ev.push({ k: 'drop', t, x: S.cl.x, y: S.cl.y });
  }
  function nextPhase(S, ph) { S.cy.ph = ph; S.cy.t0 = S.t; }

  // ---- the claw's cycle: down → close (decides the grab) → up → carry → release → return ----
  function cycle(S) {
    const t = S.t, c = S.cl, cy = S.cy, q = (d) => clamp((t - cy.t0) / d, 0, 1), e = (x) => x * x * (3 - 2 * x);
    if (cy.ph === 'down') { const k = q(K.DOWN); c.y = YR + (cy.yl - YR) * e(k); c.open = 1;
      if (k >= 1) {
        nextPhase(S, 'close');
        const best = cy.tgt >= 0 && S.caps[cy.tgt].st === 'idle' ? S.caps[cy.tgt] : null, bd = best ? Math.abs(c.x - capX(best, t)) : 1e9;
        const ok = K.GRAB_OK * (timeLeft(S) <= K.LATE_T ? K.LATE_MUL : 1), mercy = S.fails >= K.MERCY_FAILS;
        if (best && (bd <= ok || (mercy && bd <= K.GRAB_EDGE))) { cy.res = 'ok'; cy.id = best.id; }
        else if (best && bd <= K.GRAB_EDGE) { cy.res = 'slip'; cy.id = best.id; } else cy.res = 'miss';
        cy.dx = bd;
      }
    } else if (cy.ph === 'close') { const k = q(K.CLOSE); c.open = 1 - 0.85 * k;
      if (k >= 1) {
        nextPhase(S, 'up');
        if (cy.res === 'miss') { S.fails++; S.ev.push({ k: 'miss', t, x: c.x, y: c.y + 80 }); }
        else { const cp = S.caps[cy.id]; cp.st = 'held'; cp.t0 = t; cp.off = cp.px - c.x;
          if (cy.res === 'ok') S.ev.push({ k: 'grab', t, id: cp.id, x: cp.px, y: cp.py }); }
      }
    } else if (cy.ph === 'up') { const k = q(K.UP); c.y = cy.yl + (YR - cy.yl) * e(k);
      if (cy.res === 'slip' && k >= K.SLIP_AT && S.caps[cy.id].st === 'held') {
        const cp = S.caps[cy.id]; cp.st = 'back'; cp.t0 = t; cp.hx = cp.px; cp.hy = cp.py; S.fails++; S.slips++; c.open = 1;
        S.ev.push({ k: 'slip', t, id: cp.id, x: cp.px, y: cp.py }); }
      if (k >= 1) { if (cy.res === 'ok') { nextPhase(S, 'carry'); cy.xc = c.x; cy.dur = Math.max(0.35, Math.abs(c.x - CHUTE_X) / K.CARRY_V); } else { nextPhase(S, 'return'); cy.xc = c.x; } }
    } else if (cy.ph === 'carry') { const k = q(cy.dur); c.x = cy.xc + (CHUTE_X - cy.xc) * e(k); if (k >= 1) nextPhase(S, 'release');
    } else if (cy.ph === 'release') { const k = q(K.RELEASE); c.open = 0.15 + 0.85 * k;
      if (k >= 0.4 && S.caps[cy.id].st === 'held') { const cp = S.caps[cy.id]; cp.st = 'fall'; cp.t0 = t; cp.hx = cp.px; cp.hy = cp.py; }
      if (k >= 1) { nextPhase(S, 'return'); cy.xc = c.x; }
    } else if (cy.ph === 'return') { const k = q(K.RETURN); c.x = cy.xc + (HOME_X - cy.xc) * e(k); c.open = Math.max(c.open, 0.15 + 0.85 * k);
      if (k >= 1) { c.open = 1; S.cy = null; S.lastIn = t; } }
  }

  // ---- capsules: positions for every state (the scene reads px/py), landing in the chute = got ----
  function capsules(S) {
    const t = S.t, c = S.cl;
    for (const cp of S.caps) {
      if (cp.st === 'idle') { cp.px = capX(cp, t); cp.py = cp.by; }
      else if (cp.st === 'held') { const k = ss(0, 1, (t - cp.t0) / (K.CLOSE + K.UP)); cp.px = c.x + cp.off * (1 - k); cp.py = c.y + cp.hd; }
      else if (cp.st === 'back') { const k = clamp((t - cp.t0) / 0.38, 0, 1), tx = capX(cp, t);
        cp.px = cp.hx + (tx - cp.hx) * k; cp.py = cp.hy + (cp.by - cp.hy) * k * k - 34 * Math.sin(Math.PI * k) * (k > 0.7 ? 1 : 0);
        if (k >= 1) { cp.st = 'idle'; cp.px = tx; cp.py = cp.by; } }
      else if (cp.st === 'fall') { const k = clamp((t - cp.t0) / K.FALL, 0, 1); cp.px = cp.hx + (CHUTE_X - cp.hx) * k; cp.py = cp.hy + (HOLE_Y - cp.hy) * k * k;
        if (k >= 1) { cp.st = 'got'; S.got[cp.id] = true; S.nGot++; S.money = S.nGot; S.fails = 0; S.ev.push({ k: 'got', t, id: cp.id, x: CHUTE_X, y: HOLE_Y, n: S.nGot });
          if (S.nGot >= 4) { S.winT = t; S.ev.push({ k: 'win', t, x: W / 2, y: GL.y + GL.h / 2 }); } } }
    }
  }

  function step(S, inp) {
    const t = S.t + DT; S.t = t; S.steps++;
    if (S.ev.length > 220) S.ev.splice(0, S.ev.length - 220);
    const c = S.cl, lev = S.lev, playing = S.end < 0 && !(S.winT > 0);
    // demo hand glides toward the planner's target (the scene draws it)
    if (inp.hx !== undefined) { const dx = inp.hx - S.hand[0], dy = inp.hy - S.hand[1], d = Math.hypot(dx, dy), m = Math.min(d, 2600 * DT); if (d > 1e-6) { S.hand[0] += dx / d * m; S.hand[1] += dy / d * m; } }
    // ---- input: grab the lever knob and drag sideways; tap the button when the claw is free ----
    let tgt = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (playing && inp.click && inp.px !== undefined) {
      if (Math.hypot(inp.px - LEV.x, inp.py - LEV.y) < K.LEV_GRAB) lev.grab = 1;
      else if (!S.cy && Math.hypot(inp.px - BTN.x, inp.py - BTN.y) < K.BTN_R && timeLeft(S) > 0) startCycle(S);
      else if (Math.hypot(inp.px - BTN.x, inp.py - BTN.y) >= K.BTN_R) S.strayT = t;                               // a tap on the glass: the scene pulses the controls
    }
    if (!inp.press) lev.grab = 0;
    if (lev.grab && inp.press && inp.px !== undefined) tgt = clamp((inp.px - LEV.x) / K.LEV_RANGE, -1, 1);
    if (playing && inp.act && !S.actPrev && !S.cy && timeLeft(S) > 0) startCycle(S);
    S.actPrev = inp.act ? 1 : 0;
    if (S.cy || !playing) { tgt = 0; lev.grab = 0; }
    lev.d += (tgt - lev.d) * Math.min(1, DT / K.LEV_TAU);
    if (Math.abs(tgt) > 0.2 && playing) { S.lastIn = t; if (S.firstIn < 0) S.firstIn = t; }
    // ---- the claw ----
    if (S.cy) cycle(S);
    else { const a = Math.abs(lev.d), eff = a < K.LEV_DEAD ? 0 : Math.sign(lev.d) * (a - K.LEV_DEAD) / (1 - K.LEV_DEAD);
      c.v += (K.CLAW_V * eff - c.v) * Math.min(1, DT / K.CLAW_TAU); c.x += c.v * DT;
      if (c.x < X0) { c.x = X0; c.v = 0; } if (c.x > X1) { c.x = X1; c.v = 0; } }
    capsules(S);
    // ---- endcard: after the win, when the time box runs out, or when nobody plays ----
    if (S.end < 0) {
      const flying = S.cy || S.caps.some((cp) => cp.st === 'fall');
      let why = '';
      if (S.winT > 0 && t - S.winT > K.END_AFTER_WIN) why = 'win';
      else if (!(S.winT > 0) && S.firstIn >= 0 && timeLeft(S) <= 0 && (!flying || t - S.firstIn > K.TOTAL + 3)) why = 'timeout';
      else if (S.firstIn < 0 && t > K.END_NO_INPUT) why = 'passive';
      else if (S.firstIn >= 0 && !(S.winT > 0) && t - S.lastIn > K.END_IDLE) why = 'idle';
      if (why) { S.end = t; S.endWhy = why; if (why === 'timeout') S.ev.push({ k: 'timeout', t, x: W / 2, y: GL.y + 200 }); S.ev.push({ k: 'end', t, x: W / 2, y: H / 2 }); }
    }
    return S;
  }

  // ---- attract demo: a planner that plays like a good player, expressed as lever drags and button taps ----
  const scriptInput = (t, S) => {
    const c = S.cl, inp = { press: 0, click: 0, px: LEV.x, py: LEV.y, hx: LEV.x, hy: LEV.y - 10 };
    if (t < 0.8 || S.end >= 0 || S.winT > 0) return inp;                       // a beat of stillness: the hand appears first
    if (S.cy) { inp.hx = BTN.x; inp.hy = BTN.y - 6; return inp; }             // the claw works: the hand waits on the button
    let cap = null, bd = 1e9; for (const cp of S.caps) { if (cp.st !== 'idle') continue; const d = Math.abs(cp.px - c.x); if (d < bd) { bd = d; cap = cp; } }
    if (S.tries === 0 && S.caps[2].st === 'idle') cap = S.caps[2];                  // the first grab goes a little to the right: the hand visibly drags the lever
    if (!cap) return inp;
    const sgn = cap.id === 3 ? -1 : 1, target = capX(cap, t + 0.75) + (S.tries === 1 ? 52 * sgn : 0), e = target - c.x;   // the 2nd try overshoots by 52 px: a near-miss for the demo
    if (Math.abs(e) > 6) {                                                      // drag the lever toward the target (slower as it closes in)
      const v = clamp(e * 6, -K.CLAW_V, K.CLAW_V) / K.CLAW_V, raw = Math.sign(v) * (K.LEV_DEAD + Math.abs(v) * (1 - K.LEV_DEAD));
      inp.press = 1; inp.px = LEV.x + raw * K.LEV_RANGE; inp.hx = inp.px; inp.hy = LEV.y; if (!S.lev.grab) inp.click = 1;
    } else {                                                                    // aligned: the hand goes to the button and taps once the claw is still
      inp.hx = BTN.x; inp.hy = BTN.y - 6;
      if (Math.abs(c.v) < 25 && Math.hypot(S.hand[0] - inp.hx, S.hand[1] - inp.hy) < 30) { inp.press = 1; inp.click = 1; inp.px = BTN.x; inp.py = BTN.y; }
    }
    return inp;
  };
  let cache = null;
  function at(t) {
    const loop = Math.floor(t / L), q = t - loop * L, n = Math.round(q / DT);
    if (!cache || cache.loop !== loop || cache.S.steps > n) { const S0 = Object.assign(create(), { wt0: loop * L }); cache = { loop, S: S0 }; }
    const S = cache.S; while (S.steps < n) step(S, scriptInput(S.t, S));
    return Object.assign({}, S, { loop, q, demo: true, inp: scriptInput(S.t, S) });
  }
  // the demo must hit every beat of the ad inside its loop
  const demoCheck = (S) => {
    const f = [], first = S.ev.find((e) => e.k === 'got'), win = S.ev.find((e) => e.k === 'win');
    if (!first || first.t > 6) f.push('first capsule late: ' + (first ? first.t.toFixed(1) : 'never'));
    if (!S.ev.some((e) => e.k === 'slip')) f.push('no near-miss (slip) in the demo');
    if (!win || win.t > 21) f.push('win late: ' + (win ? win.t.toFixed(1) : 'never'));
    if (S.end < 0 || S.end > 23) f.push('endcard late: ' + S.end.toFixed(1));
    return f;
  };

  root.SIM = { DT, L, K, VIEW, WORLD, HINT, LAYOUT, PRODUCTS, create, spawn, respawn, outOfPlay, step, at, scriptInput, demoCheck, capX, timeLeft };
  if (typeof module !== 'undefined') module.exports = root.SIM;
})(typeof window !== 'undefined' ? window : globalThis);
