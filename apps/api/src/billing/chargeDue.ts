import { randomUUID } from 'node:crypto';
import {
  SUBSCRIPTION_PERIOD_DAYS,
  activateSubscription,
  computeExtendedExpiry,
} from './subscription.ts';
import type { PrismaClient } from '../generated/prisma/client.ts';
import type { YookassaApi } from '../yookassa/client.ts';

/**
 * Автосписания (recurring, P1). Чистая функция: находит истекающие active-
 * подписки ЮKassa с сохранённым способом оплаты и списывает через API.
 *
 * НЕ запускается автоматически — только из runCharge.ts за флагом
 * BILLING_AUTOCHARGE_ENABLED и по расписанию (Railway cron; подключает DevOps).
 */

const SUBSCRIPTION_PRICE_RUB = 500;
/** Окно «пора списывать»: подписки, истекающие в ближайшие сутки. */
const DUE_WINDOW_MS = 86_400_000;

export interface ChargeOutcome {
  subscriptionId: string;
  userId: string;
  outcome: 'charged' | 'failed';
  paymentStatus?: string;
  error?: string;
}

export interface ChargeDueResult {
  charged: number;
  failed: number;
  outcomes: ChargeOutcome[];
}

/**
 * Списывает истекающие подписки. При succeeded — продлевает на 30 дней.
 * При неуспехе — НЕ рубит доступ сразу (оставляет для grace), помечает failed.
 * TODO(grace): политика повторных попыток и закрытия доступа после N неудач.
 */
export async function chargeDueSubscriptions(
  prisma: PrismaClient,
  yookassa: YookassaApi,
  now: Date = new Date(),
): Promise<ChargeDueResult> {
  const dueBefore = new Date(now.getTime() + DUE_WINDOW_MS);

  const due = await prisma.subscription.findMany({
    where: {
      status: 'active',
      provider: 'yookassa',
      paymentMethodId: { not: null },
      expiresAt: { not: null, lte: dueBefore },
    },
    include: { user: { select: { telegramUserId: true } } },
  });

  const outcomes: ChargeOutcome[] = [];
  for (const subscription of due) {
    const paymentMethodId = subscription.paymentMethodId;
    if (paymentMethodId === null) {
      continue;
    }
    // Идемпотентный ключ на конкретный период списания (защита от двойного
    // списания при повторном запуске крона в тот же биллинг-период).
    const idempotenceKey = `recurring:${subscription.id}:${subscription.expiresAt?.toISOString() ?? 'na'}`;

    try {
      const payment = await yookassa.createRecurring({
        amountRub: SUBSCRIPTION_PRICE_RUB,
        paymentMethodId,
        telegramUserId: Number(subscription.user.telegramUserId),
        idempotenceKey,
      });

      if (payment.status === 'succeeded') {
        const expiresAt = computeExtendedExpiry(
          subscription.expiresAt,
          SUBSCRIPTION_PERIOD_DAYS,
          now,
        );
        await activateSubscription(
          prisma,
          subscription.userId,
          { expiresAt, provider: 'yookassa', paymentMethodId },
          now,
        );
        outcomes.push({
          subscriptionId: subscription.id,
          userId: subscription.userId,
          outcome: 'charged',
          paymentStatus: payment.status,
        });
      } else {
        // Неуспех/pending — оставляем как есть для grace, не продлеваем.
        outcomes.push({
          subscriptionId: subscription.id,
          userId: subscription.userId,
          outcome: 'failed',
          paymentStatus: payment.status,
        });
      }
    } catch (error) {
      outcomes.push({
        subscriptionId: subscription.id,
        userId: subscription.userId,
        outcome: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    charged: outcomes.filter((o) => o.outcome === 'charged').length,
    failed: outcomes.filter((o) => o.outcome === 'failed').length,
    outcomes,
  };
}

/** Ключ идемпотентности recurring — экспортируем на всякий случай для тестов/логов. */
export function makeRecurringIdempotenceKey(subscriptionId: string, expiresAt: Date | null): string {
  return `recurring:${subscriptionId}:${expiresAt?.toISOString() ?? randomUUID()}`;
}
