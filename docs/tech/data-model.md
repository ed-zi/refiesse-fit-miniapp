# Refiesse Fit Mini App — модель данных

**Дата:** 2026-07-08
**Статус:** черновик к утверждению (задача S0-3)
**Владелец:** Tech Lead Agent + Backend API Agent
**Связанные документы:** `docs/product/refiesse-miniapp-mvp-tz.md` (раздел 5), `docs/tech/architecture.md`, `apps/api/prisma/schema.prisma`

Этот документ описывает 9 моделей MVP словами: назначение, поля, типы, связи, индексы и инварианты. Prisma-схема (`apps/api/prisma/schema.prisma`) — машинное отражение этого документа; при расхождении источником истины считаем этот документ + MVP-ТЗ.

---

## Сквозные правила

1. **Доступ — это не поле на User.** Признак premium вычисляется динамически из активной `Subscription` (`status = active` И `expiresAt > now()`). Нигде не храним `user.isPremium`.
2. **`Workout.equipment` — массив** (`String[]`). Онбординг и карточка тренировки оперируют мультивыбором инвентаря.
3. **`AccessType` (free/premium)** — единый enum для `Workout` и `Program`, вместо булева `is_premium`. Расширяемо (напр. `trial`) без миграции типа.
4. **Источник полей `Workout`** — content matrix Кати (S0-5). Seed БД идёт из неё.
5. **Идемпотентность** заложена в схему: `ProgressEntry` (уникальность по дню), `Favorite` (уникальность пары), `TributeEvent` (уникальность `eventId`), `User` (уникальность `telegramUserId`).
6. **Денежные/датовые сравнения** для доступа делаются на стороне БД/бэкенда в UTC; клиент не участвует в проверке доступа.
7. **Мягкие идентификаторы** (`id`) — `cuid()`. Внешние ключи (`telegramUserId`, `tributeSubscriptionId`, `eventId`) хранятся отдельно от `id`.

---

## 1. User

**Назначение.** Пользователь Mini App. Идентифицируется по `telegram_user_id` из подписанного Telegram `initData`. Отдельной регистрации нет — при первой валидной подписи выполняется find-or-create (идемпотентно).

**Поля.**

| Поле | Тип | Обяз. | Описание |
|------|-----|-------|----------|
| `id` | string (cuid) | да | Внутренний PK |
| `telegramUserId` | BigInt | да, uniq | Telegram user id. BigInt — id выходят за int32 |
| `firstName` | string? | нет | Имя из initData |
| `lastName` | string? | нет | Фамилия из initData |
| `username` | string? | нет | @username, если есть |
| `languageCode` | string? | нет | Язык Telegram (для будущего) |
| `onboardingGoal` | string? | нет | Шаг 1 подбора (состояние) |
| `onboardingTime` | string? | нет | Шаг 2 (время) |
| `onboardingEquipment` | string[] | да (по умолч. `[]`) | Шаг 3 — **мультивыбор инвентаря** |
| `onboardingIntensity` | string? | нет | Шаг 4 (режим) |
| `onboardingUpdatedAt` | DateTime? | нет | Когда подбор последний раз сохранён |
| `isAdmin` | boolean | да (false) | Флаг доступа в админку |
| `createdAt` / `updatedAt` | DateTime | да | Аудит |

**Связи.** 1—1 `Subscription`; 1—N `ProgressEntry`; 1—N `Favorite`.

**Индексы.** `telegramUserId` уникален (он же основной lookup при auth).

**Инварианты.**
- `telegramUserId` неизменяем после создания.
- Пользователь создаётся ровно один раз на один `telegramUserId` (гонки при первом заходе разрешаются уникальным индексом + upsert).
- Отсутствие `Subscription` или неактивная подписка = free-доступ (не ошибка).
- `onboardingEquipment` может быть пустым массивом; это валидное состояние («без инвентаря»).

---

## 2. Category

