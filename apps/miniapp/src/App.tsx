import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type {
  Category,
  OnboardingAnswers,
  Program,
  ProgressOverview,
  UserProfile,
  WeeklyCheckinAnswer,
  Workout,
  WorkoutFeedbackRating,
  WorkoutLevel,
} from '@refiesse-fit/shared'
import { doneVerbLabel, effectiveCareAreas } from '@refiesse-fit/shared'
import { apiClient, isHttpMode } from './api/client'
import { openExternalLink } from './telegram'
import { loadYouTubeIframeApi, parseYouTubeId, YT_PLAYING, type YouTubePlayer } from './youtube'
import {
  NO_EQUIPMENT,
  type OnboardingStepDef,
  defaultOnboardingAnswers,
  onboardingSteps,
  paywallFeatures,
} from './data/mock'
import { onboardingToCatalogQuery } from './data/recommendations'
import './App.css'

type Screen =
  | 'home'
  | 'onboarding'
  | 'recommendations'
  | 'catalog'
  | 'workout'
  | 'plans'
  | 'locked'
  | 'paywall'
  | 'success'
  | 'progress'
  | 'profile'

const steps: Array<{ id: Screen; label: string }> = [
  { id: 'home', label: 'Home: быстрое действие на сегодня' },
  { id: 'onboarding', label: 'Подбор: понять состояние' },
  { id: 'recommendations', label: 'Подборка: персональные рекомендации' },
  { id: 'catalog', label: 'Каталог: выбрать тренировку' },
  { id: 'workout', label: 'Тренировка: понять и начать' },
  { id: 'plans', label: 'Планы: система на 5–7 дней' },
  { id: 'locked', label: 'Locked: premium закрыт' },
  { id: 'paywall', label: 'Paywall: ценность + оплата' },
  { id: 'success', label: 'Success: доступ открыт' },
  { id: 'progress', label: 'Прогресс: удержание без давления' },
  { id: 'profile', label: 'Профиль: подписка и настройки' },
]

/** Персональная подборка с рекомендательного API (GET /recommendations). */
type Recommendations = {
  workouts: Workout[]
  recommendedPlan: Program | null
}

/** Все данные экранов, полученные через слой данных (mock или HTTP). */
type AppData = {
  categories: Category[]
  workouts: Workout[]
  workoutOfDay: Workout | null
  plans: Program[]
  progress: ProgressOverview
  me: UserProfile
  favorites: string[]
  /** true — каталог сейчас отфильтрован по подбору. */
  catalogFiltered: boolean
}

const levelPillLabels: Record<WorkoutLevel, string> = {
  beginner: 'новичок',
  medium: 'средний',
  advanced: 'опытный',
}

const levelFactLabels: Record<WorkoutLevel, string> = {
  beginner: 'лёгкий',
  medium: 'средний',
  advanced: 'продвинутый',
}

function equipmentLabel(workout: Workout): string {
  return workout.equipment.length > 0 ? workout.equipment.join(', ') : 'без инвентаря'
}

/** Значение факта «инвентарь»: «нет», если ничего не нужно, иначе количество. */
function equipmentFactValue(workout: Workout): string {
  return workout.equipment.length === 0 ? 'нет' : String(workout.equipment.length)
}

/** Русская плюрализация: plural(2, 'минута','минуты','минут') → 'минуты'. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

/** Инициал для аватара профиля в шапке. */
function profileInitial(me: UserProfile): string {
  return me.firstName.charAt(0).toUpperCase() || 'Я'
}

/** Закрыт ли контент: сервер знает лучше (isLocked), иначе — по isPremium. */
function isWorkoutLocked(workout: Workout): boolean {
  return workout.isLocked ?? workout.isPremium
}

/** Опциональная статичная ссылка-запаска; основной путь — createPayment(). */
const paymentFallbackLink = String(import.meta.env.VITE_PAYMENT_FALLBACK_LINK ?? '').trim()

/**
 * Служебная панель навигации по экранам — ТОЛЬКО для разработки/ревью.
 * В собранных версиях (preview/прод) скрыта; в браузере можно включить
 * вручную, добавив ?dev к URL. Пользователи её никогда не видят.
 */
const showDevNav =
  import.meta.env.DEV ||
  (typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('dev'))

const dayMonthFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
})

