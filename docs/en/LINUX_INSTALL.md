# Installing Cat Break on Linux

[Русский](../ru/LINUX_INSTALL.md)

## Requirements

- Ubuntu 22.04+, Fedora 38+, or similar (64-bit)
- System tray (AppIndicator / StatusNotifier)
- **X11** is recommended for a reliable fullscreen overlay; on **Wayland** behavior depends on the compositor

## Install

### AppImage (recommended)

```bash
chmod +x Cat_Break-*.AppImage
./Cat_Break-*.AppImage
```

### deb (Debian / Ubuntu)

```bash
sudo dpkg -i cat-break_*_amd64.deb
```

Launch from the app menu or run `cat-break` (package name may vary).

## Tray icon

If the tray icon is missing, install AppIndicator support:

**Ubuntu / Debian:**

```bash
sudo apt install libayatana-appindicator3-1
```

**Fedora:**

```bash
sudo dnf install libappindicator-gtk3
```

On GNOME, enable the **AppIndicator** or **Tray Icons** extension.

## Build on Linux

```bash
git clone https://github.com/anatoly-kulishov/CatBreak.git
cd CatBreak
npm install
npm run dist:linux
```

Artifacts: `dist/*.AppImage`, `dist/*.deb`.

## Wayland

On Wayland the break overlay may not cover all windows. If the break does not go fullscreen, try an **X11** session or adjust compositor settings.

## Known limitations

- Packages are not officially signed.
- `alwaysOnTop` behavior varies by desktop environment (KDE, GNOME, etc.).
- **Launch at login** is not available on Linux in v1.0.3 (macOS and Windows only).
