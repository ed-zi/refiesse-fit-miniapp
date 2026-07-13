import * as Sentry from '@sentry/react'

/**
 * Инициализация Sentry во фронте (S4-2).
 *
 * Строго опционально: без VITE_SENTRY_DSN — полный no-op (ничего не грузится,
 * наружу ничего не уходит). Dev/preview работают без Sentry и не требуют DSN.
 *
 * initData/JWT в теле ошибок не участвуют; sendDefaultPii оставляем false,
 * чтобы не собирать лишние персональные данные.
 */
export function initSentry(): boolean {
  const dsn = String(import.meta.env.VITE_SENTRY_DSN ?? '').trim()
  if (dsn === '') {
    return false
  }
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  })
  return true
}

export { Sentry }
