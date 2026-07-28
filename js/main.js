/**
 * Two Thumbs — UI, screens, leaderboards, bootstrap
 */
(function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const state = {
    mode: "duel",
    wizardId: null,
    defenderId: null,
    pendingScore: null,
    boardTab: "duel",
  };

  let game = null;
  let raf = 0;
  let last = 0;

  // —— Leaderboards (localStorage) ——
  const LB_KEY = "two_thumbs_lb_v1";

  function loadLB() {
    try {
      return JSON.parse(localStorage.getItem(LB_KEY)) || { duel: [], endless: [] };
    } catch {
      return { duel: [], endless: [] };
    }
  }

  function saveLB(data) {
    localStorage.setItem(LB_KEY, JSON.stringify(data));
  }

  function addScore(board, name, score, meta) {
    const data = loadLB();
    data[board] = data[board] || [];
    data[board].push({
      name: (name || "Hero").slice(0, 12),
      score,
      meta: meta || {},
      at: Date.now(),
    });
    data[board].sort((a, b) => b.score - a.score);
    data[board] = data[board].slice(0, 10);
    saveLB(data);
  }

  // —— Screens ——
  function showScreen(id) {
    $$(".screen").forEach((s) => s.classList.remove("active"));
    const el = document.getElementById(id);
    if (el) el.classList.add("active");
    document.body.classList.toggle("playing", id === "screen-hud");
  }

  function toast(msg) {
    const el = $("#toast");
    el.hidden = false;
    el.textContent = msg;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.hidden = true;
    }, 1200);
  }

  function banner(msg, t) {
    const el = $("#hud-banner");
    if (!msg) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.textContent = msg;
    // restart animation
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
    clearTimeout(banner._t);
    banner._t = setTimeout(() => {
      el.hidden = true;
    }, (t || 1.2) * 1000);
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
  }

  function updateHud(h) {
    if (h.mode === "endless") {
      $("#hud-round").textContent = `W${h.endlessWave}`;
      $("#hud-score").textContent = `${h.endlessScore}`;
    } else {
      $("#hud-round").textContent = `R${h.round}`;
      $("#hud-score").textContent = `${h.scoreA} — ${h.scoreB}`;
    }
    $("#hud-combo").textContent = `×${Math.max(1, h.combo)}`;
    const pct = (h.wallHp / h.wallMax) * 100;
    $("#wall-fill").style.width = `${pct}%`;
    $("#wall-hp").textContent = String(h.wallHp);
    $("#hud-hint").textContent = h.hint || "";

    // Top-right countdown (duel: remaining; endless: elapsed)
    const timerEl = $("#hud-timer");
    if (timerEl) {
      if (h.mode === "endless") {
        timerEl.textContent = formatTime(h.timeElapsed || 0);
        timerEl.classList.remove("warn", "danger");
      } else {
        const left = h.timeLeft != null ? h.timeLeft : 120;
        timerEl.textContent = formatTime(left);
        timerEl.classList.toggle("warn", left <= 30 && left > 10);
        timerEl.classList.toggle("danger", left <= 10);
      }
    }
  }

  // —— Character grids ——
  function buildWizardGrid() {
    const grid = $("#wizard-grid");
    grid.innerHTML = "";
    TT.WIZARDS.forEach((w) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "char-card";
      card.dataset.id = w.id;
      card.dataset.school = w.school;
      card.innerHTML = `
        <div class="char-emoji">${w.emoji}</div>
        <div class="char-name">${w.name}</div>
        <div class="char-tag">${w.tag}</div>
        <div class="char-desc">${w.desc}</div>
      `;
      card.addEventListener("click", () => {
        TT.SFX.ui();
        state.wizardId = w.id;
        $$(".char-card", grid).forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        $("#btn-wizard-next").disabled = false;
      });
      grid.appendChild(card);
    });
  }

  function buildDefenderGrid() {
    const grid = $("#defender-grid");
    grid.innerHTML = "";
    TT.DEFENDERS.forEach((d) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "char-card";
      card.dataset.id = d.id;
      card.dataset.school = d.school;
      card.innerHTML = `
        <div class="char-emoji">${d.emoji}</div>
        <div class="char-name">${d.name}</div>
        <div class="char-tag">${d.tag}</div>
        <div class="char-desc">${d.desc}</div>
      `;
      card.addEventListener("click", () => {
        TT.SFX.ui();
        state.defenderId = d.id;
        $$(".char-card", grid).forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        $("#btn-defender-next").disabled = false;
      });
      grid.appendChild(card);
    });
  }

  function renderBoard() {
    const data = loadLB();
    const list = data[state.boardTab] || [];
    const ol = $("#board-list");
    if (!list.length) {
      ol.innerHTML = `<li class="board-empty">No scores yet — go make history.</li>`;
      return;
    }
    ol.innerHTML = list
      .map(
        (row, i) => `
      <li>
        <span class="rank">#${i + 1}</span>
        <span class="name">${escapeHtml(row.name)}</span>
        <span class="pts">${row.score}</span>
      </li>`
      )
      .join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // —— Game lifecycle ——
  function ensureGame() {
    if (game) return game;
    const canvas = $("#game");
    game = new TT.Game(canvas, {
      onHud: updateHud,
      onToast: toast,
      onBanner: banner,
      onRoundEnd: handleRoundEnd,
      onEndlessOver: handleEndlessOver,
    });
    return game;
  }

  function startMatch() {
    const g = ensureGame();
    const wizard = TT.WIZARDS.find((w) => w.id === state.wizardId);
    const defender = TT.DEFENDERS.find((d) => d.id === state.defenderId);
    g.resize();
    g.start({ mode: state.mode, wizard, defender });
    showScreen("screen-hud");
    startLoop();
  }

  function startLoop() {
    cancelAnimationFrame(raf);
    last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (game && game.running) {
        game.update(dt);
        game.draw();
      } else if (game) {
        game.draw();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function handleRoundEnd(info) {
    const title = $("#result-title");
    const body = $("#result-body");
    const score = $("#result-score");
    const btn = $("#btn-result-next");

    if (info.matchOver) {
      const winner = info.winner === "A" ? "Player 1" : "Player 2";
      title.textContent = "Match Over!";
      body.textContent = `${winner} claims the crown. Roles swapped every round — true mastery.`;
      score.textContent = `${info.scoreA} — ${info.scoreB}`;
      btn.textContent = "Save & Menu";
      btn.dataset.phase = "match";
      state.pendingScore = {
        board: "duel",
        score: info.winner === "A" ? info.scoreA * 100 + 50 : info.scoreB * 100 + 50,
        meta: { scoreA: info.scoreA, scoreB: info.scoreB },
      };
    } else {
      const who = info.attackerWins
        ? info.attackerIsA
          ? "Player 1 breaches the wall!"
          : "Player 2 breaches the wall!"
        : info.attackerIsA
          ? "Player 2 holds the line!"
          : "Player 1 holds the line!";
      title.textContent = `Round ${info.round} Over`;
      body.textContent =
        info.reason === "timeout"
          ? `${who} Time expired — the castle stands.`
          : `${who} Swap roles for the next round.`;
      score.textContent = `${info.scoreA} — ${info.scoreB}`;
      btn.textContent = "Swap & Fight";
      btn.dataset.phase = "round";
    }
    showScreen("screen-result");
  }

  function handleEndlessOver(info) {
    $("#result-title").textContent = "Siege Fallen";
    $("#result-body").textContent = `Wave ${info.wave} · Max combo ×${info.maxCombo} · Survived ${Math.floor(info.time)}s`;
    $("#result-score").textContent = String(info.score);
    const btn = $("#btn-result-next");
    btn.textContent = "Enter Hall of Fame";
    btn.dataset.phase = "endless";
    state.pendingScore = {
      board: "endless",
      score: info.score,
      meta: { wave: info.wave, combo: info.maxCombo },
    };
    showScreen("screen-result");
  }

  function quitToMenu() {
    if (game) {
      game.stop();
    }
    showScreen("screen-title");
    // keep idle vignette drawing
    if (game) {
      game.running = false;
      // draw idle title backdrop via empty-ish state
    }
  }

  // —— Idle title canvas art ——
  function drawIdle() {
    const canvas = $("#game");
    const g = ensureGame();
    g.resize();
    // Soft idle scene without match
    if (!g.wizard) g.wizard = TT.WIZARDS[0];
    if (!g.defender) g.defender = TT.DEFENDERS[0];
    g.wallHp = TT.CFG.WALL_MAX;
    g.paddleScale = 1;
    g.paddleX = 0.5 + Math.sin(performance.now() / 1000) * 0.08;
    g.spells = [];
    g.powerups = [];
    g.time = performance.now() / 1000;
    g.draw();
  }

  // —— Actions ——
  function onAction(action) {
    TT.SFX.ui();
    TT.SFX.unlock();
    switch (action) {
      case "play":
        state.mode = "duel";
        state.wizardId = null;
        state.defenderId = null;
        $("#wizard-title").textContent = "Pick your Wizard";
        $("#wizard-sub").textContent = "Top player — choose your school of magic";
        $("#btn-wizard-next").disabled = true;
        buildWizardGrid();
        showScreen("screen-wizard");
        break;
      case "endless":
        state.mode = "endless";
        state.wizardId = null;
        state.defenderId = null;
        $("#wizard-title").textContent = "Pick Siege Wizard";
        $("#wizard-sub").textContent = "You'll cast AND defend — both thumbs";
        $("#btn-wizard-next").disabled = true;
        buildWizardGrid();
        showScreen("screen-wizard");
        break;
      case "tutorial":
        showScreen("screen-tutorial");
        break;
      case "leaderboard":
        state.boardTab = "duel";
        $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.board === "duel"));
        renderBoard();
        showScreen("screen-leaderboard");
        break;
      case "back-title":
        quitToMenu();
        break;
      case "back-wizard":
        showScreen("screen-wizard");
        break;
      case "wizard-confirm":
        if (!state.wizardId) return;
        $("#defender-title").textContent =
          state.mode === "endless" ? "Pick your Defender" : "Pick your Defender";
        $("#defender-sub").textContent =
          state.mode === "endless"
            ? "Your shield identity for the endless siege"
            : "Bottom player — protect the castle";
        $("#btn-defender-next").disabled = true;
        $("#btn-defender-next").textContent =
          state.mode === "endless" ? "Begin Siege" : "Begin Duel";
        buildDefenderGrid();
        showScreen("screen-defender");
        break;
      case "defender-confirm":
        if (!state.defenderId) return;
        startMatch();
        break;
      case "pause":
        if (game && game.running && !game.over) {
          game.pause();
          showScreen("screen-pause");
        }
        break;
      case "resume":
        if (game) game.resume();
        showScreen("screen-hud");
        break;
      case "quit-menu":
        quitToMenu();
        break;
      case "result-next": {
        const phase = $("#btn-result-next").dataset.phase;
        if (phase === "round") {
          game.nextRound();
          showScreen("screen-hud");
        } else if (phase === "match" || phase === "endless") {
          if (state.pendingScore) {
            $("#name-score-line").textContent = `Score: ${state.pendingScore.score}`;
            $("#name-input").value = "";
            showScreen("screen-name");
          } else {
            quitToMenu();
          }
        } else {
          quitToMenu();
        }
        break;
      }
      case "save-score": {
        const name = $("#name-input").value.trim() || "Hero";
        if (state.pendingScore) {
          addScore(state.pendingScore.board, name, state.pendingScore.score, state.pendingScore.meta);
          state.pendingScore = null;
          toast("🏆 Saved!");
        }
        quitToMenu();
        break;
      }
      case "skip-score":
        state.pendingScore = null;
        quitToMenu();
        break;
      default:
        break;
    }
  }

  // —— Bootstrap ——
  function init() {
    buildWizardGrid();
    buildDefenderGrid();

    // Delegate UI clicks
    $("#ui").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      e.preventDefault();
      onAction(btn.dataset.action);
    });

    $$(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        state.boardTab = tab.dataset.board;
        $$(".tab").forEach((t) => t.classList.toggle("active", t === tab));
        renderBoard();
        TT.SFX.ui();
      });
    });

    // Prevent pull-to-refresh / scroll
    document.addEventListener(
      "touchmove",
      (e) => {
        if (document.body.classList.contains("playing")) e.preventDefault();
      },
      { passive: false }
    );

    window.addEventListener("resize", () => {
      if (game) game.resize();
      else drawIdle();
    });

    window.addEventListener("orientationchange", () => {
      setTimeout(() => {
        if (game) game.resize();
      }, 200);
    });

    // Keyboard helpers (desktop)
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if ($("#screen-hud").classList.contains("active")) onAction("pause");
        else if ($("#screen-pause").classList.contains("active")) onAction("resume");
      }
      // Desktop paddle with arrows / mouse already via pointer
      if (!game || !game.running || game.paused) return;
      if (e.key === "ArrowLeft" || e.key === "a") {
        game.paddleTargetX = Math.max(0.05, game.paddleX - 0.06);
      }
      if (e.key === "ArrowRight" || e.key === "d") {
        game.paddleTargetX = Math.min(0.95, game.paddleX + 0.06);
      }
      if (e.key === " " || e.key === "Spacebar") {
        // Launch straight shot
        if (game.cd <= 0) {
          game._spawnSpell(game.w / 2, game.h * TT.CFG.WIZARD_ZONE * 0.85, Math.PI / 2, 1, false);
          if (game.wizard.special === "decoy") {
            game._spawnSpell(game.w / 2 + 40, game.h * TT.CFG.WIZARD_ZONE * 0.85, Math.PI / 2 + 0.2, 0.9, true);
          }
          game.cd = game.wizard.cooldown;
          TT.SFX.launch();
        }
      }
    });

    ensureGame();
    drawIdle();
    startLoop();
    // Idle animation: gently move paddle
    setInterval(() => {
      if (game && !game.running && $("#screen-title").classList.contains("active")) {
        drawIdle();
      }
    }, 32);

    console.log(
      "%c Two Thumbs %c Wizard Duel · MIT ",
      "background:#7b3cff;color:#fff;font-weight:bold;padding:4px 8px;border-radius:4px 0 0 4px",
      "background:#ffd56a;color:#1a0a08;font-weight:bold;padding:4px 8px;border-radius:0 4px 4px 0"
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
