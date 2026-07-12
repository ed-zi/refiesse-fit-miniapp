import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../errors.ts';
import { serializeUser, type MeResponse } from '../types.ts';

/** preHandler: проверяет Bearer JWT; без/с битым токеном → 401. */
async function authenticate(request: FastifyRequest): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Missing or invalid access token');
  }
}

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
