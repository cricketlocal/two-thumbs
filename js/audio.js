/**
 * Two Thumbs — Web Audio SFX engine (Neon Siege)
 * Procedural synth sounds — no external files required
 */
(function (global) {
  "use strict";

  let ctx = null;
  let muted = false;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let unlocked = false;

  try {
    muted = localStorage.getItem("tt_mute") === "1";
  } catch (_) {}

  function ensure() {
    if (muted) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 1;
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.22;
      sfxBus.connect(master);
      musicBus.connect(master);
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    unlocked = true;
    return ctx;
  }

  function now() {
    return ensure() ? ctx.currentTime : 0;
  }

  function env(g, t0, attack, peak, dur, release) {
    const a = Math.max(0.003, attack || 0.01);
    const rel = Math.max(0.02, release || 0.08);
    const hold = Math.max(a + 0.01, (dur || 0.15) - rel);
    g.gain.cancelScheduledValues(t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * 0.7), t0 + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + hold + rel);
  }

  function tone(freq, dur, type, gain, slide, dest) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (slide != null) {
      o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
    }
    env(g, t0, 0.008, gain || 0.2, dur, Math.min(0.12, dur * 0.4));
    o.connect(g);
    g.connect(dest || sfxBus);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noise(dur, gain, filterFreq, type, dest) {
    const c = ensure();
    if (!c) return;
    const n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = type || "bandpass";
    f.frequency.value = filterFreq || 1200;
    f.Q.value = type === "lowpass" ? 0.7 : 1.2;
    const g = c.createGain();
    const t0 = c.currentTime;
    env(g, t0, 0.005, gain || 0.15, dur, Math.min(0.15, dur * 0.5));
    src.connect(f);
    f.connect(g);
    g.connect(dest || sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  function chord(freqs, dur, type, gain) {
    freqs.forEach((f, i) => {
      setTimeout(() => tone(f, dur, type || "sine", (gain || 0.1) * (1 - i * 0.08)), i * 40);
    });
  }

  /** Layered whoosh for flicks */
  function whoosh() {
    noise(0.12, 0.12, 900, "bandpass");
    noise(0.1, 0.08, 400, "lowpass");
    tone(180, 0.1, "sawtooth", 0.06, 480);
  }

  /** Glass fireball cast */
  function fireball() {
    whoosh();
    tone(140, 0.16, "sawtooth", 0.12, 420);
    tone(90, 0.2, "square", 0.06, 200);
    noise(0.14, 0.14, 700, "bandpass");
    setTimeout(() => {
      tone(520, 0.08, "sine", 0.08, 220);
      noise(0.08, 0.1, 1400, "highpass");
    }, 30);
  }

  /** Soft frost orb */
  function iceball() {
    tone(880, 0.12, "sine", 0.1, 440);
    tone(1320, 0.14, "triangle", 0.07, 660);
    noise(0.1, 0.06, 2400, "bandpass");
    tone(220, 0.18, "sine", 0.05, 110);
  }

  /** Shadow / decoy */
  function shadow() {
    tone(90, 0.22, "sawtooth", 0.1, 40);
    tone(180, 0.18, "triangle", 0.08, 70);
    noise(0.16, 0.1, 300, "lowpass");
  }

  /** Lightning laser */
  function laser() {
    noise(0.08, 0.16, 3000, "highpass");
    tone(1200, 0.08, "square", 0.08, 200);
    tone(2400, 0.05, "sawtooth", 0.05, 400);
  }

  /** Venom spit */
  function venom() {
    tone(300, 0.1, "sawtooth", 0.1, 90);
    noise(0.12, 0.1, 500, "bandpass");
    tone(160, 0.14, "triangle", 0.07, 60);
  }

  /** Heavy arcane meteor */
  function meteor() {
    tone(60, 0.28, "sine", 0.16, 40);
    tone(100, 0.22, "sawtooth", 0.1, 50);
    noise(0.2, 0.14, 200, "lowpass");
    setTimeout(() => noise(0.1, 0.1, 800, "bandpass"), 40);
  }

  const SFX = {
    unlock() {
      ensure();
    },

    isMuted() {
      return muted;
    },

    setMuted(m) {
      muted = !!m;
      try {
        localStorage.setItem("tt_mute", muted ? "1" : "0");
      } catch (_) {}
      if (!muted) ensure();
      else if (ctx && ctx.state === "running") {
        /* leave ctx alive; ensure() gates playback */
      }
      if (global.TT && typeof global.TT.onMuteChange === "function") {
        global.TT.onMuteChange(muted);
      }
    },

    toggleMute() {
      SFX.setMuted(!muted);
      if (!muted) SFX.ui();
      return muted;
    },

    /** Generic UI click */
    ui() {
      tone(720, 0.05, "sine", 0.12);
      tone(960, 0.06, "triangle", 0.06);
    },

    uiBack() {
      tone(480, 0.06, "sine", 0.1);
      tone(320, 0.08, "sine", 0.06);
    },

    select() {
      tone(520, 0.06, "triangle", 0.1);
      tone(780, 0.1, "sine", 0.1);
      tone(1040, 0.12, "sine", 0.08);
    },

    swipe() {
      whoosh();
    },

    /** school: fire | ice | shadow | volt | venom | arcane | default */
    launch(school) {
      switch (school) {
        case "fire":
        case "burn":
          fireball();
          break;
        case "ice":
        case "slow":
          iceball();
          break;
        case "shadow":
        case "decoy":
          shadow();
          break;
        case "volt":
        case "pierce":
        case "laser":
          laser();
          break;
        case "venom":
        case "split":
          venom();
          break;
        case "arcane":
        case "heavy":
        case "meteor":
          meteor();
          break;
        default:
          fireball();
      }
    },

    bounce() {
      tone(640, 0.05, "triangle", 0.12, 420);
      tone(900, 0.04, "sine", 0.06);
      noise(0.04, 0.06, 1800, "bandpass");
    },

    block() {
      tone(120, 0.09, "square", 0.16);
      tone(240, 0.1, "sine", 0.12, 100);
      noise(0.07, 0.14, 350, "lowpass");
      tone(90, 0.12, "triangle", 0.08);
    },

    perfect() {
      chord([523.25, 659.25, 783.99, 1046.5], 0.16, "sine", 0.11);
      noise(0.06, 0.05, 2000, "highpass");
    },

    combo(n) {
      const base = 400 + Math.min(8, n || 1) * 40;
      tone(base, 0.08, "sine", 0.1);
      tone(base * 1.5, 0.1, "triangle", 0.08);
      if (n >= 5) tone(base * 2, 0.14, "sine", 0.08);
    },

    miss() {
      tone(140, 0.18, "sawtooth", 0.14, 55);
      noise(0.16, 0.14, 180, "lowpass");
    },

    wall() {
      noise(0.22, 0.2, 280, "lowpass");
      tone(70, 0.28, "triangle", 0.16, 35);
      tone(50, 0.2, "sine", 0.1);
    },

    power() {
      chord([392, 523, 659, 784], 0.12, "sine", 0.1);
      noise(0.08, 0.06, 1200, "bandpass");
    },

    tick() {
      tone(880, 0.04, "square", 0.06);
    },

    tickUrgent() {
      tone(1100, 0.05, "square", 0.1);
      tone(880, 0.05, "square", 0.06);
    },

    roundStart() {
      chord([392, 494, 587], 0.14, "triangle", 0.1);
      setTimeout(() => tone(784, 0.18, "sine", 0.12), 120);
    },

    win() {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      notes.forEach((f, i) => {
        setTimeout(() => {
          tone(f, 0.22, "sine", 0.12);
          tone(f * 2, 0.12, "triangle", 0.04);
        }, i * 85);
      });
    },

    lose() {
      tone(280, 0.28, "sawtooth", 0.12, 80);
      setTimeout(() => tone(180, 0.35, "triangle", 0.12, 60), 100);
      noise(0.3, 0.12, 200, "lowpass");
    },

    breath() {
      noise(0.4, 0.22, 550, "bandpass");
      tone(90, 0.35, "sawtooth", 0.1, 220);
      setTimeout(() => noise(0.2, 0.12, 900, "highpass"), 80);
    },

    freeze() {
      tone(1400, 0.2, "sine", 0.08, 400);
      tone(1800, 0.18, "triangle", 0.06, 500);
      noise(0.15, 0.08, 3000, "highpass");
    },

    repair() {
      tone(300, 0.1, "sine", 0.1);
      tone(400, 0.1, "sine", 0.1);
      tone(500, 0.14, "sine", 0.1);
    },

    countdown() {
      tone(660, 0.12, "square", 0.1);
    },

    banner() {
      tone(440, 0.1, "triangle", 0.1);
      tone(660, 0.14, "sine", 0.1);
    },
  };

  // Auto-unlock on first pointer/key (browser autoplay policy)
  function armUnlock() {
    const go = () => {
      ensure();
      window.removeEventListener("pointerdown", go, true);
      window.removeEventListener("keydown", go, true);
      window.removeEventListener("touchstart", go, true);
    };
    window.addEventListener("pointerdown", go, true);
    window.addEventListener("keydown", go, true);
    window.addEventListener("touchstart", go, { capture: true, passive: true });
  }

  if (typeof window !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", armUnlock);
    } else {
      armUnlock();
    }
  }

  global.TT = global.TT || {};
  global.TT.SFX = SFX;
  global.TT.audioUnlocked = () => unlocked;
})(typeof window !== "undefined" ? window : globalThis);
