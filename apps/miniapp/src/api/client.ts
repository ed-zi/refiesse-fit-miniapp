// Слой данных Mini App (S2-B).
//
// Экраны работают только с интерфейсом ApiClient — источник данных выбирается
// через переменную окружения VITE_API_URL:
//   - пусто/не задана → mock-реализация (in-memory поверх src/data/mock.ts,
//     прототип полностью кликабелен без бэкенда — дефолт для GitHub Pages);
//   - задана → HTTP-клиент по фиксированному контракту S2 с auth-flow:
//     initData → POST /auth/telegram → Bearer JWT в памяти → повтор на 401.

import type {
  AccessStatus,
  ApiErrorResponse,
  AuthSession,
  Category,
  CatalogQuery,
  FavoriteToggleResult,
  OnboardingAnswers,
  Program,
  ProgressHistoryEntry,
  ProgressOverview,
  ProgressSummary,
  ReminderSettings,
  UserProfile,
  Workout,
  WorkoutFeedbackRating,
  WorkoutFeedbackResult,
} from '@refiesse-fit/shared'
import {
  mockCategories,
  mockPrograms,
  mockProgress,
  mockProgressEntries,
  mockUser,
  mockWorkoutOfDaySlug,
  mockWorkouts,
} from '../data/mock'
import { getInitDataRaw } from '../telegram'

export interface Catalog {
  categories: Category[]
  workouts: Workout[]
}

export interface ApiClient {
  getCatalog(query?: CatalogQuery): Promise<Catalog>
  /** Полная карточка тренировки (с videoUrl при наличии доступа); null — не найдена. */
  getWorkout(slug: string): Promise<Workout | null>
  /** Рекомендация «Тренировка дня» для Home. */
  getWorkoutOfDay(): Promise<Workout | null>
  getPlans(): Promise<Program[]>
  getProgress(): Promise<ProgressOverview>
  getMe(): Promise<UserProfile>
  /** Актуальный статус доступа (поллится после ухода на страницу оплаты). */
  getAccess(): Promise<AccessStatus>
  saveOnboarding(answers: OnboardingAnswers): Promise<OnboardingAnswers>
  /** Мягкие напоминания (MOTIV-1): вкл/выкл + удобный час (0..23 по МСК). */
  updateReminders(optIn: boolean, hour: number | null): Promise<ReminderSettings>
  /** Отметка «Я сделала» — идемпотентна по дню, возвращает обновлённые метрики. */
  markDone(workoutSlug: string): Promise<ProgressSummary>
  /** Пост-тренировочный микро-вопрос «Как ощущалось?» → живой профиль (LP-1). */
  sendFeedback(workoutSlug: string, rating: WorkoutFeedbackRating): Promise<WorkoutFeedbackResult>
  toggleFavorite(workoutSlug: string): Promise<FavoriteToggleResult>
  getFavorites(): Promise<string[]>
  /** Создаёт платёж провайдера (ЮKassa) и возвращает URL страницы оплаты. */
  createPayment(): Promise<{ confirmationUrl: string }>
  /** Персональная подборка: ранжированные тренировки + рекомендованный план. */
  getRecommendations(): Promise<{ workouts: Workout[]; recommendedPlan: Program | null }>
}

/** Ошибка API с машинным кодом (для UI-состояний и логики повторов). */
export class ApiError extends Error {
  readonly code: string
  readonly status: number | null

