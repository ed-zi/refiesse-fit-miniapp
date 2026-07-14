import { z } from 'zod';
import { activateSubscription } from '../billing/subscription.ts';
import type { PrismaClient } from '../generated/prisma/client.ts';

/**
 * Разбор и применение события Tribute к Subscription.
 * Используется и webhook'ом (routes/tribute.ts), и ручным reprocess из
 * админки (routes/adminTribute.ts) — одна логика, один результат.
 *
 * Применение state-setting (status/expiresAt присваиваются из payload,
 * ничего не инкрементируется) — повторное применение того же payload
 * идемпотентно по эффекту.
 */

export const TRIBUTE_EVENT_NAMES = [
  'new_subscription',
  'renewed_subscription',
  'cancelled_subscription',
] as const;

// Защищённый парсинг: реальные поля Tribute могут отличаться/добавляться —
// неизвестные ключи пропускаем (loose), обязательны только name и telegram_user_id.
export const tributeEventSchema = z.looseObject({
  name: z.enum(TRIBUTE_EVENT_NAMES),
  created_at: z.string().optional(),
  sent_at: z.string().optional(),
  payload: z.looseObject({
    subscription_id: z.union([z.string(), z.number()]).optional(),
    telegram_user_id: z.union([z.number().int(), z.string().regex(/^\d+$/)]),
    expires_at: z.string().optional(),
  }),
});

export type TributeEventBody = z.infer<typeof tributeEventSchema>;

/** ISO-строка → Date; отсутствие/мусор → null (не роняем платёжный контур). */
function parseExpiresAt(value: string | undefined): Date | null {
  if (value === undefined) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type ApplyOutcome =
  | { status: 'ok' }
  | { status: 'unmatched'; error: 'UNMATCHED_USER' }
  | { status: 'ignored'; error: 'MISSING_OR_INVALID_EXPIRES_AT' };

/** Применяет распарсенное событие к Subscription пользователя. */
export async function applyTributeEvent(
  prisma: PrismaClient,
  event: TributeEventBody,
  now: Date = new Date(),
): Promise<ApplyOutcome> {
  const telegramUserId = BigInt(event.payload.telegram_user_id);

  const user = await prisma.user.findUnique({ where: { telegramUserId } });
  if (!user) {
    return { status: 'unmatched', error: 'UNMATCHED_USER' };
  }

  const tributeSubscriptionId =
    event.payload.subscription_id !== undefined
      ? String(event.payload.subscription_id)
      : undefined;

  if (event.name === 'cancelled_subscription') {
    // Отмена: статус cancelled, expiresAt НЕ трогаем — доступ до конца периода.
    const existing = await prisma.subscription.findUnique({ where: { userId: user.id } });
    if (existing) {
      await prisma.subscription.update({
        where: { userId: user.id },
        data: {
          status: 'cancelled',
          cancelledAt: now,
          ...(tributeSubscriptionId !== undefined ? { tributeSubscriptionId } : {}),
        },
      });
    } else {
      // Отмена без известной подписки — фиксируем состояние как есть.
      await prisma.subscription.create({
        data: {
          userId: user.id,
          status: 'cancelled',
          expiresAt: parseExpiresAt(event.payload.expires_at),
          cancelledAt: now,
          tributeSubscriptionId: tributeSubscriptionId ?? null,
        },
      });
    }
    return { status: 'ok' };
  }

  // new_subscription / renewed_subscription: активируем до payload.expires_at
  // через общую логику открытия доступа (billing/subscription.ts).
  const expiresAt = parseExpiresAt(event.payload.expires_at);
  if (expiresAt === null) {
    return { status: 'ignored', error: 'MISSING_OR_INVALID_EXPIRES_AT' };
  }
  await activateSubscription(
    prisma,
    user.id,
    {
      expiresAt,
      provider: 'tribute',
      ...(tributeSubscriptionId !== undefined ? { tributeSubscriptionId } : {}),
    },
    now,
  );
  return { status: 'ok' };
}
