/**
 * Модель маршрутов навигации (декомпозирована из App).
 *
 * Экран — узел. Часть экранов — «вкладки» (breadth, корни нижней навигации),
 * остальные — «глубина» (depth, кладутся в стек поверх текущей вкладки).
 * Единый источник правды и для сервиса навигации, и для UI (нижняя навигация,
 * системная кнопка «назад»).
 */

/** Все экраны приложения. */
export type Screen =
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

/** Вкладки нижней навигации — корни «вширь». Порядок = порядок в баре. */
export const TABS = ['home', 'catalog', 'plans', 'progress'] as const
export type Tab = (typeof TABS)[number]

/** Экран по умолчанию при старте (корень стека). */
export const DEFAULT_SCREEN: Screen = 'home'

/** Является ли экран вкладкой (корнем «вширь»). */
export function isTab(screen: Screen): screen is Tab {
  return (TABS as readonly Screen[]).includes(screen)
}

/** Параметры маршрута (например, slug выбранной тренировки). Свободная форма. */
export type NavParams = Record<string, unknown>

/** Один узел стека навигации. */
export interface NavEntry {
  screen: Screen
  params?: NavParams
}
