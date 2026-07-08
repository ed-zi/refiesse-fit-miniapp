import { type Dispatch, type ReactNode, type SetStateAction, useMemo, useState } from 'react'
import './App.css'

type Screen =
  | 'home'
  | 'onboarding'
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
  { id: 'catalog', label: 'Каталог: выбрать тренировку' },
  { id: 'workout', label: 'Тренировка: понять и начать' },
  { id: 'plans', label: 'Планы: система на 5–7 дней' },
  { id: 'locked', label: 'Locked: premium закрыт' },
  { id: 'paywall', label: 'Paywall: ценность + Tribute' },
  { id: 'success', label: 'Success: доступ открыт' },
  { id: 'progress', label: 'Прогресс: удержание без давления' },
  { id: 'profile', label: 'Профиль: подписка и настройки' },
]

const categories = ['Спина', 'Осанка', 'Кор', 'Расслабление']

type OnboardingAnswers = {
  goal: string
  time: string
  equipment: string
  intensity: string
}

type OnboardingKey = keyof OnboardingAnswers

type OnboardingStep = {
  key: OnboardingKey
  badge: string
  title: string
  description: string
  options: Array<[string, string]>
}

const onboardingSteps: OnboardingStep[] = [
  {
    key: 'goal',
    badge: 'быстрый подбор',
    title: 'Что сейчас нужно телу?',
    description: 'Выберите основное состояние. Это не диагноз, а мягкий ориентир.',
    options: [
      ['Шея и плечи зажаты', 'после работы, сидения, дороги'],
      ['Поясница устала', 'хочется разгрузить мягко'],
      ['Кор и живот', 'без агрессивных скручиваний'],
      ['Расслабиться перед сном', 'спокойная вечерняя практика'],
    ],
  },
  {
    key: 'time',
    badge: 'время',
    title: 'Сколько есть времени?',
    description: 'Подберём практику так, чтобы её реально было сделать сегодня.',
    options: [
      ['5–10 минут', 'очень короткая разгрузка'],
      ['15–20 минут', 'оптимально для домашней практики'],
      ['25–35 минут', 'если хочется пройти полноценнее'],
    ],
  },
  {
    key: 'equipment',
    badge: 'инвентарь',
    title: 'Что есть под рукой?',
    description: 'Если ничего нет — это нормально, большинство практик можно делать без инвентаря.',
    options: [
      ['Без инвентаря', 'достаточно места и коврика по желанию'],
      ['Коврик', 'удобнее для пола и растяжки'],
      ['Резинка', 'можно добавить мягкое сопротивление'],
      ['МФР-ролл', 'для восстановления и расслабления'],
    ],
  },
  {
    key: 'intensity',
    badge: 'режим',
    title: 'Какой режим комфортен?',
    description: 'Выберите нагрузку без идеи “потерпеть”. Подбор должен остаться мягким.',
    options: [
      ['Очень мягко', 'без перегруза и сложных связок'],
      ['Обычный домашний темп', 'спокойно, но с ощущением работы'],
      ['Хочу чуть активнее', 'если есть силы и желание подвигаться больше'],
    ],
  },
]

const defaultOnboardingAnswers: OnboardingAnswers = {
  goal: onboardingSteps[0].options[0][0],
  time: onboardingSteps[1].options[1][0],
  equipment: onboardingSteps[2].options[0][0],
  intensity: onboardingSteps[3].options[0][0],
}

