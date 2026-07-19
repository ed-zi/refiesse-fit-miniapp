// Mock-данные прототипа: весь hardcoded-контент экранов вынесен сюда
// и типизирован через @refiesse-fit/shared. Позже этот контент заменит
// реальный бэкенд (см. src/api/client.ts, переключение через VITE_API_URL).

import type {
  Category,
  OnboardingAnswers,
  Program,
  ProgressHistoryEntry,
  ProgressSummary,
  UserProfile,
  Workout,
} from '@refiesse-fit/shared'
import { CARE_NONE_LABEL } from '@refiesse-fit/shared'

// ---------------------------------------------------------------------------
// Каталог
// ---------------------------------------------------------------------------

export const mockCategories: Category[] = [
  { id: 'cat-back', slug: 'spina', title: 'Спина', sortOrder: 0 },
  { id: 'cat-posture', slug: 'osanka', title: 'Осанка', sortOrder: 1 },
  { id: 'cat-core', slug: 'kor', title: 'Кор', sortOrder: 2 },
  { id: 'cat-relax', slug: 'relaxation', title: 'Расслабление', sortOrder: 3 },
]

export const mockWorkouts: Workout[] = [
  {
    id: 'w-neck-release',
    slug: 'neck-release',
    title: 'Мягкая разгрузка шеи и плеч',
    goal: 'Шея и плечи зажаты',
    durationMin: 12,
    level: 'beginner',
    equipment: [],
    isPremium: false,
    videoUrl: null,
    description:
      'Короткая практика для тех, кто провёл день за компьютером и чувствует напряжение в шее и плечах.',
    cautions:
      'Если есть острая боль, онемение или недавняя травма — не идём через усилие.',
    categorySlug: 'spina',
    thumbColor: 'dark',
  },
  {
    id: 'w-chest-mobility',
    slug: 'chest-mobility',
    title: 'Мягкая мобилизация грудного отдела',
    goal: 'Шея и плечи зажаты',
    durationMin: 14,
    level: 'beginner',
    equipment: [],
    isPremium: false,
    videoUrl: null,
    description:
      'Для тех, кто долго сидел и чувствует зажатость в шее, плечах и верхе спины.',
    cautions:
      'Если есть острая боль, онемение или недавняя травма — не идём через усилие.',
    categorySlug: 'osanka',
    thumbColor: null,
  },
  {
    id: 'w-core-no-crunch',
    slug: 'core-no-crunch',
    title: 'Кор без скручиваний',
    goal: 'Кор и живот',
    durationMin: 18,
    level: 'beginner',
    equipment: [],
    isPremium: true,
    videoUrl: null,
    description: 'Premium-тренировка из плана для глубоких мышц корпуса.',
    cautions:
      'Без агрессивных скручиваний. При дискомфорте в пояснице уменьшайте амплитуду.',
    categorySlug: 'kor',
    thumbColor: 'peach',
  },
  {
    id: 'w-lower-back-relief',
    slug: 'lower-back-relief',
    title: 'Поясница после сидячего дня',
    goal: 'Поясница устала',
    durationMin: 15,
    level: 'beginner',
    equipment: ['Коврик'],
    isPremium: true,
    videoUrl: null,
    description: 'Мягкая разгрузка поясницы без резких прогибов и рывков.',
    cautions:
      'При простреле или острой боли практику откладываем и не терпим через боль.',
    categorySlug: 'spina',
    thumbColor: null,
  },
  {
    id: 'w-evening-relax',
    slug: 'evening-relax',
    title: 'Вечернее расслабление',
    goal: 'Расслабиться перед сном',
    durationMin: 9,
    level: 'beginner',
    equipment: [],
    isPremium: false,
    videoUrl: null,
    description: 'Спокойная вечерняя практика, чтобы отпустить день и замедлиться.',
    cautions: 'Все положения — комфортные; головокружение — сигнал остановиться.',
    categorySlug: 'relaxation',
    thumbColor: 'dark',
  },
]

/** Slug «тренировки дня» на Home. */
export const mockWorkoutOfDaySlug = 'neck-release'

// ---------------------------------------------------------------------------
// Планы
// ---------------------------------------------------------------------------

