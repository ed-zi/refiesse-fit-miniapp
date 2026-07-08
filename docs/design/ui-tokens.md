# Refiesse Fit Mini App — UI Design Tokens (Soft System)

Дата: 2026-07-08
Задача: S0-6 (UI-kit и дизайн-токены)
Направление: **Soft System** — спокойная система движения, wellness-тон, без fitness-агрессии.

Реализация токенов в коде: `apps/miniapp/src/tokens.css` (CSS custom properties).
Значения извлечены из реального прототипа: `apps/miniapp/src/App.css`, `apps/miniapp/src/index.css`, `apps/miniapp/src/App.tsx`.

---

## 0. Визуальные принципы Soft System

- белая база + лавандовые фоны для мягких секций;
- салатовый (lime) — только success / progress / streak;
- фиолетовый — основной CTA и активные состояния;
- коралловый — только маленькие labels (premium);
- большие скругления, много воздуха, минимум шума;
- спокойный тон текстов: поддержка, а не давление; без «потерпеть» и наказаний за пропуски.

---

## 1. Подключение

`tokens.css` подключён в `apps/miniapp/src/main.tsx` **до** `index.css`:

```ts
import './tokens.css'
import './index.css'
```

Файл только **добавляет** переменные (`--color-*`, `--font-*`, `--radius-*`, `--space-*`, `--shadow-*`, `--size-*`) и ничего не переопределяет. Legacy-переменные из `index.css` (`--ink`, `--muted`, `--canvas`, `--lav`, `--purple`, `--lime`, `--lime-ink`, `--coral`, `--line`, `--shadow`) сохранены как есть и синхронизированы 1:1 с новыми именами. Рефакторинг `App.css` на новые токены — отдельная задача спринта 1. `npm run build` в `apps/miniapp` проходит.

---

## 2. Палитра

### База

| Токен | HEX | Legacy | Назначение |
|---|---|---|---|
| `--color-white` | `#FFFFFF` | — | чистый белый |
| `--color-bg` | `#F6F4FB` | `--canvas` | фон приложения (canvas) |
| `--color-surface` | `#FFFFFF` | — | карточки, основные поверхности |
| `--color-surface-subtle` | `#FAF9FF` | — | мягкая лавандовая поверхность (search, step, fact-иконка) |

### Бренд / акценты

| Токен | HEX | Legacy | Назначение |
|---|---|---|---|
| `--color-lavender` | `#F1EFFF` | `--lav` | лавандовый фон секций, hero, chips |
| `--color-lavender-ink` | `#403A4D` | — | текст на лаванде (chip, feature) |
| `--color-cta` | `#8F73EA` | `--purple` | фиолетовый CTA, активные tab/chip |
| `--color-cta-ink` | `#FFFFFF` | — | текст на фиолетовом CTA |
| `--color-success` | `#D5FFC7` | `--lime` | салатовый: success, progress, program |
| `--color-success-ink` | `#24451F` | `--lime-ink` | текст/иконки на салатовом |
| `--color-success-note` | `#315D2A` | — | вторичный текст на салатовом |
| `--color-coral` | `#FF8562` | `--coral` | коралловый акцент, premium labels |

### Текст

| Токен | HEX | Legacy | Назначение |
|---|---|---|---|
| `--color-text` | `#1E1E1E` | `--ink` | основной текст, заголовки |
| `--color-muted` | `#67656F` | `--muted` | вторичный текст, описания |

### Линии и границы

| Токен | HEX | Legacy | Назначение |
|---|---|---|---|
| `--color-line` | `#ECE8F7` | `--line` | базовая граница карточек |
| `--color-line-lavender` | `#D8D0FF` | — | активная лавандовая граница (chip/option/step active) |
| `--color-line-neutral` | `#DBD6E8` | — | граница secondary-кнопки |
| `--color-ring` | `#D6CFFF` | — | обводка radio (не выбран) |

### Pills доступа (free / premium / neutral)

| Токен | HEX | Назначение |
|---|---|---|
| `--color-pill-neutral-bg` | `#F6F4FB` | нейтральный pill (длительность, уровень) |
| `--color-pill-neutral-text` | `#67656F` | текст нейтрального pill |
| `--color-pill-free-bg` | `#EDFFE8` | фон free-тега |
| `--color-pill-free-text` | `#387031` | текст free-тега |
| `--color-pill-premium-bg` | `#FFF0EA` | фон premium-тега |
| `--color-pill-premium-text` | `#FF8562` | текст premium-тега (коралл) |

