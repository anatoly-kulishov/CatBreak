/**
 * Assert-based self-check for pure lib helpers (no test framework).
 * Run: npm test
 */
const assert = require("assert");
const {
  parseVersion,
  compareVersions,
  filterAssets,
  categorize,
  sortWin,
  matchesArch,
} = require("../lib/releases");
const { createSessionTimer, formatClock } = require("../lib/timer");

function asset(name) {
  return { name, browser_download_url: `https://example.com/${name}` };
}

// Fixture version is unrelated to package.json - only shapes filenames under test.
const V = "9.9.9";

// --- releases ---
assert.strictEqual(parseVersion(`v${V}`), V);
assert.strictEqual(parseVersion("1.2.3"), "1.2.3");
assert.strictEqual(parseVersion("nope"), null);

assert.strictEqual(compareVersions("2.0.0", "2.0.1"), -1);
assert.strictEqual(compareVersions("v2.0.1", "2.0.1"), 0);
assert.strictEqual(compareVersions("2.1.0", "2.0.9"), 1);

const filtered = filterAssets([
  asset(`Cat-Break-${V}-x64.exe`),
  asset("latest.yml"),
  asset(`Cat-Break-${V}-x64.exe.blockmap`),
  { name: "broken.exe" },
]);
assert.strictEqual(filtered.length, 1);
assert.strictEqual(filtered[0].name, `Cat-Break-${V}-x64.exe`);

const bins = categorize([
  asset(`Cat-Break-${V}-arm64.dmg`),
  asset(`Cat-Break-${V}-mac.zip`),
  asset(`Cat-Break-${V}-x64-Setup.exe`),
  asset(`Cat-Break-${V}-x64.exe`),
  asset(`Cat-Break-${V}-x64.AppImage`),
  asset(`cat-break-desktop_${V}_amd64.deb`),
]);
assert.strictEqual(bins.mac.length, 2);
assert.strictEqual(bins.win.length, 2);
assert.strictEqual(bins.linux.length, 2);

const winSorted = sortWin([
  asset(`Cat-Break-${V}-x64-portable.exe`),
  asset(`Cat-Break-${V}-arm64-Setup.exe`),
  asset(`Cat-Break-${V}-x64-Setup.exe`),
]);
assert.strictEqual(winSorted[0].name, `Cat-Break-${V}-x64-Setup.exe`);

assert.ok(matchesArch(`Cat-Break-${V}-arm64.dmg`, "arm64"));
assert.ok(matchesArch(`Cat-Break-${V}-universal.dmg`, "x64"));
assert.ok(!matchesArch(`Cat-Break-${V}-arm64.dmg`, "x64"));

// --- timer ---
assert.strictEqual(formatClock(65), "1:05");
assert.strictEqual(formatClock(0), "0:00");

const session = createSessionTimer();
session.resetWork(1);
assert.strictEqual(session.workSecondsLeft, 60);

session.postpone(1);
assert.strictEqual(session.workSecondsLeft, 120);
assert.strictEqual(session.postpone(1), true);

while (session.workSecondsLeft > 60) {
  const step = session.tick({
    idleSeconds: 0,
    idlePauseMinutes: 2,
    notifyBeforeBreak: true,
  });
  assert.strictEqual(step.kind, "workTick");
}

let tick = session.tick({
  idleSeconds: 0,
  idlePauseMinutes: 2,
  notifyBeforeBreak: true,
});
assert.strictEqual(tick.kind, "workTick");
assert.strictEqual(tick.notify, true);

tick = session.tick({
  idleSeconds: 999,
  idlePauseMinutes: 2,
  notifyBeforeBreak: true,
});
assert.strictEqual(tick.kind, "idle");

session.beginBreak({ demo: true, seconds: 2, breakMinutes: 5 });
assert.ok(session.onBreak);
assert.strictEqual(session.breakSecondsLeft, 2);

tick = session.tick({
  idleSeconds: 0,
  idlePauseMinutes: 2,
  notifyBeforeBreak: false,
});
assert.strictEqual(tick.kind, "breakTick");
assert.strictEqual(tick.shouldExit, false);

tick = session.tick({
  idleSeconds: 0,
  idlePauseMinutes: 2,
  notifyBeforeBreak: false,
});
assert.strictEqual(tick.shouldExit, true);

assert.strictEqual(session.markExitRequested(), true);
assert.strictEqual(session.markExitRequested(), false);

session.finishBreak(55);
assert.strictEqual(session.onBreak, false);
assert.strictEqual(session.workSecondsLeft, 55 * 60);

// postpone blocked during break
session.beginBreak({ demo: true, seconds: 10, breakMinutes: 5 });
assert.strictEqual(session.postpone(5), false);

console.log("selfcheck-lib: ok");
