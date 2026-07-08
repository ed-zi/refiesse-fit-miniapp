# Refiesse Fit Mini App — архитектурная спецификация

**Дата:** 2026-07-08
**Статус:** черновик к утверждению (задача S0-2)
**Владелец:** Tech Lead Agent
**Связанные документы:** `docs/product/refiesse-miniapp-mvp-tz.md` (источник истины по scope), `docs/product/mvp-build-spec.md`, `docs/tech/data-model.md`, `apps/api/prisma/schema.prisma`

Документ фиксирует технические решения MVP: стек, структуру монорепо, схему деплоя, границы frontend/backend, Tribute webhook flow, полный контракт API и env-переменные. Решения, отмеченные **[РЕШЕНИЕ]**, приняты Tech Lead и подлежат утверждению Эдом; альтернативы указаны с обоснованием выбора.

---

## 1. Выбор стека

### 1.1 Backend: Fastify — **[РЕШЕНИЕ]** (не NestJS)

**Выбираем Fastify.**

| Критерий | Fastify | NestJS |
|----------|---------|--------|
| Порог входа / объём boilerplate | Низкий: роуты + плагины | Высокий: модули, DI, декораторы, провайдеры |
| Скорость для MVP из ~13 роутов | Отлично — минимум церемоний | Избыточно для такого объёма |
| Валидация | Встроенная JSON-schema (или zod через плагин) | class-validator/DTO |
| Производительность | Один из самых быстрых Node-фреймворков | Поверх Express/Fastify, есть overhead |
| Экосистема плагинов | `@fastify/*` (jwt, cors, rate-limit, helmet) | Модули Nest |
| Тестируемость | `app.inject()` без поднятия сервера | TestingModule |

**Обоснование.** MVP — это ~13 REST-эндпоинтов, один webhook и Telegram-auth middleware. NestJS даёт архитектурную дисциплину, ценную на большой команде и большом домене, но для нашего scope его DI/модульность — это налог на скорость без выгоды. Fastify закрывает всё нужное штатными плагинами (JWT, CORS, rate-limit, helmet), имеет первоклассную схемную валидацию и `inject()` для тестов auth/webhook (критично для S1-4 и S3-2). Prisma и grammY одинаково хорошо живут с обоими. Если домен вырастет — Fastify не мешает поздней миграции, т.к. бизнес-логика держится в сервисном слое, а не в контроллерах.

**Стек backend:** Node.js (LTS) + TypeScript + Fastify + Prisma + PostgreSQL. Валидация — zod (общие схемы в `packages/shared`). Тесты — vitest + `app.inject()`.

### 1.2 База данных: PostgreSQL + Prisma — **[фиксируем]**

- PostgreSQL — реляционная модель (пользователи, подписки, прогресс, связи план↔тренировка), нативные массивы (`Workout.equipment String[]`), надёжные уникальные индексы для идемпотентности.
- Prisma — типобезопасный доступ, декларативные миграции, единый источник типов моделей, генерация клиента. Схема-черновик: `apps/api/prisma/schema.prisma`.

### 1.3 Bot: grammY — **[фиксируем]**

- grammY (не Telegraf): современный TypeScript-first API, чистые типы, простое меню/кнопки Web App. Для MVP боту нужно немного: `/start` с кнопкой Mini App, `/app`, menu button. grammY это закрывает без лишнего.

### 1.4 Frontend: React + Vite + TypeScript — **[уже есть]**

- Существующий прототип `apps/miniapp`. Telegram-слой: `@telegram-apps/sdk-react` (или WebApp API). Оставляем как есть, дорабатываем по спринтам S1-1/S1-2.

---

## 2. Структура монорепо

npm workspaces (решение по менеджеру — за DevOps в S0-4; структура каталогов ниже — обязательная).

```text
refiesse-fit-miniapp/
├── apps/
│   ├── miniapp/      # [есть] React+Vite+TS фронт (Telegram Mini App)
│   ├── api/          # [новый] Fastify + Prisma backend (REST + Tribute webhook)
│   └── bot/          # [новый] grammY Telegram bot (вход в Mini App)
├── packages/
│   └── shared/       # [новый] общие TS-типы и zod-схемы (контракт фронт↔бэк)
├── docs/             # спецификации (product/design/tech/content/team/qa)
└── package.json      # workspaces root
```

**Назначение каждого пакета.**