const workouts = [
  {
    title: 'Кор без скручиваний',
    access: 'premium',
    meta: ['18 мин', 'новичок'],
    thumb: 'peach',
    target: 'locked' as Screen,
  },
  {
    title: 'Поясница после сидячего дня',
    access: 'premium',
    meta: ['15 мин'],
    thumb: '',
    target: 'locked' as Screen,
  },
  {
    title: 'Вечернее расслабление',
    access: 'free',
    meta: ['9 мин'],
    thumb: 'dark',
    target: 'workout' as Screen,
  },
]

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [onboardingStep, setOnboardingStep] = useState(0)
  const [onboardingAnswers, setOnboardingAnswers] = useState<OnboardingAnswers>(
    defaultOnboardingAnswers,
  )
  const [toast, setToast] = useState('')

  const currentStep = useMemo(
    () => steps.find((step) => step.id === screen)?.label ?? '',
    [screen],
  )

  function go(next: Screen) {
    if (next === 'onboarding') {
      setOnboardingStep(0)
    }
    setScreen(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 1300)
  }

  return (
    <main className="board">
      <aside className="brief" aria-label="Навигация по прототипу">
        <h1>Refiesse Fit Mini App</h1>
        <p>
          Рабочий React-прототип в направлении <b>Soft System</b>. Сейчас задача —
          проверить логику flow до того, как наполнять контентом и подключать Tribute.
        </p>
        <p>
          Активный экран: <b>{currentStep}</b>
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

      <section className="phone" aria-label="Refiesse Fit Mini App prototype">
        <div className="app-shell">
          <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
          {screen === 'home' && <HomeScreen go={go} />}
          {screen === 'onboarding' && (
            <OnboardingScreen
              answers={onboardingAnswers}
              go={go}
              stepIndex={onboardingStep}
              setAnswers={setOnboardingAnswers}
              setStepIndex={setOnboardingStep}
            />
          )}
          {screen === 'catalog' && <CatalogScreen go={go} />}
          {screen === 'workout' && <WorkoutScreen go={go} showToast={showToast} />}
          {screen === 'plans' && <PlansScreen go={go} />}
          {screen === 'locked' && <LockedScreen go={go} />}
          {screen === 'paywall' && <PaywallScreen go={go} />}
          {screen === 'success' && <SuccessScreen go={go} />}
          {screen === 'progress' && <ProgressScreen showToast={showToast} />}
          {screen === 'profile' && <ProfileScreen go={go} />}
          <BottomNav current={screen} go={go} />
        </div>
      </section>
    </main>
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

function HomeScreen({ go }: { go: (screen: Screen) => void }) {
  return (
    <section className="screen">
      <TopBar onProfile={() => go('profile')} />
      <div className="hero hero-tall">
        <div className="badge">Доступ открыт до 18 июля</div>
        <h2>Что нужно телу сегодня?</h2>
        <p>
          Выберите состояние — я подберу мягкую тренировку на 10–20 минут.
        </p>
      </div>
      <button className="cta full" onClick={() => go('onboarding')} type="button">
        Подобрать тренировку
      </button>
      <div className="chips" aria-label="Категории">
        {categories.map((category, index) => (
          <button
            className={`chip ${index === 0 ? 'active' : ''}`}
            key={category}
            onClick={() => go('catalog')}
            type="button"
          >
            {category}
          </button>
        ))}
      </div>
      <div className="section-title">
        <h3>Тренировка дня</h3>
        <small>12 мин</small>
      </div>
      <WorkoutCard
        access="free"
        meta={['без инвентаря']}
        onClick={() => go('workout')}
        title="Мягкая разгрузка шеи и плеч"
        thumb="dark"
      />
      <div className="section-title">
        <h3>Текущий план</h3>
        <small>3/7</small>
      </div>
      <ProgramCard onClick={() => go('plans')} />
    </section>
  )
}

function OnboardingScreen({
  answers,
  go,
  stepIndex,
  setAnswers,
  setStepIndex,
}: {
  answers: OnboardingAnswers
  go: (screen: Screen) => void
  stepIndex: number
  setAnswers: Dispatch<SetStateAction<OnboardingAnswers>>
  setStepIndex: Dispatch<SetStateAction<number>>
}) {
  const step = onboardingSteps[stepIndex]
  const selectedValue = answers[step.key]
  const isLastStep = stepIndex === onboardingSteps.length - 1

  function choose(value: string) {
    setAnswers((current) => ({ ...current, [step.key]: value }))
  }

  function next() {
    if (isLastStep) {
      go('catalog')
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
      <TopBar onBack={back} right={`Шаг ${stepIndex + 1}/4`} />
      <div className="onboarding-progress" aria-label={`Шаг ${stepIndex + 1} из 4`}>
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
      {step.options.map(([title, description]) => (
        <button
          className={`option ${selectedValue === title ? 'active' : ''}`}
          key={title}
          onClick={() => choose(title)}
          type="button"
        >
          <span className="radio" />
          <span>
            <strong>{title}</strong>
            <small>{description}</small>
          </span>
        </button>
      ))}
      <div className="selection-summary">
        <strong>Подбор</strong>
        {onboardingSteps.slice(0, stepIndex + 1).map((item) => (
          <span key={item.key}>{answers[item.key]}</span>
        ))}
      </div>
      <button className="cta full" onClick={next} type="button">
        {isLastStep ? 'Показать тренировки' : 'Дальше'}
      </button>
    </section>
  )
}

function CatalogScreen({ go }: { go: (screen: Screen) => void }) {
  return (
    <section className="screen">
      <TopBar title="Каталог" right="⌕" onProfile={() => go('profile')} />
      <h2>Найти по состоянию</h2>
      <p className="lead">
        Тренировки собраны по целям: шея, поясница, кор, мобильность,
        расслабление.
      </p>
      <div className="filter-row">
        <div className="search">
          Поиск по состоянию <span className="soon">скоро</span>
        </div>
        <button className="filter" type="button" aria-label="Фильтры">
          ≡
        </button>
      </div>
      <div className="chips">
        {['Все', '5–10 мин', 'Premium', 'Новичкам'].map((chip, index) => (
          <button className={`chip ${index === 0 ? 'active' : ''}`} key={chip} type="button">
            {chip}
          </button>
        ))}
      </div>
      {workouts.map((workout) => (
        <WorkoutCard
          access={workout.access}
          key={workout.title}
          meta={workout.meta}
          onClick={() => go(workout.target)}
          title={workout.title}
          thumb={workout.thumb}
        />
      ))}
    </section>
  )
}

function WorkoutScreen({
  go,
  showToast,
}: {
  go: (screen: Screen) => void
  showToast: (message: string) => void
}) {
  return (
    <section className="screen">
      <TopBar onBack={() => go('catalog')} right="♡" onProfile={() => showToast('Добавлено в избранное')} />
      <div className="video" />
      <h2 className="compact-title">Мягкая мобилизация грудного отдела</h2>
      <p className="lead">
        Для тех, кто долго сидел и чувствует зажатость в шее, плечах и верхе
        спины.
      </p>
      <div className="facts">
        <Fact value="14" label="мин" />
        <Fact value="0" label="инвентарь" />
        <Fact value="easy" label="уровень" />
      </div>
      <div className="note">
        <b>Осторожно:</b> если есть острая боль, онемение или недавняя травма —
        не идём через усилие.
      </div>
      <button className="cta full" onClick={() => showToast('Тренировка началась')} type="button">
        Начать тренировку
      </button>
      <button className="cta ghost full stacked" onClick={() => go('progress')} type="button">
        Я сделала
      </button>
    </section>
  )
}

function PlansScreen({ go }: { go: (screen: Screen) => void }) {
  return (
    <section className="screen">
      <TopBar title="Планы" right="◇" />
      <h2>Идти по системе</h2>
      <p className="lead">Планы на 5–7 дней помогают не искать случайные упражнения.</p>
      <ProgramCard onClick={() => go('workout')} />
      <WorkoutCard
        access="premium"
        meta={['5 дней']}
        onClick={() => go('paywall')}
        title="Кор без скручиваний"
        thumb="peach"
      />
    </section>
  )
}

function LockedScreen({ go }: { go: (screen: Screen) => void }) {
  return (
    <section className="screen">
      <TopBar onBack={() => go('catalog')} right="🔒" />
      <div className="video muted-video" />
      <h2 className="compact-title">Кор без скручиваний</h2>
      <p className="lead">Premium-тренировка из плана для глубоких мышц корпуса.</p>
      <div className="facts">
        <Fact value="18" label="мин" />
        <Fact value="0" label="инвентарь" />
        <Fact value="easy" label="уровень" />
      </div>
      <div className="paywall small-paywall">
        <div>
          <div className="badge">premium</div>
          <h3>Откройте доступ, чтобы продолжить</h3>
          <p className="lead">Эта тренировка входит в Premium-каталог.</p>
        </div>
        <button className="cta full" onClick={() => go('paywall')} type="button">
          Открыть через Tribute
        </button>
      </div>
    </section>
  )
}

function PaywallScreen({ go }: { go: (screen: Screen) => void }) {
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
          {[
            '3 мини-плана на 5–7 дней',
            'Premium-каталог тренировок',
            'Избранное, история и отметка “Я сделала”',
          ].map((feature) => (
            <div className="feature" key={feature}>
              <span className="check">✓</span>
              <span>{feature}</span>
            </div>
          ))}
        </div>
        <div>
          <p className="price-note">500 ₽ в месяц. Продление и отмена — в Tribute.</p>
          <button className="cta full" onClick={() => go('success')} type="button">
            Открыть за 500 ₽/мес
          </button>
          <button className="cta secondary full stacked" onClick={() => go('catalog')} type="button">
            Продолжить бесплатно
          </button>
        </div>
      </div>
    </section>
  )
}

function SuccessScreen({ go }: { go: (screen: Screen) => void }) {
  return (
    <section className="screen">
      <TopBar title="Доступ" right="✓" />
      <div className="success">
        <div className="success-icon">✓</div>
        <h2 className="compact-title">Доступ открыт</h2>
        <p className="lead">
          Premium-планы и тренировки уже доступны. Начните с мягкого маршрута на
          7 дней.
        </p>
      </div>
      <div className="section-title">
        <h3>С чего начать</h3>
        <small>рекомендация</small>
      </div>
      <ProgramCard onClick={() => go('plans')} />
    </section>
  )
}

function ProgressScreen({ showToast }: { showToast: (message: string) => void }) {
  return (
    <section className="screen">
      <TopBar title="Прогресс" right="↗" />
      <div className="hero">
        <div className="badge">эта неделя</div>
        <h2>Даже 10 минут считаются</h2>
        <p>Прогресс поддерживает регулярность, но не наказывает за пропуски.</p>
      </div>
      <div className="stats">
        <Stat value="4" label="тренировки" />
        <Stat value="62" label="минуты" />
        <Stat value="3" label="дня подряд" />
        <Stat value="3/7" label="план" />
      </div>
      <button className="cta lime full" onClick={() => showToast('Уже отмечено')} type="button">
        Я сделала тренировку
      </button>
    </section>
  )
}

function ProfileScreen({ go }: { go: (screen: Screen) => void }) {
  return (
    <section className="screen">
      <TopBar title="Профиль" onBack={() => go('home')} right="К" />
      <div className="profile-card">
        <h3>Катя</h3>
        <p className="lead">Telegram ID связан</p>
      </div>
      <div className="program">
        <div className="badge">Premium активен</div>
        <h3>Подписка через Tribute</h3>
        <p className="lead profile-lead">
          Доступ открыт до 18 июля. Продление управляется в Tribute.
        </p>
        <button className="cta lime full" type="button">
          Управлять подпиской
        </button>
      </div>
      <button className="cta secondary full" onClick={() => go('onboarding')} type="button">
        Изменить подбор
      </button>
    </section>
  )
}

function WorkoutCard({
  title,
  access,
  meta,
  thumb,
  onClick,
}: {
  title: string
  access: string
  meta: string[]
  thumb?: string
  onClick: () => void
}) {
  return (
    <button className="workout-card" onClick={onClick} type="button">
      <span className={`thumb ${thumb ?? ''}`} />
      <span className="workout-body">
        <strong>{title}</strong>
        <span className="meta">
          <span className={`pill ${access === 'premium' ? 'premium' : 'free'}`}>{access}</span>
          {meta.map((item) => (
            <span className="pill" key={item}>
              {item}
            </span>
          ))}
        </span>
        <small>{access === 'premium' ? 'Открыть →' : 'Начать →'}</small>
      </span>
    </button>
  )
}

function ProgramCard({ onClick }: { onClick: () => void }) {
  return (
    <button className="program" onClick={onClick} type="button">
      <h3>7 дней для спины и осанки</h3>
      <div className="progress">
        <span style={{ width: '43%' }} />
      </div>
      <p className="program-note">Сегодня: грудной отдел + дыхание</p>
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
