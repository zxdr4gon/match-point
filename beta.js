// Beta build: first to 14, fixed name, and a link at the end.
(() => {
  const $ = (id) => document.getElementById(id);
  const body = document.body;
  const callout = $("callout");

  $("prize").href = window.PRIZE_URL || "#";

  const bump = (id) => {
    const element = $(id);
    element.classList.remove("bump");
    void element.offsetWidth;
    element.classList.add("bump");
  };

  const match = window.createMatch({
    canvas: $("court"),
    theme: {
      hall: ["#05060d", "#0d0a1d", "#07060f"],
      lights: "215,205,255",
      floor: "#0b0918",
      mat: ["#2a2058", "#3b2c7a"],
      pool: "190,170,255",
      lines: "rgba(244,242,255,.85)",
      posts: "#c9b8ff",
      you: "242,212,138",
      cpu: "138,92,240",
      cork: "#f2d48a",
      strings: "rgba(240,238,255,.55)",
      frame: ["#fff4cf", "#f2d48a", "#b48a3c"],
      shaft: "#d9cfff",
      grip: "#6c3fd1",
      confetti: ["#f2d48a", "#fff4cf", "#8a5cf0", "#eeeaf8"],
    },
    onEvent(type, data) {
      if (type === "score") {
        $("score-you").textContent = data.you;
        $("score-cpu").textContent = data.cpu;
        if (data.scorer) bump(data.scorer === "you" ? "score-you" : "score-cpu");
      }
      if (type === "callout") {
        callout.textContent = data.text;
        callout.className = "callout";
        void callout.offsetWidth;
        callout.classList.add("show", data.tone);
      }
      if (type === "phase") body.dataset.phase = data;
      if (type === "end") {
        $("result-title").textContent = data.won ? "You win" : "So close";
        $("result-score").textContent = `${data.you}–${data.cpu}`;
        $("result-note").textContent = data.won
          ? "Nice win! Your prize is ready."
          : "The CPU got lucky. Your prize is ready anyway.";
        $("prize").textContent = "Open your prize";
        setTimeout(() => (body.dataset.screen = "result"), data.won ? 1400 : 700);
      }
    },
  });

  const play = () => {
    body.dataset.screen = "match";
    match.start({ rules: { mode: "points", target: 5, winByTwo: false }, level: "normal" });
  };

  $("start").addEventListener("click", play);
  $("rematch").addEventListener("click", play);
})();
