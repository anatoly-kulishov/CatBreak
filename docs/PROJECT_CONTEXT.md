# Cat Break — контекст проекта (onboarding)

Документ для **нового чата / нового разработчика**: что это за приложение, как устроено, где что лежит, на что не наступать.

**Связанные документы:**

| Документ | Зачем |
|----------|--------|
| [CHAT_HANDOFF.md](CHAT_HANDOFF.md) | Handoff чата: UX-решения, tray, npm, backlog |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Цвета, лендинг, иконки |
| [LANDING_PAGES.md](LANDING_PAGES.md) | GitHub Pages, `#download-platform` |
| [README.md](README.md) | Установка по платформам |
| [CHANGELOG.md](../CHANGELOG.md) | Версии и история |

**Репозиторий:** https://github.com/anatoly-kulishov/CatBreak  
**Ветки:** `main` (stable), `develop` (работа). PR: `develop` → `main`.  
**Версия:** см. `package.json` (сейчас **1.0.7**).

---

## 1. Что это

**Cat Break** — desktop-приложение на **Electron** (Node ≥20): напоминания о перерыве для глаз.

- Таймер **работа / перерыв** в **system tray**
- По окончании работы — **полноэкранный overlay на всех мониторах** с WebM-котом
- Настройки: длительность, idle-pause, упражнения, strict mode, звук, уведомление, autostart
- UI: **EN / RU** (`locales/en.json`, `locales/ru.json`)
- Сборки: **macOS** (dmg/zip), **Windows** (nsis/portable), **Linux** (AppImage/deb) — **без code signing**

Отдельно: статический **лендинг** в `landing/` (скачивание с GitHub Releases, GitHub Pages).

---

## 2. Архитектура (кратко)

```mermaid
flowchart TB
  subgraph mainProc [main.js]
    Tray[Tray_Menu]
    Tick[tick_1s]
    SettingsWin[Settings_Window]
    BreakWins[Break_Windows]
  end

  subgraph libLayer [lib]
    Platform[platform.js]
    Timer[timer.js]
    BreakOv[break-windows.js]
    UpdateUi[update-ui.js]
    Releases[releases.js]
  end

  subgraph preloadLayer [preload]
    PreSettings[preload-settings.js]
    PreBreak[preload-break.js]
    PreUpdate[preload-update.js]
  end

  subgraph renderer
    SettingsUI[src/settings]
    BreakUI[src/break]
  end

  Tray --> Tick
  Tick --> BreakWins
  SettingsWin --> PreSettings
  BreakWins --> PreBreak
  PreSettings --> SettingsUI
  PreBreak --> BreakUI
  mainProc --> libLayer
```

**Процесс один** (`requestSingleInstanceLock`). Нет главного окна — только tray; второй запуск открывает Settings. Preload **разный** по типу окна (`sandbox: true` везде).

**Настройки на диске:** `{userData}/settings.json` (см. `SETTINGS_PATH` в `main.js`).

---

## 3. Жизненный цикл таймера

| Состояние | Поведение |
|-----------|-----------|
| **Work** | `session.workSecondsLeft` уменьшается каждую секунду (`lib/timer.js`) |
| **Idle** | Если `powerMonitor.getSystemIdleTime()` ≥ `idlePauseMinutes` — таймер **не тикает** |
| **Pre-break** | За 60 с до конца work — optional notification (`notifyBeforeBreak`) |
| **Break** | `session.onBreak`, окна на каждом `display` (`lib/break-windows.js`), countdown тикает |
| **End break** | Анимация выхода кота → `endBreak()` → снова work timer с полным `workMinutes` |

**Важные точки:**

- `session.tick()` / `overlays.*` — не ставить `breakExitRequested` вручную, только через `requestBreakExit()` → `session.markExitRequested()` (баг 1.0.0)
- `startBreak({ demo, seconds })` — demo = 30 с; concurrent start игнорируется (`withCreateLock`)
- Display hotplug: `overlays.bindDisplayHotplug()` пересоздаёт окна при add/remove монитора
- `postponeBreak(5|10)` — только когда **не** onBreak
- Первый запуск без `settings.json` автоматически открывает Settings.

---

## 4. Карта файлов

