# Cat Break на Linux

## Требования

- Ubuntu 22.04+, Fedora 38+ или аналог (64-bit)
- Системный трей (AppIndicator / StatusNotifier)
- Для оверлея поверх всех окон предпочтителен **X11**; на **Wayland** поведение зависит от композитора

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

Запуск из меню приложений или `cat-break` (имя может отличаться в зависимости от пакета).

## Трей

Если иконки нет в трее, установите поддержку AppIndicator:

**Ubuntu / Debian:**

```bash
sudo apt install libayatana-appindicator3-1
```

**Fedora:**

```bash
sudo dnf install libappindicator-gtk3
```

В GNOME включите расширение **AppIndicator** или **Tray Icons**.

## Сборка на Linux

```bash
git clone https://github.com/anatoly-kulishov/CatBreak.git
cd CatBreak
npm install
npm run dist:linux
```

Артефакты: `dist/*.AppImage`, `dist/*.deb`.

## Wayland

На Wayland полноэкранный оверлей может не перекрывать все окна. Если перерыв не на весь экран — войдите в сессию **X11** или проверьте настройки композитора.

## Известные ограничения

- Нет официальной подписи пакетов.
- Поведение `alwaysOnTop` различается между DE (KDE, GNOME, etc.).
