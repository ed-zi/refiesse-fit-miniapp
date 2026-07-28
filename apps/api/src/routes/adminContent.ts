import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { makeRequireAdmin } from '../adminAuth.ts';
import { AppError } from '../errors.ts';
import type { Prisma } from '../generated/prisma/client.ts';

/** Шаг иллюстрированной инструкции (STEP): текст + опц. id загруженной картинки. */
const stepInputSchema = z.object({
  text: z.string().min(1),
  imageId: z.string().nullable().optional(),
});

/**
 * Admin CRUD контента (S3-4): workouts / categories / programs.
 * DELETE для workouts сознательно нет — вместо удаления isPublished=false
 * (на тренировки ссылаются ProgressEntry и ProgramDay).
 */

const workoutCreateSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug: латиница-кебаб (a-z, 0-9, дефисы)'),
  title: z.string().min(1),
  goal: z.string().min(1),
  durationMin: z.number().int().positive(),
  level: z.enum(['beginner', 'medium', 'advanced']),
  equipment: z.array(z.string()).default([]),
  zones: z.array(z.string()).default([]),
  place: z.array(z.string()).default([]),
  intensity: z.string().nullable().optional(),
  restrictions: z.array(z.string()).default([]),
  access: z.enum(['free', 'premium']).default('free'),
  videoUrl: z.string().nullable().optional(),
  description: z.string().min(1),
  steps: z.array(stepInputSchema).optional(),
  cautions: z.string().min(1),
  categoryId: z.string().min(1),
  isPublished: z.boolean().default(true),
});

const workoutUpdateSchema = z
  .object({
    title: z.string().min(1),
    goal: z.string().min(1),
    durationMin: z.number().int().positive(),
    level: z.enum(['beginner', 'medium', 'advanced']),
    equipment: z.array(z.string()),
    zones: z.array(z.string()),
    place: z.array(z.string()),
    intensity: z.string().nullable(),
    restrictions: z.array(z.string()),
    access: z.enum(['free', 'premium']),
    videoUrl: z.string().nullable(),
    description: z.string().min(1),
    steps: z.array(stepInputSchema),
    cautions: z.string().min(1),
    categoryId: z.string().min(1),
    isPublished: z.boolean(),
  })
  .partial();

const categoryCreateSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug: латиница-кебаб (a-z, 0-9, дефисы)'),
  title: z.string().min(1),
  emoji: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
});

const categoryUpdateSchema = categoryCreateSchema.partial();

const programCreateSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug: латиница-кебаб (a-z, 0-9, дефисы)'),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  daysTotal: z.number().int().positive(),
  access: z.enum(['free', 'premium']).default('premium'),
  isPublished: z.boolean().default(true),
});

const programUpdateSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().nullable(),
    daysTotal: z.number().int().positive(),
    access: z.enum(['free', 'premium']),
    isPublished: z.boolean(),
  })
  .partial();

