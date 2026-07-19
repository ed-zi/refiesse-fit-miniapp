# Refiesse Fit Mini App — сводный файл проекта (HANDOFF)

**Обновлено:** 2026-07-14
**Назначение:** единая точка входа — что за проект, где что лежит, какие доступы нужны и куда их вписать для запуска.

> ⚠️ **Секретов здесь нет и быть не должно.** Ниже перечислено, *какие* ключи/доступы нужны и *куда* они вписываются (Railway / `.env`). Сами значения храните только в панелях хостинга и локальных `.env` (они в `.gitignore`).

---

## 1. Что это

Telegram Mini App для мягкого wellness/fitness-продукта **Refiesse Fit**: состояние тела → подбор → тренировка/план → выполнение → прогресс. Подписка Premium — 500 ₽/мес.

| | |
|---|---|
| **GitHub repo** | https://github.com/ed-zi/refiesse-fit-miniapp |
| **Рабочая ветка** | `claude/ai-agent-team-plan-ahtqbw` |
| **Default branch** | `main` |
| **Preview (Pages)** | https://ed-zi.github.io/refiesse-fit-miniapp/ (демо-режим, mock-данные) |
| **Telegram-бот** | @refiessefit_bot |
| **Telegram-канал** | @refiesse_fit |
| **Дизайн-направление** | Soft System (белая база, лаванда, салатовый, фиолетовые CTA) |

---

## 2. Технологический стек

| Часть | Стек | Папка |
|-------|------|-------|
| Mini App (фронт) | React 19 + Vite + TypeScript | `apps/miniapp` |
| Backend API | Node + Fastify 5 + Prisma 7 + PostgreSQL 16 | `apps/api` |
| Telegram-бот | grammY | `apps/bot` |
| Общие типы | TypeScript | `packages/shared` |
| Монорепо | npm workspaces | корень |

**Хостинг (решено):** всё в одном проекте **Railway** — PostgreSQL + API + бот + фронт (Caddy), always-on. GitHub Pages остаётся как preview демо-версии. Пошаговый деплой «только клики»: `docs/ops/deploy-railway.md`.
**Оплата (решено):** **ЮKassa** (рубли, СБП + карты). Tribute отклонён (не даёт подписку через Mini App).

---

## 3. Статус готовности

**Код готов и протестирован:** 95 тестов API + 7 Playwright E2E. Прошли 4 спринта:
- Спринт 0 — документы, монорепо, CI, дизайн ✅
- Спринт 1 — Telegram SDK, backend+auth, каталог, бот ✅
- Спринт 2 — живые данные, прогресс, избранное, подбор ✅
- Спринт 3 — доступ, платёжный webhook, админка, security-ревью ✅
- Спринт 4 — деплой-конфиги, Sentry, E2E в CI, план запуска ✅
- Пивот оплаты — переход Tribute → ЮKassa ✅

**Работает end-to-end (проверено):** вход через Telegram-подпись → каталог из БД → «Я сделала» пишет прогресс → избранное → подбор фильтрует каталог → оплата (мок-ЮKassa) открывает premium → админка управляет контентом.

---

## 4. Что нужно от Эда и Кати (внешние блокеры)

Всё программирование сделано. Для реального запуска нужны действия на вашей стороне:

### 4.1 Приём денег (ЮKassa) — блокирует платежи
1. **Самозанятость или ИП у Кати.** Без этого договор с ЮKassa не оформить. Самозанятость — 10 минут в приложении «Мой налог», для подписок 500 ₽/мес достаточно.
2. **Аккаунт ЮKassa** → получить `shopId` + `secretKey` (ЛК → Настройки → API-ключ).
3. Указать URL вебхука в ЛК ЮKassa: `https://<адрес-API>/api/payments/yookassa/webhook`.
4. Решить: включаем автосписание сразу (`BILLING_AUTOCHARGE_ENABLED=true`) или стартуем с ручного продления.
5. Подробности и механика: `docs/product/payments-yookassa.md`.

