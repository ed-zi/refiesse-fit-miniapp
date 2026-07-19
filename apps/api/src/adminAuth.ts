import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from './errors.ts';
import type { User } from './generated/prisma/client.ts';

/**
 * Двойной guard admin-роутов (TA-1):
 *   (a) header x-admin-token === ADMIN_TOKEN (timing-safe) — как раньше, ИЛИ
 *   (b) валидный Bearer JWT пользователя-админа: user.isAdmin === true ИЛИ
 *       user.telegramUserId ∈ ADMIN_TELEGRAM_IDS.
 * Позволяет Кате открывать админку прямо в Telegram по своей личности, а
 * поддержке/скриптам — по-прежнему по x-admin-token.
 */

/** Сравнение токенов за постоянное время (не палим длину/префикс тайм-атакой). */
function tokenMatches(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
}

/** Эффективный признак админа: флаг в БД ИЛИ telegram id в списке из env. */
export function isEffectiveAdmin(user: User, adminTelegramIds: Set<string>): boolean {
  return user.isAdmin === true || adminTelegramIds.has(String(user.telegramUserId));
}

export function makeRequireAdmin(app: FastifyInstance) {
  return async (request: FastifyRequest): Promise<void> => {
    const { adminToken, adminTelegramIds } = app.config;

    // (a) x-admin-token — путь поддержки/скриптов, оставлен 1:1.
    const provided = request.headers['x-admin-token'];
    if (
      adminToken !== undefined &&
      typeof provided === 'string' &&
      tokenMatches(provided, adminToken)
    ) {
      return;
    }

    // (b) Bearer JWT пользователя-админа.
    const authHeader = request.headers['authorization'];
    const hasBearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ');
    if (hasBearer) {
      let verified = true;
      try {
        await request.jwtVerify();
      } catch {
        verified = false;
      }
      if (verified) {
        const user = await app.prisma.user.findUnique({ where: { id: request.user.userId } });
        if (user && isEffectiveAdmin(user, adminTelegramIds)) {
          return;
        }
        // Есть валидный JWT, но пользователь не админ.
        throw new AppError(403, 'FORBIDDEN', 'Not an admin');
      }
    }

    // Ни (a), ни (b) не прошли.
    const notConfigured = adminToken === undefined && adminTelegramIds.size === 0;
    if (notConfigured) {
      throw new AppError(503, 'ADMIN_DISABLED', 'Admin access is not configured');
    }
    throw new AppError(403, 'FORBIDDEN', 'Invalid admin credentials');
  };
}
