/**
 * Work/break session timer (no Electron). Main wires idle, notify, windows.
 */

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function createSessionTimer() {
  let workSecondsLeft = 0;
  let breakSecondsLeft = 0;
  let onBreak = false;
  let breakIsDemo = false;
  let breakExitRequested = false;
  let preBreakNotified = false;

  function resetWork(workMinutes) {
    workSecondsLeft = workMinutes * 60;
    preBreakNotified = false;
  }

  function postpone(minutes) {
    if (onBreak) return false;
    workSecondsLeft += minutes * 60;
    preBreakNotified = false;
    return true;
  }

  function beginBreak({ demo = false, seconds = null, breakMinutes }) {
    onBreak = true;
    breakIsDemo = demo;
    breakExitRequested = false;
    preBreakNotified = false;
    breakSecondsLeft =
      demo && seconds != null ? seconds : breakMinutes * 60;
    return breakSecondsLeft;
  }

  function markExitRequested() {
    if (!onBreak || breakExitRequested) return false;
    breakExitRequested = true;
    return true;
  }

  function finishBreak(workMinutes) {
    onBreak = false;
    breakIsDemo = false;
    breakExitRequested = false;
    resetWork(workMinutes);
  }

  /**
   * Advance one second. Caller handles side effects from the returned kind.
   * @returns {{ kind: string, notify?: boolean, shouldExit?: boolean, secondsLeft?: number }}
   */
  function tick({ idleSeconds, idlePauseMinutes, notifyBeforeBreak }) {
    const idleLimit = idlePauseMinutes * 60;
    const isIdle = idleSeconds >= idleLimit;

    if (onBreak) {
      if (breakSecondsLeft <= 0) {
        return { kind: "breakWaitingExit" };
      }
      breakSecondsLeft -= 1;
      if (breakSecondsLeft <= 0 && !breakExitRequested) {
        return {
          kind: "breakTick",
          secondsLeft: breakSecondsLeft,
          shouldExit: true,
        };
      }
      return {
        kind: "breakTick",
        secondsLeft: breakSecondsLeft,
        shouldExit: false,
      };
    }

    if (isIdle) {
      return { kind: "idle" };
    }

    if (workSecondsLeft > 90) {
      preBreakNotified = false;
    }

    let notify = false;
    if (notifyBeforeBreak && workSecondsLeft === 60 && !preBreakNotified) {
      preBreakNotified = true;
      notify = true;
    }

    if (workSecondsLeft <= 0) {
      return { kind: "startBreak", notify };
    }

    workSecondsLeft -= 1;
    if (workSecondsLeft <= 0) {
      return { kind: "startBreak", notify };
    }
    return { kind: "workTick", notify };
  }

  return {
    formatClock,
    resetWork,
    postpone,
    beginBreak,
    markExitRequested,
    finishBreak,
    tick,
    get workSecondsLeft() {
      return workSecondsLeft;
    },
    get breakSecondsLeft() {
      return breakSecondsLeft;
    },
    get onBreak() {
      return onBreak;
    },
    get breakIsDemo() {
      return breakIsDemo;
    },
    get breakExitRequested() {
      return breakExitRequested;
    },
  };
}

module.exports = {
  formatClock,
  createSessionTimer,
};
