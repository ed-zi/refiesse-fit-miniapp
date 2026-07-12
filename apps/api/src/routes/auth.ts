import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../errors.ts';
import { InitDataError, verifyInitData } from '../telegram/verifyInitData.ts';
import { serializeUser, type AuthResponse } from '../types.ts';

const authBodySchema = z.object({
  initData: z.string().min(1),
});

export function registerAuthRoutes(app: FastifyInstance): void {
  /**
   * POST /auth/telegram — обмен Telegram initData на сессионный JWT.
   * Верификация подписи по BOT_TOKEN → идемпотентный upsert User по
   * telegramUserId → JWT (~1ч) с payload { userId }.
   */
  app.post('/auth/telegram', async (request): Promise<AuthResponse> => {
    const body = authBodySchema.parse(request.body ?? {});

    let verified;
    try {
      verified = verifyInitData(body.initData, app.config.botToken, {
        maxAgeSeconds: app.config.initDataMaxAgeSec,
      });
    } catch (err) {
      if (err instanceof InitDataError) {
        throw new AppError(401, 'INVALID_INIT_DATA', err.message);
      }
      throw err;
    }

    const telegramUserId = BigInt(verified.user.id);
    const user = await app.prisma.user.upsert({
      where: { telegramUserId },
      create: {
        telegramUserId,
        firstName: verified.user.firstName,
        lastName: verified.user.lastName ?? null,
        username: verified.user.username ?? null,
        languageCode: verified.user.languageCode ?? null,
      },
      update: {
        firstName: verified.user.firstName,
        lastName: verified.user.lastName ?? null,
        username: verified.user.username ?? null,
        languageCode: verified.user.languageCode ?? null,
      },
    });

    const token = app.jwt.sign({ userId: user.id });

    return {
      token,
      expiresIn: app.config.jwtExpiresIn,
      user: serializeUser(user),
    };
  });
}
