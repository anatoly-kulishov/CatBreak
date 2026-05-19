# Cat Break

Eye break reminders for your desktop: a menu bar / system tray timer, a fullscreen overlay on every display, and a cat.

**Platforms:** macOS · Windows · Linux (Electron)

## Features

- Work and break timer (default 55 / 5 minutes)
- **System tray** icon (macOS menu bar, Windows notification area, Linux AppIndicator)
- Fullscreen break overlay on **each monitor**
- Cat animation on the break screen
- Pauses the work timer while idle
- Optional eye exercises, strict mode (no skip button), 30-second demo
- **English** and **Russian** UI (Settings → Language)
- Postpone break (+5 / +10 min), optional pre-break notification, end-of-break chime
- Launch at login (macOS / Windows)

## Platform support

| Platform | Status | Build | Docs |
|----------|--------|-------|------|
| **macOS** 12+ (Apple Silicon / Intel) | Primary | `npm run dist:mac` | [en/MACOS_INSTALL.md](docs/en/MACOS_INSTALL.md) |
| **Windows** 10/11 x64, arm64 | Supported | `npm run dist:win` | [en/WINDOWS_INSTALL.md](docs/en/WINDOWS_INSTALL.md) |
| **Linux** x64 (AppImage, deb) | Supported* | `npm run dist:linux` | [en/LINUX_INSTALL.md](docs/en/LINUX_INSTALL.md) |

\* On **Wayland**, the always-on-top overlay may be limited; **X11** works more reliably.

## Quick start

```bash
git clone https://github.com/anatoly-kulishov/CatBreak.git
cd CatBreak
npm install
npm start
```

Right-click the tray icon → **Settings**, **Demo (30 sec)**.

## Build

```bash
npm install
npm run prepare    # generates build/icon.ico for Windows
npm run dist:mac   # DMG + ZIP (on macOS)
npm run dist:win   # NSIS + portable (best on Windows; Wine needed on Mac for NSIS)
npm run dist:linux # AppImage + deb (best on Linux)
npm run dist:all   # all targets (slow; cross-compilation has limits)
```

Output goes to `dist/`.

### Build by OS

| Command | Run on | Output |
|---------|--------|--------|
| `dist:mac` | macOS | `.dmg`, `.zip` |
| `dist:win` | Windows (or macOS + Wine) | `Setup.exe`, portable `.exe` |
| `dist:linux` | Linux | `.AppImage`, `.deb` |

> **macOS:** do not run `codesign --deep` on the `.app` — it breaks Electron Framework signatures and the app will crash on launch.

## Usage

1. Launch the app — a tray icon appears.
2. Wait for a break, or choose **Start break now** / **Demo (30 sec)**.
3. When the timer ends, overlay windows close automatically.
4. **Settings** — work/break intervals, idle pause, exercises, strict mode, language.

On **Windows/Linux**, the countdown is shown in the tray **tooltip**. On **macOS**, it also appears next to the menu bar icon.

## Project layout

```
CatBreak/
├── main.js
├── lib/
│   ├── platform.js   # OS-specific window & tray behavior
│   └── i18n.js       # locales
├── locales/          # en.json, ru.json
├── preload.js
├── src/
├── assets/
├── build/            # icon.icns, icon.ico, icon.png
├── docs/
└── scripts/
```

## GitHub Releases

Attach platform artifacts to each release:

- macOS: `*.dmg`, `*-mac.zip`
- Windows: `*Setup*.exe`, portable `*.exe`
- Linux: `*.AppImage`, `*.deb`

Unsigned builds: users may need **Right-click → Open** (macOS) or SmartScreen confirmation (Windows). See [docs/en/](docs/en/) or [docs/ru/](docs/ru/).

## License

[MIT](LICENSE) · [Icon credits](build/ICON_CREDITS.txt)