### 4.2 Хостинг — блокирует выход в интернет
1. **Аккаунт Railway** (регистрация через GitHub) — там поднимается ВСЁ: PostgreSQL + API + бот + фронт в одном проекте. ~$5/мес.
2. Пошаговый деплой «только клики»: **`docs/ops/deploy-railway.md`**.

### 4.3 Безопасность — обязательно перед прод-релизом
1. **Перевыпустить токен бота** через @BotFather (текущий засвечен в чате). Инструкция: `docs/ops/bot-token-rotation.md`.
2. Сгенерировать сильные `JWT_SECRET` и `ADMIN_TOKEN` (≥32 символов — прод отклонит короткие).
3. Сверить формат подписи вебхука ЮKassa с их актуальной документацией (единственный пункт security-ревью, требующий реального аккаунта). Чеклист: `docs/ops/release-checklist.md`.

### 4.4 Контент — блокирует «настоящее» наполнение
1. Реальные тренировки и **видео Кати** вместо 13 seed-заготовок с плейсхолдерами. Загружаются через админку (`/admin/ui`) без программиста.
2. Матрица контента и что заполнить: `docs/content/content-matrix.md`.

---

## 5. Переменные окружения по сервисам

> Задаются в панелях хостинга (Railway Variables (сервисов)), локально — в `.env` файлах (в git не попадают). Полные примеры: `apps/*/.env.example`.

### 5.1 API (Railway) — `apps/api`
| Переменная | Обязательна | Назначение |
|-----------|:-----------:|-----------|
| `DATABASE_URL` | да | строка подключения PostgreSQL (даёт Railway) |
| `BOT_TOKEN` | да | токен бота — для проверки подписи initData |
| `JWT_SECRET` | да | подпись сессионных JWT (прод: ≥32 симв.) |
| `CORS_ORIGIN` | прод | origin фронта (домен сервиса miniapp на Railway) |
| `YOOKASSA_SHOP_ID` | для оплат | shopId из ЛК ЮKassa |
| `YOOKASSA_SECRET_KEY` | для оплат | secretKey из ЛК ЮKassa |
| `YOOKASSA_RETURN_URL` | для оплат | куда вернуть после оплаты (Mini App) |
| `BILLING_AUTOCHARGE_ENABLED` | нет | `true`/`false` — автосписание (default false) |
| `ADMIN_TOKEN` | для веб-админки | доступ к `/admin/*` по токену (прод: ≥32 симв.) |
| `ADMIN_TELEGRAM_IDS` | для TG-админки | Telegram id админов через запятую — вход в админку из Telegram без токена |
| `SENTRY_DSN` | нет | мониторинг ошибок (пусто → выключен) |
| `JWT_EXPIRES_IN`, `INIT_DATA_MAX_AGE_SEC`, `PORT`, `NODE_ENV` | нет | значения по умолчанию есть |
| `TRIBUTE_API_KEY` | — | DEPRECATED, не нужен |

### 5.2 Бот (Railway) — `apps/bot`
| Переменная | Обязательна | Назначение |
|-----------|:-----------:|-----------|
| `BOT_TOKEN` | да | тот же токен бота |
| `WEBAPP_URL` | нет | URL Mini App для кнопки (в проде → домен сервиса miniapp на Railway) |
| `ADMIN_URL` | для TG-админки | `https://<домен-api>/admin/ui` — куда ведёт кнопка `/admin` |
| `ADMIN_TELEGRAM_IDS` | для TG-админки | Telegram id админов через запятую (те же, что у api) |

### 5.3 Mini App (Railway build-time) — `apps/miniapp`
| Переменная | Обязательна | Назначение |
|-----------|:-----------:|-----------|
| `VITE_API_URL` | да (прод) | URL API на Railway. Пусто → mock-режим |
| `VITE_PAYMENT_FALLBACK_LINK` | нет | статичная запаска-ссылка оплаты (основной путь — динамический через API) |
| `VITE_SENTRY_DSN` | нет | мониторинг фронта (пусто → выключен) |
| `VITE_DEV_INIT_DATA` | **никогда в проде** | только для локальной разработки вне Telegram |

