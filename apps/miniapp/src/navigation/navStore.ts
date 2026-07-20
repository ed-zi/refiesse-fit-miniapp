/**
 * Сервис навигации — фреймворк-независимый observable-стор поверх стека
 * маршрутов. Одна модель описывает обе оси движения:
 *   • «вширь» (breadth) — selectTab: переключение вкладки сбрасывает стек к её
 *     корню (у Telegram Mini App одна системная кнопка «назад» → один стек, это
 *     корректная модель: вкладки — верхний уровень, между ними ходим латерально);
 *   • «вглубь» (depth)  — push/pop: экран кладётся поверх и снимается «назад».
 *
 * Стор ничего не знает про React и Telegram — его переиспользуют и хук
 * useNavigation (UI), и биндинг системной кнопки «назад» (useSystemBackButton),
 * и тесты. UI-побочки (скролл, аналитика) живут снаружи, через subscribe.
 */

import { DEFAULT_SCREEN, isTab, type NavEntry, type NavParams, type Screen } from './routes'

export interface NavState {
  /** Стек маршрутов: [0] — корень «вширь», далее — «вглубь». Последний — текущий. */
  stack: NavEntry[]
}

export interface NavStore {
  getState(): NavState
  subscribe(listener: () => void): () => void
  /** «Вглубь»: положить экран поверх. Экран-вкладка вместо этого делает selectTab. */
  push(screen: Screen, params?: NavParams): void
  /** «Назад»: снять верхний экран (no-op в корне). */
  pop(): void
  /** Заменить верхний экран (переход без следа: онбординг → подборка). */
  replace(screen: Screen, params?: NavParams): void
  /** «Вширь»: переключить вкладку — стек сбрасывается к её корню. */
  selectTab(tab: Screen): void
  /** Полный сброс стека к одному экрану. */
  reset(screen: Screen, params?: NavParams): void
}

/** Текущий (верхний) маршрут стека. */
export function currentEntry(state: NavState): NavEntry {
  return state.stack[state.stack.length - 1] ?? { screen: DEFAULT_SCREEN }
}

/** Можно ли идти «назад» (в стеке больше одного экрана). */
export function canGoBack(state: NavState): boolean {
  return state.stack.length > 1
}

/** Поверхностное сравнение параметров — чтобы не дублировать один и тот же узел. */
function sameParams(a: NavParams | undefined, b: NavParams | undefined): boolean {
  if (a === b) {
    return true
  }
  if (a === undefined || b === undefined) {
    return false
  }
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  return keysA.length === keysB.length && keysA.every((key) => a[key] === b[key])
}

export function createNavStore(initial: Screen = DEFAULT_SCREEN): NavStore {
  let state: NavState = { stack: [{ screen: initial }] }
  const listeners = new Set<() => void>()

  const set = (stack: NavEntry[]): void => {
    state = { stack }
    for (const listener of listeners) {
      listener()
    }
  }

  const selectTab = (tab: Screen): void => {
    const top = currentEntry(state)
    // Уже на корне этой вкладки — ничего не делаем; иначе сбрасываем стек к корню
    // (в т.ч. «схлопываем глубину», если были внутри тренировки этой вкладки).
    if (top.screen === tab && state.stack.length === 1) {
      return
    }
    set([{ screen: tab }])
  }

  const push = (screen: Screen, params?: NavParams): void => {
    if (isTab(screen)) {
      selectTab(screen)
      return
    }
    const top = currentEntry(state)
    if (top.screen === screen && sameParams(top.params, params)) {
      return
    }
    set([...state.stack, { screen, params }])
  }

  const pop = (): void => {
    if (state.stack.length <= 1) {
      return
    }
    set(state.stack.slice(0, -1))
  }

  const replace = (screen: Screen, params?: NavParams): void => {
    set([...state.stack.slice(0, -1), { screen, params }])
  }

  const reset = (screen: Screen, params?: NavParams): void => {
    set([{ screen, params }])
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    push,
    pop,
    replace,
    selectTab,
    reset,
  }
}
