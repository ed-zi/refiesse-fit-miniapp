// Общие типы монорепо Refiesse Fit (apps/api, apps/miniapp, apps/bot).
// Выравнены по docs/tech/data-model.md и docs/product/refiesse-miniapp-mvp-tz.md (раздел 5).
// Правила пакета: без внешних зависимостей; даты передаются ISO-строками (UTC),
// id — строки (cuid на бэкенде). Это клиентские DTO, а не Prisma-модели:
// например, premium-признак здесь — вычисленный `isPremium`, а в БД — enum `AccessType`.

/** Уровень доступа к контенту (enum из data-model, п. «Сквозные правила» №3). */
export type AccessType = 'free' | 'premium'

/**
 * Уровень доступа к тренировке.
 * @deprecated Оставлено для обратной совместимости, используйте {@link AccessType}.
 */
export type AccessTier = AccessType

/** Уровень сложности тренировки (Workout.level в data-model). */
export type WorkoutLevel = 'beginner' | 'medium' | 'advanced'

/** Категория каталога (Спина / Осанка / Кор / Расслабление). */
export interface Category {
  id: string
  /** Машинный ключ: back / posture / core / relax. Стабилен, на него ссылаются фильтры. */
  slug: string
  title: string
  sortOrder: number
}

/** Единица контента — мягкая тренировка. Поля = столбцы content matrix (S0-5). */
export interface Workout {
  id: string
  /** Стабильный ключ (для seed/роутинга). */
  slug: string
  title: string
  /** Основная цель/состояние — совпадает со значениями шага 1 онбординга. */
  goal: string
  durationMin: number
  level: WorkoutLevel
  /** Массив инвентаря; пустой массив = «без инвентаря» (валидное состояние). */
  equipment: string[]
  /** Вычислено бэкендом из Workout.access === 'premium'. */
  isPremium: boolean
  /** URL видео. Бэкенд отдаёт его только при наличии доступа, иначе null/отсутствует. */
  videoUrl?: string | null
  description: string
  /** Блок осторожностей — показывается всегда, непустая строка. */
  cautions: string
  /** Slug категории (Category.slug). */
  categorySlug: string
  /** Визуальный ключ карточки в Soft System (peach / lavender / dark …). */
  thumbColor?: string | null
}

/** День внутри мини-плана. Тренировка опциональна — день может быть чек-ином/отдыхом. */
export interface ProgramDay {
  id: string
  /** Порядковый номер дня, 1..daysTotal. */
  dayIndex: number
  title: string
  /** Slug привязанной тренировки; null — день без тренировки. */
  workoutSlug?: string | null
}

/** Мини-план («система на 5–7 дней»). */
export interface Program {
  id: string
  slug: string
  title: string
  description?: string | null
  daysTotal: number
  isPremium: boolean
  days: ProgramDay[]
}

/** Отметка «Я сделала» — основа метрик прогресса. */
export interface ProgressEntry {
  id: string
  workoutId: string
  /** Точное время выполнения, ISO-строка. */
  completedAt: string
  /** Снимок длительности тренировки на момент выполнения. */
  durationMin: number
  /** Календарный день (UTC, формат YYYY-MM-DD) — ключ идемпотентности по дню. */
  entryDate: string
}

/** Агрегированные метрики прогресса (считаются бэкендом, не денормализуются в БД). */
export interface ProgressSummary {
  /** Количество выполненных тренировок за период (напр. неделю). */
  workouts: number
  /** Суммарные минуты. */
  minutes: number
  /** Дней подряд (streak без наказующего тона). */
  streakDays: number
  /** Прогресс по текущему плану: выполнено дней / всего дней. */
  planProgress: {
    done: number
    total: number
  }
}

/** Ответы онбординга «Подбор» (ТЗ 4.2). Шаг 3 — мультивыбор инвентаря. */
export interface OnboardingAnswers {
  goal: string
  time: string
  /** Мультивыбор; пустой массив = «без инвентаря» (валидное состояние). */
  equipment: string[]
  intensity: string
}

/** Статус подписки (Subscription.status в data-model). */
export type SubscriptionStatus = 'active' | 'cancelled' | 'expired'

/**
 * Вычисленный статус доступа пользователя.
 * Источник истины — бэкенд: premium ⟺ status = active И expiresAt > now().
 */
export interface AccessStatus {
  isPremium: boolean
  /** 'none' — подписки не было вовсе. */
  status: SubscriptionStatus | 'none'
  /** До какого момента действует доступ, ISO-строка; null — нет активного периода. */
  expiresAt: string | null
}

/** Профиль пользователя Mini App (ответ /me). */
export interface UserProfile {
  id: string
  /** Telegram user id; null допустим в браузерном прототипе без Telegram. */
  telegramUserId: number | null
  firstName: string
  lastName?: string | null
  username?: string | null
  /** Сохранённый подбор; null — онбординг ещё не пройден. */
  onboarding: OnboardingAnswers | null
  access: AccessStatus
}