### Состояния и служебные

| Токен | HEX / значение | Назначение |
|---|---|---|
| `--color-warning-bg` | `#FFF8F5` | мягкая плашка осторожности / error-фон |
| `--color-warning-border` | `#FFE0D5` | граница warning/error-плашки |
| `--color-warning-text` | `#604135` | текст warning/error |
| `--color-skeleton-base` | `#F1EFFF` | базовый цвет скелетона (лаванда) |
| `--color-skeleton-shine` | `#FAF9FF` | блик анимации скелетона |
| `--color-overlay` | `rgba(30,25,48,0.32)` | затемнение под locked/paywall |
| `--color-toast-bg` | `#1E1E1E` | фон toast |
| `--color-toast-text` | `#FFFFFF` | текст toast |
| `--color-progress-track` | `rgba(36,69,31,0.15)` | трек прогресса на салатовом |
| `--color-progress-fill` | `#24451F` | заполнение прогресса |

### Градиенты (декоративные превью)

| Токен | Назначение |
|---|---|
| `--gradient-thumb` | базовое превью тренировки |
| `--gradient-thumb-dark` | тёмное превью (`.thumb.dark`) |
| `--gradient-thumb-peach` | персиковое превью (`.thumb.peach`) |
| `--gradient-video` | плеер видео |
| `--gradient-avatar` | заливка аватара |
| `--gradient-success` | фон success-экрана |

---

## 3. Типографика

Семейство: `--font-sans` = `Inter, TildaSans, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`.

Uppercase — точечно (hero H2), не для всего интерфейса (мелкий экран).

### Размеры (роль → токен → px)

| Токен | px | Роль |
|---|---|---|
| `--font-size-display` | 34 | hero H2 (uppercase) |
| `--font-size-h1` | 30 | заголовок экрана / compact-title |
| `--font-size-stat` | 32 | крупные числа stat |
| `--font-size-h2` | 21 | section-заголовок (H3 в разметке) |
| `--font-size-h3` | 16 | заголовок карточки |
| `--font-size-body` | 14 | основной текст, lead |
| `--font-size-small` | 12 | small, meta, chips |
| `--font-size-tiny` | 11 | badge, fact |
| `--font-size-micro` | 10 | pills, nav labels |

### Веса

| Токен | Значение | Использование |
|---|---|---|
| `--font-weight-regular` | 400 | — (резерв) |
| `--font-weight-medium` | 700 | search-текст |
| `--font-weight-bold` | 800 | chips, steps, fact |
| `--font-weight-black` | 900 | заголовки, CTA, badges, nav |

### Line-height

| Токен | Значение | Использование |
|---|---|---|
| `--line-height-tight` | 1 | крупные заголовки / числа |
| `--line-height-display` | 0.98 | hero H2 |
| `--line-height-heading` | 1.06 | H3 |
| `--line-height-snug` | 1.12 | заголовок карточки |
| `--line-height-body` | 1.45 | основной текст |
| `--line-height-relaxed` | 1.5 | длинные абзацы |

### Letter-spacing

| Токен | Значение | Использование |
|---|---|---|
| `--letter-spacing-display` | -0.07em | uppercase заголовки |
| `--letter-spacing-heading` | -0.045em | H3 |
| `--letter-spacing-tight` | -0.03em | заголовок карточки |
| `--letter-spacing-wide` | 0.04em | uppercase caption |

---

## 4. Радиусы (большие скругления)

| Токен | px | Использование |
|---|---|---|
| `--radius-sm` | 16 | step |
| `--radius-md` | 18 | fact, toast |
| `--radius-lg` | 20 | thumb (превью) |
| `--radius-xl` | 22 | note, selection-summary, nav-button |
| `--radius-2xl` | 24 | option, stat |
| `--radius-card` | 26 | workout-card |
| `--radius-3xl` | 28 | program, profile-card |
| `--radius-4xl` | 30 | brief, bottom-nav |
| `--radius-hero` | 32 | hero, video |
| `--radius-5xl` | 34 | paywall, success |
| `--radius-phone` | 48 | рамка телефона |
| `--radius-pill` | 999 | pill-кнопки, chips, badges, progress |
| `--radius-circle` | 50% | аватар, radio, круглые иконки |