**Назначение.** Категория каталога (Спина / Осанка / Кор / Расслабление). Используется для фильтра на Home и в каталоге.

**Поля.**

| Поле | Тип | Обяз. | Описание |
|------|-----|-------|----------|
| `id` | string (cuid) | да | PK |
| `slug` | string | да, uniq | Машинный ключ (`back`, `posture`, `core`, `relax`) |
| `title` | string | да | Отображаемое название |
| `sortOrder` | int | да (0) | Порядок вывода |
| `createdAt` | DateTime | да | Аудит |

**Связи.** 1—N `Workout`.

**Индексы.** `slug` уникален.

**Инварианты.**
- `slug` стабилен: на него ссылаются фильтры фронта и content matrix.
- Удаление категории с привязанными тренировками запрещено на уровне логики (сначала перенос/снятие с публикации).

---

## 3. Workout

**Назначение.** Единица контента — мягкая тренировка. Поля = столбцы content matrix. Центральная сущность каталога и карточки.

**Поля.**

| Поле | Тип | Обяз. | Описание |
|------|-----|-------|----------|
| `id` | string (cuid) | да | PK |
| `slug` | string | да, uniq | Стабильный ключ (для seed/идемпотентности) |
| `title` | string | да | Название |
| `goal` | string | да | Основная цель/состояние (совпадает со значениями шага 1 онбординга) |
| `durationMin` | int | да | Длительность в минутах |
| `level` | `WorkoutLevel` | да (beginner) | `beginner` / `medium` / `advanced` |
| `equipment` | string[] | да (по умолч. `[]`) | **Массив** инвентаря |
| `access` | `AccessType` | да (free) | `free` / `premium` |
| `videoUrl` | string? | нет | URL видео. **Отдаётся клиенту только при наличии доступа** |
| `description` | string | да | Описание практики |
| `cautions` | string | да | Блок осторожностей — всегда показывается |
| `thumbColor` | string? | нет | Визуальный ключ карточки (Soft System: peach/lavender/dark…) |
| `isPublished` | boolean | да (true) | Черновик/опубликовано |
| `categoryId` | string | да | FK на Category |
| `createdAt` / `updatedAt` | DateTime | да | Аудит |

**Связи.** N—1 `Category`; N—M `Program` через `ProgramDay`; 1—N `ProgressEntry`; 1—N `Favorite`.

**Индексы.** `slug` uniq; индексы по `categoryId`, `access`, `level`, `durationMin` (фильтры каталога).

**Инварианты.**
- `access = premium` ⇒ `videoUrl` и любой «контент» отдаются **только** пользователю с активным доступом; в противном случае эндпоинт возвращает метаданные без `videoUrl` (см. MVP-ТЗ 4.6).
- `cautions` — непустая строка (осторожности обязательны для wellness-тона).
- `durationMin > 0`.
- `equipment` может быть пустым массивом.
- Неопубликованная тренировка (`isPublished=false`) не попадает в `/catalog`, но доступна в админке.

---

## 4. Program

**Назначение.** Мини-план (система на 5–7 дней). Показывает, что продукт — «система, а не каталог».

**Поля.**

| Поле | Тип | Обяз. | Описание |
|------|-----|-------|----------|
| `id` | string (cuid) | да | PK |
| `slug` | string | да, uniq | Стабильный ключ |
| `title` | string | да | Название плана |
| `description` | string? | нет | Короткое описание |
| `daysTotal` | int | да | Всего дней в плане |
| `access` | `AccessType` | да (free) | free/premium |
| `isPublished` | boolean | да (true) | Черновик/опубликовано |
| `createdAt` / `updatedAt` | DateTime | да | Аудит |

**Связи.** 1—N `ProgramDay`.

**Индексы.** `slug` uniq; индекс по `access`.

