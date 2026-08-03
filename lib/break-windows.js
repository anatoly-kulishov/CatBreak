const path = require("path");
const { BrowserWindow, screen } = require("electron");
const {
  configureBreakWindow,
  getBreakWindowOptions,
} = require("./platform");

const BREAK_EXIT_ANIM_MS = 1100;
const BREAK_EXIT_FAST_MS = 280;

/**
 * Multi-display break overlays + exit animation timer.
 * Session/settings stay in main; this owns BrowserWindow lifecycle.
 */
function createBreakWindowsController({
  projectRoot,
  isOnBreak,
  onFastClose,
  onExitAnimationDone,
}) {
  const windows = new Map();
  let exitTimer = null;
  let creating = false;

  function forEachAlive(fn) {
    for (const win of windows.values()) {
      if (!win.isDestroyed()) fn(win);
    }
  }

  function broadcast(channel, payload) {
    forEachAlive((win) => {
      win.webContents.send(channel, payload);
    });
  }

  function closeAll() {
    clearExitTimer();
    forEachAlive((win) => {
      win.removeAllListeners("close");
      win.destroy();
    });
    windows.clear();
  }

  function clearExitTimer() {
    if (exitTimer) {
      clearTimeout(exitTimer);
      exitTimer = null;
    }
  }

  async function createAll(payload, strictBreak) {
    const displays = screen.getAllDisplays();
    const breakHtml = path.join(projectRoot, "src", "break.html");

    for (const display of displays) {
      const win = new BrowserWindow(getBreakWindowOptions(display, strictBreak));
      configureBreakWindow(win);

      win.on("close", (e) => {
        if (!isOnBreak()) return;
        e.preventDefault();
        onFastClose();
      });

      await win.loadFile(breakHtml);
      win.webContents.send("break-init", payload);
      windows.set(display.id, win);
    }
  }

  function broadcastTick(secondsLeft) {
    broadcast("break-tick", { secondsLeft });
  }

  function broadcastLocale(payload) {
    if (!isOnBreak()) return;
    broadcast("break-locale-update", payload);
  }

  /**
   * @returns {boolean} true if exit was newly requested and animation started
   */
  function requestExit({ fast = false, playSound = false, markExitRequested }) {
    if (!markExitRequested()) return false;

    const delayMs = fast ? BREAK_EXIT_FAST_MS : BREAK_EXIT_ANIM_MS;
    broadcast("break-exit-request", { fast, playSound });

    clearExitTimer();
    exitTimer = setTimeout(() => {
      exitTimer = null;
      if (isOnBreak()) onExitAnimationDone();
    }, delayMs);
    return true;
  }

  async function withCreateLock(fn) {
    if (creating) return false;
    creating = true;
    try {
      await fn();
      return true;
    } finally {
      creating = false;
    }
  }

  return {
    createAll,
    broadcastTick,
    broadcastLocale,
    closeAll,
    clearExitTimer,
    requestExit,
    withCreateLock,
    get isCreating() {
      return creating;
    },
  };
}

module.exports = {
  createBreakWindowsController,
  BREAK_EXIT_ANIM_MS,
  BREAK_EXIT_FAST_MS,
};
