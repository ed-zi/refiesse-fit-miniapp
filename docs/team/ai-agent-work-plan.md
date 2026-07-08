# Refiesse Fit Mini App — рабочий план для команды ИИ-агентов

**Дата:** 2026-07-08
**Основание:** полная сводка проекта (2026-07-02), `docs/team/dev-agent-team.md`, `docs/product/backlog.md`, `docs/product/mvp-build-spec.md`
**Цель:** довести frontend-прототип до рабочего beta-flow:

```text
/start → Mini App → Home → Подбор → Каталог → Карточка тренировки
→ Paywall → Tribute → Доступ открыт → Прогресс
```

Принцип работы прежний: **спецификация → задача → реализация → тест → ревью → PR → проверка flow**.
Каждая задача имеет ID, владельца-агента, зависимости и acceptance criteria (AC). Мерж — только после QA и Code Review.

---

## Текущее состояние (что уже есть)

- React + Vite + TypeScript прототип, 11 экранов, 4-шаговый onboarding — работает на GitHub Pages;
- дизайн-направление Soft System утверждено, кликабельные прототипы в `docs/design/`;
- бот @refiessefit_bot привязан к Mini App (menu button + /start + /app);
- `npm run build` и `npm run lint` зелёные.

**Чего нет:** backend, БД, Telegram initData verification, сохранение прогресса, реальный контент, Tribute (сейчас mock), админка, мониторинг, production-хостинг.

---

## Спринт 0 — Спецификация и фундамент

> Выход спринта: утверждённое MVP-ТЗ, монорепо с CI, контракт API и схема БД. Без этого команда реализации не стартует.

### S0-1. MVP-ТЗ `docs/product/refiesse-miniapp-mvp-tz.md`
**Агент:** Hermes Orchestrator + Product/UX Agent
**Зависимости:** нет
Разделы: цель MVP, роли пользователей, beta-flow, экраны + AC, модели данных, API routes, Telegram auth, Tribute future, admin/content flow, QA checklist, что НЕ входит в MVP.
**AC:** документ покрывает все 11 разделов из сводки; free/premium граница описана явно; подтверждён Эдом/Катей.

### S0-2. Архитектурная спека и контракт API
**Агент:** Tech Lead Agent
**Зависимости:** S0-1
Зафиксировать: Fastify vs NestJS, структуру монорепо (`apps/miniapp`, `apps/api`, `apps/bot`, `packages/shared`), схему деплоя (Vercel/Cloudflare Pages для фронта, Railway/Render/VPS для API — принять решение), env-переменные.
Контракт API (минимум): `GET /me`, `GET /catalog`, `GET /workouts/:id`, `GET /plans`, `POST /progress`, `POST /favorites`, `GET /access`.
**AC:** есть `docs/tech/architecture.md` с диаграммой, API contract и списком env; решение по хостингу зафиксировано.

### S0-3. Схема данных
**Агент:** Tech Lead Agent + Backend API Agent
**Зависимости:** S0-2
Модели: `User`, `Workout`, `Category`, `Program`, `ProgramDay`, `ProgressEntry`, `Favorite`, `Subscription`, `TributeEvent`.
**AC:** Prisma schema draft в `docs/tech/` или `apps/api/prisma/`; поля покрывают content matrix (название, цель, длительность, уровень, инвентарь, free/premium, видео URL, описание, осторожности, план/категория); у Workout `equipment` — массив, не строка.

### S0-4. Монорепо + CI
**Агент:** DevOps Agent
**Зависимости:** S0-2
npm workspaces (или pnpm), общий tsconfig, GitHub Actions: lint + typecheck + build на каждый PR; деплой Pages из CI вместо ручного gh-pages.
**AC:** PR без зелёного CI не мержится; `apps/miniapp` собирается в CI; структура готова к добавлению `apps/api` и `apps/bot`.

