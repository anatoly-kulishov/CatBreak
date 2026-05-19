const countdownEl = document.getElementById("countdown");
const hintEl = document.getElementById("hint");
const exercisesEl = document.getElementById("exercises");
const exercisesTitleEl = document.getElementById("exercises-title");
const skipBtn = document.getElementById("skip");
const catStageEl = document.getElementById("cat-stage");
const neko1 = document.getElementById("neko1");
const neko2 = document.getElementById("neko2");
const sideEl = document.getElementById("side");

let secondsLeft = 0;
let isExiting = false;
let strings = {};
let breakState = { demo: false, strictBreak: false, showExercises: true };

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function renderTimer() {
  countdownEl.textContent = formatClock(secondsLeft);
}

function applyBreakStrings(s) {
  strings = s || {};
  document.title = strings.title || "Break";
  if (exercisesTitleEl) {
    exercisesTitleEl.textContent = strings.exercisesTitle || "";
  }
  const exerciseIds = ["exercise1", "exercise2", "exercise3", "exercise4"];
  exerciseIds.forEach((key, index) => {
    const el = document.getElementById(`exercise-${index + 1}`);
    if (el) el.textContent = strings[key] || "";
  });
  if (skipBtn) {
    skipBtn.textContent = strings.skip || "";
  }
}

function applyHints() {
  if (!breakState.strictBreak) {
    skipBtn.hidden = false;
    hintEl.textContent = breakState.demo
      ? strings.hintDemo || ""
      : strings.hintSkip || "";
  } else {
    skipBtn.hidden = true;
    hintEl.textContent = breakState.demo
      ? strings.hintDemoStrict || ""
      : strings.hintStrict || "";
  }
}

function applyBreakUi(payload) {
  if (payload.locale) {
    document.documentElement.lang = payload.locale;
  }

  breakState = {
    demo: !!payload.demo,
    strictBreak: !!payload.strictBreak,
    showExercises: !!payload.showExercises,
  };

  applyBreakStrings(payload.strings);
  exercisesEl.hidden = !breakState.showExercises;
  applyHints();
}

const meowAudioEl = document.getElementById("meow-sound");

function playEndMeowSynth() {
  try {
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.4;
    master.connect(ctx.destination);

    function tone(start, duration, f0, f1, peak = 0.7) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f0, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 80), start + duration);
      g.gain.setValueAtTime(0.001, start);
      g.gain.linearRampToValueAtTime(peak, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(g);
      g.connect(master);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    }

    const t0 = ctx.currentTime;
    tone(t0, 0.1, 620, 480, 0.55);
    tone(t0 + 0.08, 0.42, 420, 240, 0.85);
    window.setTimeout(() => ctx.close().catch(() => {}), 700);
  } catch {
    // ignore if audio is unavailable
  }
}

function playEndMeow() {
  if (!meowAudioEl) {
    playEndMeowSynth();
    return;
  }

  meowAudioEl.volume = 0.65;
  meowAudioEl.currentTime = 0;
  const playPromise = meowAudioEl.play();
  if (playPromise?.catch) {
    playPromise.catch(() => playEndMeowSynth());
  }
}

function getVisibleCatVideo() {
  if (!neko2.hidden && neko2.classList.contains("visible")) return neko2;
  if (!neko1.hidden) return neko1;
  return null;
}

function beginCatExit(fast = false, playSound = false) {
  if (isExiting) return;
  isExiting = true;

  if (playSound) {
    playEndMeow();
  }

  countdownEl.style.opacity = "0";
  sideEl.style.transition = fast ? "opacity 0.15s ease" : "opacity 0.25s ease";
  sideEl.style.opacity = "0";

  if (fast) {
    document.body.classList.add("is-fading-out");
    catStageEl.classList.add("is-fading-out");
    const visible = getVisibleCatVideo();
    if (visible) {
      visible.classList.add("cat-exit-fast");
    }
    return;
  }

  const visible = getVisibleCatVideo();
  if (visible) {
    visible.classList.add("cat-exit");
  }
}

neko1.addEventListener("ended", () => {
  neko1.hidden = true;
  neko2.hidden = false;
  neko2.classList.add("visible");
  neko2.play().catch(() => {});
});

window.catBreak.onBreakInit((payload) => {
  secondsLeft = payload.totalSeconds;
  isExiting = false;
  applyBreakUi(payload);
  renderTimer();

  document.body.classList.remove("is-fading-out");
  catStageEl.classList.remove("is-fading-out");
  catStageEl.style.opacity = "";

  neko1.hidden = false;
  neko1.classList.remove("cat-exit", "cat-exit-fast");
  neko2.hidden = true;
  neko2.classList.remove("visible", "cat-exit", "cat-exit-fast");
  neko1.play().catch(() => {});

  countdownEl.style.opacity = "1";
  sideEl.style.opacity = "1";
});

window.catBreak.onBreakLocaleUpdate((payload) => {
  applyBreakUi(payload);
});

window.catBreak.onBreakTick(({ secondsLeft: next }) => {
  secondsLeft = next;
  renderTimer();
});

window.catBreak.onBreakExitRequest((payload) => {
  beginCatExit(!!payload?.fast, !!payload?.playSound);
});

skipBtn.addEventListener("click", () => {
  window.catBreak.skipBreak();
});
