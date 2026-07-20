/**
 * Синхронизация стека навигации с системной кнопкой «назад» Telegram.
 *
 * Когда в стеке есть куда возвращаться (canGoBack), показываем нативную кнопку
 * «назад» в шапке Telegram и вешаем на неё onBack — то же поведение даёт
 * свайп-назад. Когда мы в корне вкладки — прячем её. Вне Telegram (обычный
 * браузер / прототип) — полный no-op: там работает экранная кнопка «назад».
 *
 * Всё в try/catch и за .isAvailable(): на старых клиентах компонент может быть
 * не поддержан, и это не должно ронять приложение.
 */

import { useEffect } from 'react'
import {
  hideBackButton,
  mountBackButton,
  onBackButtonClick,
  showBackButton,
} from '@telegram-apps/sdk-react'
import { isTelegramEnv } from '../telegram'

export function useSystemBackButton(canGoBack: boolean, onBack: () => void): void {
  // Монтируем компонент один раз за жизнь приложения.
  useEffect(() => {
    if (!isTelegramEnv()) {
      return
    }
    try {
      if (mountBackButton.isAvailable()) {
        mountBackButton()
      }
    } catch {
      // Компонент не поддержан клиентом — тихо игнорируем.
    }
  }, [])

  // Показ/скрытие и подписка на нажатие под текущий canGoBack.
  useEffect(() => {
    if (!isTelegramEnv()) {
      return
    }
    let off: (() => void) | undefined
    try {
      if (canGoBack) {
        if (showBackButton.isAvailable()) {
          showBackButton()
        }
        if (onBackButtonClick.isAvailable()) {
          off = onBackButtonClick(onBack)
        }
      } else if (hideBackButton.isAvailable()) {
        hideBackButton()
      }
    } catch {
      // Тихо: навигация продолжит работать через экранные кнопки.
    }
    return () => {
      try {
        off?.()
      } catch {
        // Тихо.
      }
    }
  }, [canGoBack, onBack])
}
