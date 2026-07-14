import type { PaymentProvider, PrismaClient } from '../generated/prisma/client.ts';

/**
 * Общая логика открытия/продления premium-доступа (P1).
 * Зовётся из Tribute (applyEvent) и ЮKassa (webhook, recurring), чтобы
 * «открытие доступа» жило в одном месте.
 *
 * hasAccess/getAccessStatus (src/access.ts) — источник истины по чтению
 * доступа; здесь только запись состояния Subscription.
 */

export const SUBSCRIPTION_PERIOD_DAYS = 30;

/**
 * expiresAt при продлении: от большего из (now, текущий expiresAt) + days.
 * Продление активной подписки не «съедает» остаток оплаченного периода.
 */
export function computeExtendedExpiry(current: Date | null, days: number, now: Date): Date {
  const base = current !== null && current.getTime() > now.getTime() ? current : now;
  return new Date(base.getTime() + days * 86_400_000);
}

export interface ActivateSubscriptionOptions {
  expiresAt: Date;
  provider: PaymentProvider;
  /** ЮKassa: сохранённый способ оплаты для recurring. */
  paymentMethodId?: string | null;
  /** Tribute: id подписки на стороне провайдера. */
  tributeSubscriptionId?: string;
}

/**
 * Переводит подписку пользователя в active до expiresAt (upsert).
 * Идемпотентно по эффекту: повторный вызов с тем же expiresAt не меняет
 * итоговое состояние.
 */
export async function activateSubscription(
  prisma: PrismaClient,
  userId: string,
  options: ActivateSubscriptionOptions,
  now: Date = new Date(),
): Promise<void> {
  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      status: 'active',
      expiresAt: options.expiresAt,
      provider: options.provider,
      startedAt: now,
      cancelledAt: null,
      paymentMethodId: options.paymentMethodId ?? null,
      tributeSubscriptionId: options.tributeSubscriptionId ?? null,
    },
    update: {
      status: 'active',
      expiresAt: options.expiresAt,
      provider: options.provider,
      cancelledAt: null,
      // Обновляем provider-специфичные поля только когда переданы, чтобы не
      // затирать уже сохранённые значения при частичном событии.
      ...(options.paymentMethodId !== undefined
        ? { paymentMethodId: options.paymentMethodId }
        : {}),
      ...(options.tributeSubscriptionId !== undefined
        ? { tributeSubscriptionId: options.tributeSubscriptionId }
        : {}),
    },
  });
}
