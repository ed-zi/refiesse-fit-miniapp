import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getAccessStatus } from '../access.ts';
import { isEffectiveAdmin } from '../adminAuth.ts';
import { authenticate } from '../auth.ts';
import { AppError } from '../errors.ts';
import type { OnboardingAnswers, UserProfile } from '../types.ts';
import type { Prisma, User } from '../generated/prisma/client.ts';

/**
 * = shared OnboardingAnswers (расширено под квиз RP-1). Используется и для body
 * PUT, и для чтения JSON из БД. Совместимость: старые профили с intensity (и без
 * level/frequency) принимаются; новые с level/frequency (без intensity) — тоже.
 */
const onboardingSchema = z.object({
  goal: z.string().min(1),
  time: z.string().min(1),
  /** Массив строк; пустой = «без инвентаря» (валидное состояние). */
  equipment: z.array(z.string()),
  /** Легаси-поле старого квиза — больше не обязательно. */
  intensity: z.string().optional(),
  /** Новый квиз: уровень («Новичок»/«Уверенный»/«Продвинутый»). */
  level: z.string().optional(),
  /** Новый квиз: частота занятий. */
  frequency: z.string().optional(),
});

/** Безопасно читает onboarding-JSON из БД; отсутствие/повреждённое значение → null. */
export function parseOnboarding(value: unknown): OnboardingAnswers | null {
  const parsed = onboardingSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function toUserProfile(app: FastifyInstance, user: User): Promise<UserProfile> {
  return {
    id: user.id,
    telegramUserId: Number(user.telegramUserId),
    firstName: user.firstName ?? '',
    lastName: user.lastName,
    username: user.username,
    onboarding: parseOnboarding(user.onboarding),
    access: await getAccessStatus(app.prisma, user.id),
    isAdmin: isEffectiveAdmin(user, app.config.adminTelegramIds),
  };
}

export function registerMeRoutes(app: FastifyInstance): void {
  /**
   * GET /me — плоский UserProfile (контракт S2-A, выровнен по shared).
   * access — заглушка до Спринта 3: { isPremium:false, status:'none', expiresAt:null }.
   */
  app.get('/me', { preHandler: authenticate }, async (request): Promise<UserProfile> => {
    const user = await app.prisma.user.findUnique({
      where: { id: request.user.userId },
    });
    if (!user) {
      // Токен подписан нами, но пользователя больше нет — сессия невалидна.
      throw new AppError(401, 'UNAUTHORIZED', 'User for this token no longer exists');
    }

    return toUserProfile(app, user);
  });

  /** PUT /me/onboarding — сохранить результат «Подбора» → { onboarding }. */
  app.put(
    '/me/onboarding',
    { preHandler: authenticate },
    async (request): Promise<{ onboarding: OnboardingAnswers }> => {
      const onboarding = onboardingSchema.parse(request.body ?? {});

      await app.prisma.user.update({
        where: { id: request.user.userId },
        data: { onboarding: onboarding as Prisma.InputJsonValue },
      });

      return { onboarding };
    },
  );
}
