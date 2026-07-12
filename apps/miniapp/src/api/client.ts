// Слой данных Mini App.
//
// Экраны работают только с интерфейсом ApiClient — источник данных выбирается
// здесь через переменную окружения VITE_API_URL:
//   - пусто/не задана → mock-реализация (синхронные данные из src/data/mock.ts);
//   - задана → предварительный HTTP-клиент (тонкие GET-обёртки; контракт
//     эндпоинтов и auth через Telegram initData появятся в задачах S1-3+).

import type {
  Category,
  Program,
  ProgressSummary,
  UserProfile,
  Workout,
} from '@refiesse-fit/shared'
import {
  mockCategories,
  mockPrograms,
  mockProgress,
  mockUser,
  mockWorkoutOfDaySlug,
  mockWorkouts,
} from '../data/mock'

export interface Catalog {
  categories: Category[]
  workouts: Workout[]
}

export interface ApiClient {
  getCatalog(): Promise<Catalog>
  getWorkout(slug: string): Promise<Workout | null>
  /** Рекомендация «Тренировка дня» для Home. */
  getWorkoutOfDay(): Promise<Workout | null>
  getPlans(): Promise<Program[]>
  getProgress(): Promise<ProgressSummary>
  getMe(): Promise<UserProfile>
}

// ---------------------------------------------------------------------------
// Mock-реализация: данные готовы синхронно, промисы резолвятся мгновенно.
// ---------------------------------------------------------------------------

export const mockApiClient: ApiClient = {
  getCatalog: () =>
    Promise.resolve({ categories: mockCategories, workouts: mockWorkouts }),
  getWorkout: (slug) =>
    Promise.resolve(mockWorkouts.find((workout) => workout.slug === slug) ?? null),
  getWorkoutOfDay: () =>
    Promise.resolve(
      mockWorkouts.find((workout) => workout.slug === mockWorkoutOfDaySlug) ?? null,
    ),
  getPlans: () => Promise.resolve(mockPrograms),
  getProgress: () => Promise.resolve(mockProgress),
  getMe: () => Promise.resolve(mockUser),
}

// ---------------------------------------------------------------------------
// Предварительная HTTP-реализация (скелет; реальный контракт — в S1-3+).
// ---------------------------------------------------------------------------

function createHttpApiClient(baseUrl: string): ApiClient {
  const root = baseUrl.replace(/\/+$/, '')

  async function get<T>(path: string): Promise<T> {
    const response = await fetch(`${root}${path}`)
    if (!response.ok) {
      throw new Error(`API ${path}: ${response.status} ${response.statusText}`)
    }
    return response.json() as Promise<T>
  }

  return {
    getCatalog: () => get<Catalog>('/catalog'),
    getWorkout: (slug) => get<Workout | null>(`/workouts/${encodeURIComponent(slug)}`),
    getWorkoutOfDay: () => get<Workout | null>('/workouts/day'),
    getPlans: () => get<Program[]>('/plans'),
    getProgress: () => get<ProgressSummary>('/progress'),
    getMe: () => get<UserProfile>('/me'),
  }
}

// ---------------------------------------------------------------------------
// Выбор реализации
// ---------------------------------------------------------------------------

const apiBaseUrl = String(import.meta.env.VITE_API_URL ?? '').trim()

/** Активный клиент данных приложения. */
export const apiClient: ApiClient = apiBaseUrl
  ? createHttpApiClient(apiBaseUrl)
  : mockApiClient
