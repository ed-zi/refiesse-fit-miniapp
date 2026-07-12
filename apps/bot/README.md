# @refiesse-fit/bot

Telegram-бот `@refiessefit_bot` на [grammY](https://grammy.dev). Тонкий процесс-«вход» в Mini App: приветствие и кнопка открытия приложения. Бизнес-логики здесь нет — она живёт в `apps/api`.

## Команды бота

| Команда | Поведение |
| --- | --- |
| `/start` | Короткое приветствие в тоне Soft System + inline-кнопка «Открыть Refiesse Fit» (web_app) |
| `/app` | «Mini App здесь:» + та же кнопка |

Список команд регистрируется автоматически при старте (`setMyCommands`).

## Переменные окружения

| Переменная | Обязательна | Описание |
| --- | --- | --- |
| `BOT_TOKEN` | да | Токен от @BotFather. Только env/secrets, никогда в коде/git/чатах — политика ротации: `docs/ops/bot-token-rotation.md` |
| `WEBAPP_URL` | нет | URL Mini App для кнопки. Default: `https://ed-zi.github.io/refiesse-fit-miniapp/` |

## Локальный запуск

```bash
# из корня монорепо один раз ставятся зависимости (npm install)

cd apps/bot
cp .env.example .env      # вписать BOT_TOKEN
npm run dev               # tsx watch (hot reload)
# или
npm run start             # одиночный запуск
```

Бот работает через long polling — вебхук и публичный URL для локальной разработки не нужны. Остановка: `Ctrl+C` (SIGINT/SIGTERM обрабатываются gracefully).

Без `BOT_TOKEN` процесс сразу завершается с понятным сообщением об ошибке конфигурации.

## Typecheck

```bash
npm run typecheck   # tsc --noEmit, tsconfig наследует ../../tsconfig.base.json
```

## Menu button

Кнопка меню (синяя кнопка слева от поля ввода, открывающая Mini App) настраивается вручную через **@BotFather**: `/mybots` → `@refiessefit_bot` → **Bot Settings** → **Menu Button** → указать URL Mini App (тот же, что `WEBAPP_URL`). Код бота её не задаёт.