---

## 5. Отступы (spacing scale, база 2px)

| Токен | px |
|---|---|
| `--space-3xs` | 4 |
| `--space-2xs` | 6 |
| `--space-xs` | 8 |
| `--space-sm` | 10 |
| `--space-md` | 12 |
| `--space-base` | 14 |
| `--space-lg` | 16 |
| `--space-xl` | 18 |
| `--space-2xl` | 20 |
| `--space-3xl` | 24 |
| `--space-4xl` | 28 |

---

## 6. Тени

| Токен | Значение | Использование |
|---|---|---|
| `--shadow-stat` | `0 8px 24px rgba(44,38,70,.06)` | stat, profile-card |
| `--shadow-card` | `0 12px 30px rgba(44,38,70,.07)` | workout-card |
| `--shadow-soft` | `0 18px 42px rgba(44,38,70,.1)` | мягкая тень (=`--shadow`) |
| `--shadow-lift` | `0 14px 34px rgba(44,38,70,.12)` | success-icon |
| `--shadow-nav` | `0 16px 36px rgba(44,38,70,.13)` | bottom-nav |
| `--shadow-cta` | `0 12px 28px rgba(143,115,234,.28)` | фиолетовый CTA |
| `--shadow-phone` | `0 24px 70px rgba(30,25,48,.22)` | рамка телефона |

---

## 7. Размеры и touch-зоны

Правило: интерактивная touch-зона ≥ **44px** (`--size-touch-min`).

| Токен | px | Использование |
|---|---|---|
| `--size-touch-min` | 44 | минимальная touch-зона |
| `--size-cta` | 50 | высота основного CTA |
| `--size-control` | 48 | search / filter |
| `--size-chip` | 40 | высота chip |
| `--size-avatar` | 40 | аватар / back |
| `--size-nav` | 74 | высота bottom-nav |
| `--size-nav-item` | 58 | touch-зона кнопки навигации (≥44) |
| `--size-icon` | 28 | иконка в навигации |
| `--size-radio` | 24 | radio |

Анимация: `--transition-fast` = `0.18s ease`, `--transition-toast` = `0.2s`.

---

## 8. Component inventory

Компоненты прототипа (`App.tsx` / `App.css`) с назначением и вариантами.

| Компонент | Класс | Назначение | Варианты |
|---|---|---|---|
| CTA | `.cta` | основное действие | `primary` (фиолетовый solid, по умолч.), `secondary` (белый + граница), `lime` (салатовый — «Я сделала»/подписка), модификаторы `.full`, `.stacked` |
| Chip | `.chip` | быстрый фильтр/категория | `default` (лаванда), `active` (фиолетовый + белый текст) |
| Pill | `.pill` | тег на карточке | `neutral` (длительность/уровень), `free` (зелёный), `premium` (коралл) |
| Badge | `.badge` | капсула-статус в hero/paywall | белый фон + фиолетовый текст (напр. «premium», «Доступ открыт до …») |
| WorkoutCard | `.workout-card` | карточка тренировки | превью `.thumb` (default / `dark` / `peach`), access `free`/`premium` → CTA «Начать →»/«Открыть →» |
| ProgramCard | `.program` | карточка плана (салатовый) | с прогресс-баром `.progress` и заметкой |
| Hero | `.hero` | верхний блок-обещание | `default`, `.hero-tall` |
| Facts | `.facts` / `.fact` | 3 факта (мин / инвентарь / уровень) | — |
| Stats | `.stats` / `.stat` | сетка метрик прогресса | — |
| Option | `.option` | выбор в onboarding | `default`, `active` (лаванда + `.radio` активен) |
| SelectionSummary | `.selection-summary` | сводка ответов onboarding | — |
| OnboardingProgress | `.onboarding-progress` | индикатор шагов | `span` / `span.active` |
| Progress bar | `.progress` | прогресс плана | трек + `span` (ширина в %) |
| Search / Filter | `.search`, `.filter` | строка поиска + кнопка фильтра | — |
| Video | `.video` | плеер-превью | `default`, `.muted-video` (для locked) |
| Note | `.note` | мягкая плашка осторожности | коралловая |
| Paywall | `.paywall` | экран ценности | `default`, `.small-paywall` (заглушка в locked) |
| Feature | `.feature` / `.check` | пункт списка premium | — |
| Success | `.success` / `.success-icon` | экран успешной оплаты | — |
| TopBar | `.topbar` | верхняя панель | brand / title, `.back`, `.avatar` (right slot) |
| BottomNav | `.bottom-nav` | нижняя навигация (4 таба) | `button` / `button.active` |
| Toast | `.toast` | всплывающее уведомление | `default`, `.show` |
| ProfileCard | `.profile-card` | блок профиля | — |
| Step | `.step` | навигация прототипа (dev only) | `default`, `active` |