**Инварианты.**
- `daysTotal` должен соответствовать числу `ProgramDay` (проверка на уровне seed/логики, не БД).
- Прогресс плана считается по выполненным дням (см. ProgressEntry), а не хранится на Program.
- `access = premium` план ведёт в Paywall при отсутствии доступа.

---

## 5. ProgramDay

**Назначение.** День внутри плана. Связывает `Program` с конкретной `Workout`. Тренировка опциональна — день может быть чек-ином/отдыхом.

**Поля.**

| Поле | Тип | Обяз. | Описание |
|------|-----|-------|----------|
| `id` | string (cuid) | да | PK |
| `programId` | string | да | FK на Program |
| `dayIndex` | int | да | Порядковый номер дня (1..daysTotal) |
| `title` | string | да | Заголовок дня |
| `workoutId` | string? | нет | FK на Workout (может отсутствовать) |
| `createdAt` | DateTime | да | Аудит |

**Связи.** N—1 `Program` (onDelete: Cascade); N—1 `Workout` (опционально).

**Индексы.** Уникальность `(programId, dayIndex)`; индекс по `workoutId`.

**Инварианты.**
- `dayIndex` уникален внутри плана и лежит в `1..daysTotal`.
- Удаление плана каскадно удаляет его дни; удаление тренировки, привязанной к дню, — запрещено логикой (сначала отвязать).

---

## 6. ProgressEntry

**Назначение.** Отметка «Я сделала». Основа метрик прогресса (тренировки/минуты/дни подряд/прогресс плана).

**Поля.**

| Поле | Тип | Обяз. | Описание |
|------|-----|-------|----------|
| `id` | string (cuid) | да | PK |
| `userId` | string | да | FK на User |
| `workoutId` | string | да | FK на Workout |
| `completedAt` | DateTime | да (now) | Точное время выполнения |
| `durationMin` | int | да | Снимок длительности на момент выполнения |
| `entryDate` | Date | да | Календарный день (UTC) — ключ дедупликации |

**Связи.** N—1 `User` (onDelete: Cascade); N—1 `Workout`.

**Индексы.** Уникальность `(userId, workoutId, entryDate)`; индексы по `userId` и `(userId, completedAt)`.

**Инварианты.**
- **Идемпотентность по дню:** повторное «Я сделала» по той же тренировке в тот же календарный день не создаёт новую запись (upsert/`onConflict do nothing`).
- `durationMin` фиксируется копией с `Workout` на момент записи (чтобы позднее изменение тренировки не искажало историю).
- Метрики считаются агрегатами на бэкенде; на модели не денормализуются.
- «Дни подряд» — производная величина, streak без наказующего тона (пропуск не удаляет записи).

---

## 7. Favorite

**Назначение.** Избранные тренировки пользователя (toggle).

**Поля.**

| Поле | Тип | Обяз. | Описание |
|------|-----|-------|----------|
| `id` | string (cuid) | да | PK |
| `userId` | string | да | FK на User |
| `workoutId` | string | да | FK на Workout |
| `createdAt` | DateTime | да | Когда добавлено |

**Связи.** N—1 `User` (onDelete: Cascade); N—1 `Workout`.

**Индексы.** Уникальность `(userId, workoutId)`; индекс по `userId`.

**Инварианты.**
- Одна пара `(user, workout)` — максимум одна запись; toggle = create/delete.
- Избранное переживает перезапуск приложения (хранится в БД, не в клиенте).

---

## 8. Subscription

**Назначение.** Подписка пользователя. **Единственный источник истины по premium-доступу.**

**Поля.**

| Поле | Тип | Обяз. | Описание |
|------|-----|-------|----------|
| `id` | string (cuid) | да | PK |
| `userId` | string | да, uniq | FK на User (1—1) |
| `status` | `SubscriptionStatus` | да (expired) | `active` / `cancelled` / `expired` |
| `expiresAt` | DateTime? | нет | До какого момента доступ действует |
| `tributeSubscriptionId` | string? | нет | ID подписки в Tribute |
| `startedAt` | DateTime? | нет | Начало текущего периода |
| `cancelledAt` | DateTime? | нет | Когда отменена |
| `createdAt` / `updatedAt` | DateTime | да | Аудит |