- **`apps/miniapp`** — клиент. Экраны, Telegram SDK, state, API-клиент. Не содержит секретов и бизнес-правил доступа. Собирается статикой.
- **`apps/api`** — сервер и вся бизнес-логика: Telegram-auth, каталог/планы/прогресс/избранное, проверка доступа, Tribute webhook, админ-API. Единственный, кто ходит в БД.
- **`apps/bot`** — тонкий grammY-процесс: открывает Mini App, отдаёт кнопки. По необходимости зовёт API. Не дублирует бизнес-логику.
- **`packages/shared`** — общий контракт: типы `Workout`, `Program`, `ProgressMetrics`, DTO запросов/ответов, zod-схемы валидации, enum-константы (`AccessType`, `WorkoutLevel`). Импортируется и фронтом, и API — один источник истины, нет дрейфа типов. Prisma-типы БД не экспортируются наружу; наружу идут «view»-DTO (например, `WorkoutCard` без `videoUrl`).

---

## 3. Схема деплоя

**[РЕШЕНИЕ — подтверждено Эдом 2026-07-08]:**
- **Frontend → Cloudflare Pages** (production/staging).
- **API → Railway** (Node-сервис).
- **PostgreSQL → managed Postgres на Railway** (тот же провайдер, что и API).
- **Bot → отдельный worker-процесс на Railway** (long-running polling или webhook).
- **GitHub Pages → остаётся как preview** прототипа фронта.

**Обоснование.**

- *Cloudflare Pages для фронта.* Статика Mini App, глобальный CDN, бесплатный tier, простой preview-deploy на PR, свой домен + TLS из коробки. Vercel сопоставим, но Cloudflare даёт более щедрый бесплатный трафик и меньше vendor-специфики для чисто статической SPA. (Vercel — приемлемая альтернатива, если команда уже в его экосистеме.)
- *Railway для API + БД.* Нужен постоянный Node-процесс (не serverless — из-за Prisma connection pool, webhook и будущего бота) и managed PostgreSQL рядом. Railway даёт то и другое в одном проекте, простые env-секреты, деплой из git, приватную сеть между API и БД. Render — равнозначная альтернатива (тоже managed PG + web service); выбор Railway — за более быстрый DX и единый проект для api+bot+db. VPS отклонён: ручное сопровождение TLS/бэкапов не оправдано на MVP.
- *Managed PostgreSQL* (а не self-hosted): автобэкапы, точечное восстановление, TLS — критично для платёжного контура (S3).
- *GitHub Pages как preview* — уже настроен, бесплатен, удобен продукту/дизайну смотреть прототип; production-фронт переезжает на Pages Cloudflare с указанием на production-API.

**Окружения.** `staging` (ветка/preview) и `production` для фронта и API; managed PG на каждое. Tribute webhook в production смотрит на production-API (S4-1).

---

## 4. Границы frontend / backend

```text
┌───────────── Frontend (apps/miniapp) ─────────────┐
│ Рендер экранов, состояния loading/error/empty/    │
│ locked, Telegram viewport/safe area, навигация,   │
│ клиентский state, API-клиент (шлёт initData).     │
│ НЕ решает: кто premium, что отдавать в premium,    │
│ валидна ли подпись. НЕ хранит секретов.           │
└───────────────────────────────────────────────────┘
                     │ HTTPS + Telegram initData
                     ▼
┌───────────── Backend (apps/api) ──────────────────┐
│ ЕДИНСТВЕННЫЙ владелец бизнес-логики доступа:       │
│  • верификация initData (HMAC по bot token)       │
│  • find-or-create User                            │
│  • hasAccess(user): status=active И expires>now   │
│  • фильтрация premium-контента (срезает videoUrl) │
│  • запись прогресса с дедупликацией по дню         │
│  • приём/проверка/применение Tribute webhook      │
│  • админ-операции                                 │
│ Только этот слой ходит в БД.                       │
└───────────────────────────────────────────────────┘
```

**Ключевой принцип доступа.** Проверка premium живёт **только на бэкенде**, в единой функции `hasAccess(user)` (см. `Subscription`, data-model §8). Фронт получает `access`-флаги для UI (показать Locked/Paywall), но никогда не является источником истины. Premium-эндпоинт (`GET /workouts/:id` для premium-тренировки) **срезает `videoUrl`/контент**, если доступа нет — даже при прямом запросе к API (MVP-ТЗ 4.6, S1-5 AC). Фронт не может «обойти» paywall, т.к. контента у него просто нет.

