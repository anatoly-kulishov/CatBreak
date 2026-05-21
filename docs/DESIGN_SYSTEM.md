# Cat Break — design system (reference)

Документ для разработки UI и лендинга. **Источник правды для маркeting/landing** — `landing/styles.css`.  
Окна Electron (`src/settings.css`, `src/break.css`) пока на **legacy-палитре**; при редизайне app UI ориентируйтесь на токены ниже.

---

## 1. Принципы

| | |
|---|---|
| **Тон** | Спокойный, дружелюбный, «забота о глазах», без медицинских обещаний |
| **Тема** | Только **dark** (`color-scheme: dark`) |
| **Языки** | EN + RU; строки в `locales/*.json`, на лендинге — `data-lang-panel` |
| **Акцент** | Холодный cyan (`--accent`), не оранжевый (оранжевый — legacy в settings/break) |

---

## 2. Цвета (landing — целевая система)

CSS-переменные в `landing/styles.css`:

| Token | Hex / value | Назначение |
|-------|-------------|------------|
| `--bg` | `#0c1220` | Базовый фон страницы |
| `--surface` | `#141c2f` | Карточки, переключатель языка |
| `--text` | `#e8ecf4` | Основной текст |
| `--muted` | `#8b96ad` | Вторичный текст, подсказки |
| `--accent` | `#6ee7ff` | Ссылки, активные состояния |
| `--accent-soft` | `rgba(110, 231, 255, 0.12)` | Фон выбранного pill |
| `--radius` | `14px` | Кнопки, панели, platform picker |

**Фон body (градиент):**

```css
radial-gradient(1200px 800px at 20% -10%, #1a2a4a 0%, transparent 55%),
radial-gradient(900px 700px at 100% 0%, #243054 0%, transparent 50%),
var(--bg);
```

**Primary gradient (активная кнопка платформы):**

```css
linear-gradient(160deg, #5dd5ea, #3994ff);
/* текст на gradient: #081018 */
```

**Полупрозрачные границы:** `rgba(255, 255, 255, 0.06–0.12)`  
**Панели:** `background: rgba(255, 255, 255, 0.03)`, border `rgba(255, 255, 255, 0.08)`

### App UI (`src/settings.css`, `src/break.css`)

