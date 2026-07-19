# Refiesse Fit Mini App — сводный файл проекта (HANDOFF)

**Обновлено:** 2026-07-14
**Назначение:** единая точка входа — что за проект, где что лежит, какие доступы нужны и куда их вписать для запуска.

> ⚠️ **Секретов здесь нет и быть не должно.** Ниже перечислено, *какие* ключи/доступы нужны и *куда* они вписываются (Railway / Cloudflare / `.env`). Сами значения храните только в панелях хостинга и локальных `.env` (они в `.gitignore`).

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

**Хостинг (решено):** фронт — **Cloudflare Pages**; API + бот + PostgreSQL — **Railway**; GitHub Pages остаётся как preview.
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
1. **Аккаунт Railway** — для API + бота + PostgreSQL. Создать проект, привязать репозиторий (или дать доступ/токен).
2. **Аккаунт Cloudflare** — для Pages (фронт). Бесплатного тарифа хватит.
3. Пошаговый деплой: `docs/ops/deployment.md`.

### 4.3 Безопасность — обязательно перед прод-релизом
1. **Перевыпустить токен бота** через @BotFather (текущий засвечен в чате). Инструкция: `docs/ops/bot-token-rotation.md`.
2. Сгенерировать сильные `JWT_SECRET` и `ADMIN_TOKEN` (≥32 символов — прод отклонит короткие).
3. Сверить формат подписи вебхука ЮKassa с их актуальной документацией (единственный пункт security-ревью, требующий реального аккаунта). Чеклист: `docs/ops/release-checklist.md`.

### 4.4 Контент — блокирует «настоящее» наполнение
1. Реальные тренировки и **видео Кати** вместо 13 seed-заготовок с плейсхолдерами. Загружаются через админку (`/admin/ui`) без программиста.
2. Матрица контента и что заполнить: `docs/content/content-matrix.md`.

---

## 5. Переменные окружения по сервисам

> Задаются в панелях хостинга (Railway Variables / Cloudflare Pages env), локально — в `.env` файлах (в git не попадают). Полные примеры: `apps/*/.env.example`.

### 5.1 API (Railway) — `apps/api`
| Переменная | Обязательна | Назначение |
|-----------|:-----------:|-----------|
| `DATABASE_URL` | да | строка подключения PostgreSQL (даёт Railway) |
| `BOT_TOKEN` | да | токен бота — для проверки подписи initData |
| `JWT_SECRET` | да | подпись сессионных JWT (прод: ≥32 симв.) |
| `CORS_ORIGIN` | прод | origin фронта (домен Cloudflare Pages) |
| `YOOKASSA_SHOP_ID` | для оплат | shopId из ЛК ЮKassa |
| `YOOKASSA_SECRET_KEY` | для оплат | secretKey из ЛК ЮKassa |
| `YOOKASSA_RETURN_URL` | для оплат | куда вернуть после оплаты (Mini App) |
| `BILLING_AUTOCHARGE_ENABLED` | нет | `true`/`false` — автосписание (default false) |
| `ADMIN_TOKEN` | для админки | доступ к `/admin/*` (прод: ≥32 симв.) |
| `SENTRY_DSN` | нет | мониторинг ошибок (пусто → выключен) |
| `JWT_EXPIRES_IN`, `INIT_DATA_MAX_AGE_SEC`, `PORT`, `NODE_ENV` | нет | значения по умолчанию есть |
| `TRIBUTE_API_KEY` | — | DEPRECATED, не нужен |

### 5.2 Бот (Railway) — `apps/bot`
| Переменная | Обязательна | Назначение |
|-----------|:-----------:|-----------|
| `BOT_TOKEN` | да | тот же токен бота |
| `WEBAPP_URL` | нет | URL Mini App для кнопки (default — Pages preview; в проде → домен Cloudflare) |

### 5.3 Mini App (Cloudflare Pages build) — `apps/miniapp`
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
| `ops/deployment.md` | пошаговый деплой (Railway + Cloudflare) |
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

1. Перевыпустить токен бота (@BotFather) → сохранить в Railway.
2. Railway: создать PostgreSQL + сервис API (env из 5.1) → задеплоить → миграции применяются автоматически → выполнить seed.
3. Railway: сервис бота (env из 5.2).
4. Cloudflare Pages: подключить репо, build-команда фронта, env `VITE_API_URL` = адрес API.
5. Прописать домены: `CORS_ORIGIN` (API) и `WEBAPP_URL` (бот) → домен Cloudflare; в @BotFather menu button → домен Cloudflare.
6. ЮKassa: `shopId`/`secretKey` в Railway, URL вебхука в ЛК ЮKassa, тестовая оплата на тестовом магазине.
7. Пройти `docs/ops/release-checklist.md`.
8. Запуск канала по `docs/launch/`.