---

## 5. Telegram auth и стратегия сессии — **[РЕШЕНИЕ]**

**Модель: короткоживущий JWT поверх верифицированного `initData`.**

Поток:

```text
1. Frontend берёт initData из Telegram WebApp SDK.
2. POST /auth/telegram { initData }.
3. API проверяет HMAC-SHA256 подпись initData по BOT_TOKEN
   (по документации Telegram) и свежесть auth_date.
4. find-or-create User по telegram_user_id (идемпотентно).
5. API возвращает JWT (exp ~1 час, подписан JWT_SECRET).
6. Frontend шлёт JWT в Authorization: Bearer на все /me,/catalog,...
7. По истечении JWT фронт повторяет шаг 2 (initData у него уже есть).
```

**Почему JWT, а не проверка initData на каждый запрос.** Верификация initData — это HMAC на каждый запрос плюс повторный lookup/upsert пользователя; JWT переносит дорогую проверку в единый `/auth/telegram`, а остальные запросы валидируют дешёвой подписью токена. `initData` остаётся первичным доказательством личности (его нельзя подделать без bot token), JWT — производная короткая сессия. Невалидная/просроченная подпись → 401; истёкший JWT → 401 (фронт молча переавторизуется). Тесты на верификацию — обязательны (S1-4 AC).

---

## 6. Tribute webhook flow

```text
                    ┌──────────┐
                    │  Tribute │  (оплата пользователя)
                    └────┬─────┘
                         │ POST + заголовок trbt-signature
                         ▼
        ┌────────────────────────────────────────────┐
        │  POST /api/tribute/webhook  (apps/api)      │
        └────────────────────────────────────────────┘
                         │
             ┌───────────▼────────────┐
             │ 1. Проверка подписи     │  HMAC(payload, TRIBUTE_WEBHOOK_SECRET)
             │    trbt-signature       │  == заголовок?
             └───────────┬────────────┘
                нет ◄─────┤─────► да
                 │        │
   ┌─────────────▼──┐     │
   │ Лог TributeEvent│    │  (signatureOk=false, processedAt=null)
   │ Ответ 403       │    │  событие НЕ применяется
   └─────────────────┘    │
                          ▼
             ┌────────────────────────────┐
             │ 2. Идемпотентность          │  eventId уже есть и processedAt≠null?
             └────────────┬───────────────┘
                 да ◄──────┤──────► нет
                  │        │
   ┌──────────────▼─┐      │
   │ Ответ 200 (dup) │     │  duplicate/retry безопасен
   │ повторно не     │     │
   │ применяем       │     │
   └─────────────────┘     ▼
             ┌──────────────────────────────────────┐
             │ 3. Запись TributeEvent               │
             │    (signatureOk=true, payload, type) │
             └──────────────┬───────────────────────┘
                            ▼
             ┌──────────────────────────────────────┐
             │ 4. Применение по type к Subscription │
             │   new_subscription      → status=active, expiresAt=+период
             │   renewed_subscription  → продлить expiresAt, status=active
             │   cancelled_subscription→ status=cancelled (доступ до expiresAt!)
             │   связь с User по telegram_user_id    │
             └──────────────┬───────────────────────┘
                            ▼
             ┌──────────────────────────────────────┐
             │ 5. processedAt=now(); Ответ 200      │
             │    Доступ пользователя обновлён      │
             └──────────────────────────────────────┘
```

**Инварианты (MVP-ТЗ §8):**
- невалидная подпись → **403**, событие логируется, но не применяется;
- идемпотентность по `eventId` — duplicate/retry не задваивают эффект;
- отмена **не** отрубает доступ раньше `expiresAt`;
- после оплаты доступ открывается автоматически (без действий пользователя);
- ручной reprocess из админки повторно применяет `payload`.

Реализация — Спринт 3 (S3-1/S3-2); архитектура готова уже сейчас.

---

## 7. Контракт API (детализация MVP-ТЗ §6)

Базовый префикс: без версии на MVP (`/me`, `/catalog`, …); Tribute-хук по историческому пути `/api/tribute/webhook`. Единый формат ошибок: `{ "error": { "code": string, "message": string } }`. Коды доступа: **public** (без auth), **auth** (Bearer JWT), **signature** (проверка `trbt-signature`), **admin** (auth + `isAdmin`).

### 7.1 Auth

