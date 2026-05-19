# Cat Break

Напоминания о перерывах для глаз: таймер в трее, полноэкранный оверлей на всех мониторах и кот.

**Платформы:** macOS · Windows · Linux (Electron)

## Возможности

- Таймер работы и перерыва (по умолчанию 55 / 5 минут)
- Иконка в **системном трее** (меню macOS / область уведомлений Windows / AppIndicator Linux)
- Полноэкранный перерыв на **каждом мониторе**
- Анимация кота
- Пауза таймера при простое
- Упражнения для глаз, строгий режим, демо 30 сек

## Платформы

| Платформа | Статус | Сборка | Документация |
|-----------|--------|--------|--------------|
| **macOS** 12+ (Apple Silicon / Intel) | Основная | `npm run dist:mac` | [MACOS_INSTALL.md](docs/MACOS_INSTALL.md) |
| **Windows** 10/11 x64, arm64 | Поддерживается | `npm run dist:win` | [WINDOWS_INSTALL.md](docs/WINDOWS_INSTALL.md) |
| **Linux** x64 (AppImage, deb) | Поддерживается* | `npm run dist:linux` | [LINUX_INSTALL.md](docs/LINUX_INSTALL.md) |

\* На **Wayland** оверлей поверх всех окон может работать ограниченно; предпочтителен X11.

## Быстрый старт

```bash
git clone https://github.com/anatoly-kulishov/CatBreak.git
cd CatBreak
npm install
npm start
```

ПКМ по иконке в трее → **Настройки**, **Демо (30 сек)**.

## Сборка

```bash
npm install
npm run prepare    # icon.ico для Windows
npm run dist:mac   # DMG + ZIP (на macOS)
npm run dist:win   # NSIS + portable (лучше на Windows; с Mac нужен Wine для NSIS)
npm run dist:linux # AppImage + deb (лучше на Linux)
npm run dist:all   # все три (долго; кросс-сборка с ограничениями)
```

Артефакты в `dist/`.

### Сборка по ОС

| Команда | Где запускать | Результат |
|---------|---------------|-----------|
| `dist:mac` | macOS | `.dmg`, `.zip` |
| `dist:win` | Windows (или macOS + Wine) | `Setup.exe`, portable |
| `dist:linux` | Linux | `.AppImage`, `.deb` |

> **macOS:** не используйте `codesign --deep` на `.app` — ломает Electron Framework.

## Использование

1. Запустите приложение — иконка в трее.
2. Дождитесь перерыва или **Начать перерыв сейчас** / **Демо (30 сек)**.
3. По окончании таймера окна закроются сами.
4. **Настройки** — интервалы, простой, упражнения, строгий режим.

На **Windows/Linux** обратный отсчёт в **подсказке** иконки; в строке меню macOS — также в заголовке иконки.

## Структура

```
CatBreak/
├── main.js
├── lib/platform.js   # ОС-специфичное поведение окон и трея
├── preload.js
├── src/
├── assets/
├── build/            # icon.icns, icon.ico, icon.png
├── docs/
└── scripts/
```

## GitHub Releases

Прикрепите к релизу артефакты своей платформы:

- macOS: `*.dmg`, `*-mac.zip`
- Windows: `*Setup*.exe`, `*.exe` (portable)
- Linux: `*.AppImage`, `*.deb`

## Лицензия

[MIT](LICENSE) · [ICON_CREDITS](build/ICON_CREDITS.txt)