---

## 9. Спеки состояний экранов (loading / error / empty / locked)

Требуются для всех контентных экранов: **Home, Catalog, Workout, Plans, Progress** (и вложенных списков). Тон — Soft System: мягко, без тревоги, с понятным следующим шагом.

### 9.1 Loading (скелетоны)

- **Визуал:** повторяем форму реального контента скелетон-плашками. Фон `--color-skeleton-base` (лаванда `#F1EFFF`), мягкий блик `--color-skeleton-shine`, анимация плавная (shimmer, ~1.2s), радиусы соответствуют компоненту (`--radius-card` для карточек, `--radius-pill` для chips, `--radius-lg` для thumb).
- **Никакого текста** — не показываем спиннеры/проценты, чтобы не создавать ощущение ожидания.
- **По экранам:**
  - Home — скелетон hero (`--radius-hero`), ряд chip-плашек, 1 workout-card, 1 program-card.
  - Catalog — search-строка (статична), ряд chips, 3 карточки-скелетона.
  - Workout — video-блок, заголовок (2 строки), 3 fact-плашки, note-плашка.
  - Plans / Progress — 1–2 карточки / 4 stat-плашки.
- **Доступность:** контейнер `aria-busy="true"`, скрытый текст «Загружаем…».

### 9.2 Error (мягкий текст + retry)

- **Визуал:** плашка на `--color-warning-bg` (`#FFF8F5`), граница `--color-warning-border`, текст `--color-warning-text`, радиус `--radius-xl`. Без красного, без иконок тревоги.
- **Тон текста:** «Не получилось загрузить. Иногда связь капризничает — попробуем ещё раз?»
- **Действие:** secondary-кнопка `.cta.secondary` «Обновить» (retry). Никакой вины пользователя в тексте.
- **Доступность:** `role="alert"`; фокус переводится на кнопку retry.

### 9.3 Empty (мягкий текст)

- **Визуал:** по центру блока, много воздуха, опционально мягкий лавандовый круг/иллюстрация. Заголовок `--font-size-h2`, подпись `--color-muted`, `--line-height-body`.
- **Тон и тексты по контексту:**
  - Каталог/фильтр — «Здесь пока пусто. Попробуйте убрать фильтр или выбрать другое состояние тела.»
  - Избранное — «Пока ничего не сохранено. Отмечайте тренировки сердечком — они появятся здесь.»
  - Прогресс — «Пока нет отметок. Даже 10 минут считаются — начните с мягкой практики.»
- **Действие (по ситуации):** primary CTA «Подобрать тренировку» / «Открыть каталог».

### 9.4 Locked (premium-заглушка)

- **Визуал:** контент-превью приглушается (`.muted-video` — `saturate(.65)`, `opacity .78`), сверху лавандовая заглушка `.paywall.small-paywall` (`--color-lavender`, `--radius-5xl`) с салатовым декоративным кругом. Badge «premium» (белый + коралл/фиолетовый), заголовок, короткое объяснение ценности.
- **Тон:** объяснение, не давление. «Эта тренировка входит в Premium-каталог.» / заголовок «Откройте доступ, чтобы продолжить».
- **Действие:** primary CTA «Открыть через Tribute» → paywall. Опционально secondary «Продолжить бесплатно».
- **Доступность:** заблокированный контент `aria-disabled`, у CTA понятная метка.

---

## 10. Соответствие AC (S0-6)

- Soft System вынесён в токены (цвета, типографика, радиусы, отступы, тени, размеры) — раздел 2–7, файл `apps/miniapp/src/tokens.css`. ✅
- Component inventory из прототипа — раздел 8. ✅
- Спеки состояний loading / error / empty / locked описаны для контентных экранов — раздел 9. ✅
- CSS custom properties в коде, подключены, `npm run build` проходит. ✅
