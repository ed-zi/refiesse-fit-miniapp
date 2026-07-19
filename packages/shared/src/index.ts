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
  /**
   * Вычислено бэкендом: контент закрыт для текущего пользователя
   * (premium без активного доступа). В списках каталога может отсутствовать.
   */
  isLocked?: boolean
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

/**
 * Ответы онбординга «Подбор» — 5-шаговый персонализационный квиз (RP-2).
 * Значения — строки-лейблы, как показаны пользователю.
 */
export interface OnboardingAnswers {
  /** Шаг 1: цель/состояние. */
  goal: string
  /** Шаг 4: сколько есть времени. */
  time: string
  /** Шаг 3: мультивыбор инвентаря; пустой массив = «без инвентаря». */
  equipment: string[]
  /** Шаг 2: уровень практики (RP-2). Опционально — старые профили без него. */
  level?: string
  /** Шаг 5: комфортная частота (RP-2). Опционально — старые профили без него. */
  frequency?: string
  /** Легаси-режим (до RP-2). Опционально: новый квиз его не собирает. */
  intensity?: string
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

// ---------------------------------------------------------------------------
// Контракт HTTP API (S2): вспомогательные типы запросов/ответов
// ---------------------------------------------------------------------------

/** Ответ POST /auth/telegram. */
export interface AuthSession {
  /** Bearer JWT (~1 час). */
  token: string
  /** Время жизни токена в секундах. */
  expiresIn: number
  user: UserProfile
}

/** Тело ошибки API: { error: { code, message } }. */
export interface ApiErrorPayload {
  code: string
  message: string
}

export interface ApiErrorResponse {
  error: ApiErrorPayload
}

/** Query-параметры GET /catalog. */
export interface CatalogQuery {
  /** Category.slug. */
  category?: string
  /** Максимальная длительность в минутах. */
  maxDuration?: number
  /** Только premium (true) или только free (false). */
  premium?: boolean
  level?: WorkoutLevel
}

/** Элемент истории «Я сделала» (GET /progress → entries). */
export interface ProgressHistoryEntry {
  workoutSlug: string
  workoutTitle: string
  /** ISO-строка. */
  completedAt: string
  durationMin: number
}

/** Полный ответ GET /progress: метрики + короткая история. */
export interface ProgressOverview {
  summary: ProgressSummary
  entries: ProgressHistoryEntry[]
}

/** Результат POST /favorites (toggle). */
export interface FavoriteToggleResult {
  /** true — тренировка теперь в избранном. */
  favorited: boolean
  /** Актуальный полный список slug'ов избранного. */
  slugs: string[]
}
