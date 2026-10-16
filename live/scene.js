// live/scene.js — CLAW MACHINE (graybox: shapes and labels only; art lands in phase 2). Pure function of t and the sim state.
// Layers: backdrop → machine body, glass, capsules, claw, deck (comp pass) → grade → HUD (slots, timer, callouts, hand, CTA, endcard).
(function () {
  const S = (window.SCENE = {}), L = LIB, M = L.M, W = SIM.VIEW.W, H = SIM.VIEW.H, LY = SIM.LAYOUT, K = SIM.K, GL = LY.GL, SS = L.SS;
  S.REPEAT = [];
  S.programs = () => { L.init(W, H); };
  const FONT = '"Hrumka", "Arial Black", "Arial Rounded MT Bold", "Segoe UI Black", sans-serif';   // Rubik Black (OFL), Cyrillic subset embedded in the page
  const ease = (x) => 1 - (1 - x) * (1 - x), clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const GREEN = [0.059, 0.290, 0.208], DEEP = [0.031, 0.196, 0.122], ORANGE = [1.0, 0.478, 0.102], ORANGE_D = [0.85, 0.34, 0.04], RED = [0.91, 0.196, 0.169], CREAM = [1.0, 0.957, 0.886];
  const NAMES = ['Бургер', 'Фри', 'Кола', 'Наггеты'], PCOL = [[0.86, 0.52, 0.18], [0.96, 0.78, 0.18], [0.42, 0.20, 0.14], [0.82, 0.52, 0.16]];
  S.PROMO = 'ХРУМ299';
  S.hit = [];                                                                          // tappable HUD rects (index.html: CTA → store, replay, copy)
  const disc = (x, y, r, c0, c1 = c0, a = 1) => L.rrect(x - r, y - r, 2 * r, 2 * r, r, c0, c1, a);
  const FOOD = ['burger', 'fries', 'cola', 'nuggets'], FMAX = [88, 94, 106, 84];       // sprite max side inside a capsule
  const SL = 104, sy0 = LY.band.y, ox0 = (W - (4 * SL + 3 * 20 + 36 + 210)) / 2, slotXY = (i) => [ox0 + SL / 2 + i * (SL + 20), sy0];
  const pill = { x: ox0 + 4 * SL + 3 * 20 + 36, y: sy0 - 45, w: 210, h: 90 };
  const food = (n, x, y, maxd, o = {}) => { const tx = G.tex(n), k = maxd / Math.max(tx.w, tx.h); return L.sprite(n, x - tx.w * k / 2, y - tx.h * k / 2, Object.assign({ w: tx.w * k, h: tx.h * k }, o)); };
  const DIM = { alpha: 0.55, tint: [0.10, 0.22, 0.16, 0.85] };

  S.render = (t) => {
    const ST = S.state || SIM.at(t), GT = ST.t, rnd = L.rnd, c = ST.cl, left = SIM.timeLeft(ST), busy = !!ST.cy, over = ST.end >= 0;
    const label = (...a) => (over ? 0 : L.label(...a));                             // the endcard covers the machine: its labels are not drawn
    let tr = 0; for (const e of ST.ev) { const a = GT - e.t; if (a < 0) continue; if (e.k === 'grab' && a < 0.25) tr = Math.max(tr, 1 - a / 0.25); if (e.k === 'got' && a < 0.3) tr = Math.max(tr, 0.6 * (1 - a / 0.3)); }
    const shx = 4 * tr * Math.sin(GT * 140), shy = 4 * tr * Math.sin(GT * 170 + 1);

    // ===== backdrop: deep green gradient with orange bokeh =====
    L.beginBG([0.03, 0.2, 0.12, 1]);
    L.rrect(0, 0, W, H, 0, GREEN, DEEP);
    L.glow(W / 2, H * 0.5, 1000, [0.16, 0.55, 0.38], 0.32, 1.8);
    for (let i = 0; i < 12; i++) L.glow(W * rnd(i, 1), H * rnd(i, 2), 110 + 150 * rnd(i, 3), i % 3 ? ORANGE : CREAM, 0.20 + 0.07 * Math.sin(t * 0.6 + i), 2.2);
    L.beginComp();

    // ===== the window: back wall, floor pile, chute, capsules, claw, reflections =====
    L.sprite('glass_back', GL.x - 10 + shx, GL.y - 10 + shy, { w: GL.w + 20, h: GL.h + 20 });
    L.glow(GL.x + GL.w / 2 + shx, GL.y + 20 + shy, 420, [1, 0.9, 0.7], 0.18, 2.0);
    // the pile: big balls in 3 back rows behind the capsules and one front row that nests their bottoms
    const palette = [ORANGE, RED, CREAM, [0.14, 0.52, 0.36], [0.98, 0.35, 0.2], [0.10, 0.40, 0.28], [1, 0.62, 0.2]], floorY = GL.y + GL.h - 30, bx0 = LY.DIV_X + 18, bx1 = GL.x + GL.w - 6;
    const ball = (x, y, r, i) => { const col = palette[i % palette.length]; disc(x + shx, y + shy, r, L.lerpP(col, [1, 1, 1], 0.14), L.lerpP(col, [0, 0, 0], 0.35)); L.glow(x - r * 0.35 + shx, y - r * 0.4 + shy, r * 0.45, [1, 1, 1], 0.5, 2.4); };
    for (let row = 3; row >= 1; row--) for (let i = 0, x = bx0 + 18 + 26 * (row % 2); x < bx1; i++) { const r = 32 + 10 * rnd(i + row * 31, 3); ball(x, floorY - 26 - row * 46 - 8 * rnd(i, row), r, i + row); x += r * 1.5; }
    // the chute: a chrome-and-orange bezel set into the shelf with a lit opening, fenced off by a glass pane so nothing rolls in by itself
    { const cx = LY.CHUTE_X + shx, cy = LY.HOLE_Y + shy, cT = G.tex('chute'), sw = 168, sh = sw * cT.h / cT.w, pulse = 0.5 + 0.5 * Math.sin(t * 3);
      L.shadow(cx, cy + sh * 0.40, sw * 0.52, sh * 0.2, 0.35);
      L.rrect(cx - sw * 0.37, cy - sh * 0.22 - 9, sw * 0.74, sh * 0.44 + 9, sh * 0.22, [0.30, 0.12, 0.03], [0.05, 0.02, 0.0]);                      // the shaft
      L.glow(cx, cy + sh * 0.1, sw * 0.42, [1, 0.6, 0.15], 0.30 + 0.12 * pulse, 2.0);                                                      // warm light from below
      L.sprite('chute', cx - sw / 2, cy - sh / 2, { w: sw, h: sh });
      const dx = LY.DIV_X + shx, dy0 = floorY - 250 + shy, dh = 246;
      L.rrect(dx - 10, dy0, 20, dh, 8, [0.85, 0.95, 1.0], [0.62, 0.8, 0.95], 0.26); L.rrect(dx - 10, dy0, 4, dh, 2, [1, 1, 1], [1, 1, 1], 0.8); L.rrect(dx + 5, dy0 + 20, 3, dh - 50, 1.5, [1, 1, 1], [1, 1, 1], 0.35);
      L.solid(dx - 3, dy0 + 40, 6, 90, [1, 1, 1], 0.5, 3, 45, 0.18);
      L.rrect(dx - 16, dy0 - 6, 32, 14, 7, [0.95, 0.96, 0.98], [0.5, 0.52, 0.58]); L.rrect(dx - 18, dy0 + dh - 10, 36, 16, 8, [0.9, 0.92, 0.95], [0.45, 0.47, 0.52]); }
    // capsules: glass sphere in code around the food sprite (the food bobs and tilts inside it); front row sorted after the back row
    const drawCap = (cp, swayFn) => { const R = cp.r, id = cp.id, fall = cp.st === 'fall' ? clamp((GT - cp.t0) / K.FALL, 0, 1) : 0, sc = 1 - 0.3 * fall * fall, pp = swayFn ? swayFn(cp.px + shx, cp.py + shy) : [cp.px + shx, cp.py + shy], x = pp[0], y = pp[1], bob = 3 * Math.sin(t * 1.9 + id * 1.7), tilt = 0.07 * Math.sin(t * 1.3 + id), al = 1 - SS(0.8, 1, fall), Rs = R * sc;
      if (cp.st === 'idle') L.shadow(x, y + R * 0.92, R * 0.95, R * 0.2, 0.30);
      disc(x, y, Rs * 1.03, [0.12, 0.06, 0.02], [0.2, 0.1, 0.03], 0.32 * al); disc(x, y, Rs, [0.97, 0.99, 1.0], [0.9, 0.93, 0.98], 0.66 * al); L.glow(x, y + Rs * 0.62, Rs * 0.78, [1, 0.62, 0.25], 0.22 * al, 2.0);   // milky glass, warm at the bottom so the food reads on the busy pile
      const tx = G.tex(FOOD[id]), k = FMAX[id] * R / 76 * sc / Math.max(tx.w, tx.h), fw = tx.w * k, fh = tx.h * k;
      L.sprite(FOOD[id], 0, 0, { m: M.of(M.t(x, y + 4 + bob), M.r(tilt)), w: fw, h: fh, pivot: [fw / 2, fh / 2], u: { alpha: al } });
      disc(x, y, Rs, [1, 1, 1], [0.7, 0.85, 1.0], 0.07 * al); L.ring(x, y, Rs, Rs, [1, 1, 1], 0.55 * al, 0.05); L.ring(x, y, Rs * 0.93, Rs * 0.93, [0.7, 0.9, 1.0], 0.22 * al, 0.08);
      L.glow(x - Rs * 0.40, y - Rs * 0.46, Rs * 0.34, [1, 1, 1], 0.75 * al, 2.2); L.glow(x + Rs * 0.5, y + Rs * 0.58, Rs * 0.30, [1, 0.85, 0.6], 0.28 * al, 2.2); };
    const idleCaps = ST.caps.filter((cp) => cp.st === 'idle').sort((a, b) => b.row - a.row || a.by - b.by);
    for (const cp of idleCaps) drawCap(cp);
    let aim = null; if (!busy && !over && ST.winT < 0) { let bd = 1e9; for (const cp of idleCaps) { const d = Math.abs(cp.px - c.x); if (d < bd) { bd = d; aim = cp; } }
      if (aim) { aim.dx = bd; const good = bd <= K.GRAB_OK * (left <= K.LATE_T ? K.LATE_MUL : 1) || (ST.fails >= K.MERCY_FAILS && bd <= K.GRAB_EDGE), near = bd <= K.GRAB_EDGE, col = good ? [0.45, 1, 0.55] : near ? [1, 0.78, 0.22] : null;
        if (col) L.ring(aim.px + shx, aim.py + shy, aim.r * 1.12, aim.r * 1.12, col, 0.55 + 0.25 * Math.sin(t * 8), 0.06); } }
    for (let i = 0, x = bx0 + 10; x < bx1; i++) { const r = 34 + 10 * rnd(i, 11); ball(x, floorY + 6 - 8 * rnd(i, 12), r, i + 2); x += r * 1.45; }
    // claw: rail, cable, centre finger (behind a held capsule), head with two pivoting side fingers; the whole claw swings from the rail with its speed
    const palmY = c.y, ang = 0.05 + 0.55 * c.open, hx = c.x + shx, hy = palmY + shy, railY = GL.y + 30 + shy;
    const swing = clamp(-c.v / K.CLAW_V * 0.11, -0.12, 0.12) + 0.012 * Math.sin(t * 2.1) + (ST.cy && ST.cy.ph === 'close' ? 0.02 * Math.sin((GT - ST.cy.t0) * 60) : 0);
    const cs = Math.cos(swing), sn = Math.sin(swing), sw = (x, y) => [hx + (x - hx) * cs - (y - railY) * sn, railY + (x - hx) * sn + (y - railY) * cs];   // a point hanging below the rail point, rotated by the swing
    L.rrect(GL.x + 16 + shx, GL.y + 6 + shy, GL.w - 32, 24, 12, [0.86, 0.88, 0.90], [0.46, 0.48, 0.52]);
    const hT = G.tex('claw_head'), hw = 150, hh = hw * hT.h / hT.w, headTop = hy - hh + 22 - railY;                                   // head top relative to the rail point
    L.solid(hx - 3, railY, 6, headTop + hh * 0.06, [0.78, 0.80, 0.84], swing, 3, 0);
    const fT = G.tex('claw_finger'), fh = 140, fw = fh * fT.w / fT.h, knobY = headTop + 0.79 * hh, pv = [0.575 * fw, 0.06 * fh];
    L.sprite('claw_finger', 0, 0, { m: M.of(M.t(hx, railY), M.r(swing), M.t(0, knobY + 4), M.s(0.6, 0.92)), w: fw, h: fh, pivot: pv, u: { tint: [0.55, 0.58, 0.64, 0.25] } });
    for (const cp of ST.caps) if (cp.st === 'held' || cp.st === 'back' || cp.st === 'fall') drawCap(cp, cp.st === 'held' ? sw : null);
    for (const sg of [-1, 1]) L.sprite('claw_finger', 0, 0, { m: M.of(M.t(hx, railY), M.r(swing), M.t(sg * hw * 0.43, knobY), M.r(-sg * ang), M.s(sg, 1)), w: fw, h: fh, pivot: pv });
    L.sprite('claw_head', 0, 0, { m: M.of(M.t(hx, railY), M.r(swing), M.t(0, headTop)), w: hw, h: hh, pivot: [hw / 2, 0] });
    // juice in the window: sparkles on a grab, dust on a slip or miss, a light column where a capsule drops into the chute
    for (const e of ST.ev) { const a = GT - e.t; if (a < 0 || a > 1.2) continue; const ex = e.x + shx, ey = e.y + shy;
      if (e.k === 'grab' && a < 0.7) { const q = a / 0.7; L.ring(ex, ey, 70 + 150 * ease(q), 70 + 150 * ease(q), CREAM, 0.6 * (1 - q), 0.05);
        for (let j = 0; j < 12; j++) { const an = j / 12 * 6.283 + rnd(j, 1), d = (60 + 150 * ease(q)) * (0.7 + 0.5 * rnd(j, 2)); L.star(ex + Math.cos(an) * d, ey + Math.sin(an) * d - 30 * q, 26 * (1 - q) + 6, [1, 0.93, 0.6], 1 - q); } }
      if ((e.k === 'slip' || e.k === 'miss') && a < 0.6) { const q = a / 0.6; for (let j = 0; j < 6; j++) { const an = j / 6 * 6.283 + rnd(j, 3), d = (30 + 90 * ease(q)) * (0.7 + 0.5 * rnd(j, 4)); L.puff(ex + Math.cos(an) * d, ey + Math.sin(an) * d * 0.6, (22 + 26 * q), e.k === 'slip' ? [1, 0.93, 0.8] : [0.85, 0.8, 0.7], 0.55 * (1 - q), j + (e.k === 'slip' ? 3 : 9)); } }
      if (e.k === 'got' && a < 1.0) { const q = a / 1.0, pil = (1 - SS(0.2, 1, q)) * SS(0, 0.06, a);
        for (let j = 0; j < 7; j++) L.glow(ex, ey - j * 46 * (0.5 + q), (80 - j * 7), [1, 0.86, 0.45], 0.5 * pil * (1 - j / 8), 2.2);
        L.ring(ex, ey, 40 + 130 * ease(q), 30 + 90 * ease(q), CREAM, 0.7 * (1 - q), 0.06);
        for (let j = 0; j < 10; j++) { const an = -Math.PI / 2 + (rnd(j, 5) - 0.5) * 2.4, d = (80 + 160 * rnd(j, 6)) * ease(Math.min(1, a / 0.6)); L.star(ex + Math.cos(an) * d, ey + Math.sin(an) * d + 140 * q * q, 24 * (1 - q) + 6, [1, 0.88, 0.5], 1 - q); } }
      if (e.k === 'drop' && a < 0.4) { const q = a / 0.4; L.ring(LY.BTN.x + shx, LY.BTN.y + shy, LY.BTN.r + 10 + 90 * ease(q), LY.BTN.r + 10 + 90 * ease(q), [1, 0.85, 0.5], 0.6 * (1 - q), 0.06); } }
    // reflections on the glass, then the shell on top (3-slice: the window band stretches on tall phones)
    for (let i = 0; i < 2; i++) L.solid(GL.x + 150 + i * 300 + shx, GL.y + shy, 80, GL.h, [1, 1, 1], 0.28, 0, 0, 0.07);
    L.glow(GL.x + 120 + shx, GL.y + 140 + shy, 230, [1, 1, 1], 0.10, 2.0);
    const slice = (y0, y1) => { const dy0 = LY.mapY(y0), dy1 = LY.mapY(y1); L.sprite('machine_shell', LY.SX + shx, dy0 + shy, { w: 1024 * LY.SC, h: dy1 - dy0, src: [0, y0 / 1536, 1, y1 / 1536] }); };
    slice(0, LY.SRC.bandA + 1); slice(LY.SRC.bandA, LY.SRC.bandB + 1); slice(LY.SRC.bandB, 1536);
    // chase lights along both rails (code: they never stretch with the shell)
    { const nb = Math.round(GL.h / 92), y0 = GL.y + 30, y1 = GL.y + GL.h - 30;
      for (let j = 0; j < nb; j++) { const ly = y0 + (y1 - y0) * j / (nb - 1), ph = ST.winT > 0 ? Math.sin(t * 14 + j) : Math.sin(t * (ST.firstIn >= 0 && left <= 10 ? 9 : 4) - j * 0.7), a = 0.55 + 0.45 * ph;
        for (const lx of LY.rails) { L.glow(lx + shx, ly + shy, 26, CREAM, 0.34 * a, 2.4); disc(lx + shx, ly + shy, 12, [1, 0.98, 0.9], [1, 0.82, 0.55], 0.55 + 0.45 * a); } } }
    // deck: round lever base with an arrow on each side, the knob tilts around its base
    const lvx = LY.LEV.x + shx, lvy = LY.LEV.y + 20 + shy, dirL = clamp(-ST.lev.d, 0, 1), dirR = clamp(ST.lev.d, 0, 1);
    disc(lvx, lvy + 8, 56, [0.01, 0.04, 0.03], [0, 0, 0], 0.85); disc(lvx, lvy, 50, [0.88, 0.90, 0.93], [0.38, 0.40, 0.45]); disc(lvx, lvy + 2, 39, [0.03, 0.09, 0.06], [0.0, 0.03, 0.02]); L.glow(lvx - 18, lvy - 22, 16, [1, 1, 1], 0.3, 2.4);
    for (const sg of [-1, 1]) { const tx = lvx + sg * 104, ty = lvy + 6, act = sg < 0 ? dirL : dirR, col = L.lerpP([0.95, 0.88, 0.7], [1, 0.9, 0.5], act), al = 0.55 + 0.45 * act;
      for (const bs of [-1, 1]) { if (sg < 0) L.solid(tx, ty - 6, 40, 13, col, bs * 0.8, 0, 6.5, al); else L.solid(tx - 40, ty - 6, 40, 13, col, -bs * 0.8, 40, 6.5, al); } }
    const kT = G.tex('lever_knob'), knH = 124, knW = knH * kT.w / kT.h, lang = Math.atan2(ST.lev.d * K.LEV_RANGE, 125);
    L.shadow(lvx + 30 * Math.sin(lang), lvy + 14, 40, 10, 0.3);
    L.sprite('lever_knob', 0, 0, { m: M.of(M.t(lvx, lvy), M.r(lang)), w: knW, h: knH, pivot: [0.495 * knW, 0.96 * knH] });
    const bT = G.tex('btn'), bw0 = 2 * (LY.BTN.r + 18) * (busy ? 0.95 : 1), bh0 = bw0 * bT.h / bT.w, bp = busy ? 9 : 0;
    L.shadow(LY.BTN.x + shx, LY.BTN.y + 70 + shy, bw0 * 0.5, bh0 * 0.12, 0.35);
    L.sprite('btn', LY.BTN.x - bw0 / 2 + shx, LY.BTN.y - bh0 / 2 + bp + shy, { w: bw0, h: bh0, u: busy ? { tint: [0.35, 0.2, 0.1, 0.2] } : {} });
    L.uiBox('btn', LY.BTN.x - LY.BTN.r, LY.BTN.y - LY.BTN.r, 2 * LY.BTN.r, 2 * LY.BTN.r, 6);
    { const sa = GT - ST.strayT; if (sa >= 0 && sa < 0.7 && !over) { const q = sa / 0.7, col = [1, 0.85, 0.5];                                // a tap on the glass: show where the controls are
      L.ring(LY.BTN.x + shx, LY.BTN.y + shy, LY.BTN.r + 14 + 34 * q, LY.BTN.r + 14 + 34 * q, col, 0.75 * (1 - q), 0.07); L.ring(lvx, lvy, 62 + 40 * q, 62 + 40 * q, col, 0.75 * (1 - q), 0.07); } }
    L.finish(t, { bloom: [0.14, 0.12], vignette: 0.9, warm: 0.4, roll: 0.3 });

    // ===================== HUD (screen space) =====================
    S.hit = [];
    { const urgent = ST.firstIn >= 0 && left <= 5 && left > 0 && !over; if (urgent) L.solid(0, 0, W, H, [0.9, 0.1, 0.05], 0, 0, 0, 0.04 + 0.06 * Math.max(0, Math.sin(t * 6.28)));
      for (const e of ST.ev) { const a = GT - e.t; if (a < 0 || a > 0.6) continue;
        if (e.k === 'win') L.glow(W / 2, GL.y + GL.h / 2, 900, [1, 0.97, 0.85], 0.3 * (1 - a / 0.6), 2);
        if (e.k === 'timeout') L.solid(0, 0, W, H, [0.9, 0.1, 0.05], 0, 0, 0, 0.28 * (1 - a / 0.6)); } }
    // the brand sign (top), 4 goal slots, the timer
    if (!over) {
    { const sw = LY.band.x1 - LY.band.x0 - 40, sc = Math.min(1, (sw - 60) / L.labelW('signm', 'ХРУМКА', { size: 56, font: FONT }));
      L.uiBox('sign', LY.band.x0 + 20, LY.sign.y - 42, sw, 84, 6); L.label('sign', 'ХРУМКА', W / 2, LY.sign.y, { size: Math.round(56 * sc), font: FONT, col: '#ffffff', out: '#7a2a00', al: 0.5 }); }
    const gotEv = {}; for (const e of ST.ev) if (e.k === 'got') gotEv[e.id] = e;
    for (let i = 0; i < 4; i++) { const [sx, sy] = slotXY(i), ge = gotEv[i], fly = ge ? clamp((GT - ge.t) / 0.5, 0, 1) : 0, filled = ge && fly >= 1;
      disc(sx, sy, SL / 2, filled ? [1, 0.9, 0.62] : [0.03, 0.14, 0.09], filled ? [1, 0.55, 0.15] : [0.0, 0.07, 0.04], 0.95); L.ring(sx, sy, SL / 2 + 2, SL / 2 + 2, filled ? CREAM : [0.5, 0.7, 0.58], filled ? 0.85 : 0.4, 0.06);
      if (filled) { const pop = 1 + 0.25 * Math.sin(Math.PI * clamp((GT - ge.t - 0.5) / 0.3, 0, 1)); food(FOOD[i], sx, sy, 74 * pop); L.glow(sx, sy, 90 * pop, CREAM, 0.35 * (1 - clamp((GT - ge.t - 0.5) / 0.5, 0, 1)), 2.2); }
      else food(FOOD[i], sx, sy, 70, { u: DIM });
      L.uiBox('slot' + i, sx - SL / 2, sy - SL / 2, SL, SL, 2);
      if (ge && fly < 1) { const u = ease(fly), fx = ge.x + (sx - ge.x) * u, fy = ge.y + (sy - ge.y) * u - 140 * Math.sin(Math.PI * u); food(FOOD[i], fx, fy, 120 - 46 * u); } }
    { const urgent = left <= 10 && ST.firstIn >= 0 && !over, pu = urgent ? 1 + 0.05 * Math.sin(t * 10) : 1, txt = '00:' + String(Math.ceil(left)).padStart(2, '0'), blink = ST.firstIn < 0 && !over && Math.sin(t * 5) > 0.2;
      L.rrect(pill.x, pill.y, pill.w, pill.h, 45, urgent ? [0.95, 0.26, 0.18] : [0.04, 0.12, 0.08], urgent ? [0.70, 0.10, 0.08] : [0.02, 0.07, 0.05], 0.92); L.ring(pill.x + pill.w / 2, pill.y + pill.h / 2, pill.w / 2, pill.h / 2, CREAM, 0.25, 0.04);
      L.uiBox('timer', pill.x, pill.y, pill.w, pill.h, 4);
      L.label('timer', txt, pill.x + pill.w / 2, pill.y + pill.h / 2, { size: Math.round(52 * pu), font: FONT, col: blink ? '#ffe9a8' : '#ffffff', out: '#0c1a10', al: 0.5 }); }
    }
    // headline in the zone above the machine
    if (!over) { const zone = LY.MT, tease = zone > 520, z = tease ? 1.1 : clamp(zone / 380, 0.8, 1.4), l1 = 'Достань весь обед', l2 = 'за 30 секунд!', sz = Math.round(76 * z), w1 = L.labelW('hl1', l1, { size: sz, font: FONT }), w2 = L.labelW('hl2', l2, { size: sz, font: FONT }), sc = Math.min(1, 940 / Math.max(w1, w2)), s2 = Math.round(sz * sc), bob = 1 + 0.015 * Math.sin(t * 3);
      const cy = tease ? 120 + s2 * 0.6 : LY.MT * 0.5 + 6; L.uiBox('hl', W / 2 - 480, cy - s2 * 1.2, 960, s2 * 2.4, 6);
      L.label('hl1', l1, W / 2, cy - s2 * 0.55, { size: Math.round(s2 * bob), font: FONT, col: '#ffffff', out: '#7a2a00', al: 0.5 }); L.label('hl2', l2, W / 2, cy + s2 * 0.55, { size: Math.round(s2 * 1.12 * bob), font: FONT, col: '#ffd24a', out: '#7a2a00', al: 0.5 }); }
    // tall phones: the combo and its price fill the zone above the machine, so the goal is visible from the first frame
    if (!over && LY.MT > 520) { const tT = G.tex('combo_tray'), tw = 440, th = tw * tT.h / tT.w, cy = LY.MT - 34 - th * 0.5, bob = 4 * Math.sin(t * 2);
      L.glow(W / 2, cy, 330, [1, 0.7, 0.3], 0.2, 2.2); L.sprite('combo_tray', W / 2 - tw / 2, cy - th / 2 + bob, { w: tw, h: th });
      disc(W / 2 + 190, cy - th * 0.30 + bob, 58, RED, [0.7, 0.1, 0.08]); L.ring(W / 2 + 190, cy - th * 0.30 + bob, 60, 60, CREAM, 0.8, 0.07); L.uiBox('tprice', W / 2 + 132, cy - th * 0.30 + bob - 58, 116, 116, 6);
      L.label('tprice', '299 ₽', W / 2 + 190, cy - th * 0.30 + bob, { size: 36, font: FONT, col: '#ffffff', out: '#5a0a05', al: 0.5 }); }
    // floating callouts from events
    for (const e of ST.ev) { const a = GT - e.t; if (a < 0 || over) continue;
      const pop = (slot, txt, x, y, life, size, col, out) => { if (a > life) return; const q = a / life, s = size * (a < 0.12 ? 0.6 + 0.4 * a / 0.12 : 1);
        L.label(slot, txt, x, y - 90 * ease(q), { size: Math.round(s), font: FONT, col, out, al: 0.5, a: 1 - SS(0.7, 1, q) }); };
      if (e.k === 'slip') pop('slip', 'Почти!', W / 2, GL.y + GL.h * 0.45, 1.1, 96, '#fff27a', '#7a3a00');
      if (e.k === 'miss') pop('miss', 'Мимо!', W / 2, GL.y + GL.h * 0.45, 1.0, 88, '#ffffff', '#8a1208');
      if (e.k === 'got' && (e.n || 0) < 4) pop('got' + (e.n || 0), NAMES[e.id] + ' +1', W / 2, GL.y + GL.h * 0.5, 1.2, 80, '#fff27a', '#5a3a00');
      if (e.k === 'win') pop('win', 'КОМБО!', W / 2, GL.y + GL.h * 0.38, 1.5, 120, '#fff27a', '#7a1a00');
      if (e.k === 'timeout') pop('tmo', 'Время!', W / 2, GL.y + GL.h * 0.4, 1.4, 110, '#ffffff', '#8a1208'); }
    // tutorial: the hand shows lever → button (demo: the scripted finger; play: before the first touch or after 2.5 s idle)
    const idle = !over && ST.winT < 0 && !ST.demo && (ST.firstIn < 0 || GT - ST.lastIn > 2.5);
    if (!over && ST.winT < 0 && (ST.demo || idle)) {
      let hx, hy, down;
      if (ST.demo) { hx = ST.hand[0]; hy = ST.hand[1]; down = ST.inp && ST.inp.press; }
      else { const q = (t * 0.45) % 1; if (q < 0.55) { const u = Math.sin(q / 0.55 * Math.PI * 2) * 0.7; hx = LY.LEV.x + u * K.LEV_RANGE; hy = LY.LEV.y - 10; down = true; } else { hx = LY.BTN.x; hy = LY.BTN.y - 6 + 10 * Math.sin(t * 14); down = q > 0.7 && q < 0.9; } }
      if (down) L.glow(hx, hy, 70, [1, 1, 1], 0.35, 2.5);
      L.ring(hx, hy, 46, 46, [1, 1, 1], down ? 0.7 : 0.25, 0.1);
      if (ST.firstIn < 0 || GT < 4) { const atLever = Math.hypot(hx - LY.LEV.x, hy - LY.LEV.y) < 190, cx0 = atLever ? LY.LEV.x : LY.BTN.x, cy0 = atLever ? LY.LEV.y - 205 : LY.BTN.y - 150, txt = atLever ? 'Тяни' : 'Жми', cw = L.labelW('hint', txt, { size: 44, font: FONT }) + 60;
        L.rrect(cx0 - cw / 2, cy0 - 36, cw, 72, 36, [1, 1, 1], [0.92, 0.94, 0.9], 0.95); L.uiBox('hint', cx0 - cw / 2, cy0 - 36, cw, 72, 4); L.label('hint', txt, cx0, cy0, { size: 44, font: FONT, col: '#0f4a35', out: '#ffffff', al: 0.5 }); }
      { const hT = G.tex('hand'), hh = 230 * (down ? 0.94 : 1), hw = hh * hT.w / hT.h; L.shadow(hx + 16, hy + hh * 0.5, hw * 0.4, 16, 0.25);
        L.sprite('hand', hx - 0.277 * hw, hy - 6 + (down ? 10 : 0), { w: hw, h: hh }); }
    }
    // (no persistent CTA bar: K.CTA_BAR is off; the endcard is the CTA)
    // ===== endcard (by endWhy and promo variant): an opaque card with its own backdrop, the machine is hidden =====
    if (over) { const zf = clamp((H - 170) / 1650, 1, 1.3), Y = (y) => y * zf, a = GT - ST.end, k = SS(0, 0.45, a), pop = (d) => { const q = clamp((a - d) / 0.35, 0, 1); return q < 1 ? 1.12 * ease(q) - 0.12 * q * q : 1; };
      const mode = ST.promoMode || K.PROMO_MODE, win = ST.endWhy === 'win', lost = ST.endWhy === 'timeout', locked = !win && mode === 'win', code = !locked;       // the code is for a win; only the 'always' variant gives it to everyone
      L.rrect(0, 0, W, H, 0, [0.07, 0.34, 0.24], [0.02, 0.15, 0.10], k);
      for (let i = 0; i < 12; i++) L.glow(W * rnd(i + 40, 1), H * rnd(i + 40, 2), 100 + 140 * rnd(i + 40, 3), i % 3 ? ORANGE : CREAM, 0.20 * k, 2.2);
      for (let j = 0; j < 12; j++) L.solid(W / 2 - 24, Y(640) - 900, 48, 900, [1, 0.86, 0.55], (j / 12) * 6.283 + t * 0.06, 24, 900, 0.07 * k);      // slow sunburst behind the combo
      L.glow(W / 2, Y(640), 620, [1, 0.7, 0.3], 0.25 * k, 2.2);
      { const bw = 460, by = Y(92); L.rrect(W / 2 - bw / 2, by - 46, bw, 92, 46, [1.0, 0.62, 0.22], ORANGE_D, k); L.uiBox('brand', W / 2 - bw / 2, by - 46, bw, 92, 6); L.label('brand', 'ХРУМКА', W / 2, by, { size: 56, font: FONT, col: '#ffffff', out: '#7a2a00', al: 0.5, a: k }); }
      const head = win ? 'Комбо собрано!' : locked ? (ST.endWhy === 'passive' ? 'Собери комбо — получи промокод!' : 'Не успел — попробуй ещё!') : lost ? 'Почти! Промокод всё равно твой' : 'Комбо за 299 ₽', s1 = pop(0.2);
      if (s1 > 0.01) { const w0 = L.labelW('headm', head, { size: 64, font: FONT }), hs = Math.round(64 * Math.min(1, 860 / w0) * s1);
        L.rrect(W / 2 - 470, Y(235) - 66, 940, 132, 66, CREAM, [0.98, 0.88, 0.7], 0.95 * k); L.uiBox('head', W / 2 - 470, Y(235) - 66, 940, 132, 6);
        L.label('head', head, W / 2, Y(235), { size: hs, font: FONT, col: '#0f4a35', out: '#fff4e2', al: 0.5 }); }
      const st = pop(0.35); if (st > 0.01) { const cx = W / 2, cy = Y(650), tT = G.tex('combo_tray'), tw = 960 * st, th = tw * tT.h / tT.w;
        L.sprite('combo_tray', cx - tw / 2, cy - th / 2 + 10 * Math.sin(t * 2), { w: tw, h: th, u: locked ? { alpha: 0.92, tint: [0.45, 0.47, 0.46, 0.35] } : {} });
        const bc = locked ? [0.55, 0.55, 0.55] : RED, bd = locked ? [0.32, 0.32, 0.32] : [0.7, 0.1, 0.08];
        disc(cx + 405, cy - 150, 92 * st, bc, bd); L.ring(cx + 405, cy - 150, 94 * st, 94 * st, CREAM, 0.8, 0.07); L.uiBox('price', cx + 313, cy - 242, 184, 184, 6);
        L.label('price', '299 ₽', cx + 405, cy - 150, { size: Math.round(50 * st), font: FONT, col: '#ffffff', out: locked ? '#222222' : '#5a0a05', al: 0.5 }); }
      const sc = pop(0.55); if (sc > 0.01) { const cy = Y(1070), cw = 860, ch = 150, cx0 = W / 2 - cw / 2;
        L.rrect(cx0, cy - ch / 2, cw, ch, 36, CREAM, [0.98, 0.9, 0.76], k); L.ring(W / 2, cy, cw / 2, ch / 2, ORANGE, 0.5, 0.025); L.uiBox('promo', cx0, cy - ch / 2, cw, ch, 6);
        L.rrect(cx0 + 24, cy - 48, 500, 96, 24, [0.06, 0.2, 0.14], [0.03, 0.12, 0.08]); L.uiBox('code', cx0 + 24, cy - 48, 500, 96, 6);
        L.label('code', code ? S.PROMO : 'Код за победу', cx0 + 274, cy, { size: code ? 58 : 42, font: FONT, col: code ? '#ffe9a8' : '#a9c4b6', out: '#04140b', al: 0.5 });
        const bx2 = cx0 + 548, bw2 = 288;
        if (code) { const copied = ST.copyT !== undefined && GT - ST.copyT < 1.6 || (S.copyAt !== undefined && t - S.copyAt < 1.6);
          L.rrect(bx2, cy - 48, bw2, 96, 48, [1.0, 0.62, 0.22], ORANGE_D); L.uiBox('copy', bx2, cy - 48, bw2, 96, 4);
          L.label('copy', copied ? 'Готово!' : 'Копировать', bx2 + bw2 / 2, cy, { size: 40, font: FONT, col: '#ffffff', out: '#7a2a00', al: 0.5 }); S.hit.push({ id: 'copy', x: bx2, y: cy - 48, w: bw2, h: 96 }); }
        else if (a > 1.0) { L.rrect(bx2, cy - 48, bw2, 96, 48, [1.0, 0.62, 0.22], ORANGE_D); L.uiBox('again', bx2, cy - 48, bw2, 96, 4);                                 // locked: the replay lives right in the code card
          L.label('again', 'Ещё раз', bx2 + bw2 / 2, cy, { size: 42, font: FONT, col: '#ffffff', out: '#7a2a00', al: 0.5, a: SS(1.0, 1.4, a) }); S.hit.unshift({ id: 'replay', x: bx2, y: cy - 48, w: bw2, h: 96 }); } }
      const s3 = pop(0.75), pul = 1 + 0.045 * Math.sin(t * 6), bw = 780 * s3 * pul, bh = 170 * s3 * pul, bx3 = W / 2 - bw / 2, by3 = Y(1370) - bh / 2;
      if (s3 > 0.01) { L.glow(W / 2, Y(1370), 440, [1, 0.7, 0.3], 0.3, 2.2);
        L.rrect(bx3, by3 + 12, bw, bh, bh / 2, [0.5, 0.2, 0.02], [0.4, 0.15, 0.0]); L.rrect(bx3, by3, bw, bh, bh / 2, [1.0, 0.66, 0.26], ORANGE_D); L.uiBox('endcta', bx3, by3, bw, bh, 2);
        L.label('endcta', locked ? 'ЗАКАЗАТЬ' : 'ЗАКАЗАТЬ СО СКИДКОЙ', W / 2, by3 + bh / 2, { size: Math.round((locked ? 76 : 52) * s3), font: FONT, col: '#ffffff', out: '#7a2a00', al: 0.5 });
        S.hit.push({ id: 'cta', x: bx3, y: by3, w: bw, h: bh }); }
      if (!locked && a > 1.0) { const rw = 360, ry = Y(1590), q = SS(1.0, 1.4, a);                                                                         // replay: a real pill, smaller than the order button
        L.rrect(W / 2 - rw / 2, ry - 40, rw, 80, 40, [1, 1, 1], [0.9, 0.95, 0.92], 0.16 * q); L.ring(W / 2, ry, rw / 2, 40, CREAM, 0.45 * q, 0.04); L.uiBox('replayb', W / 2 - rw / 2, ry - 40, rw, 80, 4);
        L.label('replay', 'Ещё раз', W / 2, ry, { size: 44, font: FONT, col: '#ffffff', out: '#0c2418', al: 0.5, a: q });
        S.hit.unshift({ id: 'replay', x: W / 2 - rw / 2 - 20, y: ry - 50, w: rw + 40, h: 100 }); }
      L.label('legal', '*Концепт. Бренд, цены и промокод вымышлены', W / 2, H - 70, { size: 32, font: FONT, col: '#a9c9b6', out: '#04140b', al: 0.5, a: k }); L.uiBox('legal', 20, H - 112, W - 40, 84, 2);
      if (a > 0.6) S.hit.push({ id: 'cta', x: 0, y: 0, w: W, h: H }); }
    // confetti after the win: falls over everything, also over the start of the endcard
    for (const e of ST.ev) { if (e.k !== 'win') continue; const a = GT - e.t; if (a < 0 || a > 3.6) continue; const cols = [ORANGE, RED, CREAM, [1, 0.85, 0.25], [0.3, 0.8, 0.5]];
      for (let j = 0; j < 70; j++) { const d0 = 0.35 * rnd(j, 21), tt = a - d0; if (tt < 0) continue; const x = W * rnd(j, 22) + 60 * Math.sin(tt * 2.2 + j), y = -80 + tt * (520 + 380 * rnd(j, 23)), al = 1 - SS(2.8, 3.6, a); if (y > H + 40) continue;
        L.solid(x, y, 16, 26, cols[j % 5], tt * (3 + 5 * rnd(j, 24)) + j, 8, 13, al); } }
  };

  // QA hooks: every HUD screen at its worst case, staged from the attract replay where it happens naturally
  S.QA = () => {
    const at = (tt, o = {}) => Object.assign(JSON.parse(JSON.stringify(SIM.at(tt))), o);
    const endAt = (why, mode, got) => { const s = at(14.3, { endWhy: why, promoMode: mode }); s.end = s.t - 2; s.got = got; return s; };
    return { states: [['start', at(0.3)], ['aim', at(1.2)], ['down', at(1.6)], ['got', at(3.3)], ['slip', at(4.95)], ['urgent', at(11.5, { firstIn: 0.2, t: 25 })], ['win', at(14.6)],
      ['end_win', at(16.4)], ['end_lost_always', endAt('timeout', 'always', [true, false, true, false])], ['end_lost_win', endAt('timeout', 'win', [true, false, false, false])], ['end_idle', endAt('idle', 'always', [true, true, false, false])], ['end_idle_win', endAt('idle', 'win', [true, false, false, false])], ['end_passive_win', endAt('passive', 'win', [false, false, false, false])]],
      cycles: {}, sprites: {}, box: () => [0, 0, W, H] };
  };
})();
