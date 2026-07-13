import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getAccessStatus } from '../access.ts';
import { AppError } from '../errors.ts';
import type { AccessStatus } from '../types.ts';
import type { User } from '../generated/prisma/client.ts';

/**
 * Ручные grant/revoke для поддержки — ДО полной админки (S3-1 п.4).
 * Защита: header x-admin-token === env ADMIN_TOKEN.
 * ADMIN_TOKEN не задан → роуты отключены (503 ADMIN_DISABLED).
 */

const grantBodySchema = z.object({
  telegramUserId: z.coerce.number().int().positive(),
  days: z.coerce.number().int().positive().max(3650),
});

const revokeBodySchema = z.object({
  telegramUserId: z.coerce.number().int().positive(),
});

/** Сравнение токенов за постоянное время (не палим длину/префикс тайм-атакой). */
function tokenMatches(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
}

async function findUserByTelegramId(
  app: FastifyInstance,
  telegramUserId: number,
): Promise<User> {
  const user = await app.prisma.user.findUnique({
    where: { telegramUserId: BigInt(telegramUserId) },
  });
  if (!user) {
    throw new AppError(404, 'NOT_FOUND', `User with telegramUserId ${telegramUserId} not found`);
  }
  return user;
}

export function registerAdminRoutes(app: FastifyInstance): void {
  const requireAdmin = async (request: FastifyRequest): Promise<void> => {
    const adminToken = app.config.adminToken;
    if (adminToken === undefined) {
      throw new AppError(503, 'ADMIN_DISABLED', 'ADMIN_TOKEN is not configured');
    }
    const provided = request.headers['x-admin-token'];
    if (typeof provided !== 'string' || !tokenMatches(provided, adminToken)) {
      throw new AppError(403, 'FORBIDDEN', 'Invalid admin token');
    }
  };

  /**
   * POST /admin/access/grant { telegramUserId, days } —
   * создаёт/продлевает подписку: expiresAt = max(now, текущий expiresAt) + days.
   */
  app.post(
    '/admin/access/grant',
    { preHandler: requireAdmin },
    async (request): Promise<{ access: AccessStatus }> => {
      const { telegramUserId, days } = grantBodySchema.parse(request.body ?? {});
      const user = await findUserByTelegramId(app, telegramUserId);

      const now = new Date();
      const existing = await app.prisma.subscription.findUnique({
        where: { userId: user.id },
      });
      const base =
        existing?.expiresAt !== null &&
        existing?.expiresAt !== undefined &&
        existing.expiresAt.getTime() > now.getTime()
          ? existing.expiresAt
          : now;
      const expiresAt = new Date(base.getTime() + days * 86_400_000);

      await app.prisma.subscription.upsert({
        where: { userId: user.id },
        create: { userId: user.id, status: 'active', expiresAt, startedAt: now },
        update: { status: 'active', expiresAt, cancelledAt: null },
      });

      request.log.info(
        { telegramUserId, days, expiresAt: expiresAt.toISOString() },
        'admin access grant',
      );
      return { access: await getAccessStatus(app.prisma, user.id) };
    },
  );

  /** POST /admin/access/revoke { telegramUserId } — немедленно закрывает доступ. */
  app.post(
    '/admin/access/revoke',
    { preHandler: requireAdmin },
    async (request): Promise<{ access: AccessStatus }> => {
      const { telegramUserId } = revokeBodySchema.parse(request.body ?? {});
      const user = await findUserByTelegramId(app, telegramUserId);

      const now = new Date();
      const existing = await app.prisma.subscription.findUnique({
        where: { userId: user.id },
      });
      if (existing) {
        await app.prisma.subscription.update({
          where: { userId: user.id },
          data: { status: 'expired', expiresAt: now, cancelledAt: now },
        });
      }

      request.log.info({ telegramUserId }, 'admin access revoke');
      return { access: await getAccessStatus(app.prisma, user.id) };
    },
  );
}
