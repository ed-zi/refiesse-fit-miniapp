import type { PrismaClient } from './generated/prisma/client.ts';
import type { AccessStatus } from './types.ts';

/**
 * Единственный источник истины о premium-доступе пользователя (architecture.md §4).
 * Все места, где решается «отдавать ли premium-контент», обязаны звать эту функцию.
 *
 * TODO(S3-1): реальная проверка по Subscription:
 *   доступ есть ⟺ subscription.status === 'active' && subscription.expiresAt > now().
 * Пока подписок нет — доступ всегда false (premium-контент закрыт для всех).
 */
export async function hasAccess(_prisma: PrismaClient, _userId: string): Promise<boolean> {
  return false;
}

/**
 * Статус доступа для GET /me (shared AccessStatus).
 * TODO(S3-1): считать из Subscription (status/expiresAt), а не заглушкой.
 */
export async function getAccessStatus(
  _prisma: PrismaClient,
  _userId: string,
): Promise<AccessStatus> {
  return { isPremium: false, status: 'none', expiresAt: null };
}
