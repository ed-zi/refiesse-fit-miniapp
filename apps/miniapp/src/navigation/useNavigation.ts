/**
 * React-обёртка над сервисом навигации. Один общий стор на приложение —
 * навигация это глобальный сервис, а не локальный state экрана. Хук подписывает
 * компонент на стек через useSyncExternalStore.
 */

import { useSyncExternalStore } from 'react'
import {
  canGoBack as canGoBackOf,
  createNavStore,
  currentEntry,
  type NavState,
  type NavStore,
} from './navStore'
import { DEFAULT_SCREEN, type NavEntry, type Screen } from './routes'

// Синглтон-стор: навигация переживает перерендеры и доступна вне React
// (например, биндингу системной кнопки «назад»).
const store = createNavStore(DEFAULT_SCREEN)

export interface Navigation {
  /** Весь стек (для отладки/аналитики). */
  stack: NavEntry[]
  /** Текущий (верхний) маршрут. */
  current: NavEntry
  /** Текущий экран — удобный шорткат current.screen. */
  screen: Screen
  /** Можно ли идти «назад». Управляет видимостью системной кнопки. */
  canGoBack: boolean
  /** «Вглубь» (или переключение вкладки, если это вкладка). */
  navigate: NavStore['push']
  /** «Назад» по стеку. */
  back: NavStore['pop']
  /** Заменить текущий экран без следа. */
  replace: NavStore['replace']
  /** «Вширь»: переключить вкладку. */
  selectTab: NavStore['selectTab']
  /** Полный сброс стека. */
  reset: NavStore['reset']
}

export function useNavigation(): Navigation {
  const state: NavState = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  const current = currentEntry(state)
  return {
    stack: state.stack,
    current,
    screen: current.screen,
    canGoBack: canGoBackOf(state),
    navigate: store.push,
    back: store.pop,
    replace: store.replace,
    selectTab: store.selectTab,
    reset: store.reset,
  }
}

/** Прямой доступ к стору вне React (тесты, императивные хендлеры). */
export const navigationStore = store
