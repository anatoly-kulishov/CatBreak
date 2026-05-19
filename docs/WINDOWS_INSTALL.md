# Cat Break на Windows

## Требования

- Windows 10 / 11 (64-bit)
- Для сборки из исходников: Node.js 20+

## Установка

1. Скачайте `Cat Break Setup *.exe` или `Cat Break *.exe` (portable) из [Releases](https://github.com/anatoly-kulishov/CatBreak/releases).
2. При предупреждении **SmartScreen** («Неизвестный издатель»): **Подробнее** → **Выполнить в любом случае**.
3. Иконка появится в **области уведомлений** (системный трей). Может быть в меню «скрытых» значков (^).

## Использование

ПКМ по иконке в трее:

- **Начать перерыв сейчас**
- **Демо (30 сек)**
- **Настройки**
- **Выход**

Обратный отсчёт отображается во **всплывающей подсказке** иконки (на macOS он ещё и в строке меню).

## Сборка на Windows

```bash
git clone https://github.com/anatoly-kulishov/CatBreak.git
cd CatBreak
npm install
npm run dist:win
```

Артефакты: `dist/Cat Break Setup *.exe`, portable `.exe`.

## Известные ограничения

- Оверлей «поверх всех окон» зависит от версии Windows и полноэкранных приложений (игры).
- Приложение **не подписано** кодом Authenticode — SmartScreen может предупреждать.
