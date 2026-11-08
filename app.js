// Match Point: name, settings and screens around the shared match engine.
(() => {
  const $ = (id) => document.getElementById(id);
  const body = document.body;

  /* ---------- Saved settings ---------- */

  const DEFAULTS = {
    name: "",
    mode: "points",
    target: 21,
    winByTwo: true,
    seconds: 120,
    level: "normal",
    sound: true,
    haptics: true,
  };

  const load = (key, fallback) => {
    try {
      return { ...fallback, ...JSON.parse(localStorage.getItem(key)) };
    } catch {
      return { ...fallback };
    }
  };
  const save = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Private browsing: settings just won't stick between visits.
    }
  };

  const settings = load("match-point.settings", DEFAULTS);
  const record = load("match-point.record", { wins: 0, losses: 0 });

  /* ---------- Words ---------- */

  const LEVEL_NAMES = { easy: "Easy CPU", normal: "Normal CPU", hard: "Hard CPU" };
  const minutes = (seconds) => `${seconds / 60} minute${seconds === 60 ? "" : "s"}`;
  const rulesText = () =>
    settings.mode === "timer"
      ? `Most points in ${minutes(settings.seconds)}`
      : `First to ${settings.target}${settings.winByTwo ? ", win by 2" : ""}`;
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : word === "loss" ? "es" : "s"}`;

  /* ---------- Screens ---------- */

  const show = (screen) => {
    body.dataset.screen = screen;
    const focusable = document.querySelector(`[data-for="${screen}"] input, [data-for="${screen}"] .button.primary`);
    if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 50);
  };

  const refreshHome = () => {
    $("home-name").textContent = settings.name;
    $("home-rules").textContent = rulesText();
    $("home-level").textContent = LEVEL_NAMES[settings.level];
    const played = record.wins + record.losses;
    $("home-record-row").hidden = played === 0;
    $("home-record").textContent = `${plural(record.wins, "win")}, ${plural(record.losses, "loss")}`;
  };

  /* ---------- The match ---------- */

  const callout = $("callout");
  const say = ({ text, tone }) => {
    callout.textContent = text;
    callout.className = "callout";
    void callout.offsetWidth;
    callout.classList.add("show", tone);
  };

  const bump = (id) => {
    const element = $(id);
    element.classList.remove("bump");
    void element.offsetWidth;
    element.classList.add("bump");
  };

  const match = window.createMatch({
    canvas: $("court"),
    theme: {
      hall: ["#050b09", "#0a1712", "#060d0a"],
      lights: "235,245,235",
      floor: "#0a1511",
      mat: ["#155a43", "#1f7356"],
      pool: "220,255,230",
      lines: "rgba(246,250,244,.9)",
      posts: "#dfe8e1",
      you: "216,255,62",
      cpu: "255,122,89",
      cork: "#f1f5ee",
      strings: "rgba(240,245,238,.55)",
      frame: ["#f6fff0", "#d8ff3e", "#8fae1e"],
      shaft: "#cfd8d1",
      grip: "#26403a",
      confetti: ["#d8ff3e", "#f1f5ee", "#ff7a59"],
    },
    onEvent(type, data) {
      if (type === "score") {
        $("score-you").textContent = data.you;
        $("score-cpu").textContent = data.cpu;
        if (data.scorer) bump(data.scorer === "you" ? "score-you" : "score-cpu");
      }
      if (type === "callout") say(data);
      if (type === "phase") body.dataset.phase = data;
      if (type === "clock") {
        const m = Math.floor(data / 60);
        const s = String(data % 60).padStart(2, "0");
        $("clock").textContent = `${m}:${s}`;
        $("clock").classList.toggle("low", data <= 10);
      }
      if (type === "end") {
        if (data.won) record.wins += 1;
        else record.losses += 1;
        save("match-point.record", record);
        $("result-title").textContent = data.won ? `${settings.name} wins` : "CPU wins";
        $("result-score").textContent = `${data.you}–${data.cpu}`;
        $("result-rules").textContent = rulesText();
        setTimeout(() => show("result"), 700);
      }
    },
  });

  const play = () => {
    $("hud-name").textContent = settings.name;
    $("clock").hidden = settings.mode !== "timer";
    show("match");
    match.start({
      rules: { mode: settings.mode, target: settings.target, seconds: settings.seconds, winByTwo: settings.winByTwo },
      level: settings.level,
      sound: settings.sound,
      haptics: settings.haptics,
    });
  };

  /* ---------- Settings form ---------- */

  const form = $("settings-form");

  const fillSettings = () => {
    $("set-name").value = settings.name;
    form.mode.value = settings.mode;
    form.seconds.value = String(settings.seconds);
    form.level.value = settings.level;
    $("set-two").checked = settings.winByTwo;
    $("set-sound").checked = settings.sound;
    $("set-haptics").checked = settings.haptics;
    showTarget();
    body.dataset.mode = settings.mode;
  };

  const showTarget = () => {
    $("set-target").textContent = settings.target;
    document.querySelectorAll("[data-target]").forEach((button) => {
      button.setAttribute("aria-pressed", String(Number(button.dataset.target) === settings.target));
    });
  };

  const setTarget = (value) => {
    settings.target = Math.min(30, Math.max(3, value));
    showTarget();
    save("match-point.settings", settings);
  };

  form.addEventListener("change", () => {
    const name = $("set-name").value.trim();
    if (name) settings.name = name;
    settings.mode = form.mode.value;
    settings.seconds = Number(form.seconds.value);
    settings.level = form.level.value;
    settings.winByTwo = $("set-two").checked;
    settings.sound = $("set-sound").checked;
    settings.haptics = $("set-haptics").checked;
    body.dataset.mode = settings.mode;
    save("match-point.settings", settings);
  });
  form.addEventListener("submit", (event) => event.preventDefault());

  document.querySelectorAll("[data-step]").forEach((button) => {
    button.addEventListener("click", () => setTarget(settings.target + Number(button.dataset.step)));
  });
  document.querySelectorAll("[data-target]").forEach((button) => {
    button.addEventListener("click", () => setTarget(Number(button.dataset.target)));
  });

  /* ---------- Buttons ---------- */

  $("welcome-form").addEventListener("submit", (event) => {
    event.preventDefault();
    settings.name = $("welcome-name").value.trim();
    if (!settings.name) return;
    save("match-point.settings", settings);
    refreshHome();
    show("home");
  });

  $("play").addEventListener("click", play);
  $("again").addEventListener("click", play);
  $("open-settings").addEventListener("click", () => {
    fillSettings();
    show("settings");
  });
  $("close-settings").addEventListener("click", () => {
    refreshHome();
    show("home");
  });
  $("pause").addEventListener("click", () => {
    match.pause();
    show("paused");
  });
  $("resume").addEventListener("click", () => {
    match.resume();
    show("match");
  });
  $("quit").addEventListener("click", () => {
    match.quit();
    refreshHome();
    show("home");
  });
  $("home").addEventListener("click", () => {
    match.quit();
    refreshHome();
    show("home");
  });

  // Leaving the app mid-rally pauses it.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && body.dataset.screen === "match") {
      match.pause();
      show("paused");
    }
  });

  /* ---------- Start ---------- */

  body.dataset.mode = settings.mode;
  if (settings.name) {
    refreshHome();
    show("home");
  } else {
    show("welcome");
  }

  if ("serviceWorker" in navigator) {
    addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
