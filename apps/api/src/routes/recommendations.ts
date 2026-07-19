import type { FastifyInstance } from 'fastify';
import { hasAccess } from '../access.ts';
import { authenticate } from '../auth.ts';
import { toProgramDto, toWorkoutCardDto, type ProgramDto, type WorkoutCardDto } from '../mappers.ts';
import {
  buildProfileFromOnboarding,
  pickRecommendedPlan,
  rankWorkouts,
} from '../recommend.ts';

/**
 * GET /recommendations (auth) — персональная подборка под квиз (RP-1).
 * Возвращает ВСЕ опубликованные тренировки, ранжированные скорингом
 * (recommend.ts), в формате карточки каталога (без videoUrl, с isLocked),
 * плюс наиболее подходящий план (или null).
 */

interface RecommendationsResponse {
  workouts: WorkoutCardDto[];
  recommendedPlan: ProgramDto | null;
}

export function registerRecommendationRoutes(app: FastifyInstance): void {
  app.get(
    '/recommendations',
    { preHandler: authenticate },
    async (request): Promise<RecommendationsResponse> => {
      const [user, workouts, programs, unlocked] = await Promise.all([
        app.prisma.user.findUnique({
          where: { id: request.user.userId },
          select: { onboarding: true },
        }),
        app.prisma.workout.findMany({
          where: { isPublished: true },
          include: { category: true },
        }),
        app.prisma.program.findMany({
          where: { isPublished: true },
          include: {
            days: {
              orderBy: { dayIndex: 'asc' },
              include: { workout: { select: { slug: true, category: { select: { slug: true } } } } },
            },
          },
          orderBy: { slug: 'asc' },
        }),
        hasAccess(app.prisma, request.user.userId),
      ]);

      const profile = buildProfileFromOnboarding(user?.onboarding);

      // Скоринг работает по categorySlug — прокидываем его рядом с prisma-строкой.
      const scorable = workouts.map((workout) => ({ ...workout, categorySlug: workout.category.slug }));
      const ranked = rankWorkouts(scorable, profile);

      const rankablePlans = programs.map((program) => ({
        ...program,
        days: program.days.map((day) => ({
          ...day,
          categorySlug: day.workout?.category.slug ?? null,
        })),
      }));
      const chosenPlan = pickRecommendedPlan(rankablePlans, profile);

      return {
        workouts: ranked.map((workout) => toWorkoutCardDto(workout, { unlocked })),
        recommendedPlan: chosenPlan === null ? null : toProgramDto(chosenPlan),
      };
    },
  );
}
