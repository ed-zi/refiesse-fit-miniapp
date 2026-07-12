import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hasAccess } from '../access.ts';
import { authenticate } from '../auth.ts';
import { AppError } from '../errors.ts';
import {
  toCategoryDto,
  toWorkoutCardDto,
  toWorkoutDetailDto,
  type CategoryDto,
  type WorkoutCardDto,
  type WorkoutDetailDto,
} from '../mappers.ts';
import type { Prisma } from '../generated/prisma/client.ts';

const catalogQuerySchema = z.object({
  /** Slug категории (Category.slug). */
  category: z.string().min(1).optional(),
  /** Максимальная длительность в минутах. */
  maxDuration: z.coerce.number().int().positive().optional(),
  /** true → только premium, false → только free. */
  premium: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  level: z.enum(['beginner', 'medium', 'advanced']).optional(),
});

const workoutParamsSchema = z.object({
  slug: z.string().min(1),
});

interface CatalogResponse {
  categories: CategoryDto[];
  workouts: WorkoutCardDto[];
}

export function registerCatalogRoutes(app: FastifyInstance): void {
  /**
   * GET /catalog — категории + карточки тренировок с фильтрами.
   * В списке videoUrl не отдаётся никому (он только в GET /workouts/:slug).
   */
  app.get('/catalog', { preHandler: authenticate }, async (request): Promise<CatalogResponse> => {
    const query = catalogQuerySchema.parse(request.query ?? {});

    const where: Prisma.WorkoutWhereInput = { isPublished: true };
    if (query.category !== undefined) {
      where.category = { slug: query.category };
    }
    if (query.maxDuration !== undefined) {
      where.durationMin = { lte: query.maxDuration };
    }
    if (query.premium !== undefined) {
      where.access = query.premium ? 'premium' : 'free';
    }
    if (query.level !== undefined) {
      where.level = query.level;
    }

    const [categories, workouts] = await Promise.all([
      app.prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
      app.prisma.workout.findMany({
        where,
        include: { category: true },
        orderBy: [{ durationMin: 'asc' }, { slug: 'asc' }],
      }),
    ]);

    return {
      categories: categories.map(toCategoryDto),
      workouts: workouts.map(toWorkoutCardDto),
    };
  });

  /**
   * GET /workouts/:slug — детальная карточка.
   * videoUrl отдаётся только для free-тренировок или при наличии premium-доступа
   * (hasAccess, заглушка до S3-1). Иначе — videoUrl: null, isLocked: true.
   */
  app.get(
    '/workouts/:slug',
    { preHandler: authenticate },
    async (request): Promise<{ workout: WorkoutDetailDto }> => {
      const { slug } = workoutParamsSchema.parse(request.params);

      const workout = await app.prisma.workout.findFirst({
        where: { slug, isPublished: true },
        include: { category: true },
      });
      if (!workout) {
        throw new AppError(404, 'NOT_FOUND', `Workout "${slug}" not found`);
      }

      const includeVideo =
        workout.access === 'free' ||
        (await hasAccess(app.prisma, request.user.userId));

      return { workout: toWorkoutDetailDto(workout, { includeVideo }) };
    },
  );
}
