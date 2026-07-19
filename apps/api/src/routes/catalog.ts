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
import { GOAL_TO_CATEGORY_SLUG } from '../recommend.ts';
import { parseOnboarding } from './me.ts';
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

/** Номер дня в году (UTC, 1..366) — ключ детерминированной ротации. */
function utcDayOfYear(now: Date): number {
  const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 1);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - startOfYear) / 86_400_000) + 1;
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

    const [categories, workouts, unlocked] = await Promise.all([
      app.prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
      app.prisma.workout.findMany({
        where,
        include: { category: true },
        orderBy: [{ durationMin: 'asc' }, { slug: 'asc' }],
      }),
      hasAccess(app.prisma, request.user.userId),
    ]);

    return {
      categories: categories.map(toCategoryDto),
      workouts: workouts.map((workout) => toWorkoutCardDto(workout, { unlocked })),
    };
  });

  /**
   * GET /workouts/day — «тренировка дня». Только free-контент.
   * Если у юзера сохранён onboarding.goal — предпочитаем free-тренировку из
   * соответствующей категории; иначе (или если в категории нет free) —
   * ротация по всем free по дню года. Детерминированно в рамках UTC-дня.
   * Зарегистрирован ДО /workouts/:slug, чтобы не перехватывался параметром.
   */
  app.get(
    '/workouts/day',
    { preHandler: authenticate },
    async (request): Promise<{ workout: WorkoutDetailDto }> => {
      const freeWorkouts = await app.prisma.workout.findMany({
        where: { isPublished: true, access: 'free' },
        include: { category: true },
        orderBy: { slug: 'asc' },
      });
      if (freeWorkouts.length === 0) {
        throw new AppError(404, 'NOT_FOUND', 'No free workouts available');
      }

      const user = await app.prisma.user.findUnique({
        where: { id: request.user.userId },
        select: { onboarding: true },
      });
      const goal = parseOnboarding(user?.onboarding)?.goal;
      const preferredCategory = goal !== undefined ? GOAL_TO_CATEGORY_SLUG[goal] : undefined;

      let pool = freeWorkouts;
      if (preferredCategory !== undefined) {
        const matching = freeWorkouts.filter((w) => w.category.slug === preferredCategory);
        if (matching.length > 0) {
          pool = matching;
        }
      }

      const workout = pool[utcDayOfYear(new Date()) % pool.length];
      if (!workout) {
        throw new AppError(404, 'NOT_FOUND', 'No free workouts available');
      }

      // Пул состоит только из free — видео отдаём всегда.
      return { workout: toWorkoutDetailDto(workout, { includeVideo: true }) };
    },
  );

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