С **v1.0.2+** окна приложения используют ту же палитру, что и лендинг: `--bg`, `--surface`, `--text`, `--muted`, акцент **`--accent` (#6ee7ff)** и градиент для основной кнопки. Полноэкранный перерыв: обновлённые таймер, боковая панель и кнопка пропуска в этом же ключе; учитывается `prefers-reduced-motion`.

В **v1.0.3** настройки получили быстрые пресеты 55/5, 50/10, 25/5 и кнопку запуска демо-перерыва.

### Ранее (до v1.0.2)

| Файл | Фон | CTA |
|------|-----|-----|
| `src/settings.css` | `#1a1a1a` | `#ff6b35` |
| `src/break.css` | radial `#2a3348` → `#080a10` | `#ff6b35` (`.skip`) |

---

## 3. Типографика

| Элемент | Landing | App |
|---------|---------|-----|
| Font stack | `--font`: SF Pro Text, system-ui… | system-ui, Apple, Segoe UI… |
| H1 / tagline | `clamp(1.75rem, 4vw, 2.25rem)`, weight 650, letter-spacing −0.03em | settings header ~1.35rem |
| Lead / body | 1.06rem / 0.93rem | 14px base, секции с uppercase-подзаголовками |
| Мелкий текст | 0.85–0.92rem (`--muted`) | hints ~0.75rem `--muted` |

---

## 4. Отступы и сетка

- **Контейнер:** `.page` — `max-width: 54rem`, padding `3rem 1.25rem 4rem`
- **Hero:** grid, с `720px` — иконка слева, текст справа; gap `2.5rem`
- **Gap в toolbar:** `0.5–0.75rem`
- **Panel padding:** `1.25rem 1.35rem`, `margin-top: 2.75rem`

---

## 5. Компоненты (landing)

### 5.1 Platform picker (`#download-platform`)

- BEM: `.platform-picker`, `__toggle`, `__menu`, `__logo`, `__chevron`
- Состояния:
  - default — тёмная кнопка `rgba(0,0,0,0.35)`
  - `.platform-picker--detected` — подсветка «ваша система» (auto OS)
  - `.platform-picker--open` — primary gradient
- Меню открывается **вверх**; на `<520px` — вниз
- Логика и релизы: `landing/download.js`

### 5.2 Panel (`.panel`)

Информационные блоки: install hint, download note. Заголовок `h2` 1rem / 600.

### 5.3 Lang switch (`.lang-switch`)

Pill `border-radius: 999px`, кнопки с `aria-selected="true"`.

### 5.4 Version pill (`.version-pill`)

Тег версии из GitHub API (`#latest-version`).

### 5.5 Links

- Primary inline: `--accent`, underline on hover
- Secondary row: `.secondary-links`, `--muted`

---

## 6. Иконки и иллюстрации

| Asset | Путь | Назначение |
|-------|------|------------|
| Исходник | `build/icon-source.png` | 1024×1024, **без alpha**, не коммитить правки без `npm run prepare` |
| App icon | `build/icon.png`, `.icns`, `.ico` | Squircle, фон `#1a2230` (`APP_BG` rgb 26,34,48) |
| Landing hero | `landing/app-icon.png` | **Только кот, прозрачный фон** (`buildLandingIcon`) |
| Marketing | `assets/app-icon-1024.png` | Копия app master |
| Tray | `assets/trayIcon*.png` | Отдельно от app icon |
| Cat video | `assets/neko1.webm`, `neko2.webm` | Break overlay |

**Squircle:** radius ≈ **22.3%** от 1024 (`CORNER_RADIUS` в `scripts/prepare-icons.js`).

**Регенерация:**

```bash
npm run prepare
```

### Правила для иконки на лендинге

- **Не** использовать `box-shadow` на `<img>` с alpha — даёт квадратную «подложку»
- Тень только через `filter: drop-shadow(...)` на `.hero__icon-wrap`
- **Не** класть squircle-плитку другого цвета под прозрачный PNG — фон страницы должен просвечивать
- App icon и landing icon — **разные** пайплайны (см. `buildMasterIcon` vs `buildLandingIcon`)

---

## 7. i18n (лендинг)

- `data-lang-panel="en|ru"` + `hidden` на неактивных блоках
- `data-os-hint="mac|win|linux|any"` — подсказки установки (не путать с lang panel)
- `data-i18n-toggle` — подписи кнопок платформ
- `data-releases-link` — href проставляет JS
- Язык: localStorage `catbreak-lang`, fallback `navigator.language`

---

## 8. Break overlay (кратко)

- Fullscreen, cat video slide-in/out (`break.css` keyframes)
- Countdown: крупные tabular nums, полупрозрачная подложка
- Side panel: hint + exercises + skip (orange legacy)
- Звук: `assets/meow.mp3`, fallback Web Audio в `src/break.js`

---

## 9. Карта файлов (для агента)

```
landing/
  index.html      # разметка, #download-platform, #install-hint
  styles.css      # design tokens (:root)
  download.js     # releases API, OS detect, i18n
  app-icon.png    # генерируется prepare-icons

scripts/prepare-icons.js   # icon pipeline
build/icon-source.png      # master artwork
locales/en.json, ru.json   # app strings
docs/LANDING_PAGES.md      # деплой GitHub Pages
```

---

## 10. Чеклист при изменениях UI

- [ ] Новые цвета — через `:root` в `landing/styles.css`, не хардкод без причины
- [ ] EN + RU для видимого текста
- [ ] `:focus-visible` на интерактивных элементах
- [ ] Иконки — `npm run prepare`, не править `landing/app-icon.png` руками
- [ ] Не смешивать landing tokens и legacy orange без явной задачи unification
- [ ] `node --check landing/download.js` (есть в CI)

---

## 11. Roadmap (не реализовано)

- Общий `theme.css` / shared tokens для settings + break
- Вынос `:root` в переиспользуемый файл
- Light theme — не планируется
