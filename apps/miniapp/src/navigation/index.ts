/**
 * Сервис навигации Refiesse Fit — единая точка входа.
 *
 * Слои (переиспользуемые по отдельности):
 *   routes            — модель экранов/вкладок (что вширь, что вглубь);
 *   navStore          — фреймворк-независимый стор стека (push/pop/selectTab);
 *   useNavigation     — React-хук поверх синглтон-стора;
 *   useSystemBackButton — биндинг к системной кнопке «назад» Telegram.
 */

export {
  DEFAULT_SCREEN,
  TABS,
  isTab,
  type NavEntry,
  type NavParams,
  type Screen,
  type Tab,
} from './routes'
export {
  canGoBack,
  createNavStore,
  currentEntry,
  type NavState,
  type NavStore,
} from './navStore'
export { navigationStore, useNavigation, type Navigation } from './useNavigation'
export { useSystemBackButton } from './useSystemBackButton'
