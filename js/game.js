/**
 * Two Thumbs — core duel engine
 * Air-hockey spells · growing paddle · role swap · endless
 */
(function (global) {
  "use strict";

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function dist(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return Math.hypot(dx, dy);
  }

  class Game {
    constructor(canvas, hooks) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.hooks = hooks || {};
      this.particles = new global.TT.ParticleSystem();
      this.w = 390;
      this.h = 844;
      this.dpr = 1;
      this.running = false;
      this.paused = false;
      this.mode = "duel"; // duel | endless
      this.wizard = null;
      this.defender = null;
      this.round = 1;
      this.scoreA = 0; // player A (started as attacker)
      this.scoreB = 0;
      this.attackerIsA = true;
      this.wallHp = global.TT.CFG.WALL_MAX;
      this.paddleScale = 1;
      this.paddleX = 0.5;
      this.paddleTargetX = 0.5;
      this.spells = [];
      this.powerups = [];
      this.guards = [];
      this.combo = 0;
      this.maxCombo = 0;
      this.time = 0;
      this.roundTime = global.TT.CFG.ROUND_TIME;
      this.cd = 0;
      this.powerupTimer = 0;
      this.shake = 0;
      this.slowMo = 0;
      this.effects = {
        freeze: 0,
        giant: 0,
        haste: 0,
        magnet: 0,
        multiShots: 0,
        breathCd: 0,
        slowPaddle: 0,
        burn: 0,
      };
      this.endlessScore = 0;
      this.endlessWave = 1;
      this.hintsLeft = 3;
      this.swipe = null;
      this.pointer = { active: false, id: null, x: 0, y: 0, zone: null };
      this.secondPointer = null;
      this.banner = null;
      this.bannerT = 0;
      this.over = false;
      this.fieldFlash = 0;
      this.stars = this._makeStars(48);

      this._onPointerDown = this._onPointerDown.bind(this);
      this._onPointerMove = this._onPointerMove.bind(this);
      this._onPointerUp = this._onPointerUp.bind(this);
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      this.w = Math.max(280, Math.floor(rect.width));
      this.h = Math.max(480, Math.floor(rect.height));
      this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      this.canvas.width = Math.floor(this.w * this.dpr);
      this.canvas.height = Math.floor(this.h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    _makeStars(n) {
      const s = [];
      for (let i = 0; i < n; i++) {
        s.push({
          x: Math.random(),
          y: Math.random(),
          r: 0.5 + Math.random() * 1.4,
          a: 0.2 + Math.random() * 0.6,
          tw: Math.random() * Math.PI * 2,
        });
      }
      return s;
    }

    start(opts) {
      this.mode = opts.mode || "duel";
      this.wizard = opts.wizard;
      this.defender = opts.defender;
      this.round = 1;
      this.scoreA = 0;
      this.scoreB = 0;
      this.attackerIsA = true;
      this.endlessScore = 0;
      this.endlessWave = 1;
      this.hintsLeft = 3;
      this.over = false;
      this._resetRound();
      this.running = true;
      this.paused = false;
      this.resize();
      this._bindInput(true);
      this._banner(this.mode === "endless" ? "SIEGE BEGINS" : "ROUND 1 — FIGHT!", 1.4);
      this._emitHud();
    }

    _resetRound() {
      const CFG = global.TT.CFG;
      this.wallHp = CFG.WALL_MAX;
      this.paddleScale = 1;
      this.paddleX = 0.5;
      this.paddleTargetX = 0.5;
      this.spells = [];
      this.powerups = [];
      this.guards = [];
      this.combo = 0;
      this.time = 0;
      this.roundTime = CFG.ROUND_TIME;
      this.cd = 0.15;
      this.powerupTimer = CFG.POWERUP_INTERVAL * 0.5;
      this.shake = 0;
      this.slowMo = 0;
      this.effects = {
        freeze: 0,
        giant: 0,
        haste: 0,
        magnet: 0,
        multiShots: 0,
        breathCd: 0,
        slowPaddle: 0,
        burn: 0,
      };
      this.particles.clear();
      this.fieldFlash = 0;
      this.over = false;
      this.swipe = null;
    }

    stop() {
      this.running = false;
      this._bindInput(false);
    }

    pause() {
      this.paused = true;
    }

    resume() {
      this.paused = false;
    }

    _bindInput(on) {
      const el = this.canvas;
      const m = on ? "addEventListener" : "removeEventListener";
      el[m]("pointerdown", this._onPointerDown);
      el[m]("pointermove", this._onPointerMove);
      el[m]("pointerup", this._onPointerUp);
      el[m]("pointercancel", this._onPointerUp);
      if (on) el.style.touchAction = "none";
    }

    _zone(y) {
      const CFG = global.TT.CFG;
      if (y < this.h * CFG.FIELD_TOP) return "wizard";
      if (y > this.h * CFG.FIELD_BOT) return "defender";
      return "field";
    }

    _local(e) {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / r.width) * this.w,
        y: ((e.clientY - r.top) / r.height) * this.h,
        id: e.pointerId,
      };
    }

    _onPointerDown(e) {
      if (!this.running || this.paused || this.over) return;
      e.preventDefault();
      global.TT.SFX.unlock();
      const p = this._local(e);
      const zone = this._zone(p.y);

      if (zone === "wizard" || (zone === "field" && p.y < this.h * 0.45)) {
        // Flick-swipe: sample velocity only — never draw an aim path
        const now = performance.now();
        this.swipe = {
          id: p.id,
          x0: p.x,
          y0: p.y,
          x: p.x,
          y: p.y,
          t0: now,
          samples: [{ x: p.x, y: p.y, t: now }],
        };
        try { this.canvas.setPointerCapture(p.id); } catch (_) {}
      } else {
        this.pointer = { active: true, id: p.id, x: p.x, y: p.y, zone: "defender" };
        this.paddleTargetX = p.x / this.w;
        // Dragon double-tap breath
        if (this.defender && this.defender.special === "breath") {
          const now = performance.now();
          if (this._lastTap && now - this._lastTap < 280 && this.effects.breathCd <= 0) {
            this._dragonBreath();
          }
          this._lastTap = now;
        }
        try { this.canvas.setPointerCapture(p.id); } catch (_) {}
      }
    }

    _onPointerMove(e) {
      if (!this.running || this.paused) return;
      const p = this._local(e);
      if (this.swipe && this.swipe.id === p.id) {
        const now = performance.now();
        this.swipe.x = p.x;
        this.swipe.y = p.y;
        this.swipe.samples.push({ x: p.x, y: p.y, t: now });
        // Keep a short window for flick velocity (no long drag-line aim)
        const cutoff = now - 90;
        while (this.swipe.samples.length > 2 && this.swipe.samples[0].t < cutoff) {
          this.swipe.samples.shift();
        }
      }
      if (this.pointer.active && this.pointer.id === p.id) {
        this.pointer.x = p.x;
        this.paddleTargetX = p.x / this.w;
      }
    }

    _onPointerUp(e) {
      if (!this.running) return;
      const p = this._local(e);
      if (this.swipe && this.swipe.id === p.id) {
        this._tryLaunch(this.swipe);
        this.swipe = null;
      }
      if (this.pointer.active && this.pointer.id === p.id) {
        this.pointer.active = false;
      }
    }

    _tryLaunch(swipe) {
      if (this.cd > 0 || this.effects.freeze > 0) return;

      // Flick velocity from recent samples (last ~90ms) — not a drawn aim line
      const samples = swipe.samples && swipe.samples.length >= 2
        ? swipe.samples
        : [
            { x: swipe.x0, y: swipe.y0, t: swipe.t0 },
            { x: swipe.x, y: swipe.y, t: performance.now() },
          ];
      const a = samples[0];
      const b = samples[samples.length - 1];
      const dtMs = Math.max(12, b.t - a.t);
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const flickLen = Math.hypot(dx, dy);
      // Full-gesture length as fallback for slow drags that still flick at the end
      const fullLen = Math.hypot(swipe.x - swipe.x0, swipe.y - swipe.y0);
      if (flickLen < 10 && fullLen < 22) return;

      if (flickLen < 10) {
        dx = swipe.x - swipe.x0;
        dy = swipe.y - swipe.y0;
      }

      let vx = (dx / dtMs) * 1000;
      let vy = (dy / dtMs) * 1000;
      // Spells always fire into the field (down). Up-swipes invert into a forward flick.
      if (vy < 60) vy = Math.abs(vy) + 120;
      const speed = Math.hypot(vx, vy);
      // Faster cast cadence: easier to hit power band on short flicks
      const power = clamp(speed / 700, 0.55, 1.75);
      const ang = Math.atan2(vy, vx);
      const maxSide = Math.PI * 0.42;
      const mid = Math.PI / 2;
      const clamped = mid + clamp(ang - mid, -maxSide, maxSide);

      // Launch from wizard, not from finger path — hides aim origin from defender
      const spawnX = this.w / 2 + clamp((swipe.x0 - this.w / 2) * 0.35, -this.w * 0.22, this.w * 0.22);
      const spawnY = this.h * global.TT.CFG.WIZARD_ZONE * 0.85;

      const count = 1 + (this.effects.multiShots > 0 ? 2 : 0);
      if (this.effects.multiShots > 0) this.effects.multiShots--;

      for (let i = 0; i < count; i++) {
        const spread = count > 1 ? (i - 1) * 0.18 : 0;
        this._spawnSpell(spawnX, spawnY, clamped + spread, power, false);
      }

      // Shade decoy
      if (this.wizard.special === "decoy") {
        this._spawnSpell(
          spawnX + (Math.random() > 0.5 ? 28 : -28),
          spawnY,
          clamped + (Math.random() - 0.5) * 0.5,
          power * 0.9,
          true
        );
      }

      const haste = this.effects.haste > 0 ? 0.5 : 1;
      this.cd = this.wizard.cooldown * haste;
      global.TT.SFX.swipe();
      global.TT.SFX.launch();
      // Cast flash at wizard only — no direction telegraph
      this.particles.burst(spawnX, spawnY, this.wizard.color, 12, 140, 0.3, 3);
      if (this.hintsLeft > 0) this.hintsLeft--;
    }

    _spawnSpell(x, y, angle, power, decoy) {
      const wiz = this.wizard;
      const base = 280 * wiz.speed * power * (this.mode === "endless" ? 1 + this.endlessWave * 0.03 : 1);
      const spell = {
        x,
        y,
        vx: Math.cos(angle) * base,
        vy: Math.sin(angle) * base,
        r: wiz.size * (power > 1.2 ? 1.15 : 1),
        color: wiz.color,
        color2: wiz.color2,
        damage: wiz.damage * (0.75 + power * 0.35),
        special: wiz.special,
        decoy: !!decoy,
        bounces: 0,
        maxBounces: wiz.maxBounces || 4,
        split: false,
        life: 8,
        trail: 0,
      };
      if (decoy) {
        spell.damage = 0;
        spell.color = "rgba(181,107,255,0.55)";
      }
      this.spells.push(spell);
    }

    _dragonBreath() {
      this.effects.breathCd = this.defender.breathCd || 4.5;
      global.TT.SFX.breath();
      const py = this.h * global.TT.CFG.PADDLE_Y_RATIO;
      const px = this.paddleX * this.w;
      this.particles.burst(px, py - 30, "#ff6b3d", 28, 220, 0.5, 5);
      this.fieldFlash = 0.25;
      // Destroy spells in cone above paddle
      for (let i = this.spells.length - 1; i >= 0; i--) {
        const s = this.spells[i];
        if (s.y > py - 180 && s.y < py && Math.abs(s.x - px) < 90) {
          this.particles.burst(s.x, s.y, s.color, 8, 100, 0.3, 3);
          this.spells.splice(i, 1);
          this.endlessScore += this.mode === "endless" ? 5 : 0;
        }
      }
      this._toast("🔥 FIRE BREATH!");
    }

    _paddleWidth() {
      const base = global.TT.CFG.BASE_PADDLE_W * this.defender.baseWidth;
      let scale = this.paddleScale;
      if (this.effects.giant > 0) scale *= 1.55;
      scale = clamp(scale, global.TT.CFG.PADDLE_MIN_SCALE, global.TT.CFG.PADDLE_MAX_SCALE);
      return base * scale;
    }

    _toast(msg) {
      if (this.hooks.onToast) this.hooks.onToast(msg);
    }

    _banner(msg, t) {
      this.banner = msg;
      this.bannerT = t || 1.2;
      if (this.hooks.onBanner) this.hooks.onBanner(msg, this.bannerT);
    }

    _emitHud() {
      if (this.hooks.onHud) {
        this.hooks.onHud({
          round: this.round,
          scoreA: this.scoreA,
          scoreB: this.scoreB,
          wallHp: Math.ceil(this.wallHp),
          wallMax: global.TT.CFG.WALL_MAX,
          combo: this.combo,
          mode: this.mode,
          endlessScore: this.endlessScore,
          endlessWave: this.endlessWave,
          attackerIsA: this.attackerIsA,
          timeLeft: Math.max(0, this.roundTime - this.time),
          timeElapsed: this.time,
          hint: this._hintText(),
        });
      }
    }

    _hintText() {
      if (this.hintsLeft <= 0) return "";
      if (this.mode === "endless") return "Flick to cast (no aim line) · Drag shield below";
      return this.attackerIsA
        ? "P1 flick-cast (top) · P2 defend (bottom) — no path preview"
        : "P2 flick-cast (top) · P1 defend (bottom) — no path preview";
    }

    update(dt) {
      if (!this.running || this.paused || this.over) {
        this.particles.update(dt);
        return;
      }

      let t = dt;
      if (this.slowMo > 0) {
        this.slowMo -= dt;
        t *= 0.35;
      }
      if (this.effects.freeze > 0) {
        this.effects.freeze -= dt;
        // freeze only slows spells / attacker cadence
      }

      this.time += t;
      this.cd = Math.max(0, this.cd - t);
      this.powerupTimer -= t;
      this.shake = Math.max(0, this.shake - t * 3);
      this.fieldFlash = Math.max(0, this.fieldFlash - t);
      this.bannerT = Math.max(0, this.bannerT - dt);
      if (this.bannerT <= 0) this.banner = null;

      // Effect timers
      for (const k of ["giant", "haste", "magnet", "slowPaddle", "burn", "breathCd"]) {
        if (this.effects[k] > 0) this.effects[k] = Math.max(0, this.effects[k] - t);
      }

      // Burn DOT on wall
      if (this.effects.burn > 0) {
        this.wallHp -= 4 * t * (this.defender.wallResist || 1);
      }

      // Endless auto-fire assist: occasional AI-ish pressure via auto projectiles? No — player does both thumbs.
      // Endless: scale difficulty with wave over time
      if (this.mode === "endless") {
        this.endlessWave = 1 + Math.floor(this.time / 20);
        if (this.powerupTimer <= 0) {
          this._spawnPowerup();
          this.powerupTimer = Math.max(4, global.TT.CFG.POWERUP_INTERVAL - this.endlessWave * 0.3);
        }
      } else if (this.powerupTimer <= 0) {
        if (Math.random() < global.TT.CFG.POWERUP_CHANCE + 0.35) this._spawnPowerup();
        this.powerupTimer = global.TT.CFG.POWERUP_INTERVAL;
      }

      // Paddle move
      const defSpeed = this.defender.speed * (this.effects.slowPaddle > 0 ? 0.4 : 1);
      const maxStep = defSpeed * 3.2 * t;
      let target = this.paddleTargetX;
      // Magnet
      if (this.effects.magnet > 0 && this.spells.length) {
        let best = null;
        let bestD = 1e9;
        for (const s of this.spells) {
          if (s.decoy) continue;
          if (s.y > this.h * 0.45 && s.vy > 0) {
            const d = s.y;
            if (d < bestD) {
              bestD = d;
              best = s;
            }
          }
        }
        if (best) target = lerp(target, best.x / this.w, 0.35);
      }
      this.paddleX = clamp(this.paddleX + clamp(target - this.paddleX, -maxStep, maxStep), 0.05, 0.95);

      this._updateSpells(t);
      this._updatePowerups(t);
      this._updateGuards(t);
      this.particles.update(dt);

      // Round timer (duel)
      if (this.mode === "duel" && this.time >= this.roundTime) {
        this._endRound("timeout");
        return;
      }

      if (this.wallHp <= 0) {
        this.wallHp = 0;
        this._endRound("wall");
        return;
      }

      this._emitHud();
    }

    _updateSpells(dt) {
      const freezeMul = this.effects.freeze > 0 ? 0.25 : 1;
      const left = 12;
      const right = this.w - 12;
      const top = this.h * global.TT.CFG.FIELD_TOP * 0.5;
      const bot = this.h * global.TT.CFG.CASTLE_Y_RATIO;
      const padY = this.h * global.TT.CFG.PADDLE_Y_RATIO;
      const padW = this._paddleWidth();
      const padX = this.paddleX * this.w;
      const padH = global.TT.CFG.PADDLE_H;

      for (let i = this.spells.length - 1; i >= 0; i--) {
        const s = this.spells[i];
        s.life -= dt;
        if (s.life <= 0) {
          this.spells.splice(i, 1);
          continue;
        }

        s.x += s.vx * dt * freezeMul;
        s.y += s.vy * dt * freezeMul;

        // Trails
        s.trail += dt;
        if (s.trail > 0.02) {
          s.trail = 0;
          this.particles.trail(s.x, s.y, s.color, s.r * 0.7);
        }

        // Side walls — air hockey rebound
        if (s.x - s.r < left) {
          s.x = left + s.r;
          s.vx = Math.abs(s.vx);
          s.bounces++;
          this._onBounce(s);
        } else if (s.x + s.r > right) {
          s.x = right - s.r;
          s.vx = -Math.abs(s.vx);
          s.bounces++;
          this._onBounce(s);
        }

        // Top soft bounce (keep in play)
        if (s.y - s.r < top && s.vy < 0) {
          s.y = top + s.r;
          s.vy = Math.abs(s.vy) * 0.9;
        }

        // Guards
        for (let g = this.guards.length - 1; g >= 0; g--) {
          const gu = this.guards[g];
          if (Math.abs(s.x - gu.x) < gu.w / 2 + s.r && Math.abs(s.y - gu.y) < gu.h / 2 + s.r) {
            this.particles.burst(s.x, s.y, "#ffd56a", 10, 100, 0.3, 3);
            this.spells.splice(i, 1);
            gu.hp--;
            if (gu.hp <= 0) this.guards.splice(g, 1);
            global.TT.SFX.block();
            break;
          }
        }
        if (!this.spells[i]) continue;

        // Paddle collision
        if (
          s.vy > 0 &&
          s.y + s.r >= padY - padH / 2 &&
          s.y - s.r <= padY + padH / 2 &&
          s.x > padX - padW / 2 - s.r &&
          s.x < padX + padW / 2 + s.r
        ) {
          if (s.decoy) {
            this.particles.burst(s.x, s.y, s.color, 6, 60, 0.25, 2);
            this.spells.splice(i, 1);
            continue;
          }
          this._onBlock(s, padX, padY, padW);
          this.spells.splice(i, 1);
          continue;
        }

        // Castle wall miss
        if (s.y - s.r > bot) {
          if (!s.decoy) this._onMiss(s);
          else this.particles.burst(s.x, s.y, s.color, 4, 40, 0.2, 2);
          this.spells.splice(i, 1);
        }
      }
    }

    _onBounce(s) {
      global.TT.SFX.bounce();
      this.particles.spark(s.x, s.y, s.color);
      // Venom split
      if (s.special === "split" && !s.split && s.bounces === 1) {
        s.split = true;
        const child = {
          ...s,
          vx: -s.vx * 0.85,
          vy: s.vy * 0.9,
          damage: s.damage * 0.7,
          r: s.r * 0.85,
          split: true,
          life: s.life * 0.8,
        };
        this.spells.push(child);
        this.particles.textPop(s.x, s.y - 10, "SPLIT!", s.color);
      }
      if (s.bounces > (s.maxBounces || 4)) {
        s.life = Math.min(s.life, 0.3);
      }
    }

    _onBlock(s, padX, padY, padW) {
      const CFG = global.TT.CFG;
      const offset = (s.x - padX) / (padW / 2);
      const perfect = Math.abs(offset) < 0.2;

      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);

      const grow = CFG.GROW * (this.defender.growMod || 1);
      this.paddleScale = clamp(this.paddleScale * (1 + grow), CFG.PADDLE_MIN_SCALE, CFG.PADDLE_MAX_SCALE);

      // Frost slows paddle when blocked
      if (s.special === "slow") {
        this.effects.slowPaddle = 1.4;
        this._toast("❄️ CHILLED!");
      }

      // Witch nullify flavor
      if (this.defender.special === "nullify" && Math.random() < (this.defender.nullifyChance || 0.4)) {
        this.particles.textPop(s.x, padY - 24, "NULLIFIED", "#b56bff");
      }

      // King guards every 3 blocks
      if (this.defender.special === "guards" && this.combo > 0 && this.combo % 3 === 0) {
        this._spawnGuards();
      }

      global.TT.SFX.block();
      if (perfect) {
        global.TT.SFX.perfect();
        this.particles.textPop(s.x, padY - 30, "PERFECT!", "#ffd56a");
        this.particles.burst(s.x, padY, "#ffd56a", 16, 160, 0.45, 4);
      } else {
        this.particles.burst(s.x, padY, s.color, 12, 130, 0.4, 3);
      }

      if (this.combo >= 3 && this.combo % 3 === 0) {
        this.particles.textPop(this.w / 2, this.h * 0.5, `COMBO ×${this.combo}`, "#ff6ad5");
        this._toast(`🔥 COMBO ×${this.combo}`);
      }

      if (this.mode === "endless") {
        this.endlessScore += 10 + this.combo * 2 + (perfect ? 15 : 0);
      }

      this.shake = Math.min(0.5, 0.08 + this.combo * 0.02);
    }

    _onMiss(s) {
      const CFG = global.TT.CFG;
      this.combo = 0;
      const shrink = CFG.SHRINK * (this.defender.shrinkMod || 1);
      this.paddleScale = clamp(this.paddleScale * (1 - shrink), CFG.PADDLE_MIN_SCALE, CFG.PADDLE_MAX_SCALE);

      let dmg = s.damage * (this.defender.wallResist || 1);
      // Ember burn
      if (s.special === "burn") {
        this.effects.burn = 2.2;
        dmg *= 1.1;
      }
      // Arcane heavy
      if (s.special === "heavy") dmg *= 1.15;

      this.wallHp -= dmg;
      global.TT.SFX.miss();
      global.TT.SFX.wall();
      this.particles.burst(s.x, this.h * CFG.CASTLE_Y_RATIO, "#ff3d6e", 20, 180, 0.55, 4);
      this.particles.textPop(s.x, this.h * CFG.CASTLE_Y_RATIO - 20, `-${Math.round(dmg)}`, "#ff3d6e");
      this.shake = 0.45;
      this.fieldFlash = 0.2;

      if (this.wallHp < 25) this.slowMo = 0.35;

      if (this.mode === "endless") {
        // still score time survived; damage just hurts
      }
    }

    _spawnGuards() {
      const y = this.h * 0.72;
      this.guards = [
        { x: this.w * 0.22, y, w: 36, h: 14, hp: 2 },
        { x: this.w * 0.78, y, w: 36, h: 14, hp: 2 },
      ];
      this._toast("👑 GUARDS!");
      global.TT.SFX.power();
    }

    _updateGuards() {
      // static for now
    }

    _spawnPowerup() {
      if (this.powerups.length >= 2) return;
      const def = global.TT.POWERUPS[(Math.random() * global.TT.POWERUPS.length) | 0];
      this.powerups.push({
        ...def,
        x: this.w * (0.2 + Math.random() * 0.6),
        y: this.h * (0.35 + Math.random() * 0.25),
        r: 16,
        life: 8,
        bob: Math.random() * Math.PI * 2,
      });
    }

    _updatePowerups(dt) {
      const padY = this.h * global.TT.CFG.PADDLE_Y_RATIO;
      const padW = this._paddleWidth();
      const padX = this.paddleX * this.w;

      for (let i = this.powerups.length - 1; i >= 0; i--) {
        const p = this.powerups[i];
        p.life -= dt;
        p.bob += dt * 3;
        p.y += Math.sin(p.bob) * 8 * dt;
        if (p.life <= 0) {
          this.powerups.splice(i, 1);
          continue;
        }
        // Collect by paddle or spell collision
        let hit = Math.abs(p.y - padY) < 24 && Math.abs(p.x - padX) < padW / 2 + p.r;
        if (!hit) {
          for (const s of this.spells) {
            if (dist(s.x, s.y, p.x, p.y) < s.r + p.r) {
              hit = true;
              break;
            }
          }
        }
        if (hit) {
          this._applyPowerup(p);
          this.powerups.splice(i, 1);
        }
      }
    }

    _applyPowerup(p) {
      global.TT.SFX.power();
      this.particles.burst(p.x, p.y, p.color, 18, 150, 0.5, 4);
      this._toast(`${p.emoji} ${p.name}!`);
      switch (p.apply) {
        case "multi":
          this.effects.multiShots += 3;
          break;
        case "giant":
          this.effects.giant = p.duration;
          break;
        case "freeze":
          this.effects.freeze = p.duration;
          break;
        case "repair":
          this.wallHp = clamp(this.wallHp + 18, 0, global.TT.CFG.WALL_MAX);
          this.particles.textPop(this.w / 2, this.h * 0.9, "+18 WALL", "#5dff9a");
          break;
        case "haste":
          this.effects.haste = p.duration;
          break;
        case "magnet":
          this.effects.magnet = p.duration;
          break;
      }
      if (this.mode === "endless") this.endlessScore += 25;
    }

    _endRound(reason) {
      if (this.over) return;
      this.over = true;
      this.spells = [];

      if (this.mode === "endless") {
        // Survival score: time + score
        const finalScore = this.endlessScore + Math.floor(this.time) * 3 + this.maxCombo * 5;
        this.endlessScore = finalScore;
        global.TT.SFX.lose();
        this.particles.confetti(this.w, this.h);
        if (this.hooks.onEndlessOver) {
          this.hooks.onEndlessOver({ score: finalScore, wave: this.endlessWave, maxCombo: this.maxCombo, time: this.time });
        }
        return;
      }

      // Duel: wall break = attacker wins; timeout = defender wins if wall > 0
      let attackerWins = reason === "wall";
      if (reason === "timeout") attackerWins = false;

      if (this.attackerIsA) {
        if (attackerWins) this.scoreA++;
        else this.scoreB++;
      } else {
        if (attackerWins) this.scoreB++;
        else this.scoreA++;
      }

      const need = Math.ceil(global.TT.CFG.BEST_OF / 2);
      const matchOver = this.scoreA >= need || this.scoreB >= need;

      if (attackerWins) {
        global.TT.SFX.win();
        this.particles.confetti(this.w, this.h);
      } else {
        global.TT.SFX.perfect();
      }

      if (this.hooks.onRoundEnd) {
        this.hooks.onRoundEnd({
          reason,
          attackerWins,
          attackerIsA: this.attackerIsA,
          scoreA: this.scoreA,
          scoreB: this.scoreB,
          matchOver,
          winner: matchOver ? (this.scoreA > this.scoreB ? "A" : "B") : null,
          round: this.round,
        });
      }
    }

    nextRound() {
      this.round++;
      this.attackerIsA = !this.attackerIsA;
      // Swap who is "wizard" vs "defender" roles — for hotseat, same picks but roles flip
      // Actually brief says role swaps: so attacker/defender players swap. Characters stay assigned to roles or swap?
      // "Role swaps per round" → the players swap jobs; typically they keep their chosen class for their role type.
      // Simpler viral UX: same wizard & defender kits swap who controls them.
      this._resetRound();
      this.over = false;
      this._banner(this.attackerIsA ? `ROUND ${this.round} — P1 ATTACKS` : `ROUND ${this.round} — P2 ATTACKS`, 1.5);
      this._emitHud();
    }

    // —— DRAW ——
    draw() {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      ctx.save();

      // Screen shake
      if (this.shake > 0) {
        const m = this.shake * 10;
        ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
      }

      // Trailer void — deep violet
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#1a0838");
      bg.addColorStop(0.4, "#0c0218");
      bg.addColorStop(0.75, "#120628");
      bg.addColorStop(1, "#1a1020");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Soft magenta vignette
      const vig = ctx.createRadialGradient(w / 2, h * 0.35, w * 0.1, w / 2, h * 0.5, h * 0.7);
      vig.addColorStop(0, "rgba(180, 40, 200, 0.08)");
      vig.addColorStop(1, "transparent");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      // Stars / sparkles
      for (const s of this.stars) {
        const tw = 0.5 + 0.5 * Math.sin(this.time * 2 + s.tw);
        ctx.globalAlpha = s.a * tw;
        ctx.fillStyle = s.tw % 2 > 1 ? "#ff9ae8" : "#fff";
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Arena rails + cyan orbit rings
      this._drawArena(ctx, w, h);

      // Wizard portrait zone
      this._drawWizardZone(ctx, w, h);

      // Powerups
      for (const p of this.powerups) this._drawPowerup(ctx, p);

      // Guards
      for (const g of this.guards) this._drawGuard(ctx, g);

      // Spells
      for (const s of this.spells) this._drawSpell(ctx, s);

      // No aim-line preview — defender must react to the spell, not a drawn path

      // Paddle
      this._drawPaddle(ctx, w, h);

      // Castle
      this._drawCastle(ctx, w, h);

      // Particles
      this.particles.draw(ctx);

      // Flash
      if (this.fieldFlash > 0) {
        ctx.fillStyle = `rgba(255,80,80,${this.fieldFlash * 0.35})`;
        ctx.fillRect(0, 0, w, h);
      }

      // Cooldown gem
      this._drawCooldown(ctx, w, h);

      // Effect chips
      this._drawEffectChips(ctx, w, h);

      ctx.restore();
    }

    _drawArena(ctx, w, h) {
      const top = h * global.TT.CFG.FIELD_TOP;
      const bot = h * global.TT.CFG.FIELD_BOT;
      const midY = (top + bot) * 0.5;

      // Soft playfield
      const g = ctx.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, "rgba(160, 40, 200, 0.06)");
      g.addColorStop(0.5, "rgba(40, 10, 80, 0.1)");
      g.addColorStop(1, "rgba(240, 160, 40, 0.06)");
      ctx.fillStyle = g;
      ctx.fillRect(6, top, w - 12, bot - top);

      // Trailer cyan orbit rings (mid-field air-hockey rings)
      ctx.save();
      ctx.translate(w / 2, midY);
      const pulse = 1 + Math.sin(this.time * 1.8) * 0.03;
      for (let i = 0; i < 3; i++) {
        const rw = (w * 0.38 + i * 10) * pulse;
        const rh = (w * 0.1 + i * 4) * pulse;
        ctx.beginPath();
        ctx.ellipse(0, i * 3, rw, rh, 0, 0, Math.PI * 2);
        ctx.strokeStyle = i === 0 ? "rgba(94, 240, 255, 0.55)" : "rgba(160, 140, 255, 0.28)";
        ctx.lineWidth = i === 0 ? 3.5 : 2;
        ctx.shadowColor = "#5ef0ff";
        ctx.shadowBlur = i === 0 ? 16 : 6;
        ctx.stroke();
      }
      ctx.restore();

      // Magenta-to-cyan side rails
      const rail = ctx.createLinearGradient(0, top, 0, bot);
      rail.addColorStop(0, "#ff2ecf");
      rail.addColorStop(0.5, "#5ef0ff");
      rail.addColorStop(1, "#f0c14a");
      ctx.strokeStyle = rail;
      ctx.lineWidth = 3;
      ctx.shadowColor = "#ff2ecf";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(8, top);
      ctx.lineTo(8, bot);
      ctx.moveTo(w - 8, top);
      ctx.lineTo(w - 8, bot);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    _drawWizardZone(ctx, w, h) {
      const zh = h * global.TT.CFG.WIZARD_ZONE;
      const wiz = this.wizard;
      if (!wiz) return;

      // Magenta hood glow (trailer)
      const grad = ctx.createRadialGradient(w / 2, zh * 0.55, 4, w / 2, zh * 0.55, w * 0.4);
      grad.addColorStop(0, "rgba(196, 77, 255, 0.35)");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, zh + 8);

      const cx = w / 2;
      const cy = Math.max(22, zh * 0.48);
      const sc = Math.min(0.62, zh / 78);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(sc, sc);

      // Hooded robe — trailer purple
      const robe = ctx.createLinearGradient(-30, -20, 30, 40);
      robe.addColorStop(0, "#e070ff");
      robe.addColorStop(0.5, "#b44dff");
      robe.addColorStop(1, "#6a18a8");
      ctx.fillStyle = robe;
      ctx.beginPath();
      ctx.moveTo(0, -28);
      ctx.quadraticCurveTo(38, 0, 28, 42);
      ctx.lineTo(-28, 42);
      ctx.quadraticCurveTo(-38, 0, 0, -28);
      ctx.fill();

      // Hood cowl
      ctx.fillStyle = "#9a3dff";
      ctx.beginPath();
      ctx.ellipse(0, -22, 22, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5a1488";
      ctx.beginPath();
      ctx.ellipse(0, -16, 14, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      // Face shadow
      ctx.fillStyle = "#2a0a40";
      ctx.beginPath();
      ctx.ellipse(0, -14, 9, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      // Eyes glint
      ctx.fillStyle = "rgba(255,200,255,0.7)";
      ctx.beginPath();
      ctx.arc(-3.5, -14, 1.2, 0, Math.PI * 2);
      ctx.arc(3.5, -14, 1.2, 0, Math.PI * 2);
      ctx.fill();

      // Hands casting
      ctx.fillStyle = "#3a1848";
      ctx.beginPath();
      ctx.ellipse(-22, 8, 7, 5, -0.4, 0, Math.PI * 2);
      ctx.ellipse(22, 6, 7, 5, 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Hovering charge orb when ready
      if (this.cd <= 0) {
        const og = ctx.createRadialGradient(0, 18, 1, 0, 18, 12);
        og.addColorStop(0, "#ffe566");
        og.addColorStop(0.4, wiz.color || "#ff5a1f");
        og.addColorStop(1, "transparent");
        ctx.fillStyle = og;
        ctx.beginPath();
        ctx.arc(0, 18, 12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.font = "700 9px Outfit, sans-serif";
      ctx.fillStyle = "#ff6ae0";
      ctx.textAlign = "center";
      ctx.globalAlpha = 0.8;
      ctx.fillText(this.cd > 0 ? "…" : "FLICK", w / 2, zh - 1);
      ctx.globalAlpha = 1;
    }

    _drawSpell(ctx, s) {
      ctx.save();
      ctx.translate(s.x, s.y);
      const ang = Math.atan2(s.vy, s.vx);
      const isFrost = s.special === "slow" || (s.color && s.color.indexOf("6ecb") >= 0);
      const isFire =
        s.special === "burn" ||
        s.special === "heavy" ||
        s.special === "meteor" ||
        !isFrost;

      // Trailer flame trail for fire orbs
      if (isFire && !s.decoy) {
        ctx.save();
        ctx.rotate(ang + Math.PI);
        const trail = ctx.createLinearGradient(0, 0, s.r * 4.5, 0);
        trail.addColorStop(0, "rgba(255, 230, 80, 0.9)");
        trail.addColorStop(0.35, "rgba(255, 80, 20, 0.75)");
        trail.addColorStop(1, "transparent");
        ctx.fillStyle = trail;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(s.r * 1.2, -s.r * 1.1, s.r * 4, -s.r * 0.2);
        ctx.quadraticCurveTo(s.r * 1.2, s.r * 1.1, 0, 0);
        ctx.fill();
        ctx.restore();
      }

      ctx.shadowColor = isFrost ? "#9ad8ff" : s.color || "#ff5a1f";
      ctx.shadowBlur = 18;

      if (s.special === "laser" || s.decoy) {
        ctx.rotate(ang);
        const grd = ctx.createLinearGradient(-s.r * 3, 0, s.r * 2, 0);
        grd.addColorStop(0, "transparent");
        grd.addColorStop(0.5, s.color);
        grd.addColorStop(1, "#fff");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(0, 0, s.r * 2.8, s.r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (isFrost) {
        // Soft white energy sphere (trailer ice/puck)
        const g = ctx.createRadialGradient(-s.r * 0.25, -s.r * 0.3, 1, 0, 0, s.r * 1.15);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.45, "#e8f4ff");
        g.addColorStop(0.85, "#9ad8ff");
        g.addColorStop(1, "rgba(120, 180, 255, 0.2)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, s.r * 1.1, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Glass fireball — purple shell, hot core (trailer)
        const shell = ctx.createRadialGradient(-s.r * 0.3, -s.r * 0.35, 1, 0, 0, s.r * 1.15);
        shell.addColorStop(0, "#fff6a0");
        shell.addColorStop(0.25, s.color2 || "#ff9a40");
        shell.addColorStop(0.55, s.color || "#ff4a18");
        shell.addColorStop(0.82, "#a020c0");
        shell.addColorStop(1, "rgba(80, 0, 100, 0.35)");
        ctx.fillStyle = shell;
        ctx.beginPath();
        ctx.arc(0, 0, s.r * 1.05, 0, Math.PI * 2);
        ctx.fill();
        // Specular
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.beginPath();
        ctx.ellipse(-s.r * 0.28, -s.r * 0.3, s.r * 0.28, s.r * 0.18, -0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      if (s.decoy) {
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = "#ff6ae0";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(0, 0, s.r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawPaddle(ctx, w, h) {
      const y = h * global.TT.CFG.PADDLE_Y_RATIO;
      const pw = this._paddleWidth();
      const x = this.paddleX * w;
      const ph = Math.max(global.TT.CFG.PADDLE_H, 14);
      const def = this.defender;
      if (!def) return;

      ctx.save();
      // Trailer gold-silver shield paddle
      ctx.shadowColor = "#f0c14a";
      ctx.shadowBlur = 20;

      const shieldH = Math.max(ph + 10, 22);
      const shieldW = pw;

      // Outer gold rim
      const rim = ctx.createLinearGradient(x - shieldW / 2, y, x + shieldW / 2, y);
      rim.addColorStop(0, "#c49220");
      rim.addColorStop(0.5, "#ffe08a");
      rim.addColorStop(1, "#c49220");
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.moveTo(x, y - shieldH / 2);
      ctx.quadraticCurveTo(x + shieldW / 2, y - shieldH / 4, x + shieldW / 2, y + shieldH / 6);
      ctx.quadraticCurveTo(x, y + shieldH / 2 + 4, x - shieldW / 2, y + shieldH / 6);
      ctx.quadraticCurveTo(x - shieldW / 2, y - shieldH / 4, x, y - shieldH / 2);
      ctx.fill();

      // Inner steel face
      const face = ctx.createLinearGradient(x - shieldW / 3, y - 8, x + shieldW / 3, y + 10);
      face.addColorStop(0, "#f4f0ea");
      face.addColorStop(0.5, "#c8c0b4");
      face.addColorStop(1, "#8a8070");
      ctx.fillStyle = face;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      const iw = shieldW * 0.78;
      const ih = shieldH * 0.72;
      ctx.moveTo(x, y - ih / 2);
      ctx.quadraticCurveTo(x + iw / 2, y - ih / 4, x + iw / 2, y + ih / 8);
      ctx.quadraticCurveTo(x, y + ih / 2 + 2, x - iw / 2, y + ih / 8);
      ctx.quadraticCurveTo(x - iw / 2, y - ih / 4, x, y - ih / 2);
      ctx.fill();

      // Cyan edge glint (trailer)
      ctx.strokeStyle = "rgba(94, 240, 255, 0.45)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = `${Math.min(14, shieldH * 0.55)}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(def.emoji || "🛡️", x, y);

      ctx.fillStyle = "rgba(255, 224, 138, 0.45)";
      ctx.font = "700 8px Outfit, sans-serif";
      ctx.fillText(`${Math.round(this.paddleScale * 100)}%`, x, y + shieldH / 2 + 8);

      if (this.effects.slowPaddle > 0) {
        ctx.fillStyle = "rgba(154, 216, 255, 0.3)";
        ctx.beginPath();
        ctx.arc(x, y, shieldW * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    _drawCastle(ctx, w, h) {
      const y = h * global.TT.CFG.CASTLE_Y_RATIO;
      const hp = this.wallHp / global.TT.CFG.WALL_MAX;
      const wallH = h - y + 6;

      // Warm lit stone base (trailer)
      const g = ctx.createLinearGradient(0, y - 8, 0, h);
      g.addColorStop(0, hp > 0.35 ? "#e8d4b0" : "#8a6060");
      g.addColorStop(0.4, hp > 0.35 ? "#c4a888" : "#5a3840");
      g.addColorStop(1, "#1a1020");
      ctx.fillStyle = g;
      ctx.fillRect(0, y, w, wallH);

      // Battlements
      ctx.fillStyle = hp > 0.35 ? "#d8c4a0" : "#704850";
      const bw = 16;
      for (let bx = 4; bx < w; bx += bw + 5) {
        ctx.fillRect(bx, y - 7, bw, 8);
      }

      // Side towers
      const towerW = Math.min(48, w * 0.14);
      const towerH = Math.min(36, wallH + 18);
      const drawTower = (tx) => {
        const tg = ctx.createLinearGradient(tx, y - 14, tx + towerW, y + towerH);
        tg.addColorStop(0, "#f0e0c0");
        tg.addColorStop(1, "#a89070");
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.roundRect(tx, y - 14, towerW, towerH, 4);
        ctx.fill();
        // Gold window glow
        ctx.fillStyle = "rgba(255, 200, 60, 0.55)";
        ctx.fillRect(tx + towerW * 0.35, y - 2, towerW * 0.3, 8);
      };
      drawTower(6);
      drawTower(w - towerW - 6);

      // Central keep + gold shield emblem
      const keepW = Math.min(70, w * 0.22);
      const keepX = w / 2 - keepW / 2;
      ctx.fillStyle = "#dcc8a8";
      ctx.beginPath();
      ctx.roundRect(keepX, y - 20, keepW, wallH + 16, 6);
      ctx.fill();
      // Roof
      ctx.fillStyle = "#8a4038";
      ctx.beginPath();
      ctx.moveTo(keepX - 4, y - 18);
      ctx.lineTo(w / 2, y - 34);
      ctx.lineTo(keepX + keepW + 4, y - 18);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f0c14a";
      ctx.beginPath();
      ctx.arc(w / 2, y - 34, 3, 0, Math.PI * 2);
      ctx.fill();

      // Shield emblem on keep
      const sx = w / 2;
      const sy = y + 2;
      ctx.shadowColor = "#f0c14a";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#e8c040";
      ctx.beginPath();
      ctx.moveTo(sx, sy - 10);
      ctx.lineTo(sx + 14, sy - 4);
      ctx.lineTo(sx + 12, sy + 10);
      ctx.quadraticCurveTo(sx, sy + 16, sx - 12, sy + 10);
      ctx.lineTo(sx - 14, sy - 4);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#f4f0e8";
      ctx.beginPath();
      ctx.moveTo(sx, sy - 6);
      ctx.lineTo(sx + 8, sy - 2);
      ctx.lineTo(sx + 7, sy + 6);
      ctx.quadraticCurveTo(sx, sy + 10, sx - 7, sy + 6);
      ctx.lineTo(sx - 8, sy - 2);
      ctx.closePath();
      ctx.fill();

      if (hp < 0.55) {
        ctx.strokeStyle = `rgba(40, 10, 20, ${0.45 + (1 - hp) * 0.4})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(w * 0.35, y + 2);
        ctx.lineTo(w * 0.38, y + 12);
        ctx.stroke();
      }
    }

    _drawPowerup(ctx, p) {
      ctx.save();
      ctx.translate(p.x, p.y + Math.sin(p.bob) * 3);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 16;
      ctx.fillStyle = "rgba(10,6,24,0.85)";
      ctx.beginPath();
      ctx.arc(0, 0, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = "16px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.emoji, 0, 1);
      ctx.restore();
    }

    _drawGuard(ctx, g) {
      ctx.save();
      ctx.shadowColor = "#ffd56a";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#c4a24a";
      ctx.beginPath();
      ctx.roundRect(g.x - g.w / 2, g.y - g.h / 2, g.w, g.h, 4);
      ctx.fill();
      ctx.fillStyle = "#1a1020";
      ctx.font = "10px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🛡️", g.x, g.y);
      ctx.restore();
    }

    _drawCooldown(ctx, w, h) {
      const zh = h * global.TT.CFG.WIZARD_ZONE;
      const ready = this.cd <= 0;
      const cx = w - 28;
      const cy = zh * 0.5;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fill();
      if (!ready) {
        const t = clamp(1 - this.cd / (this.wizard.cooldown || 0.5), 0, 1);
        ctx.strokeStyle = this.wizard.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, 12, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = "#5dff9a";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawEffectChips(ctx, w, h) {
      const chips = [];
      if (this.effects.giant > 0) chips.push({ t: "🛡️", c: "#ffd56a" });
      if (this.effects.freeze > 0) chips.push({ t: "🧊", c: "#6ecbff" });
      if (this.effects.haste > 0) chips.push({ t: "💨", c: "#ffe566" });
      if (this.effects.magnet > 0) chips.push({ t: "🧲", c: "#b56bff" });
      if (this.effects.multiShots > 0) chips.push({ t: `🔱${this.effects.multiShots}`, c: "#ff6ad5" });
      if (this.effects.burn > 0) chips.push({ t: "🔥", c: "#ff6b3d" });
      if (this.defender && this.defender.special === "breath" && this.effects.breathCd <= 0) {
        chips.push({ t: "🐉 ready", c: "#ff6b3d" });
      }
      // Bottom-right edge chips — keep playfield clear
      let x = w - 10;
      const y = h - 18;
      ctx.font = "700 9px Outfit, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let i = chips.length - 1; i >= 0; i--) {
        const c = chips[i];
        const tw = ctx.measureText(c.t).width + 10;
        x -= tw;
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath();
        ctx.roundRect(x, y - 8, tw, 16, 8);
        ctx.fill();
        ctx.fillStyle = c.c;
        ctx.fillText(c.t, x + tw - 5, y);
        x -= 4;
      }
    }
  }

  // Polyfill roundRect if needed
  if (typeof CanvasRenderingContext2D !== "undefined" && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
    };
  }

  global.TT = global.TT || {};
  global.TT.Game = Game;
})(typeof window !== "undefined" ? window : globalThis);
