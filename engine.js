// The badminton match itself: court, shuttle, CPU and timing. Pages wrap it in their
// own screens and colours, and hear what happens through onEvent.
window.createMatch = ({ canvas, theme, onEvent = () => {} }) => {
  const ctx = canvas.getContext("2d");
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const emit = (type, data) => onEvent(type, data);

  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const random = (lo, hi) => lo + Math.random() * (hi - lo);

  // Court units: x runs -1 to 1 across the singles court, z from the near baseline
  // (0) to the far baseline (1), y is height. Both players hit at contact height.
  const NEAR = 0.1;
  const FAR = 0.9;
  const CONTACT = 0.55;
  const NET = { z: 0.5, top: 0.36 };

  // flight/floor: how long the CPU's shots take, at the start and at their fastest.
  // perfect/good: her timing windows, in seconds either side of the perfect moment.
  // reach: the CPU's chance of missing = base + (perfect shot ? perfect : 0) + how wide * wide.
  const LEVELS = {
    easy: { flight: 1.48, floor: 0.95, smash: 0.5, perfect: 0.09, good: 0.2, reach: { base: 0.12, perfect: 0.3, wide: 0.26 } },
    normal: { flight: 1.3, floor: 0.78, smash: 1, perfect: 0.075, good: 0.17, reach: { base: 0.05, perfect: 0.24, wide: 0.24 } },
    hard: { flight: 1.08, floor: 0.6, smash: 1.6, perfect: 0.058, good: 0.13, reach: { base: 0.02, perfect: 0.11, wide: 0.1 } },
    expert: { flight: 1, floor: 0.6, smash: 2.1, perfect: 0.05, good: 0.12, reach: { base: 0.03, perfect: 0.1, wide: 0.09 } },
  };

  /* ---------- Sound ---------- */

  let audio = null;
  const settings = { sound: true, haptics: true };

  const sound = {
    start() {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      audio ||= new AudioCtx();
      audio.resume();
    },
    // The thock of a shuttle off strings: a short, filtered burst of noise.
    hit(strength) {
      if (!audio || !settings.sound) return;
      const length = 0.09;
      const buffer = audio.createBuffer(1, audio.sampleRate * length, audio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 4;
      const source = audio.createBufferSource();
      const band = audio.createBiquadFilter();
      const level = audio.createGain();
      band.type = "bandpass";
      band.frequency.value = 1800 + strength * 1600;
      band.Q.value = 1.2;
      level.gain.value = 0.35 + strength * 0.3;
      source.buffer = buffer;
      source.connect(band).connect(level).connect(audio.destination);
      source.start();
    },
    chime(up) {
      if (!audio || !settings.sound) return;
      [0, 0.09].forEach((delay, i) => {
        const at = audio.currentTime + delay;
        const osc = audio.createOscillator();
        const level = audio.createGain();
        osc.type = "sine";
        osc.frequency.value = up ? [880, 1320][i] : [440, 330][i];
        level.gain.setValueAtTime(0.0001, at);
        level.gain.exponentialRampToValueAtTime(0.08, at + 0.015);
        level.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
        osc.connect(level).connect(audio.destination);
        osc.start(at);
        osc.stop(at + 0.3);
      });
    },
  };

  const buzz = (pattern) => {
    if (settings.haptics && navigator.vibrate) navigator.vibrate(pattern);
  };

  /* ---------- Camera ---------- */

  let view = { w: 0, h: 0, dpr: 1, unit: 0, horizon: 0, base: 0 };

  const project = (x, y, z) => {
    const scale = 1 / (1 + z * 1.35);
    const ground = view.horizon + (view.base - view.horizon) * scale;
    return { x: view.w / 2 + x * view.unit * scale, y: ground - y * view.unit * scale, scale };
  };

  /* ---------- The hall, drawn once per size ---------- */

  let arena = null;
  let netLayer = null;

  const layer = () => {
    const c = document.createElement("canvas");
    c.width = Math.ceil(view.w * view.dpr);
    c.height = Math.ceil(view.h * view.dpr);
    const g = c.getContext("2d");
    g.scale(view.dpr, view.dpr);
    return { c, g };
  };

  const quad = (g, points) => {
    g.beginPath();
    points.forEach(([x, y, z], i) => {
      const p = project(x, y, z);
      if (i) g.lineTo(p.x, p.y);
      else g.moveTo(p.x, p.y);
    });
    g.closePath();
  };

  const line = (g, a, b, width) => {
    const pa = project(...a);
    const pb = project(...b);
    g.lineWidth = width * ((pa.scale + pb.scale) / 2);
    g.beginPath();
    g.moveTo(pa.x, pa.y);
    g.lineTo(pb.x, pb.y);
    g.stroke();
  };

  const drawArena = () => {
    const { c, g } = layer();
    const { w, h } = view;

    const hall = g.createLinearGradient(0, 0, 0, h);
    theme.hall.forEach((colour, i) => hall.addColorStop(i / (theme.hall.length - 1), colour));
    g.fillStyle = hall;
    g.fillRect(0, 0, w, h);

    for (let i = 0; i < 9; i++) {
      const x = (w / 8) * i;
      const glow = g.createRadialGradient(x, h * 0.07, 0, x, h * 0.07, h * 0.11);
      glow.addColorStop(0, `rgba(${theme.lights},.5)`);
      glow.addColorStop(0.08, `rgba(${theme.lights},.2)`);
      glow.addColorStop(1, `rgba(${theme.lights},0)`);
      g.fillStyle = glow;
      g.fillRect(x - h * 0.11, 0, h * 0.22, h * 0.2);
    }

    quad(g, [[-3, 0, -0.3], [3, 0, -0.3], [3, 0, 1.6], [-3, 0, 1.6]]);
    g.fillStyle = theme.floor;
    g.fill();

    quad(g, [[-1.14, 0, 0], [1.14, 0, 0], [1.14, 0, 1], [-1.14, 0, 1]]);
    const mat = g.createLinearGradient(0, project(0, 0, 1).y, 0, project(0, 0, 0).y);
    mat.addColorStop(0, theme.mat[0]);
    mat.addColorStop(1, theme.mat[1]);
    g.fillStyle = mat;
    g.fill();

    const centre = project(0, 0, 0.45);
    const pool = g.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, view.unit * 1.25);
    pool.addColorStop(0, `rgba(${theme.pool},.2)`);
    pool.addColorStop(1, `rgba(${theme.pool},0)`);
    g.fillStyle = pool;
    g.fillRect(0, 0, w, h);

    g.strokeStyle = theme.lines;
    g.lineCap = "round";
    const lw = Math.max(1.6, view.unit * 0.012);
    [-1.14, -1, 1, 1.14].forEach((x) => line(g, [x, 0, 0], [x, 0, 1], lw));
    [0, 0.06, 0.94, 1].forEach((z) => line(g, [-1.14, 0, z], [1.14, 0, z], lw));
    [0.35, 0.65].forEach((z) => line(g, [-1.14, 0, z], [1.14, 0, z], lw));
    line(g, [0, 0, 0], [0, 0, 0.35], lw);
    line(g, [0, 0, 0.65], [0, 0, 1], lw);

    const edge = g.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.8);
    edge.addColorStop(0, "rgba(0,0,0,0)");
    edge.addColorStop(1, "rgba(0,0,0,.7)");
    g.fillStyle = edge;
    g.fillRect(0, 0, w, h);
    return c;
  };

  const drawNet = () => {
    const { c, g } = layer();
    const z = NET.z;
    const left = project(-1.2, NET.top, z);
    const right = project(1.2, NET.top, z);
    const low = project(-1.2, NET.top * 0.42, z);

    g.fillStyle = "rgba(0,0,0,.4)";
    quad(g, [[-1.2, NET.top, z], [1.2, NET.top, z], [1.2, NET.top * 0.42, z], [-1.2, NET.top * 0.42, z]]);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,.13)";
    g.lineWidth = 0.8;
    const height = low.y - left.y;
    for (let x = left.x; x <= right.x; x += 5) {
      g.beginPath();
      g.moveTo(x, left.y);
      g.lineTo(x, left.y + height);
      g.stroke();
    }
    for (let y = left.y; y <= left.y + height; y += 5) {
      g.beginPath();
      g.moveTo(left.x, y);
      g.lineTo(right.x, y);
      g.stroke();
    }

    g.strokeStyle = theme.lines;
    g.lineWidth = Math.max(2, view.unit * 0.014 * left.scale);
    g.beginPath();
    g.moveTo(left.x, left.y);
    g.lineTo(right.x, right.y);
    g.stroke();
    g.strokeStyle = theme.posts;
    g.lineWidth = Math.max(2.5, view.unit * 0.018 * left.scale);
    [-1.2, 1.2].forEach((x) => {
      const top = project(x, NET.top + 0.02, z);
      const foot = project(x, 0, z);
      g.beginPath();
      g.moveTo(top.x, top.y);
      g.lineTo(foot.x, foot.y);
      g.stroke();
    });
    return c;
  };

  // A racket, drawn once. The origin is the centre of the head.
  const racketSprite = (() => {
    const size = 220;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size * 2;
    const g = c.getContext("2d");
    g.translate(size / 2, size * 0.5);

    const head = new Path2D();
    head.ellipse(0, 0, 70, 90, 0, 0, Math.PI * 2);
    g.save();
    g.clip(head);
    g.fillStyle = "rgba(255,255,255,.05)";
    g.fillRect(-80, -100, 160, 200);
    g.strokeStyle = theme.strings;
    g.lineWidth = 1.4;
    for (let x = -70; x <= 70; x += 10) {
      g.beginPath();
      g.moveTo(x, -95);
      g.lineTo(x, 95);
      g.stroke();
    }
    for (let y = -90; y <= 90; y += 10) {
      g.beginPath();
      g.moveTo(-75, y);
      g.lineTo(75, y);
      g.stroke();
    }
    g.restore();

    const frame = g.createLinearGradient(-70, -90, 70, 90);
    theme.frame.forEach((colour, i) => frame.addColorStop(i / (theme.frame.length - 1), colour));
    g.strokeStyle = frame;
    g.lineWidth = 9;
    g.stroke(head);

    g.strokeStyle = theme.shaft;
    g.lineWidth = 6;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(0, 90);
    g.lineTo(0, 205);
    g.stroke();
    g.fillStyle = theme.grip;
    g.fillRect(-9, 205, 18, 92);
    g.fillStyle = "rgba(255,255,255,.18)";
    for (let y = 210; y < 295; y += 12) g.fillRect(-9, y, 18, 3);
    return { c, size };
  })();

  /* ---------- Match state ---------- */

  const state = {
    running: false,
    paused: false,
    phase: "idle", // idle, serve, rally, point, over
    score: { you: 0, cpu: 0 },
    rules: { mode: "points", target: 21, seconds: 120, winByTwo: true },
    level: LEVELS.normal,
    clock: 0,
    golden: false,
    shot: null,
    rally: 0,
    youX: 0,
    cpuX: 0,
    cpuTarget: 0,
    swing: 0,
    cooldown: 0,
    burst: null,
    trail: [],
    timer: 0,
    server: "you",
    confetti: [],
  };

  const setPhase = (phase) => {
    state.phase = phase;
    emit("phase", phase);
  };

  const shuttleAt = (shot, s) => {
    const [x0, y0, z0] = shot.from;
    const [x1, y1, z1] = shot.to;
    return [lerp(x0, x1, s), lerp(y0, y1, s) + shot.peak * 4 * s * (1 - s), lerp(z0, z1, s)];
  };

  const launch = (by, from, to, flight, peak, extra = {}) => {
    state.shot = { by, from, to, T: flight, peak, t: 0, hit: false, ...extra };
  };

  // How quickly the CPU plays, tightening as rallies and the match go on.
  const cpuFlight = () => {
    const played = state.score.you + state.score.cpu;
    return Math.max(state.level.floor, state.level.flight - state.rally * 0.045 - Math.min(played, 20) * 0.012);
  };

  const cpuShot = (from) => {
    const played = Math.min(state.score.you + state.score.cpu, 20);
    const smashOdds = Math.min(0.34, (0.06 + state.rally * 0.03 + played * 0.012) * state.level.smash);
    const smash = Math.random() < smashOdds;
    const flight = cpuFlight() * (smash ? 0.74 : 1);
    launch("cpu", from, [random(-0.78, 0.78), CONTACT, NEAR], flight, smash ? 0.2 : random(0.85, 1.15), { smash });
    state.rally += 1;
  };

  const yourShot = (from, aim, quality) => {
    const perfect = quality === "perfect";
    const lead = Math.max(0, state.score.you - state.score.cpu);
    // Wide, hard shots are harder for the CPU to reach.
    const { reach } = state.level;
    const missChance = Math.max(0.01, reach.base + (perfect ? reach.perfect : 0.02) + Math.abs(aim) * reach.wide - Math.min(lead, 4) * 0.02);
    const reaches = Math.random() > missChance;
    state.cpuTarget = reaches ? aim : aim - Math.sign(aim || 1) * 0.42;
    launch("you", from, [aim, CONTACT, FAR], perfect ? 0.66 : 1.02, perfect ? 0.22 : 1, { reaches });
  };

  // Who has won, if anyone, under the current rules.
  const decided = () => {
    const { you, cpu } = state.score;
    const { mode, target, winByTwo } = state.rules;
    if (mode === "timer") {
      if (state.clock > 0) return null;
      if (you === cpu) return null;
      return you > cpu ? "you" : "cpu";
    }
    const high = Math.max(you, cpu);
    if (high < target) return null;
    if (!winByTwo || Math.abs(you - cpu) >= 2 || high >= target + 9) return you > cpu ? "you" : "cpu";
    return null;
  };

  const startPoint = () => {
    state.shot = null;
    state.rally = 0;
    state.trail = [];
    if (state.rules.mode === "timer" && state.clock <= 0 && !state.golden) {
      state.golden = true;
      emit("callout", { text: "Golden point", tone: "accent" });
    }
    if (state.server === "you") {
      setPhase("serve");
    } else {
      setPhase("rally");
      state.timer = 0.75;
    }
  };

  const endPoint = (winner) => {
    state.score[winner] += 1;
    state.server = winner;
    emit("score", { ...state.score, scorer: winner });
    sound.chime(winner === "you");
    if (winner === "you") emit("callout", { text: "Point", tone: "accent" });
    else emit("callout", { text: "Missed", tone: "plain" });
    buzz(winner === "you" ? [18, 40, 18] : 30);
    setPhase("point");
    state.timer = 1.2;
  };

  const finish = () => {
    const won = state.score.you > state.score.cpu;
    state.running = false;
    setPhase("over");
    if (won) {
      buzz([20, 60, 20, 60, 40]);
      if (!calm && theme.confetti) celebrate();
    }
    emit("end", { ...state.score, won });
  };

  /* ---------- Input ---------- */

  const aimFrom = (clientX) => clamp((clientX - view.w / 2) / (view.unit * 0.55), -1, 1) * 0.82;
  const swing = () => {
    state.swing = 1;
  };

  const tap = (clientX) => {
    if (!state.running || state.paused) return;
    if (state.phase === "serve") {
      swing();
      sound.hit(0.4);
      yourShot([state.youX, 0.42, NEAR], aimFrom(clientX), "good");
      setPhase("rally");
      return;
    }
    if (state.phase !== "rally") return;

    const shot = state.shot;
    if (!shot || shot.by !== "cpu" || shot.hit || state.cooldown > 0) {
      swing();
      return;
    }

    const error = shot.t - shot.T;
    const { perfect: PERFECT, good: GOOD } = state.level;
    if (error < -GOOD) {
      // Too early: a free practice swing, then a short wait before the next try.
      swing();
      state.cooldown = 0.28;
      emit("callout", { text: "Early", tone: "plain" });
      return;
    }
    if (error > GOOD) return;

    const quality = Math.abs(error) <= PERFECT ? "perfect" : "good";
    shot.hit = true;
    swing();
    const at = shuttleAt(shot, clamp(shot.t / shot.T, 0, 1.05));
    state.burst = { at, age: 0, strong: quality === "perfect" };
    sound.hit(quality === "perfect" ? 1 : 0.55);
    if (quality === "perfect") buzz(14);
    emit("callout", { text: quality === "perfect" ? "Perfect" : "Good", tone: quality === "perfect" ? "accent" : "plain" });
    yourShot(at, aimFrom(clientX), quality);
  };

  canvas.addEventListener("pointerdown", (event) => tap(event.clientX));
  addEventListener("keydown", (event) => {
    if (event.key !== " " || !state.running || state.paused) return;
    if (document.activeElement && document.activeElement.closest("button, input, select, a")) return;
    event.preventDefault();
    tap(view.w / 2);
  });

  /* ---------- Update ---------- */

  const update = (dt) => {
    state.swing = Math.max(0, state.swing - dt / 0.22);
    state.cooldown = Math.max(0, state.cooldown - dt);
    if (state.burst && (state.burst.age += dt) > 0.5) state.burst = null;
    state.confetti = state.confetti.filter((bit) => {
      bit.age += dt;
      bit.vy += 0.5 * dt;
      bit.x += bit.vx * dt;
      bit.y += bit.vy * dt;
      bit.spin += bit.turn * dt;
      return bit.age < 3.2;
    });

    // Before and after a match, the shuttle drifts back and forth on its own.
    if (!state.running) {
      if (!state.shot || state.shot.t >= state.shot.T) {
        const from = state.shot ? state.shot.to : [0, 0.5, FAR];
        const toNear = from[2] !== NEAR;
        launch("cpu", from, [random(-0.6, 0.6), CONTACT, toNear ? NEAR : FAR], 1.5, 1);
      }
      const shot = state.shot;
      shot.t += dt;
      state.trail.push(project(...shuttleAt(shot, shot.t / shot.T)));
      if (state.trail.length > 7) state.trail.shift();
      if (shot.to[2] === NEAR) state.youX = lerp(state.youX, shot.to[0], clamp(dt * 3));
      else state.cpuX = lerp(state.cpuX, shot.to[0], clamp(dt * 3));
      return;
    }
    if (state.paused) return;

    if (state.rules.mode === "timer" && state.clock > 0 && state.phase !== "point") {
      const before = Math.ceil(state.clock);
      state.clock = Math.max(0, state.clock - dt);
      if (Math.ceil(state.clock) !== before) emit("clock", Math.ceil(state.clock));
      // Time ran out between rallies: end now, or play a golden point if it's tied.
      if (state.clock <= 0 && state.phase === "serve") {
        if (decided()) {
          finish();
          return;
        }
        if (!state.golden) {
          state.golden = true;
          emit("callout", { text: "Golden point", tone: "accent" });
        }
      }
    }

    if (state.phase === "point" || (state.phase === "rally" && !state.shot)) {
      state.timer -= dt;
      if (state.timer <= 0) {
        if (state.phase === "point") {
          if (decided()) finish();
          else startPoint();
        } else {
          cpuShot([state.cpuX, 0.45, FAR]); // The CPU serves.
        }
      }
    }

    const shot = state.shot;
    if (shot && (state.phase === "rally" || state.phase === "point")) {
      shot.t += dt;
      const s = shot.t / shot.T;
      const pos = shuttleAt(shot, s);
      state.trail.push(project(...pos));
      if (state.trail.length > 7) state.trail.shift();

      if (shot.by === "cpu") {
        state.youX = lerp(state.youX, shot.to[0], clamp(dt * 7));
      } else {
        state.cpuX = lerp(state.cpuX, state.cpuTarget, clamp(dt * 4.2));
        if (s >= 1 && shot.reaches && !shot.hit && state.phase === "rally") {
          shot.hit = true;
          sound.hit(0.45);
          cpuShot(shuttleAt(shot, 1));
          return;
        }
      }

      if (pos[1] <= 0 && state.phase === "rally") endPoint(shot.by === "cpu" ? "cpu" : "you");
      if (pos[1] <= 0) shot.t -= dt; // Rest on the floor.
    }
  };

  /* ---------- Drawing ---------- */

  const glowSpot = (x, z, radius, colour, strength) => {
    const p = project(x, 0, z);
    const r = radius * view.unit * p.scale;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1, 0.32);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    glow.addColorStop(0, `rgba(${colour},${strength})`);
    glow.addColorStop(1, `rgba(${colour},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const paintRacket = (x, z, mirror, tilt) => {
    const p = project(x, CONTACT, z);
    const k = (view.unit * 0.3 * p.scale) / racketSprite.size;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(tilt);
    ctx.scale(mirror * k, k);
    ctx.drawImage(racketSprite.c, -racketSprite.size / 2, -racketSprite.size * 0.5);
    ctx.restore();
  };

  // The moving ring meets the fixed one at exactly the right moment to hit.
  const paintTiming = () => {
    const shot = state.shot;
    if (!state.running || !shot || shot.by !== "cpu" || shot.hit || state.phase !== "rally") return;
    const s = shot.t / shot.T;
    if (s < 0.3 || s > 1.15) return;
    const p = project(shot.to[0], 0, NEAR);
    const base = view.unit * 0.13 * p.scale;
    const close = 1 - clamp(Math.abs(shot.t - shot.T) / 0.35);
    const fade = clamp((s - 0.3) / 0.2) * (s > 1 ? clamp((1.15 - s) / 0.15) : 1);

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(${theme.you},${0.45 + close * 0.55})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, base, base * 0.32, 0, 0, Math.PI * 2);
    ctx.stroke();
    const shrink = base * (1 + 2.6 * clamp(1 - s, 0, 1));
    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, shrink, shrink * 0.32, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };

  const paintShuttle = () => {
    const shot = state.shot;
    if (!shot) return;
    const pos = shuttleAt(shot, shot.t / shot.T);
    const p = project(...pos);

    const shadow = project(pos[0], 0, pos[2]);
    const sr = (0.05 / (1 + pos[1] * 1.5)) * view.unit * shadow.scale;
    ctx.fillStyle = "rgba(0,0,0,.4)";
    ctx.beginPath();
    ctx.ellipse(shadow.x, shadow.y, sr, sr * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    if (!calm && state.trail.length > 1) {
      ctx.save();
      ctx.lineCap = "round";
      for (let i = 1; i < state.trail.length; i++) {
        const a = state.trail[i - 1];
        const b = state.trail[i];
        ctx.strokeStyle = `rgba(255,255,255,${(i / state.trail.length) * 0.2})`;
        ctx.lineWidth = view.unit * 0.02 * b.scale * (i / state.trail.length);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // The cork leads and the feathered skirt trails behind it.
    const previous = state.trail[state.trail.length - 2] || p;
    const angle = Math.atan2(p.y - previous.y, p.x - previous.x);
    const r = Math.max(3, view.unit * 0.022 * p.scale);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    const skirt = ctx.createLinearGradient(-r * 2.6, 0, 0, 0);
    skirt.addColorStop(0, "rgba(255,255,255,.55)");
    skirt.addColorStop(1, "rgba(255,255,255,.96)");
    ctx.fillStyle = skirt;
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, -r * 0.55);
    ctx.lineTo(-r * 2.6, -r * 1.15);
    ctx.lineTo(-r * 2.6, r * 1.15);
    ctx.lineTo(-r * 0.2, r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = theme.cork;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const paintBurst = () => {
    if (!state.burst || calm) return;
    const { at, age, strong } = state.burst;
    const p = project(...at);
    const k = age / 0.5;
    ctx.save();
    ctx.strokeStyle = strong ? `rgba(${theme.you},${1 - k})` : `rgba(255,255,255,${0.7 * (1 - k)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, view.unit * (0.04 + k * 0.16) * p.scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };

  const celebrate = () => {
    for (let i = 0; i < 140; i++) {
      state.confetti.push({
        x: random(0, 1),
        y: random(-0.25, -0.02),
        vx: random(-0.05, 0.05),
        vy: random(0.12, 0.3),
        spin: random(0, Math.PI),
        turn: random(-6, 6),
        size: random(5, 9),
        colour: theme.confetti[i % theme.confetti.length],
        age: 0,
      });
    }
  };

  const paintConfetti = () => {
    state.confetti.forEach((bit) => {
      ctx.save();
      ctx.globalAlpha = 1 - clamp((bit.age - 2.4) / 0.8);
      ctx.translate(bit.x * view.w, bit.y * view.h);
      ctx.rotate(bit.spin);
      ctx.fillStyle = bit.colour;
      ctx.fillRect(-bit.size / 2, -bit.size * 0.3, bit.size, bit.size * 0.6 * Math.abs(Math.cos(bit.spin * 1.7)) + 1);
      ctx.restore();
    });
  };

  const paint = () => {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.drawImage(arena, 0, 0, view.w, view.h);

    const shot = state.shot;
    const shuttleZ = shot ? shuttleAt(shot, shot.t / shot.T)[2] : 0;
    const swingTilt = Math.sin(state.swing * Math.PI) * 1.1;

    // Far side first, then the net, then the near side.
    glowSpot(state.cpuX, FAR, 0.2, theme.cpu, 0.55);
    paintRacket(state.cpuX + 0.06, FAR + 0.02, -1, 0.35);
    if (shuttleZ > NET.z) paintShuttle();
    ctx.drawImage(netLayer, 0, 0, view.w, view.h);
    glowSpot(state.youX, NEAR, 0.24, theme.you, 0.4);
    paintTiming();
    if (shuttleZ <= NET.z) paintShuttle();
    paintRacket(state.youX + 0.05, NEAR, 1, -0.35 + swingTilt);
    paintBurst();
    paintConfetti();
  };

  /* ---------- Loop ---------- */

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = innerWidth;
    const h = innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    view = { w, h, dpr, unit: Math.min(w * 0.44, h * 0.34), horizon: h * 0.17, base: h * 0.84 };
    arena = drawArena();
    netLayer = drawNet();
  };

  let last = performance.now();
  const frame = (now) => {
    update(Math.min((now - last) / 1000, 0.05));
    last = now;
    paint();
    requestAnimationFrame(frame);
  };

  addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);

  return {
    // rules: { mode: "points" | "timer", target, seconds, winByTwo }
    start({ rules, level = "normal", sound: withSound = true, haptics = true }) {
      settings.sound = withSound;
      settings.haptics = haptics;
      sound.start();
      state.rules = { ...state.rules, ...rules };
      state.level = LEVELS[level] || LEVELS.normal;
      state.score = { you: 0, cpu: 0 };
      state.clock = state.rules.mode === "timer" ? state.rules.seconds : 0;
      state.golden = false;
      state.server = "you";
      state.running = true;
      state.paused = false;
      state.confetti = [];
      emit("score", { ...state.score });
      if (state.rules.mode === "timer") emit("clock", Math.ceil(state.clock));
      startPoint();
    },
    pause() {
      state.paused = true;
    },
    resume() {
      state.paused = false;
      last = performance.now();
    },
    quit() {
      state.running = false;
      state.paused = false;
      state.shot = null;
      setPhase("idle");
    },
  };
};
