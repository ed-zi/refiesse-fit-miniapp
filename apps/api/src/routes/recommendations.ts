import type { FastifyInstance } from 'fastify';
import { hasAccess } from '../access.ts';
import { authenticate } from '../auth.ts';
import { toProgramDto, toWorkoutCardDto, type ProgramDto, type WorkoutCardDto } from '../mappers.ts';
import { computeDifficultyBias, parseProfileSignals, weeklyEasing } from '../livingProfile.ts';
import {
  buildProfileFromOnboarding,
  pickRecommendedPlan,
  rankWorkoutsScored,
  recommendedCount,
  withDifficultyBias,
} from '../recommend.ts';

/**
 * GET /recommendations (auth) — персональная подборка под квиз (RP-1).
 * Возвращает ВСЕ опубликованные тренировки, ранжированные скорингом
 * (recommend.ts), в формате карточки каталога (без videoUrl, с isLocked),
 * плюс наиболее подходящий план (или null).
 */

interface RecommendationsResponse {
  workouts: WorkoutCardDto[];
  /**
   * Сколько верхних тренировок из workouts — уверенные совпадения (секция
   * «Точно вам»). Остальные идут в «Ещё». 0 — нет подбора, единый список.
   */
  recommendedCount: number;
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
          select: { onboarding: true, profileSignals: true },
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

      // Профиль подбора из квиза + сдвиг сложности из живого профиля: пост-
      // тренировочные ответы (LP-1) и недельный чек-ин (WEEK-1). Мягко — сумму
      // держим в пределах ±1, чтобы не бросало из крайности в крайность.
      const signals = parseProfileSignals(user?.profileSignals);
      const rawBias = computeDifficultyBias(signals) + weeklyEasing(signals);
      const bias = Math.max(-1, Math.min(1, rawBias));
      const profile = withDifficultyBias(buildProfileFromOnboarding(user?.onboarding), bias);

      // Скоринг работает по categorySlug — прокидываем его рядом с prisma-строкой.
      const scorable = workouts.map((workout) => ({ ...workout, categorySlug: workout.category.slug }));
      const scored = rankWorkoutsScored(scorable, profile);
      const ranked = scored.map((entry) => entry.workout);
      const recCount = recommendedCount(scored, profile);

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
        recommendedCount: recCount,
        recommendedPlan: chosenPlan === null ? null : toProgramDto(chosenPlan),
      };
    },
  );
}
