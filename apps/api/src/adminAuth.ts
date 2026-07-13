import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from './errors.ts';

/**
 * Общий guard admin-роутов: header x-admin-token === env ADMIN_TOKEN.
 * ADMIN_TOKEN не задан → 503 ADMIN_DISABLED; неверный токен → 403.
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

export function makeRequireAdmin(app: FastifyInstance) {
  return async (request: FastifyRequest): Promise<void> => {
    const adminToken = app.config.adminToken;
    if (adminToken === undefined) {
      throw new AppError(503, 'ADMIN_DISABLED', 'ADMIN_TOKEN is not configured');
    }
    const provided = request.headers['x-admin-token'];
    if (typeof provided !== 'string' || !tokenMatches(provided, adminToken)) {
      throw new AppError(403, 'FORBIDDEN', 'Invalid admin token');
    }
  };
}
