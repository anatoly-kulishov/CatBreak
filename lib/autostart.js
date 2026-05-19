const { app } = require("electron");

function canUseLoginItemSettings() {
  return process.platform === "darwin" || process.platform === "win32";
}

function applyLaunchAtLogin(enabled) {
  if (!canUseLoginItemSettings()) {
    return { ok: false, reason: "unsupported-platform" };
  }

  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      openAsHidden: true,
      name: "Cat Break",
    });
    return { ok: true };
  } catch (err) {
    console.error("launchAtLogin", err);
    return { ok: false, reason: String(err) };
  }
}

function isLaunchAtLoginEnabled() {
  if (!canUseLoginItemSettings()) {
    return false;
  }
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
}

module.exports = {
  canUseLoginItemSettings,
  applyLaunchAtLogin,
  isLaunchAtLoginEnabled,
};