function formatDayMonth(iso: string | null): string | null {
  if (!iso) {
    return null
  }
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : dayMonthFormat.format(date)
}

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [onboardingStep, setOnboardingStep] = useState(0)
  const [onboardingAnswers, setOnboardingAnswers] = useState<OnboardingAnswers>(
    defaultOnboardingAnswers,
  )
  const [toast, setToast] = useState('')
  const [data, setData] = useState<AppData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedWorkoutSlug, setSelectedWorkoutSlug] = useState<string | null>(null)
  const [workoutDetail, setWorkoutDetail] = useState<Workout | null>(null)
  const [payPending, setPayPending] = useState(false)
  const [recommendations, setRecommendations] = useState<Recommendations | null>(null)
  const [recsLoading, setRecsLoading] = useState(false)
  // Живой профиль (LP-1): slug тренировки, по которой показываем микро-вопрос
  // «Как ощущалось?» после «Я сделала». null — карточки нет.
  const [feedbackSlug, setFeedbackSlug] = useState<string | null>(null)

  // Единая машина состояний загрузки: loading → error | ready (retry через reloadKey).
  useEffect(() => {
    let cancelled = false
    Promise.all([
      apiClient.getCatalog(),
      apiClient.getWorkoutOfDay(),
      apiClient.getPlans(),
      apiClient.getProgress(),
      apiClient.getMe(),
      apiClient.getFavorites(),
    ])
      .then(([catalog, workoutOfDay, plans, progress, me, favorites]) => {
        if (cancelled) {
          return
        }
        setData({
          categories: catalog.categories,
          workouts: catalog.workouts,
          workoutOfDay,
          plans,
          progress,
          me,
          favorites,
          catalogFiltered: false,
        })
        // «Изменить подбор» и повторный квиз стартуют с сохранённых ответов;
        // старые профили без level/frequency добираются дефолтами.
        if (me.onboarding) {
          setOnboardingAnswers({ ...defaultOnboardingAnswers, ...me.onboarding })
        } else {
          // Новый пользователь ещё не проходил подбор → квиз как онбординг,
          // сразу при первом открытии (а не спрятанной кнопкой на Home).
          setOnboardingStep(0)
          setScreen('onboarding')
          window.scrollTo({ top: 0 })
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }
        console.error('[data] не удалось загрузить данные приложения', error)
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Что-то пошло не так при загрузке. Попробуйте ещё раз.',
        )
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const currentStep = useMemo(
    () => steps.find((step) => step.id === screen)?.label ?? '',
    [screen],
  )

  /** Прямая навигация без проверок (для внутренних переходов). */
  function goUnchecked(next: Screen) {
    if (next === 'onboarding') {
      setOnboardingStep(0)
    }
    setScreen(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function go(next: Screen) {
    // Success показывается только при активном premium (в HTTP-режиме);
    // прямой заход без доступа мягко уводит на paywall.
    if (next === 'success' && isHttpMode && data && !data.me.access.isPremium) {
      next = 'paywall'
    }
    goUnchecked(next)
    // Прямой заход на подборку (в т.ч. из левой панели прототипа) — подтянуть,
    // если ещё не загружали.
    if (next === 'recommendations' && data && !recommendations && !recsLoading) {
      void loadRecommendations()
    }
  }

  /** Загрузка персональной подборки с рекомендательного API. */
  function loadRecommendations() {
    setRecsLoading(true)
    return apiClient
      .getRecommendations()
      .then((recs) => setRecommendations(recs))
      .catch(() => {
        // Пустая подборка вместо вечной загрузки — экран покажет мягкую заглушку.
        setRecommendations({ workouts: [], recommendedPlan: null })
      })
      .finally(() => setRecsLoading(false))
  }

  function retryLoad() {
    setLoadError(null)
    setData(null)
    setReloadKey((key) => key + 1)
  }

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 1300)
  }

  /**
   * Refetch GET /access. Если premium открылся — Success, обновление me.access
   * и refetch каталога/тренировки дня (premium-контент разблокировался).
   * manual — клик «Я уже оплатила»: даёт обратную связь и при отсутствии доступа.
   */
  function refreshAccess(options?: { manual?: boolean }) {
    if (!data) {
      return
    }
    const wasPremium = data.me.access.isPremium
    if (wasPremium && !options?.manual) {
      // Авто-поллинг не нужен: доступ уже открыт.
      return
    }
    void apiClient
      .getAccess()
      .then((access) => {
        setData((current) =>
          current ? { ...current, me: { ...current.me, access } } : current,
        )
        if (access.isPremium) {
          if (!wasPremium || options?.manual) {
            goUnchecked('success')
          }
          if (!wasPremium) {
            // Замки поменялись: сбрасываем кэш детальной и обновляем списки.
            setWorkoutDetail(null)
            void Promise.all([
              apiClient.getCatalog(
                data.catalogFiltered && data.me.onboarding
                  ? onboardingToCatalogQuery(data.me.onboarding)
                  : undefined,
              ),
              apiClient.getWorkoutOfDay(),
            ])
              .then(([catalog, workoutOfDay]) => {
                setData((current) =>
                  current
                    ? {
                        ...current,
                        categories: catalog.categories,
                        workouts: catalog.workouts,
                        workoutOfDay,
                      }
                    : current,
                )
              })
              .catch(() => {
                // Каталог обновится при следующей загрузке; доступ уже проставлен.
              })
          }
        } else if (options?.manual) {
          showToast('Оплата пока не подтвердилась. Попробуйте чуть позже')
        }
      })
      .catch(() => {
        if (options?.manual) {
          showToast('Не получилось проверить доступ')
        }
      })
  }

  // Всегда свежая ссылка на refreshAccess для подписок на события окна.
  const refreshAccessRef = useRef<(options?: { manual?: boolean }) => void>(() => {})
  useEffect(() => {
    refreshAccessRef.current = refreshAccess
  })

  // Поллинг доступа при возврате в приложение (после оплаты на странице кассы).
  useEffect(() => {
    if (!isHttpMode) {
      return
    }
    const onFocus = () => refreshAccessRef.current()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshAccessRef.current()
      }
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  /** CTA paywall'а: создать платёж ЮKassa и уйти на страницу оплаты. */
  function startPayment() {
    if (!isHttpMode) {
      // Mock-прототип: демонстрационный переход на Success, как раньше.
      go('success')
      return
    }
    if (payPending) {
      return
    }
    setPayPending(true)
    void apiClient
      .createPayment()
      .then(({ confirmationUrl }) => {
        openExternalLink(confirmationUrl)
        // Подстраховка к поллингу по фокусу: одна отложенная проверка доступа.
        window.setTimeout(() => refreshAccessRef.current(), 8000)
      })
      .catch(() => {
        // Касса не настроена (503 PAYMENTS_DISABLED) или сеть: пробуем запаску.
        if (paymentFallbackLink) {
          openExternalLink(paymentFallbackLink)
          window.setTimeout(() => refreshAccessRef.current(), 8000)
        } else {
          showToast('Оплата скоро подключится')
        }
      })
      .finally(() => {
        setPayPending(false)
      })
  }

  /** Открывает карточку тренировки: закрытый контент ведёт на Locked. */
  function openWorkout(workout: Workout) {
    setSelectedWorkoutSlug(workout.slug)
    const locked = isWorkoutLocked(workout)
    go(locked ? 'locked' : 'workout')
    if (!locked && workoutDetail?.slug !== workout.slug) {
      // Полная карточка (в HTTP-режиме список каталога приходит без videoUrl).
      apiClient
        .getWorkout(workout.slug)
        .then((detail) => {
          if (detail) {
            setWorkoutDetail(detail)
          }
        })
        .catch(() => {
          // Останемся на данных из списка — карточка всё равно читаема.
        })
    }
  }

  /** Завершение квиза: сохранить подбор и показать персональную подборку. */
  function completeOnboarding(answers: OnboardingAnswers) {
    // Оптимистично фиксируем ответы (профиль/предзаполнение) и уходим на экран
    // подборки; свежие рекомендации грузим ниже.
    setData((current) =>
      current ? { ...current, me: { ...current.me, onboarding: answers } } : current,
    )
    setRecommendations(null)
    goUnchecked('recommendations')
    void (async () => {
      try {
        await apiClient.saveOnboarding(answers)
      } catch {
        showToast('Подбор не сохранился. Попробуйте ещё раз')
      }
      void loadRecommendations()
    })()
  }

  /** Сброс фильтра подбора → полный каталог. */
  function resetCatalogFilter() {
    void apiClient
      .getCatalog()
      .then((catalog) => {
        setData((current) =>
          current
            ? {
                ...current,
                categories: catalog.categories,
                workouts: catalog.workouts,
                catalogFiltered: false,
              }
            : current,
        )
      })
      .catch(() => {
        showToast('Не получилось обновить каталог')
      })
  }

  /** «Я сделала»: markDone → свежие метрики (+ история) → мягкий toast.
   *  durationMin — реально проведённые минуты (честный таймер), иначе номинал. */
  function markWorkoutDone(workoutSlug: string, durationMin?: number) {
    void (async () => {
      try {
        const summary = await apiClient.markDone(workoutSlug, durationMin)
        let progress: ProgressOverview = {
          summary,
          entries: data?.progress.entries ?? [],
        }
        try {
          progress = await apiClient.getProgress()
        } catch {
          // Метрики уже свежие; история догрузится при следующем обновлении.
        }
        setData((current) => (current ? { ...current, progress } : current))
        showToast('Записано. Даже 10 минут считаются')
        // Живой профиль (LP-1): мягко спрашиваем, как ощущалось.
        setFeedbackSlug(workoutSlug)
      } catch {
        showToast('Не получилось сохранить. Попробуйте ещё раз')
      }
    })()
  }

  /** Ответ на пост-тренировочный микро-вопрос → живой профиль (LP-1). */
  function submitFeedback(rating: WorkoutFeedbackRating) {
    const slug = feedbackSlug
    setFeedbackSlug(null)
    if (!slug) {
      return
    }
    void apiClient
      .sendFeedback(slug, rating)
      .then(() => {
        showToast('Спасибо — учту в следующей подборке')
        // Свежая подборка станет актуальной при следующем заходе на экран.
        setRecommendations(null)
      })
      .catch(() => {
        // Тихо: обратная связь необязательна, не мешаем пользователю.
      })
  }

  function toggleFavorite(workoutSlug: string) {
    void apiClient
      .toggleFavorite(workoutSlug)
      .then((result) => {
        setData((current) => (current ? { ...current, favorites: result.slugs } : current))
        showToast(result.favorited ? 'Добавлено в избранное' : 'Убрано из избранного')
      })
      .catch(() => {
        showToast('Не получилось обновить избранное')
      })
  }

  /** Мягкие напоминания (MOTIV-1): сохранить настройку + оптимистично обновить me. */
  function updateReminders(optIn: boolean, hour: number | null) {
    void apiClient
      .updateReminders(optIn, hour)
      .then((reminders) => {
        setData((current) =>
          current ? { ...current, me: { ...current.me, reminders } } : current,
        )
        showToast(optIn ? 'Напоминания включены' : 'Напоминания выключены')
      })
      .catch(() => {
        showToast('Не получилось сохранить напоминания')
      })
  }

  /** Недельный чек-ин (WEEK-1): сохранить ответ, скрыть карточку, освежить подбор. */
  function submitCheckin(answer: WeeklyCheckinAnswer) {
    // Оптимистично прячем карточку.
    setData((current) =>
      current ? { ...current, me: { ...current.me, weeklyCheckin: { due: false } } } : current,
    )
    void apiClient
      .submitCheckin(answer)
      .then((weeklyCheckin) => {
        setData((current) =>
          current ? { ...current, me: { ...current.me, weeklyCheckin } } : current,
        )
        // Ответ влияет на сложность — освежим подборку при следующем заходе.
        setRecommendations(null)
        showToast('Спасибо — учту в подборке')
      })
      .catch(() => {
        showToast('Не получилось сохранить ответ')
      })
  }

  function editOnboarding() {
    if (data?.me.onboarding) {
      // Старые профили без level/frequency — добираем дефолтами, чтобы все
      // 5 шагов были предзаполнены и ничего не падало.
      setOnboardingAnswers({ ...defaultOnboardingAnswers, ...data.me.onboarding })
    }
    go('onboarding')
  }

  // Фолбэки нужны, чтобы экраны «Тренировка» и «Locked» открывались
  // и напрямую из левой панели прототипа, без выбора карточки.
  const selectedWorkout =
    data?.workouts.find((workout) => workout.slug === selectedWorkoutSlug) ?? null
  const workoutForDetail =
    (workoutDetail && workoutDetail.slug === selectedWorkoutSlug ? workoutDetail : null) ??
    (selectedWorkout && !isWorkoutLocked(selectedWorkout) ? selectedWorkout : null) ??
    data?.workouts.find((workout) => !isWorkoutLocked(workout)) ??
    null
  const workoutForLocked =
    (selectedWorkout && isWorkoutLocked(selectedWorkout) ? selectedWorkout : null) ??
    data?.workouts.find((workout) => isWorkoutLocked(workout)) ??
    // При открытом доступе замков нет — для демо-экрана Locked берём любой premium.
    data?.workouts.find((workout) => workout.isPremium) ??
    null

  // Формулировка «Я сделал(а)» под выбранный в онбординге род (по умолчанию — женский).
  const doneLabel = doneVerbLabel(data?.me.onboarding?.gender)
  // «Бережём зоны»: отмеченные чувствительные места — для мягкой заметки на тренировке.
  const careAreas = effectiveCareAreas(data?.me.onboarding?.careAreas)

  return (
    <main className="board">
      {showDevNav && (
        <aside className="brief" aria-label="Навигация по экранам (dev)">
          <h1>Refiesse Fit</h1>
          <p>
            Панель навигации по экранам — только для разработки. Активный экран:{' '}
            <b>{currentStep}</b>
          </p>
          <div className="steps">
            {steps.map((step) => (
              <button
                className={`step ${screen === step.id ? 'active' : ''}`}
                key={step.id}
                onClick={() => go(step.id)}
                type="button"
              >
                {step.label}
              </button>
            ))}
          </div>
        </aside>
      )}

      <section className="phone" aria-label="Refiesse Fit">
        <div className="app-shell">
          <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
          {!data && !loadError && <LoadingScreen />}
          {!data && loadError && <ErrorScreen message={loadError} onRetry={retryLoad} />}
          {data && (
            <>
              {screen === 'home' && (
                <HomeScreen
                  data={data}
                  go={go}
                  openWorkout={openWorkout}
                  onCheckin={submitCheckin}
                />
              )}
              {screen === 'onboarding' && (
                <OnboardingScreen
                  answers={onboardingAnswers}
                  go={go}
                  onComplete={completeOnboarding}
                  stepIndex={onboardingStep}
                  setAnswers={setOnboardingAnswers}
                  setStepIndex={setOnboardingStep}
                />
              )}
              {screen === 'recommendations' && (
                <RecommendationsScreen
                  data={data}
                  go={go}
                  loading={recsLoading}
                  openWorkout={openWorkout}
                  recommendations={recommendations}
                />
              )}
              {screen === 'catalog' && (
                <CatalogScreen
                  data={data}
                  go={go}
                  onResetFilter={resetCatalogFilter}
                  openWorkout={openWorkout}
                />
              )}
              {screen === 'workout' && workoutForDetail && (
                <WorkoutScreen
                  careAreas={careAreas}
                  doneLabel={doneLabel}
                  go={go}
                  isFavorite={data.favorites.includes(workoutForDetail.slug)}
                  onDone={markWorkoutDone}
                  onToggleFavorite={toggleFavorite}
                  showToast={showToast}
                  workout={workoutForDetail}
                />
              )}
              {screen === 'plans' && (
                <PlansScreen data={data} go={go} openWorkout={openWorkout} />
              )}
              {screen === 'locked' && workoutForLocked && (
                <LockedScreen go={go} workout={workoutForLocked} />
              )}
              {screen === 'paywall' && (
                <PaywallScreen
                  go={go}
                  onAlreadyPaid={() => refreshAccess({ manual: true })}
                  onPay={startPayment}
                  payPending={payPending}
                />
              )}
              {screen === 'success' && <SuccessScreen data={data} go={go} />}
              {screen === 'progress' && (
                <ProgressScreen
                  initial={profileInitial(data.me)}
                  onProfile={() => go('profile')}
                  onMark={() => {
                    // Отметка «сделала» живёт на экране тренировки, где есть
                    // конкретный субъект: ведём на сегодняшнюю практику (или каталог).
                    if (data.workoutOfDay) {
                      openWorkout(data.workoutOfDay)
                    } else {
                      go('catalog')
                    }
                  }}
                  progress={data.progress}
                />
              )}
              {screen === 'profile' && (
                <ProfileScreen
                  go={go}
                  me={data.me}
                  onEditOnboarding={editOnboarding}
                  onUpdateReminders={updateReminders}
                />
              )}
              {feedbackSlug && (
                <FeedbackPrompt
                  onAnswer={submitFeedback}
                  onDismiss={() => setFeedbackSlug(null)}
                />
              )}
              <BottomNav current={screen} go={go} />
            </>
          )}
        </div>
      </section>
    </main>
  )
}

/** Скелетон в форме Home (ui-tokens 9.1): без текста и спиннеров. */
function LoadingScreen() {
  return (
    <section className="screen" aria-busy="true">
      <span className="visually-hidden">Загружаем…</span>
      <div className="skeleton sk-hero" />
      <div className="sk-chips">
        <span className="skeleton sk-chip" />
        <span className="skeleton sk-chip" />
        <span className="skeleton sk-chip" />
        <span className="skeleton sk-chip" />
      </div>
      <div className="skeleton sk-card" />
      <div className="skeleton sk-program" />
    </section>
  )
}

/** Ошибка загрузки: мягкий текст + повтор (Soft System, без тревоги). */
function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="screen">
      <TopBar />
      <div className="hero">
        <div className="badge">небольшая пауза</div>
        <h2>Данные не загрузились</h2>
        <p>{message}</p>
      </div>
      <button className="cta full" onClick={onRetry} type="button">
        Попробовать ещё раз
      </button>
    </section>
  )
}

function TopBar({
  title = 're.fit',
  onProfile,
  onBack,
  right = 'К',
}: {
  title?: string
  onProfile?: () => void
  onBack?: () => void
  right?: string
}) {
  return (
    <div className="topbar">
      {onBack ? (
        <button className="back" onClick={onBack} type="button" aria-label="Назад">
          ←
        </button>
      ) : (
        <div className="brand">
          {title === 're.fit' ? (
            <>
              re<span>.</span>fit
            </>
          ) : (
            title
          )}
        </div>
      )}
      <button
        className="avatar"
        onClick={onProfile}
        type="button"
        aria-label="Профиль"
      >
        {right}
      </button>
    </div>
  )
}

function HomeScreen({
  data,
  go,
  openWorkout,
  onCheckin,
}: {
  data: AppData
  go: (screen: Screen) => void
  openWorkout: (workout: Workout) => void
  onCheckin: (answer: WeeklyCheckinAnswer) => void
}) {
  const accessUntil = formatDayMonth(data.me.access.expiresAt)
  const workoutOfDay = data.workoutOfDay
  const plan = data.plans.find((program) => !program.isPremium) ?? data.plans[0] ?? null
  const { done, total } = data.progress.summary.planProgress
  const todayDay = plan?.days[done] ?? null

  return (
    <section className="screen">
      <TopBar right={profileInitial(data.me)} onProfile={() => go('profile')} />
      <div className="hero hero-tall">
        <div className="badge">
          {data.me.access.isPremium && accessUntil
            ? `Доступ открыт до ${accessUntil}`
            : 'Мягкая система движения'}
        </div>
        <h2>Что нужно телу сегодня?</h2>
        <p>
          Выберите состояние — я подберу мягкую тренировку на 10–20 минут.
        </p>
      </div>
      {data.me.weeklyCheckin.due && <WeeklyCheckinCard onAnswer={onCheckin} />}
      <button className="cta full" onClick={() => go('onboarding')} type="button">
        Подобрать тренировку
      </button>
      <div className="chips" aria-label="Категории">
        {data.categories.map((category, index) => (
          <button
            className={`chip ${index === 0 ? 'active' : ''}`}
            key={category.slug}
            onClick={() => go('catalog')}
            type="button"
          >
            {category.title}
          </button>
        ))}
      </div>
      {workoutOfDay && (
        <>
          <div className="section-title">
            <h3>Тренировка дня</h3>
            <small>{workoutOfDay.durationMin} мин</small>
          </div>
          <WorkoutCard
            isPremium={workoutOfDay.isPremium}
            meta={[equipmentLabel(workoutOfDay)]}
            onClick={() => openWorkout(workoutOfDay)}
            title={workoutOfDay.title}
            thumb={workoutOfDay.thumbColor}
          />
        </>
      )}
      {plan && (
        <>
          <div className="section-title">
            <h3>Текущий план</h3>
            <small>
              {done}/{total}
            </small>
          </div>
          <ProgramCard
            note={todayDay ? `Сегодня: ${todayDay.title}` : null}
            onClick={() => go('plans')}
            percent={total > 0 ? Math.round((done / total) * 100) : 0}
            title={plan.title}
          />
        </>
      )}
    </section>
  )
}

/**
 * Недельный лёгкий чек-ин (WEEK-1). Мягкая карточка на Home раз в неделю:
 * один вопрос о самочувствии, ответ влияет на сложность в подборке.
 */
function WeeklyCheckinCard({ onAnswer }: { onAnswer: (answer: WeeklyCheckinAnswer) => void }) {
  const options: Array<{ answer: WeeklyCheckinAnswer; label: string }> = [
    { answer: 'better', label: 'Полегче' },
    { answer: 'same', label: 'Так же' },
    { answer: 'harder', label: 'Тяжелее' },
  ]
  return (
    <div className="checkin-card">
      <div className="badge">чек-ин недели</div>
      <h3>Как прошла неделя?</h3>
      <p className="lead">Подстроим нагрузку — без правильных ответов.</p>
      <div className="checkin-options">
        {options.map((option) => (
          <button
            className="chip"
            key={option.answer}
            onClick={() => onAnswer(option.answer)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function isOptionSelected(
  step: OnboardingStepDef,
  answers: OnboardingAnswers,
  value: string,
): boolean {
  const current = answers[step.key]
  return Array.isArray(current) ? current.includes(value) : current === value
}

function answerLabel(step: OnboardingStepDef, answers: OnboardingAnswers): string {
  const current = answers[step.key]
  if (Array.isArray(current)) {
    return current.length > 0 ? current.join(', ') : NO_EQUIPMENT
  }
  return current ?? '—'
}

function OnboardingScreen({
  answers,
  go,
  onComplete,
  stepIndex,
  setAnswers,
  setStepIndex,
}: {
  answers: OnboardingAnswers
  go: (screen: Screen) => void
  onComplete: (answers: OnboardingAnswers) => void
  stepIndex: number
  setAnswers: Dispatch<SetStateAction<OnboardingAnswers>>
  setStepIndex: Dispatch<SetStateAction<number>>
}) {
  const step = onboardingSteps[stepIndex]
  const isLastStep = stepIndex === onboardingSteps.length - 1

  function choose(value: string) {
    setAnswers((current) => {
      if (step.multi) {
        // Мультивыбор (инвентарь, «бережём зоны»): toggle значений;
        // exclusiveValue («Без инвентаря» / «Нет, всё ок») снимает остальные.
        const raw = current[step.key]
        const selected = Array.isArray(raw) ? raw : []
        let next: string[]
        if (step.exclusiveValue && value === step.exclusiveValue) {
          next = selected.includes(value) ? [] : [value]
        } else if (selected.includes(value)) {
          next = selected.filter((item) => item !== value)
        } else {
          next = [...selected.filter((item) => item !== step.exclusiveValue), value]
        }
        return { ...current, [step.key]: next }
      }
      return { ...current, [step.key]: value }
    })
  }

  function next() {
    if (isLastStep) {
      onComplete(answers)
      return
    }
    setStepIndex((current) => Math.min(current + 1, onboardingSteps.length - 1))
  }

  function back() {
    if (stepIndex === 0) {
      go('home')
      return
    }
    setStepIndex((current) => Math.max(current - 1, 0))
  }

  return (
    <section className="screen">
      <TopBar onBack={back} right={`Шаг ${stepIndex + 1}/${onboardingSteps.length}`} />
      <div
        className="onboarding-progress"
        aria-label={`Шаг ${stepIndex + 1} из ${onboardingSteps.length}`}
      >
        {onboardingSteps.map((item, index) => (
          <span
            className={index <= stepIndex ? 'active' : ''}
            key={item.key}
            style={{ width: `${100 / onboardingSteps.length}%` }}
          />
        ))}
      </div>
      <div className="hero">
        <div className="badge">{step.badge}</div>
        <h2>{step.title}</h2>
        <p>{step.description}</p>
      </div>
      {step.options.map((option) => (
        <button
          className={`option ${isOptionSelected(step, answers, option.value) ? 'active' : ''}`}
          key={option.value}
          onClick={() => choose(option.value)}
          type="button"
        >
          <span className={`radio ${step.multi ? 'checkbox' : ''}`} />
          <span>
            <strong>{option.value}</strong>
            <small>{option.hint}</small>
          </span>
        </button>
      ))}
      <div className="selection-summary">
        <strong>Подбор</strong>
        {onboardingSteps.slice(0, stepIndex + 1).map((item) => (
          <span key={item.key}>{answerLabel(item, answers)}</span>
        ))}
      </div>
      <button className="cta full" onClick={next} type="button">
        {isLastStep ? 'Показать мою подборку' : 'Дальше'}
      </button>
    </section>
  )
}

/** Персональная подборка после квиза — рендерит ранжированный сервером список. */
function RecommendationsScreen({
  data,
  go,
  loading,
  openWorkout,
  recommendations,
}: {
  data: AppData
  go: (screen: Screen) => void
  loading: boolean
  openWorkout: (workout: Workout) => void
  recommendations: Recommendations | null
}) {
  const goal = data.me.onboarding?.goal
  const plan = recommendations?.recommendedPlan ?? null

  return (
    <section className="screen">
      <TopBar right={profileInitial(data.me)} onProfile={() => go('profile')} />
      <div className="hero">
        <div className="badge">персонально</div>
        <h2>Подобрано для тебя</h2>
        <p>
          {goal
            ? `Мягкие практики под “${goal}” — от коротких к глубже.`
            : 'Мягкие практики под ваш подбор — от коротких к глубже.'}
        </p>
      </div>

      {loading && !recommendations ? (
        <>
          <div className="skeleton sk-card" />
          <div className="skeleton sk-card" />
          <div className="skeleton sk-card" />
        </>
      ) : recommendations && recommendations.workouts.length > 0 ? (
        recommendations.workouts.map((workout) => (
          <WorkoutCard
            isPremium={workout.isPremium}
            key={workout.slug}
            meta={[`${workout.durationMin} мин`, levelPillLabels[workout.level]]}
            onClick={() => openWorkout(workout)}
            title={workout.title}
            thumb={workout.thumbColor}
          />
        ))
      ) : (
        <div className="empty-state">
          <h3>Пока собираем</h3>
          <p>
            Персональная подборка появится чуть позже. А пока можно открыть весь
            каталог мягких практик.
          </p>
        </div>
      )}

      {plan && (
        <>
          <div className="section-title">
            <h3>Рекомендуем план</h3>
            <small>{plan.daysTotal} дней</small>
          </div>
          <ProgramCard
            note={plan.description ?? null}
            onClick={() => go(plan.isPremium && !data.me.access.isPremium ? 'paywall' : 'plans')}
            percent={0}
            title={plan.title}
          />
        </>
      )}

      <button
        className="cta secondary full stacked"
        onClick={() => go('catalog')}
        type="button"
      >
        Открыть весь каталог
      </button>
    </section>
  )
}

const emptyFilteredCatalogText =
  'Под этот подбор пока нет тренировок. Попробуйте убрать один фильтр или изменить состояние — мягких вариантов много.'
const emptyCatalogText =
  'Тренировки скоро появятся здесь. Загляните чуть позже — мы наполняем каталог мягкими практиками.'

function CatalogScreen({
  data,
  go,
  onResetFilter,
  openWorkout,
}: {
  data: AppData
  go: (screen: Screen) => void
  onResetFilter: () => void
  openWorkout: (workout: Workout) => void
}) {
  return (
    <section className="screen">
      <TopBar right={profileInitial(data.me)} onProfile={() => go('profile')} />
      <h2>Найти по состоянию</h2>
      <p className="lead">
        Тренировки собраны по целям: шея, поясница, кор, мобильность,
        расслабление.
      </p>
      {data.catalogFiltered && (
        <div className="filter-note">
          <span>Показан подбор под ваше состояние</span>
          <button onClick={onResetFilter} type="button">
            Сбросить
          </button>
        </div>
      )}
      {data.workouts.length === 0 ? (
        <div className="empty-state">
          <h3>Пока пусто</h3>
          <p>{data.catalogFiltered ? emptyFilteredCatalogText : emptyCatalogText}</p>
          {data.catalogFiltered && (
            <button className="cta secondary full" onClick={onResetFilter} type="button">
              Показать все тренировки
            </button>
          )}
        </div>
      ) : (
        data.workouts.map((workout) => (
          <WorkoutCard
            isPremium={workout.isPremium}
            key={workout.slug}
            meta={[`${workout.durationMin} мин`, levelPillLabels[workout.level]]}
            onClick={() => openWorkout(workout)}
            title={workout.title}
            thumb={workout.thumbColor}
          />
        ))
      )}
    </section>
  )
}

/**
 * Встроенный YouTube-плеер + честный таймер (VID). Считает реально просмотренные
 * секунды через IFrame API. Устойчив к отказу: если API не загрузился (нет сети
 * до youtube.com) — status='failed', показываем плоский iframe, минуты по номиналу.
 * YT заменяет управляемый им узел на iframe, поэтому держим его ВНЕ дерева React
 * (ручной host-div внутри ref-обёртки), чтобы не конфликтовать при размонтировании.
 */
function useYouTubePlayer(videoId: string | null) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<YouTubePlayer | null>(null)
  const [status, setStatus] = useState<'idle' | 'ready' | 'failed'>('idle')
  const [watchedSec, setWatchedSec] = useState(0)

  useEffect(() => {
    const wrapper = containerRef.current
    if (!videoId || !wrapper) {
      return
    }
    let cancelled = false
    let tick: ReturnType<typeof setInterval> | undefined
    const host = document.createElement('div')
    wrapper.appendChild(host)

    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled) {
          return
        }
        playerRef.current = new YT.Player(host, {
          videoId,
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
          events: {
            onReady: () => {
              if (!cancelled) setStatus('ready')
            },
          },
        })
        tick = setInterval(() => {
          const player = playerRef.current
          try {
            if (player && player.getPlayerState() === YT_PLAYING) {
              setWatchedSec((seconds) => seconds + 1)
            }
          } catch {
            /* плеер ещё не готов — игнорируем */
          }
        }, 1000)
      })
      .catch(() => {
        if (!cancelled) setStatus('failed')
      })

    return () => {
      cancelled = true
      if (tick) clearInterval(tick)
      try {
        playerRef.current?.destroy()
      } catch {
        /* noop */
      }
      playerRef.current = null
      wrapper.replaceChildren()
    }
  }, [videoId])

  const play = (): void => {
    try {
      playerRef.current?.playVideo()
    } catch {
      /* noop */
    }
  }
  return { containerRef, status, watchedSec, play }
}

/** Секунды → «M:SS». */
function formatClock(totalSec: number): string {
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${String(sec).padStart(2, '0')}`
}

function WorkoutScreen({
  careAreas,
  doneLabel,
  go,
  isFavorite,
  onDone,
  onToggleFavorite,
  showToast,
  workout,
}: {
  careAreas: string[]
  doneLabel: string
  go: (screen: Screen) => void
  isFavorite: boolean
  onDone: (workoutSlug: string, durationMin?: number) => void
  onToggleFavorite: (workoutSlug: string) => void
  showToast: (message: string) => void
  workout: Workout
}) {
  const videoId = parseYouTubeId(workout.videoUrl)
  const { containerRef, status, watchedSec, play } = useYouTubePlayer(videoId)

  function finish(): void {
    // Честный таймер: пишем реально просмотренное время; короткая сессия (<30с —
    // «уже делал(а)») пишется по номиналу (durationMin не передаём).
    const measured = watchedSec >= 30 ? Math.max(1, Math.round(watchedSec / 60)) : undefined
    onDone(workout.slug, measured)
    go('progress')
  }

  return (
    <section className="screen">
      <TopBar
        onBack={() => go('catalog')}
        right={isFavorite ? '♥' : '♡'}
        onProfile={() => onToggleFavorite(workout.slug)}
      />
      {videoId ? (
        status === 'failed' ? (
          <div className="video-embed">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&playsinline=1`}
              title={workout.title}
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="video-embed" ref={containerRef} />
        )
      ) : workout.videoUrl ? (
        <button
          className="video video-playable"
          onClick={() => openExternalLink(workout.videoUrl as string)}
          type="button"
        >
          <span className="video-cta">Смотреть видео</span>
        </button>
      ) : (
        <div className="video" />
      )}
      {watchedSec > 0 && (
        <p className="timer-note">В практике: {formatClock(watchedSec)}</p>
      )}
      <h2 className="compact-title">{workout.title}</h2>
      <p className="lead">{workout.description}</p>
      <div className="facts">
        <Fact value={String(workout.durationMin)} label="мин" />
        <Fact value={equipmentFactValue(workout)} label="инвентарь" />
        <Fact value={levelFactLabels[workout.level]} label="уровень" />
      </div>
      <div className="note">
        <b>Осторожно:</b> {workout.cautions}
      </div>
      {careAreas.length > 0 && (
        <div className="note note-care">
          <b>Бережём:</b> {careAreas.join(', ').toLowerCase()}. Двигайся мягко, без
          боли — при дискомфорте остановись.
        </div>
      )}
      <button
        className="cta full"
        onClick={() => {
          if (videoId) {
            play()
          } else if (workout.videoUrl) {
            openExternalLink(workout.videoUrl)
          } else {
            showToast('Тренировка началась')
          }
        }}
        type="button"
      >
        Начать тренировку
      </button>
      <button className="cta ghost full stacked" onClick={finish} type="button">
        {doneLabel}
      </button>
    </section>
  )
}