| Метод | Путь | Тело / параметры | Ответ (200) | Ошибки | Доступ |
|-------|------|------------------|-------------|--------|--------|
| POST | `/auth/telegram` | body: `{ initData: string }` | `{ token, expiresIn, user: {...} }` | 401 `invalid_init_data` | public |

### 7.2 Профиль и подбор

| Метод | Путь | Тело / параметры | Ответ (200) | Ошибки | Доступ |
|-------|------|------------------|-------------|--------|--------|
| GET | `/me` | — | `{ user, onboarding, access: { type, expiresAt } }` | 401 | auth |
| PUT | `/me/onboarding` | body: `{ goal, time, equipment: string[], intensity }` | `{ onboarding }` | 401, 400 `validation_error` | auth |

### 7.3 Каталог и контент

| Метод | Путь | Параметры | Ответ (200) | Ошибки | Доступ |
|-------|------|-----------|-------------|--------|--------|
| GET | `/catalog` | query: `category?`, `duration?` (`5-10`/`15-20`/`25-35`), `access?` (`free`/`premium`), `level?` | `{ items: WorkoutCard[] }` (карточки без `videoUrl`) | 401, 400 | auth |
| GET | `/workouts/:id` | path: `id` | `{ workout }` — **premium без доступа: без `videoUrl`/контента, с `locked:true`** | 401, 404 `not_found` | auth |
| GET | `/plans` | — | `{ items: Program[] с прогрессом N/M }` | 401 | auth |
| GET | `/plans/:id` | path: `id` | `{ program, days: ProgramDay[] }` | 401, 404 | auth |

### 7.4 Прогресс и избранное

| Метод | Путь | Тело / параметры | Ответ | Ошибки | Доступ |
|-------|------|------------------|-------|--------|--------|
| POST | `/progress` | body: `{ workoutId }` | 201 `{ entry }` или 200 `{ entry, duplicate:true }` (идемпотентно по user+workout+день) | 401, 404, 403 `locked` (premium без доступа) | auth |
| GET | `/progress` | — | `{ metrics: { workouts, minutes, streakDays, planProgress }, history: [] }` | 401 | auth |
| POST | `/favorites` | body: `{ workoutId }` | `{ workoutId, favorite: boolean }` (toggle) | 401, 404 | auth |

### 7.5 Доступ

| Метод | Путь | Ответ | Ошибки | Доступ |
|-------|------|-------|--------|--------|
| GET | `/access` | `{ type: "free"\|"premium", expiresAt: string\|null }` | 401 | auth |

### 7.6 Tribute webhook

| Метод | Путь | Заголовок | Ответ | Ошибки | Доступ |
|-------|------|-----------|-------|--------|--------|
| POST | `/api/tribute/webhook` | `trbt-signature` | 200 `{ ok:true }` (в т.ч. duplicate) | **403** `invalid_signature`, 400 `invalid_payload` | signature |

### 7.7 Служебное и админка

| Метод | Путь | Ответ | Доступ |
|-------|------|-------|--------|
| GET | `/health` | `{ status:"ok" }` | public |
| * | `/admin/workouts`, `/admin/categories`, `/admin/programs` (CRUD) | сущности | admin |
| GET | `/admin/users`, `/admin/subscriptions`, `/admin/tribute-events` | списки | admin |
| POST | `/admin/subscriptions/:userId/grant` \| `/revoke` | `{ subscription }` | admin |
| POST | `/admin/tribute-events/:id/reprocess` | `{ event }` | admin |

**Правила ответов (MVP-ТЗ §6):**
- единый JSON-формат ошибок `{ error: { code, message } }`;
- premium-эндпоинт без доступа отдаёт метаданные, но не `video_url`/контент;
- запрос без валидного initData/JWT → 401; premium-действие без доступа → 403;
- коды: 200/201 успех, 400 валидация, 401 нет/невалидна сессия, 403 нет прав/доступа/подписи, 404 не найдено, 409 конфликт (при необходимости), 500 внутренняя.

---

## 8. Env-переменные (только имена и назначение, без значений)

### 8.1 `apps/api`