---

## 6. Админка

- Адрес: `https://<адрес-API>/admin/ui`
- Вход: поле для `ADMIN_TOKEN` (то же значение, что в env API).
- Возможности: тренировки (CRUD, free/premium, публикация, видео-URL), категории, планы, поиск пользователей + выдать/отозвать доступ, журнал платёжных событий + переобработка.

---

## 7. Карта документации (`docs/`)

| Файл | О чём |
|------|-------|
| **HANDOFF.md** | этот файл — сводка и доступы |
| `product/refiesse-miniapp-mvp-tz.md` | MVP-ТЗ: цель, роли, экраны, API, что не входит |
| `product/payments-yookassa.md` | решение и механика оплаты ЮKassa |
| `product/backlog.md`, `product/mvp-build-spec.md` | исходный бэклог и билд-спека |
| `tech/architecture.md` | архитектура, контракт API, схема деплоя |
| `tech/data-model.md` | модели данных (Prisma) |
| `ops/deploy-railway.md` | **пошаговый деплой на Railway (только клики)** |
| `ops/deployment.md` | общая заметка по деплою (исходная) |
| `ops/release-checklist.md` | обязательное перед прод-релизом (security) |
| `ops/bot-token-rotation.md` | перевыпуск токена бота |
| `content/content-matrix.md` | контент: тренировки, планы, тексты, что дать Кате |
| `design/ui-tokens.md` | дизайн-система Soft System, токены, состояния |
| `qa/smoke-checklist.md` | ручной чеклист + что покрыто E2E |
| `launch/launch-plan.md` | план запуска через канал |
| `launch/warmup-posts.md`, `launch/launch-post.md` | готовые тексты постов |
| `launch/metrics.md` | метрики первой недели |
| `team/ai-agent-work-plan.md` | план работ по спринтам |
| `team/dev-agent-team.md` | состав команды агентов и роли |

---

## 8. Локальный запуск (для разработчика)

```bash
# 1. PostgreSQL 16 запущен; создать базу refiesse_dev (пользователь refiesse)
# 2. API
cd apps/api
cp .env.example .env            # заполнить DATABASE_URL, BOT_TOKEN, JWT_SECRET
npm run migrate                 # применить миграции
npm run db:seed                 # 13 тренировок, 6 категорий, 3 плана
npm run dev                     # http://localhost:3000
# 3. Mini App
cd apps/miniapp
# .env.local: VITE_API_URL=http://localhost:3000  (+ VITE_DEV_INIT_DATA для браузера)
npm run dev
# 4. Бот (опционально)
cd apps/bot && cp .env.example .env  # BOT_TOKEN → npm run dev
```

**Проверки:** `npm run build` / `npm run lint` / `npm run typecheck` (корень); `npm test` (в `apps/api`, 95 тестов); `npm run test:e2e` (в `apps/miniapp`, Playwright).

---

## 9. Порядок первого прод-запуска (кратко)

Полный пошаговый чеклист «только клики» — **`docs/ops/deploy-railway.md`**. Вкратце:

1. Railway: **New Project → Deploy PostgreSQL**.
2. Railway: сервис **api** (Root Directory `apps/api`, env из 5.1, на первый деплой `SEED_ON_START=true`) → домен → `/health` отвечает → убрать `SEED_ON_START`.
3. Railway: сервис **miniapp** (Root Directory `/`, `VITE_API_URL` = домен api) → домен = URL Mini App.
4. Связать: `CORS_ORIGIN` (api) = домен miniapp.
5. Перевыпустить токен бота (@BotFather) → `BOT_TOKEN` в сервис api.
6. Railway: сервис **bot** (Root Directory `apps/bot`, `BOT_TOKEN`, `WEBAPP_URL` = домен miniapp).
7. @BotFather → menu button URL = домен miniapp. Пройти чеклист проверки (шаг 9 в deploy-railway.md).
8. Позже — ЮKassa (`shopId`/`secretKey` в api, вебхук в ЛК), `docs/ops/release-checklist.md`, запуск канала по `docs/launch/`.
