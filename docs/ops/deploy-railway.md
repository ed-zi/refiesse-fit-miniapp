# Деплой на Railway — пошаговый чеклист (только клики)

**Всё в одном проекте Railway:** PostgreSQL + API + бот + фронт. Always-on (без засыпаний). ~$5/мес по потреблению (есть стартовый бесплатный кредит).

> Репозиторий уже подготовлен: Dockerfile'ы, автоматические миграции при старте, отдача фронта через Caddy. Ниже — только действия в панелях. Код трогать не нужно.

---

## Предварительно
- Аккаунт Railway (регистрация через GitHub `ed-zi`): https://railway.app
- Аккаунт даёт доступ к репозиторию `ed-zi/refiesse-fit-miniapp`, ветка для деплоя — `claude/ai-agent-team-plan-ahtqbw` (или после мержа — `main`).

---

## Шаг 1. Проект + база данных
1. Railway → **New Project** → **Deploy PostgreSQL**. Появится сервис **Postgres** (внутри него уже есть переменная `DATABASE_URL`).
2. Назвать проект, например `refiesse-fit`.

## Шаг 2. Сгенерировать секреты
Нужны два случайных ключа (≥32 символа). Любой генератор, или в терминале:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # выполнить дважды
```
Первый → `JWT_SECRET`, второй → `ADMIN_TOKEN`. Сохранить.

## Шаг 3. Сервис API
1. В проекте → **New → GitHub Repo** → `ed-zi/refiesse-fit-miniapp`.
2. Открыть сервис → **Settings**:
   - **Service Name:** `api`
   - **Root Directory:** `apps/api`
   - **Branch:** ветка деплоя.
   - Builder подхватится из `railway.toml` (Dockerfile). Ничего вручную не вводить.
3. **Variables** → добавить:
   | Ключ | Значение |
   |------|----------|
   | `DATABASE_URL` | `${{ Postgres.DATABASE_URL }}` |
   | `BOT_TOKEN` | *(пока старый токен; заменить в шаге 6)* |
   | `JWT_SECRET` | первый ключ из шага 2 |
   | `ADMIN_TOKEN` | второй ключ из шага 2 |
   | `NODE_ENV` | `production` |
   | `SEED_ON_START` | `true` *(только на первый деплой — засеет БД)* |
4. Deploy пойдёт сам. При старте контейнер: применит миграции → (т.к. `SEED_ON_START=true`) засеет 13 тренировок/6 категорий/3 плана → поднимет сервер. Проверить в **Logs**: `prisma migrate deploy` → `db:seed` → старт.
5. **Settings → Networking → Generate Domain** → появится публичный URL API (напр. `https://api-production-xxxx.up.railway.app`). Проверить: открыть `<URL>/health` → `{"status":"ok"}`.
6. **Убрать `SEED_ON_START`** из Variables (чтобы повторные деплои не перезатирали контент). Сохранить.

## Шаг 4. Сервис фронта (Mini App)
1. В проекте → **New → GitHub Repo** → тот же репозиторий.
2. **Settings**:
   - **Service Name:** `miniapp`
   - **Root Directory:** `/` (пусто/корень) — фронт зависит от общего пакета, собирается из корня; путь Dockerfile берётся из `railway.toml` (`apps/miniapp/Dockerfile`).
3. **Variables**:
   | Ключ | Значение |
   |------|----------|
   | `VITE_API_URL` | `https://${{ api.RAILWAY_PUBLIC_DOMAIN }}` |
4. Deploy. **Settings → Networking → Generate Domain** → публичный URL фронта (напр. `https://miniapp-production-xxxx.up.railway.app`). **Это и есть URL Mini App.**

## Шаг 5. Связать домены (CORS + return)
Открыть сервис **api → Variables**, добавить/заполнить:
| Ключ | Значение |
|------|----------|
| `CORS_ORIGIN` | URL фронта из шага 4 |
| `YOOKASSA_RETURN_URL` | URL фронта из шага 4 *(пригодится с оплатой)* |

API передеплоится сам.

## Шаг 6. Перевыпустить токен бота
1. Telegram → **@BotFather** → `/mybots` → `@refiessefit_bot` → **API Token → Revoke current token** → скопировать новый.
2. Вписать новый `BOT_TOKEN` в Variables сервиса **api** (заменить старый).

## Шаг 7. Сервис бота
1. В проекте → **New → GitHub Repo** → тот же репозиторий.
2. **Settings:** Service Name `bot`, **Root Directory** `apps/bot`.
3. **Variables**:
   | Ключ | Значение |
   |------|----------|
   | `BOT_TOKEN` | новый токен из шага 6 |
   | `WEBAPP_URL` | URL фронта из шага 4 |
   | `NODE_ENV` | `production` |
4. Deploy. В **Logs** увидеть `[bot] старт: long polling`.

## Шаг 8. Menu button бота
1. **@BotFather** → `/mybots` → `@refiessefit_bot` → **Bot Settings → Menu Button → Edit menu button URL** → вставить URL фронта из шага 4.

## Шаг 9. Проверка (чеклист)
- [ ] `<api>/health` → `{"status":"ok"}`
- [ ] Открыть бота → **Menu button** → Mini App грузится
- [ ] Каталог показывает 13 тренировок (данные из БД, не mock)
- [ ] Открыть free-тренировку → **«Я сделала»** → на экране «Прогресс» цифры выросли
- [ ] Premium-тренировка → показывает paywall (оплата пока не подключена)
- [ ] Админка: `<api>/admin/ui` → ввести `ADMIN_TOKEN` → видны тренировки/пользователи
- [ ] Бот отвечает на `/start`

---

## Позже: подключить оплату ЮKassa
Когда у Кати будут `shopId`/`secretKey` (нужна самозанятость/ИП):
1. В сервисе **api → Variables**: `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` (и `YOOKASSA_RETURN_URL` уже задан в шаге 5).
2. В ЛК ЮKassa указать вебхук: `https://<api>/api/payments/yookassa/webhook`.
3. Тестовая оплата на тестовом магазине. Детали — `docs/product/payments-yookassa.md`, `docs/ops/release-checklist.md`.
4. Автосписания: `BILLING_AUTOCHARGE_ENABLED=true` + Railway **Cron** на `apps/api` скрипт `src/billing/runCharge.ts` (или ручное продление на старте).

---

## Если что-то падает
- **Logs** у каждого сервиса Railway — первое место для диагностики.
- Билд фронта не идёт → проверить, что Root Directory = `/` (не `apps/miniapp`): фронту нужен корень монорепо.
- 401/CORS во фронте → проверить `CORS_ORIGIN` (api) = точный URL фронта.
- База пустая → на первый деплой api должен был стоять `SEED_ON_START=true` (см. шаг 3).
