import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../auth.ts';
import { AppError } from '../errors.ts';
import type { PrismaClient } from '../generated/prisma/client.ts';

const favoriteBodySchema = z.object({
  workoutSlug: z.string().min(1),
});

/** Slugs избранного пользователя (стабильный порядок — по времени добавления). */
async function favoriteSlugs(prisma: PrismaClient, userId: string): Promise<string[]> {
  const favorites = await prisma.favorite.findMany({
    where: { userId },
    include: { workout: { select: { slug: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return favorites.map((favorite) => favorite.workout.slug);
}

export function registerFavoriteRoutes(app: FastifyInstance): void {
  /** POST /favorites — toggle по workoutSlug → { favorited, slugs }. */
  app.post(
    '/favorites',
    { preHandler: authenticate },
    async (request): Promise<{ favorited: boolean; slugs: string[] }> => {
      const { workoutSlug } = favoriteBodySchema.parse(request.body ?? {});
      const userId = request.user.userId;

      const workout = await app.prisma.workout.findFirst({
        where: { slug: workoutSlug, isPublished: true },
      });
      if (!workout) {
        throw new AppError(404, 'NOT_FOUND', `Workout "${workoutSlug}" not found`);
      }

      const existing = await app.prisma.favorite.findUnique({
        where: { userId_workoutId: { userId, workoutId: workout.id } },
      });

      let favorited: boolean;
      if (existing) {
        await app.prisma.favorite.delete({ where: { id: existing.id } });
        favorited = false;
      } else {
        await app.prisma.favorite.create({ data: { userId, workoutId: workout.id } });
        favorited = true;
      }

      return { favorited, slugs: await favoriteSlugs(app.prisma, userId) };
    },
  );

  /** GET /favorites → { slugs }. */
  app.get(
    '/favorites',
    { preHandler: authenticate },
    async (request): Promise<{ slugs: string[] }> => {
      return { slugs: await favoriteSlugs(app.prisma, request.user.userId) };
    },
  );
}
