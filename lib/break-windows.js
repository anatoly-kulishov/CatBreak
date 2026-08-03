const path = require("path");
const { configureBreakWindow, getBreakWindowOptions } = require("./platform");

const BREAK_EXIT_ANIM_MS = 1100;
const BREAK_EXIT_FAST_MS = 280;

/**
 * Multi-display break overlays + exit animation timer.
 * Session/settings stay in main; this owns BrowserWindow lifecycle.
 */
function createBreakWindowsController({
  BrowserWindow,
  screen,
  projectRoot,
  isOnBreak,
  onFastClose,
  onExitAnimationDone,
  getBreakSecondsLeft,
}) {
  const windows = new Map();
  let exitTimer = null;
  let creating = false;
  let lastPayload = null;
  let lastStrictBreak = false;
  let displayUnbind = null;

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

  function destroyWindowsOnly() {
    forEachAlive((win) => {
      win.removeAllListeners("close");
      win.destroy();
    });
    windows.clear();
  }

  function closeAll() {
    clearExitTimer();
    destroyWindowsOnly();
    lastPayload = null;
  }

  function clearExitTimer() {
    if (exitTimer) {
      clearTimeout(exitTimer);
      exitTimer = null;
    }
  }

  async function createAll(payload, strictBreak) {
    lastPayload = payload;
    lastStrictBreak = strictBreak;
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

  async function recreateForDisplays() {
    if (!isOnBreak() || creating || !lastPayload) return;
    await withCreateLock(async () => {
      destroyWindowsOnly();
      await createAll(lastPayload, lastStrictBreak);
      const secondsLeft = getBreakSecondsLeft?.();
      if (secondsLeft != null) {
        broadcastTick(secondsLeft);
      }
    });
  }

  function bindDisplayHotplug() {
    if (displayUnbind) return displayUnbind;
    const handler = () => {
      void recreateForDisplays();
    };
    screen.on("display-added", handler);
    screen.on("display-removed", handler);
    displayUnbind = () => {
      screen.removeListener("display-added", handler);
      screen.removeListener("display-removed", handler);
      displayUnbind = null;
    };
    return displayUnbind;
  }

  return {
    createAll,
    broadcastTick,
    broadcastLocale,
    closeAll,
    clearExitTimer,
    requestExit,
    withCreateLock,
    bindDisplayHotplug,
    recreateForDisplays,
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
