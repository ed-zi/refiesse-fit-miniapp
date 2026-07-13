# Деплой Refiesse Fit — руководство (S4-1)

Пошаговая инструкция прод-деплоя. Схема хостинга утверждена в
`docs/tech/architecture.md` §3. Перед включением реальных платежей —
обязательно пройти `docs/ops/release-checklist.md`.

## 1. Обзор сервисов

| Компонент | Где хостится | Как деплоится | Конфиг в репо |
|-----------|--------------|---------------|---------------|
| `apps/miniapp` (фронт) | **Cloudflare Pages** | git-интеграция (push в `main`) | `apps/miniapp/wrangler.toml`, `public/_redirects` |
| `apps/api` (Fastify) | **Railway** (Docker) | git-интеграция (push в `main`) | `apps/api/Dockerfile`, `railway.toml`, `docker-entrypoint.sh` |
| `apps/bot` (grammY) | **Railway** worker (Docker) | git-интеграция | `apps/bot/Dockerfile`, `railway.toml` |
| PostgreSQL | **Railway** managed Postgres | плагин Railway | — |
| GitHub Pages | preview прототипа | `.github/workflows/deploy-pages.yml` | (без изменений) |

Прод-деплой идёт через **git-интеграцию Cloudflare/Railway**, а не через
GitHub Actions: секреты живут в дашбордах провайдеров и не хранятся в
GitHub Secrets. `deploy-pages.yml` остаётся только для preview на GitHub Pages.

## 2. Переменные окружения по сервисам

Секреты в git не коммитятся (только `.env.example`). Значения задаются:
Railway → Service → **Variables**; Cloudflare → Pages project → **Settings →
Environment variables**.

### 2.1 API (`apps/api`) — Railway Variables

| Переменная | Обяз. | Назначение / значение в проде |
|------------|:----:|-------------------------------|
| `DATABASE_URL` | да | Строка Postgres. Сослать на плагин: `${{ Postgres.DATABASE_URL }}` |
| `BOT_TOKEN` | да | Токен бота (HMAC-верификация initData). Тот же, что у бота |
| `JWT_SECRET` | да | Секрет подписи JWT. **≥ 32 случайных символов** (иначе старт падает) |
| `JWT_EXPIRES_IN` | нет | TTL сессии, по умолчанию `1h` |
| `INIT_DATA_MAX_AGE_SEC` | нет | Возраст `auth_date`, по умолчанию `86400` |
| `TRIBUTE_API_KEY` | да* | Ключ HMAC-проверки `trbt-signature`. Не задан → webhook отвечает 503 |
| `ADMIN_TOKEN` | да* | Токен admin-API (`x-admin-token`). **≥ 32 символов** в проде. Не задан → `/admin/*` = 503 |
| `CORS_ORIGIN` | да | Origin фронта (домен Cloudflare Pages). Не задан в проде → warning, разрешены все origin |
| `SENTRY_DSN` | нет | DSN мониторинга. Не задан → Sentry выключен (no-op) |
| `PORT` | нет | Порт HTTP. Railway задаёт сам; сервер слушает `0.0.0.0:$PORT` |
| `NODE_ENV` | да | `production` |

\* обязательны для рабочего платёжного контура и админки; без них соответствующие
роуты возвращают 503 (fail-closed).

### 2.2 Bot (`apps/bot`) — Railway Variables

| Переменная | Обяз. | Назначение |
|------------|:----:|------------|
| `BOT_TOKEN` | да | Токен бота от @BotFather |
| `WEBAPP_URL` | да | URL Mini App (домен Cloudflare Pages) для кнопки web_app |
| `NODE_ENV` | нет | `production` |

### 2.3 Miniapp (`apps/miniapp`) — Cloudflare Pages build env

Только `VITE_*` попадают в клиентский бандл — секретов backend/бота тут быть не должно.

| Переменная | Обяз. | Назначение |
|------------|:----:|------------|
| `VITE_API_URL` | да | Прод-URL API (домен Railway API). Пусто → фронт на mock-данных |
| `VITE_TRIBUTE_LINK` | да | Ссылка оплаты Tribute для Paywall. Пусто → кнопка скрыта |
| `VITE_SENTRY_DSN` | нет | DSN фронтового Sentry. Пусто → выключено (no-op) |
| `VITE_DEV_INIT_DATA` | **нет** | **Только dev.** В прод-сборке НЕ задавать |

