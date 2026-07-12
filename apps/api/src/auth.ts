import type { FastifyRequest } from 'fastify';
import { AppError } from './errors.ts';

/** preHandler для auth-роутов: проверяет Bearer JWT; без/с битым токеном → 401. */
export async function authenticate(request: FastifyRequest): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Missing or invalid access token');
  }
}
