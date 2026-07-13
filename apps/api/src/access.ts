import type { PrismaClient } from './generated/prisma/client.ts';
import type { AccessStatus } from './types.ts';

/**
 * Единственный источник истины о premium-доступе пользователя (architecture.md §4).
 * Все места, где решается «отдавать ли premium-контент», обязаны звать эту функцию.
 *
 * Правила (S3-1, MVP-ТЗ §8):
 *   - status='active'    И expiresAt > now → premium;
 *   - status='cancelled' И expiresAt > now → premium (отмена НЕ рубит доступ
 *     раньше конца оплаченного периода);
 *   - expiresAt <= now (или отсутствует)   → нет доступа, в ответе status='expired';
 *   - подписки никогда не было             → status='none'.
 */
export async function getAccessStatus(
  prisma: PrismaClient,
  userId: string,
  now: Date = new Date(),
): Promise<AccessStatus> {
  const subscription = await prisma.subscription.findUnique({ where: { userId } });
  if (!subscription) {
    return { isPremium: false, status: 'none', expiresAt: null };
  }

  const paidUntil = subscription.expiresAt;
  const periodActive = paidUntil !== null && paidUntil.getTime() > now.getTime();
  const statusGrants = subscription.status === 'active' || subscription.status === 'cancelled';

  if (periodActive && statusGrants) {
    return {
      isPremium: true,
      status: subscription.status,
      expiresAt: paidUntil.toISOString(),
    };
  }

  // Подписка была, но не действует (истекла или отозвана).
  // expiresAt: null — «нет активного периода» (см. комментарий в shared AccessStatus).
  return { isPremium: false, status: 'expired', expiresAt: null };
}

/** true ⟺ у пользователя сейчас есть premium-доступ. */
export async function hasAccess(
  prisma: PrismaClient,
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  return (await getAccessStatus(prisma, userId, now)).isPremium;
}
