# Installing Cat Break on macOS

[Русский](../ru/MACOS_INSTALL.md)

## Requirements

- macOS 12 Monterey or later
- Pre-built releases: **arm64** (Apple Silicon); **x64** (Intel) available when published
- Build for Intel on a Mac: `npm run dist:mac:x64`

## Download a release

**DMG**

1. Get `Cat Break-*-arm64.dmg` (or `*-x64.dmg` for Intel) from [Releases](https://github.com/anatoly-kulishov/CatBreak/releases), or build from source.
2. Open the DMG and drag **Cat Break** to **Applications**.

**ZIP**

1. Get `Cat Break-*-arm64-mac.zip` from Releases.
2. Unzip the archive (often into **Downloads**).
3. Drag **Cat Break.app** to **Applications** — do not run it from the extracted folder.

## First launch (unsigned app)

The app is **not** signed with an Apple Developer ID. macOS may block the first launch.

**Option 1:** Right-click `Cat Break.app` → **Open** → **Open** in the dialog.

If macOS says the app is **“damaged”** and there is no second **Open** button, remove the quarantine attribute in Terminal:

```bash
xattr -cr "/Applications/Cat Break.app"
open "/Applications/Cat Break.app"
```

Run the `/Applications/...` command **after** moving the app to **Applications** (DMG or ZIP).

If the app is still in **Downloads** and you have not moved it yet:

```bash
xattr -cr "$HOME/Downloads/Cat Break.app"
```

Use the real path if the unzip folder name differs. Then move the app to **Applications** and prefer the first command.

**Option 3:** **System Settings** → **Privacy & Security** → **Open Anyway** (after a blocked launch attempt).

## Launch at login

Enable **Launch at login** in the app **Settings** (macOS and Windows). The app starts to the menu bar only.

## Screen recording (optional)

Not required in v1.0.3. If a future version adds a blurred desktop background, grant **Screen Recording** for Cat Break under **Privacy & Security**.

## “Cannot open because of a problem”

Do **not** run `codesign --deep` on the `.app` manually — it breaks Electron Framework signatures and the app will crash.

Use a build from this repository or Releases without re-signing.
