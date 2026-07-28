/**
 * Two Thumbs — juicy particle system
 */
(function (global) {
  "use strict";

  class ParticleSystem {
    constructor() {
      this.list = [];
    }

    clear() {
      this.list.length = 0;
    }

    burst(x, y, color, n, speed, life, size) {
      n = n || 12;
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
        const s = (speed || 140) * (0.4 + Math.random() * 0.8);
        this.list.push({
          x, y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: life || 0.5 + Math.random() * 0.4,
          max: life || 0.6,
          r: (size || 3) * (0.5 + Math.random()),
          color: color || "#fff",
          drag: 0.96,
          g: 40,
          type: "dot",
        });
      }
    }

    trail(x, y, color, r) {
      this.list.push({
        x, y,
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
        life: 0.25 + Math.random() * 0.2,
        max: 0.4,
        r: r || 4,
        color,
        drag: 0.9,
        g: 0,
        type: "glow",
      });
    }

    spark(x, y, color) {
      this.list.push({
        x, y,
        vx: (Math.random() - 0.5) * 200,
        vy: -80 - Math.random() * 160,
        life: 0.4 + Math.random() * 0.3,
        max: 0.6,
        r: 2 + Math.random() * 2,
        color,
        drag: 0.98,
        g: 280,
        type: "dot",
      });
    }

    textPop(x, y, text, color) {
      this.list.push({
        x, y,
        vx: 0,
        vy: -50,
        life: 0.9,
        max: 0.9,
        r: 0,
        color: color || "#ffd56a",
        drag: 1,
        g: 0,
        type: "text",
        text,
      });
    }

    confetti(w, h) {
      const colors = ["#ff6b3d", "#6ecbff", "#b56bff", "#ffe566", "#5dff9a", "#ff6ad5", "#ffd56a"];
      for (let i = 0; i < 60; i++) {
        this.list.push({
          x: Math.random() * w,
          y: -20 - Math.random() * 80,
          vx: (Math.random() - 0.5) * 80,
          vy: 80 + Math.random() * 120,
          life: 1.5 + Math.random(),
          max: 2,
          r: 3 + Math.random() * 4,
          color: colors[i % colors.length],
          drag: 0.99,
          g: 60,
          type: "confetti",
          rot: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 8,
        });
      }
    }

    update(dt) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const p = this.list[i];
        p.life -= dt;
        if (p.life <= 0) {
          this.list.splice(i, 1);
          continue;
        }
        p.vx *= p.drag;
        p.vy = p.vy * p.drag + p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.spin) p.rot += p.spin * dt;
      }
    }

    draw(ctx) {
      for (const p of this.list) {
        const a = Math.max(0, p.life / p.max);
        ctx.save();
        ctx.globalAlpha = a;
        if (p.type === "text") {
          ctx.font = "bold 18px Outfit, sans-serif";
          ctx.fillStyle = p.color;
          ctx.textAlign = "center";
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 12;
          ctx.fillText(p.text, p.x, p.y);
        } else if (p.type === "glow") {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2);
          g.addColorStop(0, p.color);
          g.addColorStop(1, "transparent");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.type === "confetti") {
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot || 0);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
        } else {
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  global.TT = global.TT || {};
  global.TT.ParticleSystem = ParticleSystem;
})(typeof window !== "undefined" ? window : globalThis);
