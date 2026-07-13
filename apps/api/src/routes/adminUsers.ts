import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getAccessStatus } from '../access.ts';
import { makeRequireAdmin } from '../adminAuth.ts';
import { AppError } from '../errors.ts';
import type { Prisma, User } from '../generated/prisma/client.ts';

/** Admin: пользователи и их доступ (S3-4 п.4). */

const searchQuerySchema = z.object({
  query: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().max(50).default(50),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

/** BigInt telegramUserId → number для JSON (как в /me). */
function adminUserDto(user: User) {
  return {
    id: user.id,
    telegramUserId: Number(user.telegramUserId),
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    languageCode: user.languageCode,
    isAdmin: user.isAdmin,
    onboarding: user.onboarding ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export function registerAdminUserRoutes(app: FastifyInstance): void {
  const requireAdmin = makeRequireAdmin(app);
  const adminOpts = { preHandler: requireAdmin };

  /**
   * GET /admin/users?query= — поиск по telegramUserId (точно) или
   * username/имени (подстрока, без регистра). Без query — последние 50.
   */
  app.get('/admin/users', adminOpts, async (request) => {
    const { query, limit } = searchQuerySchema.parse(request.query ?? {});

    let where: Prisma.UserWhereInput = {};
    if (query !== undefined && query.length > 0) {
      const or: Prisma.UserWhereInput[] = [
        { username: { contains: query, mode: 'insensitive' } },
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
      ];
      if (/^\d+$/.test(query)) {
        or.push({ telegramUserId: BigInt(query) });
      }
      where = { OR: or };
    }

    const users = await app.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const items = await Promise.all(
      users.map(async (user) => ({
        ...adminUserDto(user),
        access: await getAccessStatus(app.prisma, user.id),
      })),
    );
    return { items };
  });

  /** GET /admin/users/:id — профиль + подписка + последние 10 ProgressEntry. */
  app.get('/admin/users/:id', adminOpts, async (request) => {
    const { id } = idParamsSchema.parse(request.params);

    const user = await app.prisma.user.findUnique({
      where: { id },
      include: {
        subscription: true,
        progressEntries: {
          orderBy: { completedAt: 'desc' },
          take: 10,
          include: { workout: { select: { slug: true, title: true } } },
        },
      },
    });
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'User not found');
    }

    return {
      user: adminUserDto(user),
      access: await getAccessStatus(app.prisma, user.id),
      subscription: user.subscription
        ? {
            status: user.subscription.status,
            expiresAt: user.subscription.expiresAt?.toISOString() ?? null,
            tributeSubscriptionId: user.subscription.tributeSubscriptionId,
            startedAt: user.subscription.startedAt?.toISOString() ?? null,
            cancelledAt: user.subscription.cancelledAt?.toISOString() ?? null,
          }
        : null,
      progressEntries: user.progressEntries.map((entry) => ({
        workoutSlug: entry.workout.slug,
        workoutTitle: entry.workout.title,
        completedAt: entry.completedAt.toISOString(),
        durationMin: entry.durationMin,
      })),
    };
  });
}