### S0-5. Content matrix (стартовый контент Кати)
**Агент:** Content Producer Agent (+ вход от Кати)
**Зависимости:** нет (идёт параллельно)
Таблица 10–15 тренировок: название, цель, длительность, уровень, инвентарь, free/premium, видео URL, короткое описание, осторожности, план/категория. 3 free-тренировки, 3 мини-плана на 5–7 дней.
**AC:** `docs/content/content-matrix.md` заполнен реальными материалами; free/premium разметка утверждена; тексты paywall и дисклеймеров готовы.

### S0-6. UI-kit и дизайн-токены
**Агент:** UI Design Agent
**Зависимости:** нет
Вынести Soft System в токены (цвета: белая база, лаванда, салатовый success, фиолетовый CTA, коралловые labels; радиусы, отступы, типографика). Component inventory из прототипа. Спеки состояний: loading / error / empty / locked.
**AC:** `docs/design/ui-tokens.md` + CSS custom properties в коде; каждый экран имеет описанные состояния loading/error/empty/locked.

### S0-7. Перевыпуск токена бота
**Агент:** DevOps Agent + Эд
**Зависимости:** нет — **сделать немедленно, токен засвечен в чате**
**AC:** новый токен через BotFather; хранится только в env/secrets, не в git; бот работает.

---

## Спринт 1 — Telegram-интеграция и скелет backend

> Выход спринта: Mini App ведёт себя как настоящее Telegram-приложение, backend отвечает и узнаёт пользователя.

### S1-1. Подключение Telegram SDK на фронте
**Агент:** Frontend Mini App Agent
**Зависимости:** S0-4
`@telegram-apps/sdk-react` (или WebApp API): init, viewport/safe area, theme params, expand, closing behavior, передача initData в API-клиент.
**AC:** нет собственных «системных» зон, safe area корректна на iOS/Android Telegram; тема не ломает Soft System палитру; приложение работает и в браузере (dev-fallback без Telegram).

### S1-2. Рефакторинг фронта: слой данных и типы
**Агент:** Frontend Mini App Agent
**Зависимости:** S0-3
Убрать hardcoded mock из `App.tsx`: вынести типы (`Workout`, `Plan`, `ProgressEntry`…в `packages/shared`), API-клиент с mock-режимом, `equipment: string[]` + мультивыбор на шаге 3/4 onboarding.
**AC:** экраны рендерятся из данных, а не из литералов в JSX; переключение mock/real API одной env-переменной; шаг «Что есть под рукой?» — мультивыбор.

### S1-3. Скелет backend-приложения
**Агент:** Backend API Agent
**Зависимости:** S0-2, S0-3, S0-4
`apps/api`: Fastify/NestJS + Prisma + PostgreSQL, healthcheck, миграции, валидация (zod/typebox), формат ошибок.
**AC:** `GET /health` отвечает; миграции применяются с нуля одной командой; ошибки в едином JSON-формате.

### S1-4. Telegram auth: верификация initData
**Агент:** Backend API Agent
**Зависимости:** S1-3
Проверка подписи initData по bot token, создание/поиск User по `telegram_user_id`, сессия (JWT или подписанный initData на каждый запрос), `GET /me`.
**AC:** запрос с невалидной подписью → 401; валидный initData создаёт пользователя один раз (idempotent); есть тесты на верификацию подписи.

### S1-5. Catalog/Plans/Workout API + seed
**Агент:** Backend API Agent
**Зависимости:** S1-3, S0-5
`GET /catalog` (фильтры: категория, длительность, free/premium), `GET /workouts/:id`, `GET /plans`; seed из content matrix.
**AC:** premium-контент без доступа отдаёт метаданные карточки, но **не** видео URL/содержимое; фильтры работают; seed повторяем.