```
main.js              # wiring: tray, IPC, lifecycle
preload-settings.js  # Settings window API
preload-break.js     # break overlay API
preload-update.js    # compact update dialog API
package.json         # scripts, electron-builder targets

lib/
  platform.js        # OS: tray title, break window flags, icons
  timer.js           # work/break session FSM (no Electron)
  break-windows.js   # multi-display overlays + display hotplug
  update-ui.js       # update check/download/dialogs
  release-assets.js  # shared asset categorize/sort (Node + browser UMD)
  releases.js        # GitHub API + pick asset for runtime
  updater.js         # electron-updater glue
  i18n.js / autostart.js / notifications.js

src/
  settings.html/js/css   # окно настроек
  break.html/js/css      # fullscreen break overlay
  update-dialog.*        # compact macOS update prompt

locales/en.json, ru.json
assets/
  neko1.webm, neko2.webm   # cat videos (large)
  meow.mp3                 # end-of-break sound
  trayIcon*.png
  app-icon-1024.png        # generated

build/
  icon-source.png      # исходник иллюстрации (1024, без alpha)
  icon.png/.icns/.ico  # generated (npm run prepare)

landing/               # GitHub Pages (не Electron)
  index.html, styles.css, download.js, release-assets.js, app-icon.png

scripts/
  prepare-icons.js         # squircle app icons + landing/app-icon.png
  sync-release-assets.js   # lib/release-assets.js → landing/
  selfcheck-lib.js         # npm test
  update-meow.sh

docs/                  # install guides, DESIGN_SYSTEM, этот файл
.github/workflows/
  ci.yml               # syntax check + npm test
  landing-pages.yml    # deploy landing/ on push to main
```

---

## 5. Настройки (DEFAULT_SETTINGS)

```js
{
  workMinutes: 55,
  breakMinutes: 5,
  idlePauseMinutes: 2,
  showExercises: true,
  strictBreak: false,      // без кнопки Skip, closable=false на break window
  locale: "auto",          // "en" | "ru" | "auto"
  notifyBeforeBreak: true,
  soundOnBreakEnd: true,
  launchAtLogin: false,    // UI скрыт на Linux (canUseLoginItemSettings)
}
```

Сохранение: IPC `save-settings` → merge с DEFAULT → `saveSettings()` → при смене locale — `broadcastBreakLocaleUpdate()`.

---

## 6. IPC / preload API

| Канал | Направление | Назначение |
|-------|-------------|------------|
| `get-settings` | invoke | settings + strings + version + releasesUrl |
| `save-settings` | invoke | сохранить settings |
| `skip-break` | invoke | `requestBreakExit({ fast: true })` |
| `break-init` | main → break | payload: totalSeconds, strings, strictBreak, demo… |
| `break-tick` | main → break | `{ secondsLeft }` |
| `break-exit-request` | main → break | `{ fast, playSound }` |
| `break-locale-update` | main → break | новые strings при смене языка в Settings |
| `settings-updated` | main → settings | push после save |

Renderer: **`window.catBreak`** (`preload-settings.js` / `preload-break.js` / `preload-update.js`), `contextIsolation: true`, `sandbox: true`.

Break overlay CSP: `default-src 'self'; media-src 'self'; … script-src 'self'`.

---

## 7. Break UI (`src/break.js`)

- Два видео `neko1` / `neko2`: slide-in, sleep, exit animation
- Countdown крупно слева; side panel: hint, exercises, skip
- **`playEndMeow()`** — `assets/meow.mp3`, fallback Web Audio synth
- Strict mode: skip hidden, close window → fast exit

---

## 8. Platform notes (читать перед правками)

| OS | Особенности |
|----|-------------|
| **macOS** | Dock hidden; tray **title** с таймером; double-click tray → Settings; **unsigned** — Gatekeeper, см. `docs/en/MACOS_INSTALL.md` |
| **Windows** | `signAndEditExecutable: false` в package.json (иначе winCodeSign/7zip symlink error); SmartScreen |
| **Linux** | autostart UI hidden; AppImage/deb |

**Не использовать `codesign --deep`** на post-build — ломало запуск на чужих Mac (см. CHANGELOG 1.0.0).

**Иконки:** `npm run prepare` после смены `build/icon-source.png`. App icon ≠ landing icon (прозрачный кот без плитки).

---

## 9. Сборка и релизы

```bash
npm start              # dev
npm run prepare        # icons
npm run dist:mac       # dmg + zip (+ MACOS_INSTALL.md в dist/)
npm run dist:mac:x64   # Intel Mac
npm run dist:win
npm run dist:linux
```

Артефакты: `dist/`. Релизы — **GitHub Releases** (лендинг тянет `/releases/latest` API).

**Публикация релиза (без ручной загрузки файлов):**

1. Версия в `package.json` и секция в `CHANGELOG.md` совпадают.
2. Код в `main`, затем один из вариантов:
   - **Тег:** `git tag v1.0.6 && git push origin v1.0.6` → workflow `release.yml` (notes из CHANGELOG + сборка mac/win/linux + upload).
   - **Кнопка:** GitHub → Actions → Release → Run workflow → version `1.0.6` (как в `package.json`, не `1.0.0`), ref `main` → создаёт тег и запускает pipeline.
   - **Пересборка:** если тег уже есть — Run workflow с `rebuild_only=true` и той же version.
