# Installing Cat Break on Windows

[Русский](../ru/WINDOWS_INSTALL.md)

## Requirements

- Windows 10 or 11 (64-bit)
- Node.js 20+ (build from source only)

## Install

1. Download `Cat Break Setup *.exe` or the portable `Cat Break *.exe` from [Releases](https://github.com/anatoly-kulishov/CatBreak/releases).
2. If **SmartScreen** shows “Unknown publisher”: **More info** → **Run anyway**.
3. The icon appears in the **notification area** (system tray). It may be under the hidden icons (^) chevron.

## Usage

Right-click the tray icon:

- **Start break now**
- **Demo (30 sec)**
- **Postpone break (+5 / +10 min)**
- **Settings**
- **Quit**

The countdown is shown in the icon **tooltip**.

## Launch at login

Enable **Launch at login** in **Settings** (macOS and Windows).

## Build on Windows

```bash
git clone https://github.com/anatoly-kulishov/CatBreak.git
cd CatBreak
npm install
npm run dist:win
```

Artifacts: `dist/Cat Break Setup *.exe`, portable `.exe`.

### Build error: “Cannot create symbolic link” (winCodeSign)

If `electron-builder` fails while extracting `winCodeSign` with **Cannot create symbolic link**, Windows blocked symlink creation (no code signing certificate is used anyway).

**Fix (pick one):**

1. **Recommended:** pull the latest `package.json` — unsigned Windows builds set `signAndEditExecutable: false` so `winCodeSign` is not needed.
2. **Settings → Privacy & security → For developers** → enable **Developer Mode**, then delete the cache folder and rebuild:
   ```bat
   rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign"
   npm run dist:win
   ```
3. Run **Command Prompt as Administrator** and run `npm run dist:win` again.

Optional env var (unsigned build):

```bat
set CSC_IDENTITY_AUTO_DISCOVERY=false
npm run dist:win
```

## Known limitations

- Always-on-top overlay behavior depends on Windows version and fullscreen apps (e.g. games).
- The app is **not** Authenticode-signed — SmartScreen may warn on first run.
