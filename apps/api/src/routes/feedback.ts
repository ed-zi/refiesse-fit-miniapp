import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../auth.ts';
import { AppError } from '../errors.ts';
import {
  appendFeedback,
  computeDifficultyBias,
  parseProfileSignals,
  type FeedbackRating,
} from '../livingProfile.ts';
import type { Prisma } from '../generated/prisma/client.ts';

const feedbackBodySchema = z.object({
  workoutSlug: z.string().min(1),
  rating: z.enum(['soft', 'right', 'hard']),
});

export function registerFeedbackRoutes(app: FastifyInstance): void {
  /**
   * POST /feedback — ответ на пост-тренировочный микро-вопрос «Как ощущалось?»
   * (LP-1). Копится в User.profileSignals и сдвигает сложность в /recommendations.
   * Мягкий UX: без ошибок на повторный ответ (тот же день/тренировка — заменяется).
   */
  app.post(
    '/feedback',
    { preHandler: authenticate },
    async (request): Promise<{ ok: true; bias: number }> => {
      const { workoutSlug, rating } = feedbackBodySchema.parse(request.body ?? {});
      const userId = request.user.userId;

      const workout = await app.prisma.workout.findFirst({
        where: { slug: workoutSlug, isPublished: true },
        select: { id: true },
      });
      if (!workout) {
        throw new AppError(404, 'NOT_FOUND', `Workout "${workoutSlug}" not found`);
      }

      const user = await app.prisma.user.findUnique({
        where: { id: userId },
        select: { profileSignals: true },
      });
      const signals = parseProfileSignals(user?.profileSignals);
      const updated = appendFeedback(signals, {
        workoutSlug,
        rating: rating as FeedbackRating,
        at: new Date().toISOString(),
      });

      await app.prisma.user.update({
        where: { id: userId },
        data: { profileSignals: updated as unknown as Prisma.InputJsonValue },
      });

      return { ok: true, bias: computeDifficultyBias(updated) };
    },
  );
}