## 3. Миграции БД

- Прод-миграции применяются автоматически **при каждом деплое API**:
  `apps/api/docker-entrypoint.sh` выполняет `npx prisma migrate deploy` до старта
  сервера. `migrate deploy` применяет только уже закоммиченные миграции
  (`apps/api/prisma/migrations/**`), новых не создаёт — безопасно и идемпотентно.
- Новые миграции создаются локально (`npm run migrate` в `apps/api`) и коммитятся
  в git. Prisma Client генерируется в образе на этапе сборки (`prisma generate`).
- Prisma работает через driver-адаптер `@prisma/adapter-pg` (pg-драйвер) с
  `DATABASE_URL` от Railway — нативный query-engine в рантайме не нужен.

## 4. Порядок первого деплоя

1. **PostgreSQL.** В проекте Railway: New → Database → PostgreSQL. Скопировать
   `DATABASE_URL` (или ссылаться `${{ Postgres.DATABASE_URL }}`).
2. **API.** New Service → GitHub repo → Settings → **Root Directory = `apps/api`**
   (Railway подхватит `Dockerfile` и `railway.toml`). Задать Variables (§2.1).
   Задеплоить. Entrypoint накатит миграции и поднимет сервер; healthcheck — `/health`.
   Проверить: `GET https://<api>/health` → `{ "status": "ok" }`.
3. **(опц.) Сид контента.** Разово: `npm run db:seed` в `apps/api` с прод
   `DATABASE_URL` (локально или через Railway shell).
4. **Miniapp.** Cloudflare Pages → Create project → Connect репозиторий. Настройки
   сборки: Build command `npm run build`, Output `apps/miniapp/dist`, Root `/`.
   Build env vars — §2.3. Задеплоить, получить домен Pages.
5. **Связать домены.** Прописать домен Pages в `CORS_ORIGIN` API и в `WEBAPP_URL`
   бота; `VITE_API_URL` фронта — на домен API. Передеплоить затронутые сервисы.
6. **Bot.** New Service → тот же repo → Root Directory = `apps/bot`. Variables
   (`BOT_TOKEN`, `WEBAPP_URL`). Задеплоить (long polling, healthcheck не нужен).
7. **Menu-button бота** в @BotFather → указать URL Mini App (домен Pages).

## 5. Webhook Tribute

1. В дашборде Tribute задать webhook URL: `https://<api-домен>/api/tribute/webhook`.
2. `TRIBUTE_API_KEY` из Tribute → в Variables API (ключ HMAC-проверки `trbt-signature`).
3. Проверить формат подписи по актуальной документации Tribute
   (release-checklist п.1) и прогнать тестовую оплату.
4. Невалидная подпись → 403 (в лог пишется `signatureOk:false`, событие не
   применяется); дубли гасятся по `eventId`; отмена не рубит доступ раньше
   `expiresAt` (architecture.md §6).

## 6. Мониторинг (Sentry, S4-2)

- **API:** задать `SENTRY_DSN` → включается автоматически (ловит необработанные
  500-е). Не задан → полный no-op. В Sentry уходит только объект ошибки
  (`sendDefaultPii=false`) — без initData/JWT/подписи/секретов.
- **Miniapp:** задать `VITE_SENTRY_DSN` → включается `@sentry/react` +
  `ErrorBoundary`. Пусто → выключено.
- Настроить алёрт на Tribute-события с `error` (release-checklist, бэклог).

## 7. Где хранятся секреты

| Секрет | Хранилище |
|--------|-----------|
| `DATABASE_URL`, `BOT_TOKEN`, `JWT_SECRET`, `TRIBUTE_API_KEY`, `ADMIN_TOKEN`, `CORS_ORIGIN`, `SENTRY_DSN` | Railway → Service Variables |
| `VITE_*` (сборка фронта) | Cloudflare Pages → Environment variables |
| GitHub Secrets | не используются для прод-деплоя (Pages preview идёт по `GITHUB_TOKEN`) |

Ротация `BOT_TOKEN` — `docs/ops/bot-token-rotation.md`.

## 8. Перед включением платежей

Обязательный чек-лист: **`docs/ops/release-checklist.md`** (формат подписи
Tribute, сильные секреты, `CORS_ORIGIN`, ротация токена бота).
