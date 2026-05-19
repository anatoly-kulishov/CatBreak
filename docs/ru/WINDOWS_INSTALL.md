# Cat Break на Windows

[English](../en/WINDOWS_INSTALL.md)

## Требования

- Windows 10 / 11 (64-bit)
- Node.js 20+ (для сборки из исходников)

## Установка

1. Скачайте `Cat Break Setup *.exe` или portable `Cat Break *.exe` из [Releases](https://github.com/anatoly-kulishov/CatBreak/releases).
2. При **SmartScreen** («Неизвестный издатель»): **Подробнее** → **Выполнить в любом случае**.
3. Иконка в **области уведомлений** (трей), возможно в скрытых значках (^).

## Использование

ПКМ по иконке в трее:

- **Начать перерыв сейчас**
- **Демо (30 сек)**
- **Отложить перерыв (+5 / +10 мин)**
- **Настройки**
- **Выход**

Обратный отсчёт — во **всплывающей подсказке** иконки.

## Автозапуск

Включите **Запускать при входе в систему** в **Настройках**.

## Сборка на Windows

```bash
git clone https://github.com/anatoly-kulishov/CatBreak.git
cd CatBreak
npm install
npm run dist:win
```

Артефакты: `dist/Cat Break Setup *.exe`, portable `.exe`.

### Ошибка сборки: «Cannot create symbolic link» (winCodeSign)

Если `electron-builder` падает при распаковке `winCodeSign` с **Cannot create symbolic link**, Windows не дал создать симлинк (сертификата подписи у нас всё равно нет).

**Решение (одно из):**

1. **Рекомендуется:** обновите репозиторий — в `package.json` для Windows стоит `signAndEditExecutable: false`, без `winCodeSign`.
2. **Параметры → Конфиденциальность → Для разработчиков** → включите **Режим разработчика**, удалите кэш и соберите снова:
   ```bat
   rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign"
   npm run dist:win
   ```
3. Запустите **cmd от имени администратора** и снова `npm run dist:win`.

Переменная окружения (без подписи):

```bat
set CSC_IDENTITY_AUTO_DISCOVERY=false
npm run dist:win
```

## Ограничения

- Оверлей зависит от Windows и полноэкранных приложений.
- Нет подписи Authenticode — возможны предупреждения SmartScreen.
