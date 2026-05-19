# Cat Break на Linux

[English](../en/LINUX_INSTALL.md)

## Требования

- Ubuntu 22.04+, Fedora 38+ или аналог (64-bit)
- Системный трей (AppIndicator / StatusNotifier)
- Предпочтителен **X11**; на **Wayland** поведение зависит от композитора

## Установка

### AppImage (рекомендуется)

```bash
chmod +x Cat_Break-*.AppImage
./Cat_Break-*.AppImage
```

### deb (Debian/Ubuntu)

```bash
sudo dpkg -i cat-break_*_amd64.deb
```

Запуск из меню или `cat-break`.

## Трей

**Ubuntu / Debian:**

```bash
sudo apt install libayatana-appindicator3-1
```

**Fedora:**

```bash
sudo dnf install libappindicator-gtk3
```

В GNOME — расширение **AppIndicator** или **Tray Icons**.

## Сборка на Linux

```bash
git clone https://github.com/anatoly-kulishov/CatBreak.git
cd CatBreak
npm install
npm run dist:linux
```

Артефакты: `dist/*.AppImage`, `dist/*.deb`.

## Wayland

Оверлей может не перекрывать все окна — попробуйте сессию **X11**.

## Ограничения

- Пакеты без официальной подписи.
- `alwaysOnTop` зависит от окружения рабочего стола.
- **Автозапуск** в v1.0.1 недоступен на Linux (только macOS и Windows).
