import type { FastifyInstance } from 'fastify';
import { getAccessStatus } from '../access.ts';
import { authenticate } from '../auth.ts';
import type { AccessStatus } from '../types.ts';

export function registerAccessRoutes(app: FastifyInstance): void {
  /** GET /access — статус доступа (тот же формат и функция, что в /me.access). */
  app.get('/access', { preHandler: authenticate }, async (request): Promise<AccessStatus> => {
    return getAccessStatus(app.prisma, request.user.userId);
  });
}
