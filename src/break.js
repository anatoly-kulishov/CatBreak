const countdownEl = document.getElementById("countdown");
const hintEl = document.getElementById("hint");
const exercisesEl = document.getElementById("exercises");
const skipBtn = document.getElementById("skip");
const catStageEl = document.getElementById("cat-stage");
const neko1 = document.getElementById("neko1");
const neko2 = document.getElementById("neko2");
const sideEl = document.getElementById("side");

let secondsLeft = 0;
let isExiting = false;

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function renderTimer() {
  countdownEl.textContent = formatClock(secondsLeft);
}

function getVisibleCatVideo() {
  if (!neko2.hidden && neko2.classList.contains("visible")) return neko2;
  if (!neko1.hidden) return neko1;
  return null;
}

function beginCatExit(fast = false) {
  if (isExiting) return;
  isExiting = true;

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

  if (payload.showExercises) {
    exercisesEl.hidden = false;
  }

  if (!payload.strictBreak) {
    skipBtn.hidden = false;
    hintEl.textContent = payload.demo
      ? "Демо. Закроет все экраны сразу."
      : "Закроет перерыв на всех экранах.";
  } else {
    hintEl.textContent = payload.demo ? "Демо-перерыв" : "Отойдите от монитора.";
  }
});

window.catBreak.onBreakTick(({ secondsLeft: next }) => {
  secondsLeft = next;
  renderTimer();
});

window.catBreak.onBreakExitRequest((payload) => {
  beginCatExit(!!payload?.fast);
});

skipBtn.addEventListener("click", () => {
  window.catBreak.skipBreak();
});
