/**
 * Two Thumbs — Web Audio synthesized SFX (no assets needed)
 */
(function (global) {
  "use strict";

  let ctx = null;
  let muted = false;
  let master = null;

  function ensure() {
    if (muted) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.28;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, gain, slide) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.2, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise(dur, gain, filterFreq) {
    const c = ensure();
    if (!c) return;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = filterFreq || 1200;
    const g = c.createGain();
    const t0 = c.currentTime;
    g.gain.setValueAtTime(gain || 0.15, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur);
  }

  const SFX = {
    unlock() { ensure(); },
    swipe() { tone(220, 0.12, "sawtooth", 0.12, 520); noise(0.08, 0.06, 800); },
    launch() { tone(180, 0.18, "square", 0.1, 640); tone(360, 0.14, "sine", 0.08, 900); },
    bounce() { tone(520, 0.06, "triangle", 0.1, 380); },
    block() { tone(140, 0.1, "square", 0.14); tone(280, 0.12, "sine", 0.1, 120); noise(0.06, 0.1, 400); },
    perfect() { tone(523, 0.1, "sine", 0.12); tone(659, 0.12, "sine", 0.1); tone(784, 0.18, "sine", 0.1); },
    miss() { tone(120, 0.2, "sawtooth", 0.12, 60); noise(0.15, 0.12, 200); },
    wall() { noise(0.2, 0.18, 300); tone(80, 0.25, "triangle", 0.15, 40); },
    power() { tone(400, 0.08, "sine", 0.1); tone(600, 0.1, "sine", 0.1); tone(900, 0.16, "sine", 0.12); },
    ui() { tone(660, 0.06, "sine", 0.08); },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => {
        setTimeout(() => tone(f, 0.2, "sine", 0.12), i * 90);
      });
    },
    lose() { tone(300, 0.25, "sawtooth", 0.1, 90); tone(200, 0.3, "triangle", 0.1, 70); },
    breath() { noise(0.35, 0.2, 600); tone(100, 0.3, "sawtooth", 0.08, 200); },
    setMuted(m) { muted = !!m; },
  };

  global.TT = global.TT || {};
  global.TT.SFX = SFX;
})(typeof window !== "undefined" ? window : globalThis);
