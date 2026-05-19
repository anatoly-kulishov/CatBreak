# Installing Cat Break on macOS

[Русский](../ru/MACOS_INSTALL.md)

## Requirements

- macOS 12 Monterey or later
- Pre-built releases: **arm64** (Apple Silicon); **x64** (Intel) available when published
- Build for Intel on a Mac: `npm run dist:mac:x64`

## Download a release

1. Get `Cat Break-*-arm64.dmg` (or `*-x64.dmg` for Intel) from [Releases](https://github.com/anatoly-kulishov/CatBreak/releases), or build from source.
2. Open the DMG and drag **Cat Break** to **Applications**.

## First launch (unsigned app)

The app is **not** signed with an Apple Developer ID. macOS may block the first launch.

**Option 1:** Right-click `Cat Break.app` → **Open** → **Open** in the dialog.

**Option 2:** Terminal:

```bash
xattr -cr "/Applications/Cat Break.app"
open "/Applications/Cat Break.app"
```

**Option 3:** **System Settings** → **Privacy & Security** → **Open Anyway** (after a blocked launch attempt).

## Launch at login

Enable **Launch at login** in the app **Settings** (macOS and Windows). The app starts to the menu bar only.

## Screen recording (optional)

Not required in v1.0.1. If a future version adds a blurred desktop background, grant **Screen Recording** for Cat Break under **Privacy & Security**.

## “Cannot open because of a problem”

Do **not** run `codesign --deep` on the `.app` manually — it breaks Electron Framework signatures and the app will crash.

Use a build from this repository or Releases without re-signing.
