# Refiesse Fit Mini App — команда разработки

**Проект:** Telegram Mini App для Refiesse Fit  
**Связка:** Telegram-канал → Tribute → Mini App → каталог / планы / прогресс / подписка  
**Дизайн-направление:** Soft System  
**Дата:** 2026-06-27

---

## 1. Принцип работы команды

Разработка идёт не хаотично, а через маленькие вертикальные куски:

```text
спецификация → задача → реализация → тест → ревью → PR → проверка flow
```

Главное правило:

```text
каждая задача должна приближать нас к рабочему beta-flow
```

Beta-flow:

```text
/start
→ открыть Mini App
→ Home
→ Подбор
→ Каталог
→ Карточка тренировки
→ Paywall
→ Tribute
→ Доступ открыт
→ Прогресс
```

---

## 2. Ядро команды

### 1. Hermes Orchestrator / Product Owner

**Роль:** управляющий агент проекта.

**Ответственность:**

- держит общий контекст;
- не даёт смешивать Refiesse с EDVERSE;
- принимает продуктовые решения вместе с Эдом/Катей;
- дробит работу на задачи;
- проверяет, что агенты не уходят в лишнее;
- собирает документы, backlog и план релиза.

**Выход:**

- MVP scope;
- build spec;
- backlog;
- acceptance criteria;
- release checklist.

---

### 2. Product / UX Agent

**Роль:** продуктовая логика и пользовательские сценарии.

**Ответственность:**

- flow Mini App;
- структура экранов;
- onboarding;
- paywall logic;
- free/premium граница;
- прогресс без давления;
- понятность “система, а не каталог”.

**Выход:**

- user flows;
- экранные сценарии;
- UX acceptance criteria.

---

### 3. UI Design Agent

**Роль:** визуальная система Soft System.

**Ответственность:**

- цвета, типографика, карточки, кнопки;
- перенос визуального стиля refiesse.ru;
- кликабельный прототип;
- состояния: empty, locked, success, loading, error;
- UI-kit для разработки.

**Выход:**

- clickable prototype;
- UI-kit;
- CSS tokens;
- component specs.

---

### 4. Content Producer Agent

**Роль:** упаковка контента Кати в продукт.

**Ответственность:**

- собрать матрицу тренировок;
- разметить видео;
- выбрать free/premium;
- собрать 3 мини-плана;
- упаковать Telegram-посты в образовательные карточки;
- подготовить тексты карточек, paywall, дисклеймеров.

**Выход:**

- content matrix;
- стартовый seed-контент;
- тексты для Mini App.

---

### 5. Tech Lead Agent

**Роль:** техническая архитектура.

**Ответственность:**

- выбрать финальный стек;
- определить структуру репозитория;
- спроектировать backend/frontend границы;
- определить DB schema;
- спроектировать Tribute webhook flow;
- определить env-переменные и deployment-схему.

**Выход:**

- technical spec;
- architecture diagram;
- DB schema;
- API contract.

---

## 3. Команда реализации

### 6. Frontend Mini App Agent

**Роль:** клиентская часть Telegram Mini App.

**Стек:**

```text
React + Vite + TypeScript
Telegram WebApp SDK / @telegram-apps/sdk-react
CSS modules или Tailwind
```

**Ответственность:**

- Home;
- Onboarding;
- Catalog;
- Workout Detail;
- Plans;
- Paywall;
- Payment Success;
- Progress;
- Profile;
- frontend state;
- Telegram viewport / safe area.

**Definition of Done:**

- экран соответствует прототипу;
- работает на mobile Telegram;
- есть loading/error/empty state;
- не ломается на iOS/Android viewport.

---

### 7. Backend API Agent

**Роль:** API и бизнес-логика.

**Стек:**

```text
Node.js + TypeScript
Fastify или NestJS
PostgreSQL
Prisma
```

**Ответственность:**

- Telegram auth;
- users;
- catalog;
- programs;
- workouts;
- favorites;
- progress;
- access checks;
- admin API.

**Definition of Done:**

- API имеет валидацию;
- premium endpoint не отдаёт закрытый контент без доступа;
- ошибки возвращаются в понятном формате;
- есть тесты на критичную логику.

---

### 8. Tribute Integration Agent

**Роль:** платежи и доступ.

**Ответственность:**

- Tribute payment link;
- `/api/tribute/webhook`;
- проверка `trbt-signature`;
- обработка `new_subscription`;
- обработка `renewed_subscription`;
- обработка `cancelled_subscription`;
- idempotency;
- связь по `telegram_user_id`;
- ручной reprocess события.

**Definition of Done:**

- подпись webhook проверяется;
- retry webhook безопасен;
- duplicate event не ломает доступ;
- пользователь после оплаты получает premium;
- отмена не отрубает доступ раньше `expires_at`.

---

### 9. Bot Developer Agent

**Роль:** Telegram bot как вход в Mini App.

**Стек:**

```text
grammY или Telegraf
```

**Ответственность:**

