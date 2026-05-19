# Changelog

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
