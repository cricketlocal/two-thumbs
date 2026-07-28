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
      this.cd = 0.4;
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
        this.swipe = { id: p.id, x0: p.x, y0: p.y, x: p.x, y: p.y, t0: performance.now() };
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
        this.swipe.x = p.x;
        this.swipe.y = p.y;
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
      const dx = swipe.x - swipe.x0;
      const dy = swipe.y - swipe.y0;
      const dt = Math.max(16, performance.now() - swipe.t0);
      const len = Math.hypot(dx, dy);
      if (len < 18) return;

      // Prefer downward / toward field; invert if player swipes up from top
      let vx = dx / (dt / 1000);
      let vy = dy / (dt / 1000);
      // Normalize toward field (positive y = down)
      if (vy < 40) vy = Math.abs(vy) + 80;
      const speed = Math.hypot(vx, vy);
      const power = clamp(speed / 900, 0.45, 1.65);
      const ang = Math.atan2(vy, vx);
      // Limit extreme side angles
      const maxSide = Math.PI * 0.42;
      const mid = Math.PI / 2;
      const clamped = mid + clamp(ang - mid, -maxSide, maxSide);

      const count = 1 + (this.effects.multiShots > 0 ? 2 : 0);
      if (this.effects.multiShots > 0) this.effects.multiShots--;

      for (let i = 0; i < count; i++) {
        const spread = count > 1 ? (i - 1) * 0.18 : 0;
        this._spawnSpell(swipe.x0, this.h * global.TT.CFG.WIZARD_ZONE * 0.85, clamped + spread, power, false);
      }

      // Shade decoy
      if (this.wizard.special === "decoy") {
        this._spawnSpell(swipe.x0 + (Math.random() > 0.5 ? 30 : -30), this.h * global.TT.CFG.WIZARD_ZONE * 0.85, clamped + (Math.random() - 0.5) * 0.5, power * 0.9, true);
      }

      const haste = this.effects.haste > 0 ? 0.55 : 1;
      this.cd = this.wizard.cooldown * haste;
      global.TT.SFX.swipe();
      global.TT.SFX.launch();
      this.particles.burst(swipe.x0, this.h * global.TT.CFG.WIZARD_ZONE * 0.85, this.wizard.color, 10, 120, 0.35, 3);
      if (this.hintsLeft > 0) this.hintsLeft--;
    }

    _spawnSpell(x, y, angle, power, decoy) {
      const wiz = this.wizard;
      const base = 220 * wiz.speed * power * (this.mode === "endless" ? 1 + this.endlessWave * 0.03 : 1);
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
          hint: this._hintText(),
        });
      }
    }

    _hintText() {
      if (this.hintsLeft <= 0) return "";
      if (this.mode === "endless") return "Swipe spells from the top · Drag shield at the bottom";
      return this.attackerIsA
        ? "P1 attack (top swipe) · P2 defend (bottom drag)"
        : "P2 attack (top swipe) · P1 defend (bottom drag)";
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

      // Background
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#12082a");
      bg.addColorStop(0.45, "#0a0618");
      bg.addColorStop(1, "#1a0a14");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Stars
      for (const s of this.stars) {
        const tw = 0.5 + 0.5 * Math.sin(this.time * 2 + s.tw);
        ctx.globalAlpha = s.a * tw;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Arena rails
      this._drawArena(ctx, w, h);

      // Wizard portrait zone
      this._drawWizardZone(ctx, w, h);

      // Powerups
      for (const p of this.powerups) this._drawPowerup(ctx, p);

      // Guards
      for (const g of this.guards) this._drawGuard(ctx, g);

      // Spells
      for (const s of this.spells) this._drawSpell(ctx, s);

      // Swipe aim line
      if (this.swipe) this._drawSwipe(ctx, this.swipe);

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

      // Playfield glow
      const g = ctx.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, "rgba(100,60,200,0.08)");
      g.addColorStop(0.5, "rgba(40,20,80,0.12)");
      g.addColorStop(1, "rgba(200,60,80,0.08)");
      ctx.fillStyle = g;
      ctx.fillRect(8, top, w - 16, bot - top);

      // Side rails
      const rail = ctx.createLinearGradient(0, top, 0, bot);
      rail.addColorStop(0, "#b56bff");
      rail.addColorStop(0.5, "#6ecbff");
      rail.addColorStop(1, "#ff6b3d");
      ctx.strokeStyle = rail;
      ctx.lineWidth = 4;
      ctx.shadowColor = "#b56bff";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(10, top);
      ctx.lineTo(10, bot);
      ctx.moveTo(w - 10, top);
      ctx.lineTo(w - 10, bot);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Center line dashes
      ctx.setLineDash([6, 10]);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w / 2, top + 8);
      ctx.lineTo(w / 2, bot - 8);
      ctx.stroke();
      ctx.setLineDash([]);

      // Zone labels
      ctx.font = "700 10px Outfit, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.textAlign = "center";
      ctx.fillText("SPELLFIELD · REBOUNDS", w / 2, top + 16);
    }

    _drawWizardZone(ctx, w, h) {
      const zh = h * global.TT.CFG.WIZARD_ZONE;
      const wiz = this.wizard;
      if (!wiz) return;

      const grad = ctx.createRadialGradient(w / 2, zh * 0.55, 10, w / 2, zh * 0.55, w * 0.45);
      grad.addColorStop(0, wiz.color + "55");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, zh + 20);

      // Wizard figure
      const cx = w / 2;
      const cy = zh * 0.48;
      ctx.save();
      ctx.translate(cx, cy);
      // Aura
      ctx.beginPath();
      ctx.arc(0, 0, 36 + Math.sin(this.time * 3) * 3, 0, Math.PI * 2);
      ctx.fillStyle = wiz.color + "33";
      ctx.fill();
      // Body cloak
      ctx.fillStyle = wiz.color;
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.quadraticCurveTo(28, 10, 18, 34);
      ctx.lineTo(-18, 34);
      ctx.quadraticCurveTo(-28, 10, 0, -22);
      ctx.fill();
      ctx.fillStyle = wiz.color2;
      ctx.beginPath();
      ctx.arc(0, -18, 14, 0, Math.PI * 2);
      ctx.fill();
      // Hat
      ctx.fillStyle = wiz.color;
      ctx.beginPath();
      ctx.moveTo(-16, -22);
      ctx.lineTo(0, -48);
      ctx.lineTo(16, -22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = wiz.color2;
      ctx.fillRect(-18, -24, 36, 5);
      // Staff
      ctx.strokeStyle = "#e8d5a8";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(22, 8);
      ctx.lineTo(34, -20);
      ctx.stroke();
      ctx.fillStyle = wiz.color2;
      ctx.shadowColor = wiz.color;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(34, -24, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.font = "800 13px Cinzel, serif";
      ctx.fillStyle = wiz.color2;
      ctx.textAlign = "center";
      ctx.shadowColor = wiz.color;
      ctx.shadowBlur = 10;
      ctx.fillText(wiz.name.toUpperCase(), w / 2, zh * 0.92);
      ctx.shadowBlur = 0;

      ctx.font = "600 10px Outfit, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillText("SWIPE TO CAST", w / 2, zh * 0.92 + 14);
    }

    _drawSpell(ctx, s) {
      ctx.save();
      ctx.translate(s.x, s.y);
      const ang = Math.atan2(s.vy, s.vx);
      ctx.rotate(ang);

      if (s.special === "laser" || s.decoy) {
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 16;
        const grd = ctx.createLinearGradient(-s.r * 3, 0, s.r * 2, 0);
        grd.addColorStop(0, "transparent");
        grd.addColorStop(0.5, s.color);
        grd.addColorStop(1, "#fff");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(0, 0, s.r * 2.8, s.r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (s.special === "meteor" || s.special === "heavy") {
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 20;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(0, 0, s.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = s.color2;
        ctx.beginPath();
        ctx.arc(-s.r * 0.25, -s.r * 0.25, s.r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 14;
        const g = ctx.createRadialGradient(-s.r * 0.3, -s.r * 0.3, 1, 0, 0, s.r);
        g.addColorStop(0, "#fff");
        g.addColorStop(0.35, s.color2);
        g.addColorStop(1, s.color);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (s.decoy) {
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(0, 0, s.r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawSwipe(ctx, swipe) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,213,106,0.7)";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(swipe.x0, swipe.y0);
      ctx.lineTo(swipe.x, swipe.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,213,106,0.9)";
      ctx.beginPath();
      ctx.arc(swipe.x, swipe.y, 6, 0, Math.PI * 2);
      ctx.fill();
      // Power ring
      const len = Math.hypot(swipe.x - swipe.x0, swipe.y - swipe.y0);
      const power = clamp(len / 120, 0, 1);
      ctx.strokeStyle = `rgba(255,107,61,${0.4 + power * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(swipe.x0, swipe.y0, 12 + power * 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    _drawPaddle(ctx, w, h) {
      const y = h * global.TT.CFG.PADDLE_Y_RATIO;
      const pw = this._paddleWidth();
      const x = this.paddleX * w;
      const ph = global.TT.CFG.PADDLE_H;
      const def = this.defender;
      if (!def) return;

      ctx.save();
      // Glow
      ctx.shadowColor = def.color;
      ctx.shadowBlur = 18;
      const g = ctx.createLinearGradient(x - pw / 2, y, x + pw / 2, y);
      g.addColorStop(0, def.color2);
      g.addColorStop(0.5, def.color);
      g.addColorStop(1, def.color2);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x - pw / 2, y - ph / 2, pw, ph, 8);
      ctx.fill();

      // Shield emblem
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "12px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(def.emoji, x, y);

      // Scale ticks
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = "700 9px Outfit, sans-serif";
      ctx.fillText(`${Math.round(this.paddleScale * 100)}%`, x, y + ph + 10);

      // Slow tint
      if (this.effects.slowPaddle > 0) {
        ctx.fillStyle = "rgba(110,203,255,0.25)";
        ctx.beginPath();
        ctx.roundRect(x - pw / 2, y - ph / 2, pw, ph, 8);
        ctx.fill();
      }
      ctx.restore();
    }

    _drawCastle(ctx, w, h) {
      const y = h * global.TT.CFG.CASTLE_Y_RATIO;
      const hp = this.wallHp / global.TT.CFG.WALL_MAX;

      // Wall body
      const wallH = h - y + 8;
      const g = ctx.createLinearGradient(0, y, 0, h);
      g.addColorStop(0, `rgba(90,70,100,${0.5 + hp * 0.4})`);
      g.addColorStop(1, "#1a1020");
      ctx.fillStyle = g;
      ctx.fillRect(0, y, w, wallH);

      // Battlements
      ctx.fillStyle = hp > 0.3 ? "#6a5a70" : "#5a3040";
      const bw = 22;
      for (let x = 8; x < w; x += bw + 8) {
        ctx.fillRect(x, y - 10, bw, 12);
      }

      // Cracks when damaged
      if (hp < 0.7) {
        ctx.strokeStyle = `rgba(20,10,20,${0.5 + (1 - hp) * 0.4})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w * 0.3, y + 5);
        ctx.lineTo(w * 0.35, y + 25);
        ctx.lineTo(w * 0.28, y + 40);
        if (hp < 0.4) {
          ctx.moveTo(w * 0.65, y + 8);
          ctx.lineTo(w * 0.7, y + 35);
        }
        ctx.stroke();
      }

      // Gate
      ctx.fillStyle = "#2a1828";
      ctx.beginPath();
      ctx.moveTo(w / 2 - 28, h);
      ctx.lineTo(w / 2 - 28, y + 18);
      ctx.quadraticCurveTo(w / 2, y + 4, w / 2 + 28, y + 18);
      ctx.lineTo(w / 2 + 28, h);
      ctx.fill();

      // Defender name
      if (this.defender) {
        ctx.font = "700 11px Outfit, sans-serif";
        ctx.fillStyle = "rgba(255,213,106,0.7)";
        ctx.textAlign = "center";
        ctx.fillText(`${this.defender.emoji} ${this.defender.name}`, w / 2, h - 12);
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
      let x = 16;
      const y = h * global.TT.CFG.FIELD_BOT + 8;
      ctx.font = "700 11px Outfit, sans-serif";
      for (const c of chips) {
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        const tw = ctx.measureText(c.t).width + 14;
        ctx.beginPath();
        ctx.roundRect(x, y, tw, 20, 10);
        ctx.fill();
        ctx.fillStyle = c.c;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(c.t, x + 7, y + 11);
        x += tw + 6;
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
