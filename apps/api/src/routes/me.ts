import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth.ts';
import { AppError } from '../errors.ts';
import { serializeUser, type MeResponse } from '../types.ts';

export function registerMeRoutes(app: FastifyInstance): void {
  /**
   * GET /me — профиль текущего пользователя.
   * access — заглушка до Спринта 3 (Tribute/Subscription): всегда free.
   */
  app.get('/me', { preHandler: authenticate }, async (request): Promise<MeResponse> => {
    const user = await app.prisma.user.findUnique({
      where: { id: request.user.userId },
    });
    if (!user) {
      // Токен подписан нами, но пользователя больше нет — сессия невалидна.
      throw new AppError(401, 'UNAUTHORIZED', 'User for this token no longer exists');
    }

    return {
      user: serializeUser(user),
      access: { tier: 'free' },
    };
  });
}
