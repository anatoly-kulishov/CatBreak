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

## Ограничения

- Оверлей зависит от Windows и полноэкранных приложений.
- Нет подписи Authenticode — возможны предупреждения SmartScreen.
