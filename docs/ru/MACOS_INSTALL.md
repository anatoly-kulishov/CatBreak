# Установка Cat Break на macOS

[English](../en/MACOS_INSTALL.md)

## Требования

- macOS 12 Monterey и новее
- Готовые сборки в [Releases](https://github.com/anatoly-kulishov/CatBreak/releases): **arm64** (Apple Silicon); **x64** (Intel) — при наличии в релизах
- Сборка для Intel: `npm run dist:mac:x64`

## Скачать сборку

1. Скачайте `Cat Break-*-arm64.dmg` (или `*-x64.dmg` для Intel) из Releases или соберите сами.
2. Откройте DMG и перетащите **Cat Break** в **Программы**.

## Первый запуск (без подписи Apple)

Приложение **не подписано** Apple Developer ID. macOS может заблокировать запуск.

**Способ 1:** ПКМ по `Cat Break.app` → **Открыть** → **Открыть**.

**Способ 2:** Терминал:

```bash
xattr -cr "/Applications/Cat Break.app"
open "/Applications/Cat Break.app"
```

**Способ 3:** **Системные настройки** → **Конфиденциальность и безопасность** → **Всё равно открыть**.

## Автозапуск

Включите **Запускать при входе в систему** в **Настройках** (macOS и Windows).

## Запись экрана (опционально)

В v1.0.1 не требуется. Если в будущих версиях появится размытый фон — включите **Запись экрана** для Cat Break.

## Ошибка «не удаётся открыть из-за проблемы»

Не подписывайте `.app` через `codesign --deep` — ломает Electron Framework.

Используйте сборку из Releases без дополнительной подписи.