- `/start`;
- кнопка открытия Mini App;
- menu button;
- кнопка “Открыть доступ”;
- базовые reminders later;
- связь с каналом запуска.

**Definition of Done:**

- бот открывает Mini App;
- кнопка работает в Telegram mobile;
- пользовательский Telegram ID совпадает с backend user.

---

### 10. Admin Agent

**Роль:** минимальная админка.

**Ответственность:**

- CRUD тренировок;
- CRUD категорий;
- CRUD программ;
- free/premium toggle;
- video URL;
- просмотр пользователей;
- просмотр подписок;
- просмотр Tribute events;
- manual grant/revoke.

**Definition of Done:**

- Катя/команда может добавить тренировку без разработчика;
- можно поменять premium/free;
- можно проверить, почему доступ не открылся.

---

## 4. Качество и релиз

### 11. QA Agent

**Роль:** тестирование.

**Ответственность:**

- smoke tests;
- regression checklist;
- mobile Telegram checks;
- Tribute webhook checks;
- access checks;
- bug reports.

**Критичный smoke-flow:**

```text
/start
→ Mini App
→ Catalog
→ premium workout
→ Paywall
→ Tribute payment
→ webhook
→ access unlock
→ complete workout
→ Progress updated
```

**Definition of Done:**

- проверено на Telegram iOS;
- проверено на Telegram Android;
- проверено на Telegram Desktop, если возможно;
- premium нельзя открыть без доступа;
- после оплаты доступ открывается.

---

### 12. Code Review / Security Agent

**Роль:** независимая проверка кода.

**Ответственность:**

- review PR;
- security scan;
- проверка webhook signature;
- проверка auth;
- проверка доступа к premium;
- проверка отсутствия секретов в коде.

**Правило:**

```text
Ни одна критичная интеграция не мержится без ревью.
```

---

### 13. DevOps Agent

**Роль:** деплой и окружения.

**Ответственность:**

- staging;
- production;
- env variables;
- database;
- TLS;
- webhook URL;
- logs;
- backups;
- Sentry/monitoring.

**Definition of Done:**

- есть staging URL;
- есть production URL;
- Tribute webhook смотрит в правильный backend;
- секреты не лежат в git;
- логи позволяют понять проблему оплаты/доступа.

---

### 14. Growth / Launch Agent

**Роль:** запуск через Telegram-канал.

**Ответственность:**

- 7-дневный прогрев;
- launch post;
- early-bird CTA;
- тексты постов;
- CTA в канал;
- сбор обратной связи.

**Выход:**

- launch plan;
- посты;
- метрики запуска.

---

## 5. Рабочий процесс

### Для каждой задачи

```text
1. Hermes формулирует задачу
2. Добавляет acceptance criteria
3. Назначает агенту
4. Агент реализует
5. QA / тесты
6. Code Review Agent проверяет
7. PR
8. merge только после зелёных проверок
```

### Ветки

```text
main
feat/telegram-auth
feat/catalog
feat/tribute-webhook
feat/progress
feat/admin-content
```

### Commit style

```text
feat: add telegram auth
feat: add workout catalog
feat: implement tribute webhook verification
fix: prevent duplicate webhook processing
```

---

## 6. Первый состав команды на Sprint 0–1

Не запускаем всех сразу. Ядро на старт:

```text
1. Hermes Orchestrator
2. Product / UX Agent
3. UI Design Agent
4. Content Producer Agent
5. Tech Lead Agent
6. Frontend Mini App Agent
7. Backend API Agent
8. Tribute Integration Agent
9. QA Agent
10. Code Review Agent
```

Bot, Admin, DevOps, Growth подключаются сразу после утверждения build spec.

---

## 7. Первые задачи команды

### Product / UX Agent

- утвердить финальный MVP-flow;
- уточнить категории;
- уточнить free/premium границу;
- написать acceptance criteria для экранов.

### UI Design Agent

- довести clickable prototype;
- подготовить UI-kit;
- подготовить states: loading, error, empty, locked.

### Content Producer Agent

- собрать таблицу 10–15 тренировок;
- выбрать 3 free;
- собрать 3 premium-плана;
- подготовить тексты карточек.

### Tech Lead Agent

- подготовить build spec;
- выбрать финальный стек;
- описать API и DB schema;
- описать deployment.

### Backend / Tribute Agents

- спроектировать auth/access/webhook;
- подготовить schema для subscriptions/events;
- определить env variables.

### QA Agent

- написать smoke checklist;
- написать Tribute/access test cases;
- определить устройства для проверки.

---

## 8. Что нужно от Эда / Кати

1. Подтвердить дизайн-направление Soft System.
2. Дать список первых тренировок.
3. Дать ссылки на видео/материалы.
4. Решить цену Tribute-подписки.
5. Подтвердить free/premium границу.
6. Создать или дать доступ к Telegram bot.
7. Создать или дать доступ к Tribute.
8. Решить, где будет GitHub repo.
9. Решить, где хостим backend.
10. Дать логотип/фото/визуальные материалы, если есть.