| Переменная | Назначение |
|------------|------------|
| `DATABASE_URL` | Строка подключения к managed PostgreSQL |
| `BOT_TOKEN` | Токен бота — ключ для HMAC-верификации Telegram initData |
| `JWT_SECRET` | Секрет подписи сессионных JWT |
| `JWT_EXPIRES_IN` | Время жизни JWT (напр. `1h`) |
| `TRIBUTE_API_KEY` | Ключ API Tribute (исходящие вызовы, later) |
| `TRIBUTE_WEBHOOK_SECRET` | Секрет для проверки заголовка `trbt-signature` |
| `TRIBUTE_PAYMENT_LINK` | Ссылка на оплату (может отдаваться фронту через API) |
| `CORS_ORIGIN` | Разрешённый origin фронта (Cloudflare Pages домен) |
| `PORT` | Порт HTTP-сервера |
| `NODE_ENV` | `development` / `production` |
| `SENTRY_DSN` | DSN мониторинга (Спринт 4, опц.) |

### 8.2 `apps/bot`

| Переменная | Назначение |
|------------|------------|
| `BOT_TOKEN` | Токен бота grammY |
| `MINIAPP_URL` | URL Mini App для кнопки/menu button |
| `API_BASE_URL` | Базовый URL API (если бот обращается к backend) |
| `NODE_ENV` | Окружение |

### 8.3 `apps/miniapp`

| Переменная | Назначение |
|------------|------------|
| `VITE_API_BASE_URL` | Базовый URL backend API |
| `VITE_USE_MOCK` | Переключатель mock/real API (S1-2) |
| `VITE_TRIBUTE_PAYMENT_LINK` | Ссылка Paywall (или проксируется через API) |
| `VITE_SENTRY_DSN` | DSN фронтового мониторинга (опц.) |

> Секреты не хранятся в git — только в env/secrets провайдера (S0-7, S4-1). `BOT_TOKEN` подлежит немедленному перевыпуску (S0-7).

---

## 9. ASCII-диаграмма архитектуры

```text
                          ┌───────────────────────────┐
                          │        Telegram            │
                          │  @refiessefit_bot + client │
                          └──────┬──────────────┬──────┘
                                 │ /start,      │ открывает Web App
                                 │ menu button  │ (initData)
                                 ▼              ▼
                     ┌────────────────┐   ┌──────────────────────────┐
                     │  apps/bot      │   │  apps/miniapp            │
                     │  grammY worker │   │  React+Vite (Mini App)   │
                     │  (Railway)     │   │  (Cloudflare Pages)      │
                     └───────┬────────┘   └───────────┬──────────────┘
                             │                        │ HTTPS
                             │ (опц. API)             │ Bearer JWT / initData
                             │                        ▼
                             │            ┌──────────────────────────┐
                             └───────────►│  apps/api                │
                                          │  Fastify + Prisma        │
                                          │  (Railway)               │
                                          │  • Telegram auth         │
                                          │  • hasAccess() gate      │
                                          │  • catalog/plans/progress│
                                          │  • /api/tribute/webhook  │
                                          │  • /admin/*              │
                                          └───────┬──────────┬───────┘
                                                  │          │
                        packages/shared           │          │ signature
                        (типы + zod DTO)  ────────►│          ▲
                        импортят miniapp+api       ▼          │
                                          ┌────────────────┐  │
                                          │ PostgreSQL     │  │ POST + trbt-signature
                                          │ (managed,      │  │
                                          │  Railway)      │  │
                                          └────────────────┘  │
                                                              │
                                                        ┌──────────┐
                                                        │ Tribute  │
                                                        └──────────┘

  GitHub Pages ──► preview прототипа фронта (остаётся как preview-окружение)
```

---

## 10. Резюме принятых решений

- **Backend:** Fastify (не NestJS) — минимум церемоний для ~13 роутов, штатные плагины (jwt/cors/rate-limit/helmet), `inject()` для тестов auth/webhook.
- **DB:** PostgreSQL + Prisma (нативные массивы, уникальные индексы под идемпотентность, типобезопасность).
- **Bot:** grammY.
- **Хостинг:** фронт — Cloudflare Pages; API + managed PostgreSQL + bot — Railway; GitHub Pages остаётся preview.
- **Auth/сессия:** верификация Telegram initData (HMAC по BOT_TOKEN) → короткоживущий JWT; проверка доступа только на бэкенде через единую `hasAccess()`.
- **Границы:** вся логика доступа и premium-фильтрация — на backend; фронт без секретов и без источника истины по доступу; общий контракт — в `packages/shared`.
- **Tribute:** webhook с проверкой подписи → лог `TributeEvent` (идемпотентность по `eventId`) → обновление `Subscription`; невалидная подпись → 403; отмена не рубит доступ раньше `expiresAt`.