  constructor(code: string, message: string, status: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

// ---------------------------------------------------------------------------
// Mock-реализация: мгновенные ответы + in-memory состояние,
// чтобы «Я сделала», избранное и подбор оставались кликабельными в прототипе.
// ---------------------------------------------------------------------------

function createMockApiClient(): ApiClient {
  const favorites = new Set<string>()
  // Живой профиль (LP-1) в прототипе: копим ответы и считаем сдвиг сложности.
  const feedbackLog: WorkoutFeedbackRating[] = []
  const feedbackBias = (): number => {
    const recent = feedbackLog.slice(-5)
    const net = recent.filter((r) => r === 'hard').length - recent.filter((r) => r === 'soft').length
    if (net >= 2) return -1
    if (net <= -2) return 1
    return 0
  }
  let onboarding: OnboardingAnswers | null = mockUser.onboarding
  let reminders: ReminderSettings = { ...mockUser.reminders }
  let summary: ProgressSummary = { ...mockProgress, planProgress: { ...mockProgress.planProgress } }
  let entries: ProgressHistoryEntry[] = [...mockProgressEntries]

  function applyQuery(workouts: Workout[], query?: CatalogQuery): Workout[] {
    if (!query) {
      return workouts
    }
    return workouts.filter((workout) => {
      if (query.category && workout.categorySlug !== query.category) {
        return false
      }
      if (query.maxDuration !== undefined && workout.durationMin > query.maxDuration) {
        return false
      }
      if (query.premium !== undefined && workout.isPremium !== query.premium) {
        return false
      }
      if (query.level && workout.level !== query.level) {
        return false
      }
      return true
    })
  }

  return {
    getCatalog: (query) =>
      Promise.resolve({
        categories: mockCategories,
        workouts: applyQuery(mockWorkouts, query),
      }),
    getWorkout: (slug) =>
      Promise.resolve(mockWorkouts.find((workout) => workout.slug === slug) ?? null),
    getWorkoutOfDay: () =>
      Promise.resolve(
        mockWorkouts.find((workout) => workout.slug === mockWorkoutOfDaySlug) ?? null,
      ),
    getPlans: () => Promise.resolve(mockPrograms),
    getProgress: () =>
      Promise.resolve({
        summary: { ...summary, planProgress: { ...summary.planProgress } },
        entries: [...entries],
      }),
    getMe: () => Promise.resolve({ ...mockUser, onboarding, reminders }),
    getAccess: () => Promise.resolve({ ...mockUser.access }),
    saveOnboarding: (answers) => {
      onboarding = {
        ...answers,
        equipment: [...answers.equipment],
      }
      return Promise.resolve(onboarding)
    },
    updateReminders: (optIn, hour) => {
      reminders = { optIn, hour: optIn ? hour : reminders.hour }
      return Promise.resolve({ ...reminders })
    },
    markDone: (workoutSlug) => {
      const workout = mockWorkouts.find((item) => item.slug === workoutSlug)
      if (!workout) {
        return Promise.reject(new ApiError('NOT_FOUND', 'Тренировка не найдена', 404))
      }
      const today = new Date().toISOString().slice(0, 10)
      const duplicate = entries.some(
        (entry) => entry.workoutSlug === workoutSlug && entry.completedAt.slice(0, 10) === today,
      )
      if (!duplicate) {
        // Как на бэкенде: дубль дня не создаёт новую запись (идемпотентность).
        entries = [
          {
            workoutSlug: workout.slug,
            workoutTitle: workout.title,
            completedAt: new Date().toISOString(),
            durationMin: workout.durationMin,
          },
          ...entries,
        ]
        summary = {
          ...summary,
          workouts: summary.workouts + 1,
          minutes: summary.minutes + workout.durationMin,
          planProgress: { ...summary.planProgress },
        }
      }
      return Promise.resolve({ ...summary, planProgress: { ...summary.planProgress } })
    },
    sendFeedback: (workoutSlug, rating) => {
      const workout = mockWorkouts.find((item) => item.slug === workoutSlug)
      if (!workout) {
        return Promise.reject(new ApiError('NOT_FOUND', 'Тренировка не найдена', 404))
      }
      feedbackLog.push(rating)
      return Promise.resolve({ ok: true as const, bias: feedbackBias() })
    },
    toggleFavorite: (workoutSlug) => {
      const favorited = !favorites.has(workoutSlug)
      if (favorited) {
        favorites.add(workoutSlug)
      } else {
        favorites.delete(workoutSlug)
      }
      return Promise.resolve({ favorited, slugs: [...favorites] })
    },
    getFavorites: () => Promise.resolve([...favorites]),
    createPayment: () =>
      // В прототипе оплата «проходит» сразу: возвращаем фиктивный URL,
      // App в mock-режиме имитирует немедленный доступ (paywall → success).
      Promise.resolve({ confirmationUrl: 'https://example.test/mock-payment' }),
    getRecommendations: () => {
      // Имитация серверного скоринга: ставим совпадения по цели/уровню
      // сохранённого подбора вперёд, режем до топ-4. План — первый из mock.
      const goal = onboarding?.goal
      // Живой профиль: сдвигаем предпочитаемый уровень (LP-1).
      const bias = feedbackBias()
      const levelRank = { beginner: 0, medium: 1, advanced: 2 } as const
      const preferred = Math.max(0, Math.min(2, 1 + bias)) // 0 легче / 2 сложнее
      const ranked = [...mockWorkouts].sort((a, b) => {
        const score = (workout: Workout) =>
          (goal && workout.goal === goal ? 0 : 10) +
          Math.abs(levelRank[workout.level] - preferred)
        return score(a) - score(b)
      })
      return Promise.resolve({
        workouts: ranked.slice(0, 4),
        recommendedPlan: mockPrograms[0] ?? null,
      })
    },
  }
}

export const mockApiClient: ApiClient = createMockApiClient()

// ---------------------------------------------------------------------------
// HTTP-реализация по контракту S2
// ---------------------------------------------------------------------------

function buildQueryString(query?: CatalogQuery): string {
  if (!query) {
    return ''
  }
  const params = new URLSearchParams()
  if (query.category) {
    params.set('category', query.category)
  }
  if (query.maxDuration !== undefined) {
    params.set('maxDuration', String(query.maxDuration))
  }
  if (query.premium !== undefined) {
    params.set('premium', String(query.premium))
  }
  if (query.level) {
    params.set('level', query.level)
  }
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function toApiError(response: Response, payload: unknown): ApiError {
  const errorBody = (payload as Partial<ApiErrorResponse> | null)?.error
  if (errorBody && typeof errorBody.code === 'string' && typeof errorBody.message === 'string') {
    return new ApiError(errorBody.code, errorBody.message, response.status)
  }
  return new ApiError(
    'HTTP_ERROR',
    `Сервер ответил ошибкой ${response.status}. Попробуйте ещё раз чуть позже.`,
    response.status,
  )
}

function createHttpApiClient(baseUrl: string): ApiClient {
  const root = baseUrl.replace(/\/+$/, '')

  // Токен живёт в памяти модуля (~1 час); localStorage сознательно не используем.
  let token: string | null = null
  // Единый in-flight промис авторизации: параллельные запросы не плодят /auth/telegram.
  let authInFlight: Promise<void> | null = null

  function resolveInitData(): string {
    // (а) внутри Telegram — подписанная строка из launch params;
    const fromTelegram = getInitDataRaw()
    if (fromTelegram) {
      return fromTelegram
    }
    // (б) вне Telegram — dev-fallback из env, чтобы работать против локального API;
    const fromEnv = String(import.meta.env.VITE_DEV_INIT_DATA ?? '').trim()
    if (fromEnv) {
      return fromEnv
    }
    // (в) ни того ни другого — внятная ошибка для UI.
    throw new ApiError(
      'NO_INIT_DATA',
      'Не получилось авторизоваться: откройте приложение внутри Telegram. ' +
        'Для локальной разработки в браузере задайте VITE_DEV_INIT_DATA.',
    )
  }

  function authenticate(): Promise<void> {
    authInFlight ??= (async () => {
      const initData = resolveInitData()
      const response = await fetch(`${root}/auth/telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      })
      const payload = await parseJsonSafe(response)
      if (!response.ok) {
        throw toApiError(response, payload)
      }
      token = (payload as AuthSession).token
    })().finally(() => {
      authInFlight = null
    })
    return authInFlight
  }

  async function request<T>(
    path: string,
    init?: { method?: string; body?: unknown },
    allowReauth = true,
  ): Promise<T> {
    if (!token) {
      await authenticate()
    }
    const response = await fetch(`${root}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
    // Токен истёк (~1 час): однократная переавторизация + повтор запроса.
    if (response.status === 401 && allowReauth) {
      token = null
      return request<T>(path, init, false)
    }
    const payload = await parseJsonSafe(response)
    if (!response.ok) {
      throw toApiError(response, payload)
    }
    return payload as T
  }

  return {
    getCatalog: (query) => request<Catalog>(`/catalog${buildQueryString(query)}`),
    getWorkout: async (slug) => {
      try {
        const { workout } = await request<{ workout: Workout }>(
          `/workouts/${encodeURIComponent(slug)}`,
        )
        return workout
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return null
        }
        throw error
      }
    },
    getWorkoutOfDay: async () => {
      const { workout } = await request<{ workout: Workout }>('/workouts/day')
      return workout
    },
    getPlans: async () => {
      const { items } = await request<{ items: Program[] }>('/plans')
      return items
    },
    getProgress: () => request<ProgressOverview>('/progress'),
    getMe: () => request<UserProfile>('/me'),
    getAccess: () => request<AccessStatus>('/access'),
    saveOnboarding: async (answers) => {
      const { onboarding } = await request<{ onboarding: OnboardingAnswers }>('/me/onboarding', {
        method: 'PUT',
        body: answers,
      })
      return onboarding
    },
    updateReminders: async (optIn, hour) => {
      const { reminders } = await request<{ reminders: ReminderSettings }>('/me/reminders', {
        method: 'PUT',
        body: { optIn, hour },
      })
      return reminders
    },
    markDone: async (workoutSlug) => {
      const { summary } = await request<{ summary: ProgressSummary }>('/progress', {
        method: 'POST',
        body: { workoutSlug },
      })
      return summary
    },
    sendFeedback: (workoutSlug, rating) =>
      request<WorkoutFeedbackResult>('/feedback', {
        method: 'POST',
        body: { workoutSlug, rating },
      }),
    toggleFavorite: (workoutSlug) =>
      request<FavoriteToggleResult>('/favorites', {
        method: 'POST',
        body: { workoutSlug },
      }),
    getFavorites: async () => {
      const { slugs } = await request<{ slugs: string[] }>('/favorites')
      return slugs
    },
    createPayment: () =>
      request<{ confirmationUrl: string }>('/api/payments/create', { method: 'POST' }),
    getRecommendations: () =>
      request<{ workouts: Workout[]; recommendedPlan: Program | null }>('/recommendations'),
  }
}

// ---------------------------------------------------------------------------
// Выбор реализации
// ---------------------------------------------------------------------------

const apiBaseUrl = String(import.meta.env.VITE_API_URL ?? '').trim()

/** true — работаем против реального API (VITE_API_URL задан). */
export const isHttpMode = apiBaseUrl !== ''

/** Активный клиент данных приложения. */
export const apiClient: ApiClient = isHttpMode
  ? createHttpApiClient(apiBaseUrl)
  : mockApiClient
