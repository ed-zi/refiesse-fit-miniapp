/**
 * Загрузчик встроенного виджета оплаты ЮKassa (checkout-widget).
 *
 * Виджет позволяет принять оплату ПРЯМО в мини-аппе по confirmation_token
 * (confirmation.type=embedded), без ухода в браузер. Скрипт грузим один раз,
 * лениво — только когда пользователь реально идёт платить.
 *
 * Docs: https://yookassa.ru/developers/payment-acceptance/integration-scenarios/widget/basics
 */

const WIDGET_SRC = 'https://yookassa.ru/checkout-widget/v1/checkout-widget.js'

/** Минимальный тип конструктора виджета (SDK без типов). */
export interface YooKassaCheckout {
  render(elementIdOrEl: string | HTMLElement): Promise<void>
  on(event: 'success' | 'fail' | 'complete' | 'modal_close', cb: () => void): void
  destroy(): void
}

export interface YooKassaCheckoutOptions {
  confirmation_token: string
  return_url?: string
  error_callback?: (error: unknown) => void
  customization?: Record<string, unknown>
}

type WidgetCtor = new (options: YooKassaCheckoutOptions) => YooKassaCheckout

interface WidgetWindow extends Window {
  YooMoneyCheckoutWidget?: WidgetCtor
}

let loadPromise: Promise<WidgetCtor> | null = null

/**
 * Грузит скрипт виджета и резолвит конструктор YooMoneyCheckoutWidget.
 * Повторные вызовы переиспользуют один промис. timeoutMs — защита от зависания.
 */
export function loadYooKassaWidget(timeoutMs = 12000): Promise<WidgetCtor> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('no window'))
  }
  const w = window as WidgetWindow
  if (w.YooMoneyCheckoutWidget) {
    return Promise.resolve(w.YooMoneyCheckoutWidget)
  }
  if (loadPromise) {
    return loadPromise
  }

  loadPromise = new Promise<WidgetCtor>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      loadPromise = null
      reject(new Error('yookassa widget load timeout'))
    }, timeoutMs)

    const finish = () => {
      const ctor = (window as WidgetWindow).YooMoneyCheckoutWidget
      if (ctor) {
        window.clearTimeout(timer)
        resolve(ctor)
      } else {
        window.clearTimeout(timer)
        loadPromise = null
        reject(new Error('yookassa widget not available after load'))
      }
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${WIDGET_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', finish, { once: true })
      existing.addEventListener('error', () => {
        window.clearTimeout(timer)
        loadPromise = null
        reject(new Error('yookassa widget script error'))
      }, { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = WIDGET_SRC
    script.async = true
    script.addEventListener('load', finish, { once: true })
    script.addEventListener('error', () => {
      window.clearTimeout(timer)
      loadPromise = null
      reject(new Error('yookassa widget script error'))
    }, { once: true })
    document.head.appendChild(script)
  })

  return loadPromise
}
