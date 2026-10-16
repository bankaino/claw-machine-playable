// live/audio.js — procedural sound for the claw machine (WebAudio, zero asset bytes) driven by the sim event bus S.ev and the claw state.
// index.html calls AUDIO.tick(state) once per frame in play mode; the context starts on the first user gesture (autoplay policy)
// and AUDIO.mute(bool) is wired to ad-network viewability / audio-volume callbacks.
(function () {
  let ac = null, out = null, motor = null, last = -1, muted = false, lastTickX = 0, lastSec = 99, nbuf = null;
  const start = () => {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    ac = new C(); out = ac.createGain(); out.gain.value = muted ? 0 : 0.55; out.connect(ac.destination);
    // motor: two detuned saws through a band-pass, pitch and level follow how fast the claw moves
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 2.2; const g = ac.createGain(); g.gain.value = 0;
    const o1 = ac.createOscillator(), o2 = ac.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = 90; o2.frequency.value = 135;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(out); o1.start(); o2.start(); motor = { o1, o2, g, f };
  };
  addEventListener('pointerdown', start, { capture: true }); addEventListener('keydown', start, { capture: true });
  const noise = () => { if (nbuf) return nbuf; nbuf = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate); const d = nbuf.getChannelData(0);
    let s = 12345; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; } return nbuf; };
  const env = (node, t0, a, peak, dur) => { const g = ac.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); node.connect(g); g.connect(out); return g; };
  const tone = (freq, t0, dur, type = 'sine', peak = 0.2, slide = 0) => { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur); env(o, t0, 0.005, peak, dur); o.start(t0); o.stop(t0 + dur + 0.05); };
  const burst = (t0, dur, f0, f1, peak, q = 1.2, type = 'bandpass') => { const s = ac.createBufferSource(); s.buffer = noise(); const f = ac.createBiquadFilter();
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur); s.connect(f); env(f, t0, 0.004, peak, dur); s.start(t0); s.stop(t0 + dur + 0.05); };
  const NOTES = [523, 659, 784, 1047];                                     // C5 E5 G5 C6: every capsule climbs the chord
  const SFX = {
    drop: (t0) => { tone(180, t0, 0.07, 'square', 0.10, 0.6); burst(t0, 0.05, 3000, 1500, 0.12, 3, 'highpass'); },                        // the big button: thunk + click
    grab: (t0) => { burst(t0, 0.07, 5200, 2200, 0.22, 4, 'highpass'); tone(1760, t0, 0.10, 'triangle', 0.10, 0.8); tone(880, t0 + 0.03, 0.18, 'sine', 0.12); },   // metal clack + ting
    slip: (t0) => { tone(520, t0, 0.35, 'triangle', 0.16, 0.45); burst(t0 + 0.05, 0.18, 1600, 500, 0.12, 1.5); },                          // sad slide: it fell out
    miss: (t0) => { tone(140, t0, 0.18, 'sine', 0.22, 0.6); burst(t0, 0.08, 900, 300, 0.10); },
    got: (t0, e) => { const f = NOTES[Math.min(3, (e.n || 1) - 1)]; tone(f, t0, 0.36, 'triangle', 0.17); tone(f * 2, t0 + 0.02, 0.28, 'sine', 0.08); tone(f * 1.5, t0 + 0.09, 0.30, 'sine', 0.06);
      tone(95, t0, 0.14, 'sine', 0.22, 0.5); burst(t0, 0.10, 2400, 900, 0.07, 2); },                                                         // thud in the chute + chime
    win: (t0) => { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => { tone(f, t0 + 0.05 + i * 0.07, 0.34, 'triangle', 0.13); tone(f * 2, t0 + 0.05 + i * 0.07, 0.2, 'sine', 0.04); }); burst(t0 + 0.4, 0.8, 6000, 2500, 0.10, 1, 'highpass'); },
    timeout: (t0) => { [392, 330, 262].forEach((f, i) => tone(f, t0 + i * 0.16, 0.34, 'sawtooth', 0.10)); },
    end: (t0) => { tone(262, t0, 0.5, 'sine', 0.08); tone(392, t0 + 0.02, 0.5, 'sine', 0.06); },
    copy: (t0) => { tone(1500, t0, 0.04, 'square', 0.07); tone(2200, t0 + 0.04, 0.06, 'square', 0.05); },
  };
  window.AUDIO = {
    mute: (m) => { muted = m; if (out) out.gain.value = m ? 0 : 0.55; },
    tick: (S) => {
      if (!ac || !S) return; const now = ac.currentTime;
      if (S.t < last) { last = -1; lastSec = 99; }                          // restart / replay
      for (const e of S.ev) { if (e.t <= last) continue; if (SFX[e.k]) SFX[e.k](now, e); }
      last = S.t;
      // lever ratchet: a soft tick for every ~38 px the claw travels sideways
      const c = S.cl, moving = c && !S.cy ? Math.min(1, Math.abs(c.v) / SIM.K.CLAW_V) : 0;
      if (c && !S.cy && Math.abs(c.x - lastTickX) > 38) { tone(260 + 90 * moving, now, 0.03, 'square', 0.025); lastTickX = c.x; } else if (S.cy) lastTickX = c.x;
      // last five seconds: a tick per second
      const left = SIM.timeLeft(S), sec = Math.ceil(left);
      if (S.firstIn >= 0 && S.end < 0 && sec <= 5 && sec > 0 && sec < lastSec) { tone(sec === 1 ? 1180 : 880, now, 0.09, 'square', 0.05); }
      lastSec = S.end < 0 ? sec : 99;
      // motor: whirs while the claw is working (pitch by phase) and while the lever drives it sideways
      const ph = S.cy ? S.cy.ph : '', busy = ph === 'down' || ph === 'up' || ph === 'carry' || ph === 'return', lvl = busy ? 0.05 : 0.04 * moving, pitch = busy ? (ph === 'down' ? 70 : ph === 'up' ? 110 : 90) : 60 + 40 * moving;
      motor.g.gain.setTargetAtTime(S.end < 0 ? lvl : 0, now, 0.05); motor.o1.frequency.setTargetAtTime(pitch, now, 0.06); motor.o2.frequency.setTargetAtTime(pitch * 1.5, now, 0.06);
      motor.f.frequency.setTargetAtTime(380 + pitch * 4, now, 0.08);
    },
  };
})();