**Связи.** 1—1 `User`.

**Индексы.** `userId` uniq; индекс `(status, expiresAt)` (быстрая проверка доступа); индекс по `tributeSubscriptionId`.

**Инварианты.**
- **Правило доступа:** premium активен ⟺ `status = active` И `expiresAt > now()`. Единая функция `hasAccess(user)` на бэкенде; логика не размазана по роутам.
- Отмена (`cancelled`) **не отрубает доступ раньше** `expiresAt`: пользователь остаётся premium до конца оплаченного периода.
- `renewed_subscription` продлевает `expiresAt` и возвращает `status = active`.
- `expired` выставляется, когда `expiresAt` прошёл (лениво при проверке или фоновой задачей).
- Manual grant/revoke из админки изменяет `status`/`expiresAt` и логируется.

---

## 9. TributeEvent

**Назначение.** Лог входящих webhook-событий Tribute. Обеспечивает идемпотентность обработки и разбор инцидентов («почему у пользователя X не открылся доступ»).

**Поля.**

| Поле | Тип | Обяз. | Описание |
|------|-----|-------|----------|
| `id` | string (cuid) | да | PK |
| `eventId` | string | да, uniq | ID события Tribute — **ключ идемпотентности** |
| `type` | `TributeEventType` | да | `new_subscription` / `renewed_subscription` / `cancelled_subscription` |
| `telegramUserId` | BigInt? | нет | Связь с пользователем (User может ещё не существовать) |
| `payload` | Json | да | Полное тело события (для reprocess/аудита) |
| `signatureOk` | boolean | да | Прошла ли проверка `trbt-signature` |
| `processedAt` | DateTime? | нет | Когда применено; `null` = принято, но не применено |
| `error` | string? | нет | Причина, если применение не удалось |
| `receivedAt` | DateTime | да | Когда получено |

**Связи.** Логическая связь с `User` по `telegramUserId` (без жёсткого FK — событие может прийти раньше пользователя).

**Индексы.** `eventId` uniq; индексы по `telegramUserId` и `type`.

**Инварианты.**
- **Идемпотентность:** повторный webhook с тем же `eventId` не применяется дважды (уникальный индекс + проверка `processedAt`). Duplicate/retry безопасны.
- Событие с `signatureOk = false` **сохраняется для аудита, но не применяется** к `Subscription` (эндпоинт при этом отвечает 403).
- Событие всегда логируется до попытки применения (чтобы был след даже при падении обработки).
- Ручной reprocess из админки повторно применяет `payload` по бизнес-правилам, не создавая дубль лога.

---

## Диаграмма связей (текстом)

```text
User 1───1 Subscription
User 1───N ProgressEntry N───1 Workout
User 1───N Favorite      N───1 Workout
Category 1───N Workout
Program  1───N ProgramDay N───1 Workout (опц.)
TributeEvent ··· (по telegram_user_id) ··· User
                                             │
                     применяется к           ▼
             TributeEvent ─────────────► Subscription
```

---

## Соответствие content matrix (S0-5)

Столбцы content matrix ложатся на `Workout` так:

| Content matrix | Поле модели |
|----------------|-------------|
| Название | `Workout.title` |
| Цель / состояние | `Workout.goal` |
| Длительность | `Workout.durationMin` |
| Уровень | `Workout.level` |
| Инвентарь | `Workout.equipment[]` |
| Free/Premium | `Workout.access` |
| Видео URL | `Workout.videoUrl` |
| Описание | `Workout.description` |
| Осторожности | `Workout.cautions` |
| Категория | `Workout.category` (по `Category.slug`) |
| План / день | `Program` + `ProgramDay` |
