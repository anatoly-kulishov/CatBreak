const fields = [
  "workMinutes",
  "breakMinutes",
  "idlePauseMinutes",
  "showExercises",
  "strictBreak",
];

function showBootError(message) {
  const status = document.getElementById("status");
  if (status) {
    status.style.color = "#f5a097";
    status.textContent = message;
  }
}

async function load() {
  if (!window.catBreak?.getSettings) {
    showBootError("Ошибка загрузки интерфейса. Перезапустите приложение.");
    return;
  }

  try {
    const { settings } = await window.catBreak.getSettings();
    for (const key of fields) {
      const el = document.getElementById(key);
      if (!el) continue;
      if (el.type === "checkbox") {
        el.checked = !!settings[key];
      } else {
        el.value = settings[key];
      }
    }
  } catch (err) {
    console.error(err);
    showBootError("Не удалось загрузить настройки.");
  }
}

function readForm() {
  const next = {};
  for (const key of fields) {
    const el = document.getElementById(key);
    if (el.type === "checkbox") {
      next[key] = el.checked;
    } else {
      next[key] = Number.parseInt(el.value, 10);
    }
  }
  return next;
}

document.getElementById("save")?.addEventListener("click", async () => {
  try {
    await window.catBreak.saveSettings(readForm());
    const status = document.getElementById("status");
    status.style.color = "#8bc48a";
    status.textContent = "Сохранено";
    setTimeout(() => {
      status.textContent = "";
    }, 2000);
  } catch (err) {
    console.error(err);
    showBootError("Не удалось сохранить настройки.");
  }
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", load);
} else {
  load();
}
