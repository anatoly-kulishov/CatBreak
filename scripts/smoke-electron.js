/**
 * Electron smoke: translator + update dialog payloads + window/preload checks.
 * Run: npx electron scripts/smoke-electron.js
 */
const assert = require("assert");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const { createTranslator } = require("../lib/i18n");
const { createUpdateUi } = require("../lib/update-ui");
const { createSessionTimer, formatClock } = require("../lib/timer");
const { groupPlatformAssets } = require("../lib/release-assets");

const root = path.join(__dirname, "..");

const DEFAULT_SETTINGS = {
  workMinutes: 55,
  breakMinutes: 5,
  idlePauseMinutes: 2,
  showExercises: true,
  strictBreak: false,
  locale: "en",
  notifyBeforeBreak: true,
  soundOnBreakEnd: true,
  launchAtLogin: false,
  checkForUpdates: true,
  autoDownloadUpdates: true,
  autoInstallOnQuit: false,
  updateDismissedVersion: null,
  updateLastCheckAt: null,
};

let settings = { ...DEFAULT_SETTINGS };
const failures = [];

function check(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
    console.error(`FAIL ${name}: ${err.message}`);
  }
}

function registerIpcStubs(updates) {
  const handlers = {
    "get-settings": () => {
      const tr = createTranslator(settings.locale);
      return {
        settings,
        workSecondsLeft: 55 * 60,
        onBreak: false,
        locale: tr.locale,
        strings: tr.messages,
        appVersion: "1.0.7",
        releasesUrl: "https://github.com/anatoly-kulishov/CatBreak/releases",
        launchAtLoginSupported: false,
        updateState: updates.getUpdateStatePayload(),
        update: updates.getUpdatePayload(),
      };
    },
    "save-settings": () => true,
    "start-demo-break": () => true,
    "open-update-download": () => true,
    "dismiss-update": () => true,
    "check-for-updates": () => updates.getUpdateStatePayload(),
    "update-dialog-action": () => true,
    "skip-break": () => true,
  };
  for (const [channel, fn] of Object.entries(handlers)) {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async () => fn());
  }
}

function loadWindow(file, preload) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 400,
      height: 600,
      show: false,
      webPreferences: {
        preload: path.join(root, preload),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const fail = (_e, errorCode, errorDescription, validatedURL) => {
      win.destroy();
      reject(
        new Error(
          `load failed ${errorCode} ${errorDescription} url=${validatedURL}`,
        ),
      );
    };
    win.webContents.on("did-fail-load", fail);

    win
      .loadFile(path.join(root, file))
      .then(async () => {
        win.webContents.removeListener("did-fail-load", fail);
        resolve(win);
      })
      .catch((err) => {
        win.webContents.removeListener("did-fail-load", fail);
        try {
          win.destroy();
        } catch {
          /* ignore */
        }
        reject(err);
      });
  });
}