### S1-6. Бот на новом токене в монорепо
**Агент:** Bot Developer Agent
**Зависимости:** S0-4, S0-7
`apps/bot` на grammY: `/start` с кнопкой Mini App, `/app`, menu button, единый Telegram ID с backend.
**AC:** бот открывает Mini App на mobile; `telegram_user_id` из бота совпадает с user в API; токен только в env.

---

## Спринт 2 — Реальный flow данных

> Выход спринта: пользователь проходит весь free-flow на реальных данных с сохранением прогресса.

### S2-1. Фронт на реальном API: Home, Catalog, Workout, Plans
**Агент:** Frontend Mini App Agent
**Зависимости:** S1-2, S1-5
Подключить экраны к API, состояния loading/error/empty/locked по спекам S0-6, «Тренировка дня» и «Текущий план» с backend.
**AC:** каталог и карточки показывают seed-контент; ошибка сети показывает мягкий error-state с retry; premium-карточка ведёт в locked/paywall.

### S2-2. Прогресс: `POST /progress` + экран
**Агент:** Backend API Agent + Frontend Mini App Agent
**Зависимости:** S1-4, S2-1
«Я сделала» пишет ProgressEntry; метрики (тренировки, минуты, дни подряд, прогресс плана) считаются на backend; тон без наказаний за пропуски.
**AC:** повторное нажатие «Я сделала» не задваивает запись за день; метрики совпадают с записями; streak не обнуляет тон UX (нет «вы всё потеряли»).

### S2-3. Избранное и история
**Агент:** Backend API Agent + Frontend Mini App Agent
**Зависимости:** S2-1
`POST /favorites` (toggle), история выполненных в профиле/прогрессе.
**AC:** избранное переживает перезапуск приложения; история отсортирована по дате.

### S2-4. Персонализация подбора
**Агент:** Product/UX Agent + Frontend Mini App Agent
**Зависимости:** S2-1
Результат onboarding (состояние, время, инвентарь[], режим) фильтрует каталог и «тренировку дня»; сохранение выбора в профиле пользователя, «Изменить подбор» в профиле.
**AC:** после onboarding каталог отфильтрован по выбору; подбор сохраняется между сессиями; можно изменить из профиля.

### S2-5. Видео в карточке тренировки
**Агент:** Frontend Mini App Agent + Content Producer Agent
**Зависимости:** S2-1, S0-5
Встраивание видео (video URL из content matrix) в workout detail, «Начать тренировку».
**AC:** free-видео играет в Telegram iOS/Android; premium-видео недоступно без доступа даже прямым запросом к API.

---

## Спринт 3 — Tribute и админка

> Выход спринта: реальная оплата открывает premium; Катя управляет контентом без разработчика.

### S3-1. Access-модель на backend
**Агент:** Backend API Agent + Tribute Integration Agent
**Зависимости:** S1-4
`GET /access`, `Subscription` с `expires_at`, проверка доступа во всех premium-endpoint'ах, manual grant/revoke (для поддержки).
**AC:** единая функция проверки доступа (не размазана по роутам); истёкшая подписка закрывает premium; manual grant работает и логируется.

### S3-2. Tribute: payment link + webhook
**Агент:** Tribute Integration Agent
**Зависимости:** S3-1
`/api/tribute/webhook`: проверка `trbt-signature`, обработка `new_subscription` / `renewed_subscription` / `cancelled_subscription`, idempotency по event id, `TributeEvent` лог, связь по `telegram_user_id`, ручной reprocess.
**AC:** невалидная подпись → 403 и событие не применяется; duplicate/retry webhook безопасен; после оплаты доступ открывается без действий пользователя; отмена не отрубает доступ раньше `expires_at`; тесты на все три типа событий + duplicate.

### S3-3. Paywall на реальном Tribute
**Агент:** Frontend Mini App Agent + Tribute Integration Agent
**Зависимости:** S3-2
Кнопка «Открыть через Tribute» ведёт на реальный payment link; по возвращении — поллинг/refetch `GET /access` → Success screen; профиль показывает реальные `expires_at` и «Управлять подпиской».
**AC:** полный цикл оплата → возврат → «Доступ открыт» проходит на тестовой оплате; «Продолжить бесплатно» работает; дата доступа в профиле реальная, не «18 июля» хардкодом.