3. Дождаться зелёных job **release-notes** и три **build**. Артефакты и `latest-*.yml` появятся на Releases автоматически.

При **Request timed out** на Windows: **не** жмите Re-run failed jobs на старом run (workflow застрял на коммите тега). Варианты:
- **Release Windows assets → Run workflow** (только Windows, всегда с `main`, tag `v1.0.6`)
- **Release → Run workflow** → version `1.0.6`, **rebuild_only** включён, ref `main`

Локально `npm run dist:*` — только для проверки; на GitHub заливать вручную не нужно.

CI (`ci.yml`): `npm ci`, `prepare` (sync release-assets + icons), `npm test`, `node --check` на main/lib/preload/landing/scripts.

---

## 10. Лендинг

- `#download-platform` — macOS / Windows / Linux dropdowns, файлы из GitHub API
- `detectPlatform()` — подсветка «ваша система», OS-specific install hint
- Деплой: push `landing/**` в **main** → workflow `landing-pages.yml`
- Дизайн-токены: `landing/styles.css` (см. DESIGN_SYSTEM.md)

Лендинг **не** входит в electron-builder `files`.

---

## 11. i18n

- Файлы: `locales/en.json`, `locales/ru.json`
- Ключи: `app.*`, `tray.*`, `settings.*`, `break.*`, `notify.*`
- Плейсхолдеры: `{{clock}}`, `{{minutes}}` и т.д.
- HTML: `lang` на settings/break выставляется из resolved locale

Новая опция в Settings → добавить ключи в **оба** JSON + UI в `settings.html/js`.

---

## 12. Типичные задачи → куда лезть

| Задача | Файлы |
|--------|--------|
| Логика таймера | `lib/timer.js`, wiring в `main.js` |
| Break overlays / multi-monitor | `lib/break-windows.js`, `lib/platform.js` |
| Updates UI | `lib/update-ui.js`, `lib/updater.js`, `lib/releases.js` |
| Asset menus (app + landing) | `lib/release-assets.js` (+ sync в `landing/`) |
| Новая настройка | `main.js` DEFAULT + IPC, `settings.*`, `locales/*` |
| Текст break overlay | `locales/*`, `src/break.js` |
| Звук конца перерыва | `assets/meow.mp3`, `src/break.js`, `scripts/update-meow.sh` |
| Иконка / tray | `build/icon-source.png`, `scripts/prepare-icons.js`, `assets/trayIcon*` |
| Лендинг / скачивание | `landing/*`, `docs/LANDING_PAGES.md` |
| Установка пользователям | `docs/en/*`, `docs/ru/*` |
| CI | `.github/workflows/ci.yml` |
| Релиз на GitHub | `.github/workflows/release.yml`, `scripts/release-notes-from-changelog.js` |

---

## 13. Известные ограничения

- **Обновления:** упакованная сборка — `electron-updater` (фоновая загрузка, `latest-*.yml` по тегу `v*`); fallback — GitHub API (`lib/releases.js`). Settings: статус, «Проверить обновления», баннер с прогрессом; на **macOS** диалог с иконкой кота (in-app, `src/update-dialog.html` или модалка в Settings); на Win/Linux — нативный диалог + `.ico`. Настройки: `autoDownloadUpdates`, `autoInstallOnQuit`. macOS `quitAndInstall` без подписи Apple часто не срабатывает — ручная установка из Releases. Артефакты релиза: `Cat-Break-${version}-${arch}.${ext}`.
- Нет подписи бинарников
- Settings/Break UI — **legacy** палитра (orange CTA); лендинг — новая cyan DS (см. DESIGN_SYSTEM)
- `landing/` и docs могут быть в `develop` раньше, чем в `main`
- GitHub API на лендинге: rate limit / CORS нет (client-side fetch); при 404 — fallback на Releases page

---

## 14. Промпт для нового чата (можно вставить)

```
Проект: Cat Break — Electron tray timer + fullscreen cat break overlay.
Repo: anatoly-kulishov/CatBreak, ветка develop/main.
Прочитай docs/PROJECT_CONTEXT.md, docs/DESIGN_SYSTEM.md.
Entry: main.js, preload-*.js, lib/timer.js, lib/break-windows.js, lib/update-ui.js, src/break.js, src/settings.js, landing/download.js.
Не подписывать билды codesign --deep. Windows: signAndEditExecutable: false.
```

---

## 15. Чеклист перед PR

- [ ] `node --check` на затронутые `.js`
- [ ] EN + RU для новых строк
- [ ] `npm run prepare` если менялся `icon-source.png`
- [ ] Не коммитить secrets / `.env`
- [ ] macOS/Win/Linux нюансы если трогали platform/autostart/notifications