async function run() {
  check("formatClock", () => {
    assert.strictEqual(formatClock(125), "2:05");
  });

  check("session timer demo break", () => {
    const session = createSessionTimer();
    session.resetWork(1);
    session.beginBreak({ demo: true, seconds: 3, breakMinutes: 5 });
    assert.ok(session.onBreak);
    assert.strictEqual(session.breakSecondsLeft, 3);
  });

  check("groupPlatformAssets", () => {
    const g = groupPlatformAssets([
      {
        name: "Cat-Break-1.0.7-arm64.dmg",
        browser_download_url: "https://example.com/a.dmg",
      },
      {
        name: "latest.yml",
        browser_download_url: "https://example.com/latest.yml",
      },
    ]);
    assert.strictEqual(g.mac.length, 1);
    assert.strictEqual(g.win.length, 0);
  });

  const updates = createUpdateUi({
    getAppVersion: () => "1.0.7",
    getSettings: () => settings,
    saveSettings: () => {},
    isPackaged: () => false,
    BrowserWindow,
    getSettingsWindow: () => null,
    openSettings: () => {},
    openExternal: async () => {},
    showMessageBox: async () => ({ response: 0 }),
    withAppDialogIcon: (o) => o,
    getAppIconPath: () => path.join(root, "build", "icon.png"),
    getTranslator: () => createTranslator(settings.locale),
    showNotification: () => {},
    notifySettingsUi: () => {},
    refreshTray: () => {},
    projectRoot: root,
  });

  registerIpcStubs(updates);

  for (const locale of ["en", "ru"]) {
    settings = { ...DEFAULT_SETTINGS, locale, updateLastCheckAt: Date.now() };
    check(`update dialog up_to_date (${locale})`, () => {
      const payload = updates.buildDialogPayload();
      assert.strictEqual(payload.kind, "up_to_date");
      assert.ok(!payload.title.includes("getSettings"), payload.title);
      assert.ok(!payload.detail.includes("getSettings"), payload.detail);
      assert.ok(
        payload.title.length > 3 && !payload.title.startsWith("settings."),
        payload.title,
      );
      const ok = payload.actions.find((a) => a.id === "ok");
      assert.ok(ok);
      assert.ok(!String(ok.label).includes("getSettings"));
      assert.ok(!String(ok.label).startsWith("settings."));
    });
  }

  settings = { ...DEFAULT_SETTINGS, locale: "en", updateLastCheckAt: Date.now() };
  check("update state up_to_date shape", () => {
    const state = updates.getUpdateStatePayload();
    assert.strictEqual(state.phase, "up_to_date");
    assert.strictEqual(state.currentVersion, "1.0.7");
  });

  check("EN translator", () => {
    const tr = createTranslator("en");
    assert.ok(tr.t("settings.updateUpToDateTitle").toLowerCase().includes("date"));
    assert.strictEqual(tr.t("settings.updateDialogOk"), "OK");
  });

  check("RU translator", () => {
    const tr = createTranslator("ru");
    assert.ok(/[А-Яа-яЁё]/.test(tr.t("settings.updateUpToDateTitle")));
  });

  try {
    const breakWin = await loadWindow("src/break.html", "preload-break.js");
    const api = await breakWin.webContents.executeJavaScript(`({
      skip: typeof window.catBreak?.skipBreak,
      save: typeof window.catBreak?.saveSettings,
      install: typeof window.catBreak?.installUpdate,
      onInit: typeof window.catBreak?.onBreakInit,
    })`);
    check("break preload least-privilege", () => {
      assert.strictEqual(api.skip, "function");
      assert.strictEqual(api.onInit, "function");
      assert.strictEqual(api.save, "undefined");
      assert.strictEqual(api.install, "undefined");
    });
    breakWin.destroy();
  } catch (err) {
    check("break window load", () => {
      throw err;
    });
  }

  await new Promise((r) => setTimeout(r, 200));

  try {
    const settingsWin = await loadWindow("src/settings.html", "preload-settings.js");
    const api = await settingsWin.webContents.executeJavaScript(`({
      getSettings: typeof window.catBreak?.getSettings,
      saveSettings: typeof window.catBreak?.saveSettings,
      skipBreak: typeof window.catBreak?.skipBreak,
      installUpdate: typeof window.catBreak?.installUpdate,
    })`);
    check("settings preload API", () => {
      assert.strictEqual(api.getSettings, "function");
      assert.strictEqual(api.saveSettings, "function");
      assert.strictEqual(api.skipBreak, "undefined");
      assert.strictEqual(api.installUpdate, "undefined");
    });

    const boot = await settingsWin.webContents.executeJavaScript(`
      (async () => {
        try {
          const data = await window.catBreak.getSettings();
          return {
            ok: true,
            hasStrings: typeof data?.strings?.settings?.sub === "string",
            version: data?.appVersion || null,
            error: null,
          };
        } catch (e) {
          return { ok: false, error: String(e), hasStrings: false, version: null };
        }
      })()
    `);
    check("settings getSettings IPC", () => {
      assert.strictEqual(boot.ok, true, boot.error || "invoke failed");
      assert.strictEqual(boot.hasStrings, true);
      assert.strictEqual(boot.version, "1.0.7");
    });
    settingsWin.destroy();
  } catch (err) {
    check("settings window load", () => {
      throw err;
    });
  }

  await new Promise((r) => setTimeout(r, 200));

  try {
    const updateWin = await loadWindow(
      "src/update-dialog.html",
      "preload-update.js",
    );
    const api = await updateWin.webContents.executeJavaScript(`({
      action: typeof window.catBreak?.updateDialogAction,
      save: typeof window.catBreak?.saveSettings,
      onDialog: typeof window.catBreak?.onUpdateDialog,
    })`);
    check("update-dialog preload", () => {
      assert.strictEqual(api.action, "function");
      assert.strictEqual(api.onDialog, "function");
      assert.strictEqual(api.save, "undefined");
    });
    updateWin.destroy();
  } catch (err) {
    check("update-dialog window load", () => {
      throw err;
    });
  }

  if (failures.length) {
    console.error(`\nSMOKE FAILED (${failures.length})`);
    for (const f of failures) console.error(` - ${f}`);
    app.exit(1);
    return;
  }
  console.log("\nsmoke-electron: ok");
  app.exit(0);
}

app.whenReady().then(run).catch((err) => {
  console.error(err);
  app.exit(1);
});

// Keep process alive between sequential BrowserWindow loads.
app.on("window-all-closed", (e) => {
  e.preventDefault();
});
