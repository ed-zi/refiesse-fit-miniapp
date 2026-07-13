// Интеграция с Telegram Mini Apps SDK (S1-1).
//
// Главное правило: приложение обязано работать и в обычном браузере —
// десктоп-прототип с левой панелью остаётся основным способом ревью.
// Поэтому: определяем «мы в Telegram» по наличию launch params (isTMA),
// всю инициализацию держим в try/catch и вне Telegram не делаем ничего
// (и не шумим ошибками в консоль).

import {
  bindThemeParamsCssVars,
  bindViewportCssVars,
  expandViewport,
  init,
  isTMA,
  mountThemeParamsSync,
  mountViewport,
  openLink,
  openTelegramLink,
  retrieveRawInitData,
} from '@telegram-apps/sdk-react'

/** true, если приложение запущено внутри Telegram (launch params доступны). */
export function isTelegramEnv(): boolean {
  try {
    return isTMA()
  } catch {
    return false
  }
}

/**
 * Инициализация SDK. Вызывается один раз до рендера (см. main.tsx).
 * В обычном браузере — no-op, приложение продолжает работать как прототип.
 */
export function initTelegram(): void {
  if (!isTelegramEnv()) {
    return
  }

  try {
    init()

    // Тема Telegram → CSS-переменные (--tg-theme-*), если доступно.
    if (mountThemeParamsSync.isAvailable()) {
      mountThemeParamsSync()
      if (bindThemeParamsCssVars.isAvailable()) {
        bindThemeParamsCssVars()
      }
    }

    // Viewport: разворачиваем на полную высоту и пробрасываем CSS-переменные
    // (--tg-viewport-height, --tg-viewport-safe-area-inset-* и т.д.).
    // Safe area снизу учитывается в .bottom-nav (App.css) с fallback 0px.
    if (mountViewport.isAvailable()) {
      void mountViewport()
        .then(() => {
          if (expandViewport.isAvailable()) {
            expandViewport()
          }
          if (bindViewportCssVars.isAvailable()) {
            bindViewportCssVars()
          }
        })
        .catch((error: unknown) => {
          console.warn('[telegram] не удалось смонтировать viewport', error)
        })
    }
  } catch (error) {
    console.warn('[telegram] инициализация SDK не удалась', error)
  }
}

/**
 * Сырая строка initData для будущей авторизации на бэкенде (S1-3).
 * Вне Telegram (или если данных нет) возвращает null.
 */
export function getInitDataRaw(): string | null {
  if (!isTelegramEnv()) {
    return null
  }
  try {
    return retrieveRawInitData() ?? null
  } catch {
    return null
  }
}

/**
 * Открывает внешнюю ссылку (например, оплату Tribute).
 * Внутри Telegram — через SDK (openTelegramLink для t.me, иначе openLink),
 * в обычном браузере — window.open. Ошибки SDK не роняют приложение.
 */
export function openExternalLink(url: string): void {
  if (isTelegramEnv()) {
    try {
      if (/^https:\/\/t\.me\//i.test(url) && openTelegramLink.isAvailable()) {
        openTelegramLink(url)
        return
      }
      if (openLink.isAvailable()) {
        openLink(url)
        return
      }
    } catch (error) {
      console.warn('[telegram] не удалось открыть ссылку через SDK', error)
    }
  }
  window.open(url, '_blank', 'noopener')
}