const programDaysSchema = z.object({
  days: z
    .array(
      z.object({
        dayIndex: z.number().int().positive(),
        title: z.string().min(1),
        workoutId: z.string().nullable(),
      }),
    )
    .refine(
      (days) => new Set(days.map((d) => d.dayIndex)).size === days.length,
      'dayIndex внутри плана должны быть уникальны',
    ),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

/** P2002 (unique) / P2003 (FK) / P2025 (not found) → понятные ошибки API. */
function mapPrismaError(error: unknown, entity: string): never {
  const code = (error as { code?: unknown }).code;
  if (code === 'P2002') {
    throw new AppError(409, 'CONFLICT', `${entity}: значение уникального поля уже занято (slug?)`);
  }
  if (code === 'P2003') {
    throw new AppError(400, 'VALIDATION_ERROR', `${entity}: ссылка на несуществующую запись`);
  }
  if (code === 'P2025') {
    throw new AppError(404, 'NOT_FOUND', `${entity} not found`);
  }
  throw error as Error;
}

export function registerAdminContentRoutes(app: FastifyInstance): void {
  const requireAdmin = makeRequireAdmin(app);
  const adminOpts = { preHandler: requireAdmin };

  // ---------------------------------------------------------------- workouts

  /** GET /admin/workouts — все, включая неопубликованные. */
  app.get('/admin/workouts', adminOpts, async () => {
    const items = await app.prisma.workout.findMany({
      include: { category: { select: { slug: true, title: true } } },
      orderBy: [{ createdAt: 'asc' }, { slug: 'asc' }],
    });
    return { items };
  });

  /** POST /admin/workouts — создать. */
  app.post('/admin/workouts', adminOpts, async (request, reply) => {
    const data = workoutCreateSchema.parse(request.body ?? {});
    const { steps, ...rest } = data;
    try {
      const workout = await app.prisma.workout.create({
        data: {
          ...rest,
          videoUrl: rest.videoUrl ?? null,
          ...(steps !== undefined ? { steps: steps as unknown as Prisma.InputJsonValue } : {}),
        },
        include: { category: { select: { slug: true, title: true } } },
      });
      request.log.info({ workoutId: workout.id, slug: workout.slug }, 'admin workout created');
      return await reply.status(201).send({ workout });
    } catch (error) {
      mapPrismaError(error, 'Workout');
    }
  });

  /** PUT /admin/workouts/:id — обновить любые поля (slug неизменяем). */
  app.put('/admin/workouts/:id', adminOpts, async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const data = workoutUpdateSchema.parse(request.body ?? {});
    const { steps, ...rest } = data;
    try {
      const workout = await app.prisma.workout.update({
        where: { id },
        data: {
          ...rest,
          ...(steps !== undefined ? { steps: steps as unknown as Prisma.InputJsonValue } : {}),
        },
        include: { category: { select: { slug: true, title: true } } },
      });
      request.log.info({ workoutId: id, fields: Object.keys(data) }, 'admin workout updated');
      return { workout };
    } catch (error) {
      mapPrismaError(error, 'Workout');
    }
  });

  /**
   * DELETE /admin/workouts/:id — реальное удаление с защитой ссылок.
   * Блокируется, если на тренировку ссылаются ProgressEntry / ProgramDay /
   * Favorite (409 WORKOUT_REFERENCED) — вместо удаления снимают с публикации.
   */
  app.delete('/admin/workouts/:id', adminOpts, async (request) => {
    const { id } = idParamsSchema.parse(request.params);

    const workout = await app.prisma.workout.findUnique({ where: { id } });
    if (!workout) {
      throw new AppError(404, 'NOT_FOUND', 'Workout not found');
    }

    const [progressCount, programDayCount, favoriteCount] = await Promise.all([
      app.prisma.progressEntry.count({ where: { workoutId: id } }),
      app.prisma.programDay.count({ where: { workoutId: id } }),
      app.prisma.favorite.count({ where: { workoutId: id } }),
    ]);

    if (progressCount > 0 || programDayCount > 0 || favoriteCount > 0) {
      // Русское склонение: 1 день / 2 дня / 5 дней (и т.п.).
      const plural = (n: number, one: string, few: string, many: string): string => {
        const mod100 = n % 100;
        const mod10 = n % 10;
        if (mod100 >= 11 && mod100 <= 14) return many;
        if (mod10 === 1) return one;
        if (mod10 >= 2 && mod10 <= 4) return few;
        return many;
      };
      const reasons: string[] = [];
      if (progressCount > 0) {
        reasons.push(`${progressCount} ${plural(progressCount, 'выполнение', 'выполнения', 'выполнений')}`);
      }
      if (programDayCount > 0) {
        reasons.push(`входит в ${programDayCount} ${plural(programDayCount, 'день', 'дня', 'дней')} планов`);
      }
      if (favoriteCount > 0) {
        reasons.push(`${favoriteCount} в избранном`);
      }
      throw new AppError(
        409,
        'WORKOUT_REFERENCED',
        `Нельзя удалить: ${reasons.join(', ')}. Снимите с публикации или уберите из плана.`,
      );
    }

    await app.prisma.workout.delete({ where: { id } });
    request.log.info({ workoutId: id, slug: workout.slug }, 'admin workout deleted');
    return { deleted: true };
  });

  // -------------------------------------------------------------- categories

  /** GET /admin/categories. */
  app.get('/admin/categories', adminOpts, async () => {
    const items = await app.prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
    return { items };
  });

  /** POST /admin/categories — создать. */
  app.post('/admin/categories', adminOpts, async (request, reply) => {
    const data = categoryCreateSchema.parse(request.body ?? {});
    try {
      const category = await app.prisma.category.create({ data });
      request.log.info({ categoryId: category.id, slug: category.slug }, 'admin category created');
      return await reply.status(201).send({ category });
    } catch (error) {
      mapPrismaError(error, 'Category');
    }
  });

  /** PUT /admin/categories/:id — slug/title/sortOrder. */
  app.put('/admin/categories/:id', adminOpts, async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const data = categoryUpdateSchema.parse(request.body ?? {});
    try {
      const category = await app.prisma.category.update({ where: { id }, data });
      request.log.info({ categoryId: id, fields: Object.keys(data) }, 'admin category updated');
      return { category };
    } catch (error) {
      mapPrismaError(error, 'Category');
    }
  });

  /**
   * DELETE /admin/categories/:id — удаление только пустой категории.
   * Если в категории есть тренировки → 409 CATEGORY_NOT_EMPTY.
   */
  app.delete('/admin/categories/:id', adminOpts, async (request) => {
    const { id } = idParamsSchema.parse(request.params);

    const category = await app.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new AppError(404, 'NOT_FOUND', 'Category not found');
    }

    const workoutCount = await app.prisma.workout.count({ where: { categoryId: id } });
    if (workoutCount > 0) {
      throw new AppError(
        409,
        'CATEGORY_NOT_EMPTY',
        `Нельзя удалить: в категории ${workoutCount} тренировок. Сначала перенесите или удалите их.`,
      );
    }

    await app.prisma.category.delete({ where: { id } });
    request.log.info({ categoryId: id, slug: category.slug }, 'admin category deleted');
    return { deleted: true };
  });

  // ---------------------------------------------------------------- programs

  /** GET /admin/programs — с днями. */
  app.get('/admin/programs', adminOpts, async () => {
    const items = await app.prisma.program.findMany({
      include: {
        days: {
          orderBy: { dayIndex: 'asc' },
          include: { workout: { select: { id: true, slug: true, title: true } } },
        },
      },
      orderBy: { slug: 'asc' },
    });
    return { items };
  });

  /** POST /admin/programs — создать. */
  app.post('/admin/programs', adminOpts, async (request, reply) => {
    const data = programCreateSchema.parse(request.body ?? {});
    try {
      const program = await app.prisma.program.create({
        data: { ...data, description: data.description ?? null },
        include: { days: true },
      });
      request.log.info({ programId: program.id, slug: program.slug }, 'admin program created');
      return await reply.status(201).send({ program });
    } catch (error) {
      mapPrismaError(error, 'Program');
    }
  });

  /** PUT /admin/programs/:id — title/description/daysTotal/access/isPublished. */
  app.put('/admin/programs/:id', adminOpts, async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const data = programUpdateSchema.parse(request.body ?? {});
    try {
      const program = await app.prisma.program.update({
        where: { id },
        data,
        include: { days: { orderBy: { dayIndex: 'asc' } } },
      });
      request.log.info({ programId: id, fields: Object.keys(data) }, 'admin program updated');
      return { program };
    } catch (error) {
      mapPrismaError(error, 'Program');
    }
  });

  /**
   * PUT /admin/programs/:id/days — полная замена массива дней.
   * Та же идемпотентная логика, что в seed: upsert по (programId, dayIndex),
   * лишние дни удаляются.
   */
  app.put('/admin/programs/:id/days', adminOpts, async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const { days } = programDaysSchema.parse(request.body ?? {});

    const program = await app.prisma.program.findUnique({ where: { id } });
    if (!program) {
      throw new AppError(404, 'NOT_FOUND', 'Program not found');
    }

    try {
      for (const day of days) {
        await app.prisma.programDay.upsert({
          where: { programId_dayIndex: { programId: id, dayIndex: day.dayIndex } },
          create: {
            programId: id,
            dayIndex: day.dayIndex,
            title: day.title,
            workoutId: day.workoutId,
          },
          update: { title: day.title, workoutId: day.workoutId },
        });
      }
      // Полная замена: всё, чего нет в новом списке, удаляем.
      await app.prisma.programDay.deleteMany({
        where: { programId: id, dayIndex: { notIn: days.map((d) => d.dayIndex) } },
      });
    } catch (error) {
      mapPrismaError(error, 'ProgramDay');
    }

    const updated = await app.prisma.program.findUniqueOrThrow({
      where: { id },
      include: {
        days: {
          orderBy: { dayIndex: 'asc' },
          include: { workout: { select: { id: true, slug: true, title: true } } },
        },
      },
    });
    request.log.info({ programId: id, daysCount: days.length }, 'admin program days replaced');
    return { program: updated };
  });

  /**
   * DELETE /admin/programs/:id — удаление плана вместе с днями (транзакция).
   * ProgramDay не хранит пользовательских данных; ProgressEntry ссылается на
   * workout, а не на день, поэтому прогресс не теряется.
   */
  app.delete('/admin/programs/:id', adminOpts, async (request) => {
    const { id } = idParamsSchema.parse(request.params);

    const program = await app.prisma.program.findUnique({ where: { id } });
    if (!program) {
      throw new AppError(404, 'NOT_FOUND', 'Program not found');
    }

    await app.prisma.$transaction([
      app.prisma.programDay.deleteMany({ where: { programId: id } }),
      app.prisma.program.delete({ where: { id } }),
    ]);
    request.log.info({ programId: id, slug: program.slug }, 'admin program deleted');
    return { deleted: true };
  });
}