/**
 * Пост-тренировочный микро-вопрос (живой профиль, LP-1). Мягкая карточка снизу:
 * один вопрос, три ответа в одно касание, без давления — можно закрыть.
 */
function FeedbackPrompt({
  onAnswer,
  onDismiss,
}: {
  onAnswer: (rating: WorkoutFeedbackRating) => void
  onDismiss: () => void
}) {
  const options: Array<{ rating: WorkoutFeedbackRating; label: string }> = [
    { rating: 'soft', label: 'Мягко' },
    { rating: 'right', label: 'В самый раз' },
    { rating: 'hard', label: 'Было тяжело' },
  ]
  return (
    <div className="feedback-sheet" role="dialog" aria-label="Как ощущалось после тренировки">
      <div className="feedback-card">
        <p className="feedback-title">Как ощущалось?</p>
        <p className="feedback-sub">Подстроим следующую подборку под тебя</p>
        <div className="feedback-options">
          {options.map((option) => (
            <button
              className="feedback-chip"
              key={option.rating}
              onClick={() => onAnswer(option.rating)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <button className="feedback-skip" onClick={onDismiss} type="button">
          Позже
        </button>
      </div>
    </div>
  )
}

function PlansScreen({
  data,
  go,
  openWorkout,
}: {
  data: AppData
  go: (screen: Screen) => void
  openWorkout: (workout: Workout) => void
}) {
  const freePlan = data.plans.find((program) => !program.isPremium) ?? null
  const premiumPlans = data.plans.filter((program) => program.isPremium)
  const { done, total } = data.progress.summary.planProgress
  const todayDay = freePlan?.days[done] ?? null
  const todayWorkout = todayDay?.workoutSlug
    ? data.workouts.find((workout) => workout.slug === todayDay.workoutSlug) ?? null
    : null

  return (
    <section className="screen">
      <TopBar right={profileInitial(data.me)} onProfile={() => go('profile')} />
      <h2>Идти по системе</h2>
      <p className="lead">Планы на 5–7 дней помогают не искать случайные упражнения.</p>
      {freePlan && (
        <ProgramCard
          note={todayDay ? `Сегодня: ${todayDay.title}` : null}
          onClick={() => (todayWorkout ? openWorkout(todayWorkout) : go('catalog'))}
          percent={total > 0 ? Math.round((done / total) * 100) : 0}
          title={freePlan.title}
        />
      )}
      {premiumPlans.map((program) => (
        <WorkoutCard
          isPremium={program.isPremium}
          key={program.slug}
          meta={[`${program.daysTotal} дней`]}
          onClick={() => go('paywall')}
          thumb="peach"
          title={program.title}
        />
      ))}
    </section>
  )
}

function LockedScreen({ go, workout }: { go: (screen: Screen) => void; workout: Workout }) {
  return (
    <section className="screen">
      <TopBar onBack={() => go('catalog')} right="🔒" />
      <div className="video muted-video" />
      <h2 className="compact-title">{workout.title}</h2>
      <p className="lead">{workout.description}</p>
      <div className="facts">
        <Fact value={String(workout.durationMin)} label="мин" />
        <Fact value={equipmentFactValue(workout)} label="инвентарь" />
        <Fact value={levelFactLabels[workout.level]} label="уровень" />
      </div>
      <div className="paywall small-paywall">
        <div>
          <div className="badge">premium</div>
          <h3>Откройте доступ, чтобы продолжить</h3>
          <p className="lead">Эта тренировка входит в Premium-каталог.</p>
        </div>
        <button className="cta full" onClick={() => go('paywall')} type="button">
          Открыть Premium
        </button>
      </div>
    </section>
  )
}

function PaywallScreen({
  go,
  onAlreadyPaid,
  onPay,
  payPending,
}: {
  go: (screen: Screen) => void
  onAlreadyPaid: () => void
  onPay: () => void
  payPending: boolean
}) {
  return (
    <section className="screen">
      <TopBar onBack={() => go('catalog')} right="✧" />
      <div className="paywall">
        <div>
          <div className="badge">Refiesse Fit Premium</div>
          <h2>Идти по системе, а не искать посты</h2>
          <p className="lead">
            Откройте планы, каталог, прогресс и мягкое движение под ваше
            состояние.
          </p>
          {paywallFeatures.map((feature) => (
            <div className="feature" key={feature}>
              <span className="check">✓</span>
              <span>{feature}</span>
            </div>
          ))}
        </div>
        <div>
          <p className="price-note">500 ₽ в месяц. Оплата картой на защищённой странице.</p>
          <button className="cta full" disabled={payPending} onClick={onPay} type="button">
            {payPending ? 'Открываем оплату…' : 'Открыть за 500 ₽/мес'}
          </button>
          <button className="cta ghost full stacked" onClick={onAlreadyPaid} type="button">
            Я уже оплатила
          </button>
          <button className="cta secondary full stacked" onClick={() => go('catalog')} type="button">
            Продолжить бесплатно
          </button>
        </div>
      </div>
    </section>
  )
}

function SuccessScreen({ data, go }: { data: AppData; go: (screen: Screen) => void }) {
  const plan = data.plans.find((program) => !program.isPremium) ?? data.plans[0] ?? null
  const { done, total } = data.progress.summary.planProgress
  const todayDay = plan?.days[done] ?? null
  const accessUntil = formatDayMonth(data.me.access.expiresAt)

  return (
    <section className="screen">
      <TopBar title="Доступ" right="✓" />
      <div className="success">
        <div className="success-icon">✓</div>
        <h2 className="compact-title">
          {accessUntil ? `Доступ открыт до ${accessUntil}` : 'Доступ открыт'}
        </h2>
        <p className="lead">
          Premium-планы и тренировки уже доступны. Начните с мягкого маршрута на
          7 дней.
        </p>
      </div>
      <div className="section-title">
        <h3>С чего начать</h3>
        <small>рекомендация</small>
      </div>
      {plan && (
        <ProgramCard
          note={todayDay ? `Сегодня: ${todayDay.title}` : null}
          onClick={() => go('plans')}
          percent={total > 0 ? Math.round((done / total) * 100) : 0}
          title={plan.title}
        />
      )}
    </section>
  )
}

function ProgressScreen({
  initial,
  onMark,
  onProfile,
  progress,
}: {
  initial: string
  onMark: () => void
  onProfile: () => void
  progress: ProgressOverview
}) {
  const { summary, entries } = progress
  const recent = entries.slice(0, 5)

  return (
    <section className="screen">
      <TopBar right={initial} onProfile={onProfile} />
      <div className="hero">
        <div className="badge">эта неделя</div>
        <h2>Даже 10 минут считаются</h2>
        <p>Прогресс поддерживает регулярность, но не наказывает за пропуски.</p>
      </div>
      <div className="stats">
        <Stat
          value={String(summary.workouts)}
          label={plural(summary.workouts, 'тренировка', 'тренировки', 'тренировок')}
        />
        <Stat
          value={String(summary.minutes)}
          label={plural(summary.minutes, 'минута', 'минуты', 'минут')}
        />
        <Stat
          value={String(summary.streakDays)}
          label={`${plural(summary.streakDays, 'день', 'дня', 'дней')} подряд`}
        />
        <Stat value={`${summary.planProgress.done}/${summary.planProgress.total}`} label="план" />
      </div>
      <p className="stats-note">Тренировки и минуты — за эту неделю.</p>
      <button className="cta full" onClick={onMark} type="button">
        Отметить практику
      </button>
      {recent.length > 0 && (
        <>
          <div className="section-title">
            <h3>Недавние практики</h3>
            <small>история</small>
          </div>
          <div className="history">
            {recent.map((entry) => (
              <div className="history-item" key={`${entry.workoutSlug}-${entry.completedAt}`}>
                <strong>{entry.workoutTitle}</strong>
                <span>
                  {formatDayMonth(entry.completedAt) ?? '—'} · {entry.durationMin} мин
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

/** Варианты времени для напоминаний (час по МСК). */
const reminderHourOptions: Array<{ hour: number; label: string }> = [
  { hour: 9, label: 'Утро' },
  { hour: 14, label: 'День' },
  { hour: 19, label: 'Вечер' },
  { hour: 21, label: 'Поздний вечер' },
]

function ProfileScreen({
  go,
  me,
  onEditOnboarding,
  onUpdateReminders,
}: {
  go: (screen: Screen) => void
  me: UserProfile
  onEditOnboarding: () => void
  onUpdateReminders: (optIn: boolean, hour: number | null) => void
}) {
  // Фолбэк на случай ответа старого API без reminders — не роняем экран.
  const reminders = me.reminders ?? { optIn: false, hour: null }
  const remindOptIn = reminders.optIn
  const remindHour = reminders.hour ?? 19
  const access = me.access
  const accessUntil = formatDayMonth(access.expiresAt)
  let subscriptionText: string
  if (access.isPremium && access.status === 'cancelled') {
    subscriptionText = accessUntil
      ? `Продление отключено, доступ до ${accessUntil}.`
      : 'Продление отключено, доступ действует до конца оплаченного периода.'
  } else if (access.isPremium) {
    subscriptionText = accessUntil
      ? `Доступ открыт до ${accessUntil}. Продление — автоматически.`
      : 'Доступ открыт. Продление — автоматически.'
  } else {
    subscriptionText = 'Подписка не активна. Premium откроет планы, каталог и прогресс.'
  }

  return (
    <section className="screen">
      <TopBar title="Профиль" onBack={() => go('home')} right={me.firstName.charAt(0) || 'К'} />
      <div className="profile-card">
        <h3>{me.firstName}</h3>
        <p className="lead">
          {me.telegramUserId !== null ? 'Аккаунт Telegram' : 'Профиль'}
        </p>
      </div>
      <div className="program">
        <div className="badge">
          {access.isPremium ? 'Premium активен' : 'Подписка не активна'}
        </div>
        <h3>Управление подпиской</h3>
        <p className="lead profile-lead">{subscriptionText}</p>
        {access.isPremium ? (
          <button className="cta on-lime full" type="button">
            Управлять подпиской
          </button>
        ) : (
          <button className="cta on-lime full" onClick={() => go('paywall')} type="button">
            Открыть Premium
          </button>
        )}
      </div>
      <div className="program reminders-card">
        <div className="badge">{remindOptIn ? 'Напоминания включены' : 'Мягкие напоминания'}</div>
        <h3>Напоминания</h3>
        <p className="lead profile-lead">
          Тёплый пинг в Telegram, если за день так и не нашлось минутки. Без вины и
          давления — выключить можно в любой момент.
        </p>
        <button
          className={`cta ${remindOptIn ? 'secondary' : 'on-lime'} full`}
          onClick={() => onUpdateReminders(!remindOptIn, remindHour)}
          type="button"
        >
          {remindOptIn ? 'Выключить напоминания' : 'Включить напоминания'}
        </button>
        {remindOptIn && (
          <div className="reminder-hours" role="group" aria-label="Время напоминания">
            {reminderHourOptions.map((option) => (
              <button
                className={`chip ${remindHour === option.hour ? 'active' : ''}`}
                key={option.hour}
                onClick={() => onUpdateReminders(true, option.hour)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="cta secondary full" onClick={onEditOnboarding} type="button">
        Изменить подбор
      </button>
    </section>
  )
}

function WorkoutCard({
  title,
  isPremium,
  meta,
  thumb,
  onClick,
}: {
  title: string
  isPremium: boolean
  meta: string[]
  thumb?: string | null
  onClick: () => void
}) {
  return (
    <button className="workout-card" onClick={onClick} type="button">
      <span className={`thumb ${thumb ?? ''}`} />
      <span className="workout-body">
        <strong>{title}</strong>
        <span className="meta">
          <span className={`pill ${isPremium ? 'premium' : 'free'}`}>
            {isPremium ? 'premium' : 'free'}
          </span>
          {meta.map((item) => (
            <span className="pill" key={item}>
              {item}
            </span>
          ))}
        </span>
      </span>
    </button>
  )
}

function ProgramCard({
  title,
  percent,
  note,
  onClick,
}: {
  title: string
  percent: number
  note?: string | null
  onClick: () => void
}) {
  return (
    <button className="program" onClick={onClick} type="button">
      <h3>{title}</h3>
      <div className="progress">
        <span style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }} />
      </div>
      {note && <p className="program-note">{note}</p>}
    </button>
  )
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div className="fact">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}

const navIconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

function BottomNav({ current, go }: { current: Screen; go: (screen: Screen) => void }) {
  const items: Array<{ id: Screen; icon: ReactNode; label: string }> = [
    {
      id: 'home',
      icon: (
        <svg {...navIconProps} aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      ),
      label: 'Сегодня',
    },
    {
      id: 'catalog',
      icon: (
        <svg {...navIconProps} aria-hidden="true">
          <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
        </svg>
      ),
      label: 'Каталог',
    },
    {
      id: 'plans',
      icon: (
        <svg {...navIconProps} aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
          <path d="M8 2.5v4M16 2.5v4M3.5 10.5h17" />
        </svg>
      ),
      label: 'Планы',
    },
    {
      id: 'progress',
      icon: (
        <svg {...navIconProps} aria-hidden="true">
          <path d="M3.5 17.5l5.5-5.5 3.5 3.5 7.5-7.5" />
          <path d="M14.5 8h5.5v5.5" />
        </svg>
      ),
      label: 'Прогресс',
    },
  ]

  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      {items.map((item) => (
        <button
          aria-current={current === item.id ? 'page' : undefined}
          className={current === item.id ? 'active' : ''}
          key={item.id}
          onClick={() => go(item.id)}
          type="button"
        >
          <i aria-hidden="true">{item.icon}</i>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

export default App