export const mockPrograms: Program[] = [
  {
    id: 'p-back-posture-7',
    slug: 'back-posture-7',
    title: '7 дней для спины и осанки',
    description: 'Мягкий маршрут на неделю: спина, осанка, дыхание.',
    daysTotal: 7,
    isPremium: false,
    days: [
      { id: 'p1-d1', dayIndex: 1, title: 'Шея и плечи', workoutSlug: 'neck-release' },
      { id: 'p1-d2', dayIndex: 2, title: 'Поясница мягко', workoutSlug: 'lower-back-relief' },
      { id: 'p1-d3', dayIndex: 3, title: 'Осанка стоя', workoutSlug: 'chest-mobility' },
      { id: 'p1-d4', dayIndex: 4, title: 'Грудной отдел + дыхание', workoutSlug: 'chest-mobility' },
      { id: 'p1-d5', dayIndex: 5, title: 'Кор без скручиваний', workoutSlug: 'core-no-crunch' },
      { id: 'p1-d6', dayIndex: 6, title: 'Мобильность всего тела', workoutSlug: null },
      { id: 'p1-d7', dayIndex: 7, title: 'Вечернее расслабление', workoutSlug: 'evening-relax' },
    ],
  },
  {
    id: 'p-core-5',
    slug: 'core-5',
    title: 'Кор без скручиваний',
    description: 'План на 5 дней для глубоких мышц корпуса.',
    daysTotal: 5,
    isPremium: true,
    days: [
      { id: 'p2-d1', dayIndex: 1, title: 'Дыхание и центр', workoutSlug: 'core-no-crunch' },
      { id: 'p2-d2', dayIndex: 2, title: 'Стабилизация', workoutSlug: 'core-no-crunch' },
      { id: 'p2-d3', dayIndex: 3, title: 'Боковая линия', workoutSlug: null },
      { id: 'p2-d4', dayIndex: 4, title: 'Кор + поясница', workoutSlug: 'lower-back-relief' },
      { id: 'p2-d5', dayIndex: 5, title: 'Спокойное закрепление', workoutSlug: null },
    ],
  },
]

// ---------------------------------------------------------------------------
// Прогресс и профиль
// ---------------------------------------------------------------------------

export const mockProgress: ProgressSummary = {
  workouts: 4,
  minutes: 62,
  streakDays: 3,
  planProgress: { done: 3, total: 7 },
}

/** Короткая история «Я сделала» (соответствует entries из GET /progress). */
export const mockProgressEntries: ProgressHistoryEntry[] = [
  {
    workoutSlug: 'chest-mobility',
    workoutTitle: 'Мягкая мобилизация грудного отдела',
    completedAt: '2026-07-11T19:10:00.000Z',
    durationMin: 14,
  },
  {
    workoutSlug: 'neck-release',
    workoutTitle: 'Мягкая разгрузка шеи и плеч',
    completedAt: '2026-07-10T18:40:00.000Z',
    durationMin: 12,
  },
  {
    workoutSlug: 'lower-back-relief',
    workoutTitle: 'Поясница после сидячего дня',
    completedAt: '2026-07-09T20:05:00.000Z',
    durationMin: 15,
  },
  {
    workoutSlug: 'evening-relax',
    workoutTitle: 'Вечернее расслабление',
    completedAt: '2026-07-08T21:30:00.000Z',
    durationMin: 9,
  },
]

export const mockUser: UserProfile = {
  id: 'user-kate',
  telegramUserId: null,
  firstName: 'Катя',
  lastName: null,
  username: null,
  onboarding: null,
  access: {
    isPremium: true,
    status: 'active',
    expiresAt: '2026-07-18T00:00:00.000Z',
  },
}

// ---------------------------------------------------------------------------
// Онбординг «Подбор» (ТЗ 4.2) — контент шагов
// ---------------------------------------------------------------------------

/** Значение «Без инвентаря» — эксклюзивная опция мультивыбора на шаге 3. */
export const NO_EQUIPMENT = 'Без инвентаря'

export interface OnboardingOption {
  value: string
  hint: string
}

export interface OnboardingStepDef {
  key: keyof OnboardingAnswers
  badge: string
  title: string
  description: string
  options: OnboardingOption[]
  /** Шаг с мультивыбором (чекбоксы вместо радио). */
  multi?: boolean
  /** Опция, выбор которой снимает остальные (и наоборот). */
  exclusiveValue?: string
}

