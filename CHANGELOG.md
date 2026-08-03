# Changelog

## [1.0.7] - 2026-08-03

### Changed

- Refactor main process: extract `lib/timer.js`, `lib/break-windows.js`, `lib/update-ui.js`; split preloads by window; sandbox Settings and update dialog
- Shared GitHub asset helpers in `lib/release-assets.js` (used by app updater and landing download menus)
- Settings copy clarifies unsigned macOS update/install limits
- CI: `npm test` selfcheck for timer and release-asset helpers

### Fixed

- Main-process update dialog fallback used `window.setTimeout` (ReferenceError); settings save now clamps/validates values and preserves update dismiss/last-check fields
- Break overlays recreate when displays are added or removed during a break
- Update dialogs showed raw `getSettings().…` keys after update-ui extract (i18n path mangled)

## [1.0.6] - 2026-05-21

### Added

- Settings: update status line, manual check button, background download and install-on-quit options
- macOS: in-app update dialogs with app icon; compact update prompt window from tray (without opening full Settings)
- Windows: multi-size `.ico`, window/taskbar/installer icons; release artifact name `Cat-Break-*`

### Changed

- Update flow: notifications when download completes, restart prompt, retry on check errors, release notes in dialog (GitHub body)
- Update channel hint in UI (in-app updater vs GitHub Releases)

## [1.0.5] - 2026-05-21

### Changed

- Landing: FAQ click targets, macOS quarantine notes (DMG then Applications), hero idle-only motion
- Landing: dedupe duplicate CI release assets in platform download menus; shorter menu labels
- Paw decor: three toes and pad (break overlay and landing)

## [1.0.4] - 2026-05-21

### Added

- In-app update checks: GitHub Releases API fallback and `electron-updater` in packaged builds
- Settings update banner with download progress and tray actions (check, download, install)
- GitHub Actions release workflow (`v*`) publishing artifacts and `latest-*.yml` for auto-update

## [1.0.3] - 2026-05-21

### Added

- Settings open automatically on first launch when no saved settings exist
- Timer presets in Settings: 55/5, 50/10, and 25/5
- Demo break button in Settings
- macOS install guidance for the “app is damaged” Gatekeeper dialog

### Changed

- Tray menu labels are clearer: “Postpone 5 minutes” and “Restart work timer”
- Settings window height adjusted for the quick-start controls
- Meow at break end now plays on early exit too (skip, close window, tray “End break”) when enabled

## [1.0.2] - 2026-05-20

### Added

- Settings grouped into sections (General, Timing, Break behavior) with helper hints
- Landing: release loading label and pending state for the version pill
- `prefers-reduced-motion` support on break overlay and landing spinner

### Fixed

- Linux `.deb` build: `author` / `maintainer` in `package.json` for electron-builder
- Landing download menu: distinct labels for Windows installer vs portable, macOS DMG vs ZIP

### Changed

- App UI (Settings, break overlay) aligned with landing design tokens (cyan accent, dark surfaces)
- Tray menu regrouped: break actions, postpone, reset, settings, quit
- Save feedback and focus styles in Settings

## [1.0.1] - 2026-05-19

### Added

- Postpone break (+5 / +10 min) from the tray menu
- Optional notification 1 minute before a break
- Optional meow when a break ends (real cat SFX from Mixkit, Web Audio fallback)
- Launch at login (macOS and Windows)
- App version and Releases link in Settings
- English and Russian strings for new options

### Fixed

- Windows build: disable `signAndEditExecutable` to avoid winCodeSign symlink errors on unsigned builds
- Document `lang` on settings/break pages follows selected locale
- Break overlay text updates when language is changed in Settings during a break

### Changed

- Installation docs in `docs/en/` and `docs/ru/`
- Tray double-click (macOS) opens Settings
- `package.json` description in English
- GitHub Actions workflow for syntax checks

## [1.0.0] - 2026-05-19

- Initial release: tray timer, fullscreen break overlay, cat animation
- macOS, Windows, and Linux builds
- English and Russian UI