### S3-4. Минимальная админка
**Агент:** Admin Agent
**Зависимости:** S1-5, S3-1
CRUD тренировок/категорий/программ, free/premium toggle, video URL, просмотр пользователей/подписок/Tribute events, manual grant/revoke.
**AC:** Катя добавляет тренировку без разработчика; можно ответить на вопрос «почему у пользователя X не открылся доступ» по данным админки; админка закрыта авторизацией.

### S3-5. Security review платёжного контура
**Агент:** Code Review / Security Agent
**Зависимости:** S3-2, S3-4
Ревью: webhook signature, auth, premium-доступ, секреты, admin-авторизация.
**AC:** чеклист ревью пройден; критичные замечания исправлены до мержа; секретов в git нет (проверено сканом).

---

## Спринт 4 — Продакшн, QA и запуск

### S4-1. Production-хостинг
**Агент:** DevOps Agent
**Зависимости:** S1-3, решение из S0-2
Staging + production для фронта и API, PostgreSQL managed, TLS, webhook URL Tribute → production, бэкапы БД. GitHub Pages остаётся как preview.
**AC:** staging и production URL живые; Mini App в боте указывает на production; секреты в env; бэкап восстанавливается.

### S4-2. Мониторинг и логи
**Агент:** DevOps Agent
**Зависимости:** S4-1
Sentry (front + back), структурные логи оплат/доступа/webhook.
**AC:** по логам восстанавливается путь любого Tribute event; ошибки фронта видны в Sentry.

### S4-3. E2E и регресс
**Агент:** QA Agent
**Зависимости:** S2-*, S3-3
Playwright по beta-flow (free-путь автоматизирован, paywall — до перехода в Tribute), обновлённый `docs/qa/smoke-checklist.md`, ручной прогон на Telegram iOS + Android (+ Desktop).
**AC:** Playwright flow зелёный в CI; smoke-чеклист пройден на обоих мобильных Telegram; баги заведены и закрыты или явно отложены.

### S4-4. Запуск через канал
**Агент:** Growth / Launch Agent
**Зависимости:** S4-1, S4-3
7-дневный прогрев, launch post, early-bird CTA, сбор обратной связи, метрики (открытия Mini App, конверсия paywall, оплаты).
**AC:** launch plan и тексты готовы до конца S4-3; после запуска есть дашборд/сводка метрик первой недели.

---

## Карта зависимостей (критический путь)

```text
S0-1 → S0-2 → S0-3 → S1-3 → S1-4 → S3-1 → S3-2 → S3-3 → S4-3 → S4-4
              S0-4 ↗       S1-5 → S2-1 → S2-2..S2-5 ↗
Параллельно без блокировок: S0-5 (контент), S0-6 (UI-kit), S0-7 (токен), S1-1, S1-6
```

Внешние блокеры (нужны от Эда/Кати):
1. **Сейчас:** перевыпуск токена бота (S0-7), утверждение MVP-ТЗ (S0-1), контент-матрица (S0-5).
2. **К спринту 3:** доступ к Tribute, цена подписки.
3. **К спринту 4:** решение по production-хостингу (готовится в S0-2).

---

## Правила исполнения (для всех агентов)

- Одна задача = одна ветка `feat/<id>-<slug>` = один PR; commit style — как в `dev-agent-team.md`.
- PR мержится только при зелёном CI + прохождении AC + ревью Code Review Agent (для S3-* — обязательно Security-ревью).
- Каждый PR обязан отвечать на вопрос: «какой шаг beta-flow это приближает?»
- Тон продукта во всех текстах и состояниях: мягкая система, без fitness-агрессии, без токсичного streak, без медицинской анкеты.