// 7-шаговый персонализационный квиз (RP-2 + LP + CARE). Порядок:
// (1) цель, (2) уровень, (3) инвентарь, (4) длительность, (5) частота,
// (6) бережём зоны, (7) обращение.
export const onboardingSteps: OnboardingStepDef[] = [
  {
    key: 'goal',
    badge: 'быстрый подбор',
    title: 'Что сейчас нужно телу?',
    description: 'Выберите основное состояние. Это не диагноз, а мягкий ориентир.',
    options: [
      { value: 'Шея и плечи зажаты', hint: 'после работы, сидения, дороги' },
      { value: 'Поясница устала', hint: 'хочется разгрузить мягко' },
      { value: 'Кор и живот', hint: 'без агрессивных скручиваний' },
      { value: 'Расслабиться перед сном', hint: 'спокойная вечерняя практика' },
    ],
  },
  {
    key: 'level',
    badge: 'уровень',
    title: 'Насколько ты в практике?',
    description: 'Просто чтобы подобрать темп — здесь нет правильного ответа.',
    options: [
      { value: 'Новичок', hint: 'только начинаю' },
      { value: 'Уверенный', hint: 'двигаюсь иногда' },
      { value: 'Продвинутый', hint: 'регулярно занимаюсь' },
    ],
  },
  {
    key: 'equipment',
    badge: 'инвентарь',
    title: 'Что есть под рукой?',
    description:
      'Можно выбрать несколько. Если ничего нет — это нормально, большинство практик можно делать без инвентаря.',
    multi: true,
    exclusiveValue: NO_EQUIPMENT,
    options: [
      { value: NO_EQUIPMENT, hint: 'достаточно места и коврика по желанию' },
      { value: 'Коврик', hint: 'удобнее для пола и растяжки' },
      { value: 'Резинка', hint: 'можно добавить мягкое сопротивление' },
      { value: 'МФР-ролл', hint: 'для восстановления и расслабления' },
    ],
  },
  {
    key: 'time',
    badge: 'время',
    title: 'Сколько есть времени?',
    description: 'Подберём практику так, чтобы её реально было сделать сегодня.',
    options: [
      { value: '5–10 минут', hint: 'очень короткая разгрузка' },
      { value: '15–20 минут', hint: 'оптимально для домашней практики' },
      { value: '25–35 минут', hint: 'если хочется пройти полноценнее' },
    ],
  },
  {
    key: 'frequency',
    badge: 'ритм',
    title: 'Как часто комфортно заниматься?',
    description: 'Это ритм, а не обязательство — выберите то, что реально впишется.',
    options: [
      { value: '2–3 раза в неделю', hint: 'спокойный старт' },
      { value: '4–5 раз в неделю', hint: 'уверенный ритм' },
      { value: 'Каждый день', hint: 'по чуть-чуть, без перегруза' },
    ],
  },
  {
    key: 'careAreas',
    badge: 'бережём зоны',
    title: 'Есть места, где нужно бережнее?',
    description:
      'Не диагноз — просто ориентир, чтобы подбирать мягче. Можно выбрать несколько.',
    multi: true,
    exclusiveValue: CARE_NONE_LABEL,
    options: [
      { value: CARE_NONE_LABEL, hint: 'ничего не беспокоит' },
      { value: 'Шея и плечи', hint: 'чувствительны после нагрузки' },
      { value: 'Поясница', hint: 'бережём спину' },
      { value: 'Колени', hint: 'без резких приседов и прыжков' },
      { value: 'Запястья', hint: 'меньше упора на руки' },
    ],
  },
  {
    key: 'gender',
    badge: 'обращение',
    title: 'Как к тебе обращаться?',
    description: 'Только ради правильных формулировок — больше ни на что не влияет.',
    options: [
      { value: 'Женский род', hint: '«я сделала»' },
      { value: 'Мужской род', hint: '«я сделал»' },
    ],
  },
]

export const defaultOnboardingAnswers: OnboardingAnswers = {
  goal: 'Шея и плечи зажаты',
  level: 'Новичок',
  time: '15–20 минут',
  equipment: [NO_EQUIPMENT],
  frequency: '2–3 раза в неделю',
  careAreas: [CARE_NONE_LABEL],
  gender: 'Женский род',
}

// ---------------------------------------------------------------------------
// Прочий контент экранов
// ---------------------------------------------------------------------------

/** Фильтры-чипы каталога (пока декоративные). */
export const catalogFilters = ['Все', '5–10 мин', 'Premium', 'Новичкам']

/** Список ценности на Paywall. */
export const paywallFeatures = [
  '3 мини-плана на 5–7 дней',
  'Premium-каталог тренировок',
  'Избранное, история и отметки о занятиях',
]
