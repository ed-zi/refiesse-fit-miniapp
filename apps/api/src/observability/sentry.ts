import * as Sentry from '@sentry/node';
import type { AppConfig } from '../config.ts';

/**
 * Инициализация Sentry (S4-2).
 *
 * Строго опционально: если SENTRY_DSN не задан — полный no-op. Ничего не
 * инициализируется, `captureException` тихо игнорирует вызовы, наружу не
 * уходит ни одного запроса. Это гарантирует, что dev/test/CI работают без
 * Sentry и не требуют DSN (тесты buildApp() без DSN → Sentry выключен).
 *
 * Приватность (release-checklist / architecture §4): sendDefaultPii=false —
 * не прикрепляем заголовки/куки/тело запроса, чтобы в Sentry не утекли
 * initData, JWT, trbt-signature, admin-token или payload оплаты.
 */

let enabled = false;

export function initSentry(config: AppConfig): boolean {
  if (enabled) {
    return true;
  }
  if (config.sentryDsn === undefined) {
    return false;
  }
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.nodeEnv,
    // Не собираем PII: никакой персональной/секретной нагрузки из запросов.
    sendDefaultPii: false,
    // Мониторим ошибки, не трейсим перформанс (можно включить позже).
    tracesSampleRate: 0,
  });
  enabled = true;
  return true;
}

/** true ⟺ Sentry инициализирован (DSN задан). */
export function isSentryEnabled(): boolean {
  return enabled;
}

/**
 * Отправляет исключение в Sentry, если он включён; иначе no-op.
 * Никогда не бросает — мониторинг не должен ломать обработку запроса.
 */
export function captureException(error: unknown): void {
  if (!enabled) {
    return;
  }
  try {
    Sentry.captureException(error);
  } catch {
    // Проглатываем: сбой доставки в Sentry не должен влиять на ответ клиенту.
  }
}

/** Тестовый хук: сбрасывает состояние (для изоляции между тест-файлами). */
export function resetSentryForTests(): void {
  enabled = false;
}
