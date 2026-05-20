# Лендинг и GitHub Pages

Статический сайт в каталоге `landing/`: якорь **`#download-platform`** — три кнопки (**macOS / Windows / Linux**) и выпадающие пункты с вариантами сборок (в духе промо-секций с `/#download-platform`). Скрипт запрашивает [последний GitHub Release](https://github.com/anatoly-kulishov/CatBreak/releases/latest) и подставляет прямые ссылки на артефакты (по имени файла выделяются Apple Silicon / Intel, arm64 и т.д.). Если список пуст или API недоступен, в меню остаётся ссылка на страницу релиза.

## Однократная настройка

1. В репозитории: **Settings → Pages**.
2. **Build and deployment**: Source **GitHub Actions** (Pages идёт из workflow `.github/workflows/landing-pages.yml`).

После успешного прогона workflow URL будет вида  
`https://anatoly-kulishov.github.io/CatBreak/` (или кастомный домен при подключении).

## Когда сайт обновляется

Пуш в ветку `main`, если менялись только файлы под `landing/**` или сам workflow Pages.

Разработку на другой ветке можно делать там же; перед публикацией сливайте изменения лендинга в `main`.

## Иконка на странице

Файл `landing/app-icon.png` (256×256) — кот без фоновой «плитки» (прозрачный фон, `knockOutBackground` в `prepare-icons.js`).

```bash
npm run prepare
```

Тень на лендинге — через `filter: drop-shadow` на обёртке, чтобы не было квадратного `box-shadow` вокруг прозрачных углов.
