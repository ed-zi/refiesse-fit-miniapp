import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../auth.ts';
import { AppError } from '../errors.ts';
import type { PrismaClient } from '../generated/prisma/client.ts';

const progressBodySchema = z.object({
  workoutSlug: z.string().min(1),
});

/** = shared ProgressSummary. */
export interface ProgressSummary {
  workouts: number;
  minutes: number;
  streakDays: number;
  planProgress: { done: number; total: number };
}

interface ProgressEntryDto {
  workoutSlug: string;
  workoutTitle: string;
  completedAt: string;
  durationMin: number;
}

/** UTC-полночь календарного дня — значение для колонки DATE (ключ идемпотентности). */
function utcDate(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** YYYY-MM-DD (UTC). */
function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Понедельник текущей недели, UTC-полночь. TODO: таймзона пользователя. */
function utcWeekStart(now: Date): Date {
  const today = utcDate(now);
  const mondayOffset = (today.getUTCDay() + 6) % 7; // 0 = понедельник
  return new Date(today.getTime() - mondayOffset * 86_400_000);
}

/** Slug плана для planProgress. TODO(S2+): активный план пользователя. */
const PROGRESS_PLAN_SLUG = 'plan-back-posture-7';

export async function computeProgressSummary(
  prisma: PrismaClient,
  userId: string,
  now: Date = new Date(),
): Promise<ProgressSummary> {
  const [entries, plan] = await Promise.all([
    prisma.progressEntry.findMany({
      where: { userId },
      select: {
        entryDate: true,
        durationMin: true,
        workout: { select: { slug: true } },
      },
    }),
    prisma.program.findUnique({
      where: { slug: PROGRESS_PLAN_SLUG },
      include: { days: { include: { workout: { select: { slug: true } } } } },
    }),
  ]);

  // Тренировки и минуты за текущую неделю (пн–вс UTC).
  const weekStart = utcWeekStart(now);
  const weekEntries = entries.filter((entry) => entry.entryDate.getTime() >= weekStart.getTime());
  const workouts = weekEntries.length;
  const minutes = weekEntries.reduce((sum, entry) => sum + entry.durationMin, 0);

  // Streak: подряд дни с ≥1 записью, заканчивая сегодня или вчера.
  const daysWithEntries = new Set(entries.map((entry) => dateKey(entry.entryDate)));
  const today = utcDate(now);
  let cursor = today;
  if (!daysWithEntries.has(dateKey(cursor))) {
    cursor = new Date(cursor.getTime() - 86_400_000); // допускаем старт со вчера
  }
  let streakDays = 0;
  while (daysWithEntries.has(dateKey(cursor))) {
    streakDays += 1;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }

  // Прогресс по плану: сколько дней плана имеют выполненный (когда-либо) workout.
  const completedSlugs = new Set(entries.map((entry) => entry.workout.slug));
  const done =
    plan?.days.filter((day) => day.workout !== null && completedSlugs.has(day.workout.slug))
      .length ?? 0;

  return {
    workouts,
    minutes,
    streakDays,
    planProgress: { done, total: plan?.daysTotal ?? 0 },
  };
}

export function registerProgressRoutes(app: FastifyInstance): void {
  /**
   * POST /progress — отметка «Я сделала».
   * Идемпотентно по (user, workout, UTC-день): дубль не создаёт вторую запись
   * и тоже отвечает 200 { summary } (мягкий UX, без ошибки).
   */
  app.post(
    '/progress',
    { preHandler: authenticate },
    async (request): Promise<{ summary: ProgressSummary }> => {
      const { workoutSlug } = progressBodySchema.parse(request.body ?? {});
      const userId = request.user.userId;

      const workout = await app.prisma.workout.findFirst({
        where: { slug: workoutSlug, isPublished: true },
      });
      if (!workout) {
        throw new AppError(404, 'NOT_FOUND', `Workout "${workoutSlug}" not found`);
      }

      const entryDate = utcDate(new Date());
      await app.prisma.progressEntry.upsert({
        where: {
          userId_workoutId_entryDate: { userId, workoutId: workout.id, entryDate },
        },
        create: {
          userId,
          workoutId: workout.id,
          durationMin: workout.durationMin, // снимок длительности на момент выполнения
          entryDate,
        },
        update: {}, // дубль в тот же день — ничего не меняем
      });

      return { summary: await computeProgressSummary(app.prisma, userId) };
    },
  );

  /** GET /progress — метрики + история (новые сверху, лимит 50). */
  app.get(
    '/progress',
    { preHandler: authenticate },
    async (request): Promise<{ summary: ProgressSummary; entries: ProgressEntryDto[] }> => {
      const userId = request.user.userId;

      const [summary, entries] = await Promise.all([
        computeProgressSummary(app.prisma, userId),
        app.prisma.progressEntry.findMany({
          where: { userId },
          include: { workout: { select: { slug: true, title: true } } },
          orderBy: { completedAt: 'desc' },
          take: 50,
        }),
      ]);

      return {
        summary,
        entries: entries.map((entry) => ({
          workoutSlug: entry.workout.slug,
          workoutTitle: entry.workout.title,
          completedAt: entry.completedAt.toISOString(),
          durationMin: entry.durationMin,
        })),
      };
    },
  );
}
