import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { loadConfig, type AppConfig } from './config.ts';
import { createPrismaConnection } from './db/prisma.ts';
import { AppError } from './errors.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerCatalogRoutes } from './routes/catalog.ts';
import { registerFavoriteRoutes } from './routes/favorites.ts';
import { registerMeRoutes } from './routes/me.ts';
import { registerPlanRoutes } from './routes/plans.ts';
import { registerProgressRoutes } from './routes/progress.ts';
import type { PrismaClient } from './generated/prisma/client.ts';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    config: AppConfig;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string };
    user: { userId: string };
  }
}

/**
 * Собирает Fastify-приложение без listen — для тестов через app.inject()
 * и для запуска в server.ts.
 */
export async function buildApp(config: AppConfig = loadConfig()): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.nodeEnv !== 'test',
  });

  app.decorate('config', config);

  // CORS: явный origin из env; если не задан (dev) — разрешаем всё.
  await app.register(cors, {
    origin: config.corsOrigin ?? true,
  });

  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: config.jwtExpiresIn },
  });

  const db = await createPrismaConnection(config.databaseUrl);
  app.decorate('prisma', db.prisma);
  app.addHook('onClose', async () => {
    await db.close();
  });

  // Единый формат ошибок: { error: { code, message } }.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      const message = error.issues
        .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join('; ');
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message },
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
    }

    const fastifyError = error as Partial<FastifyError>;
    const statusCode =
      typeof fastifyError.statusCode === 'number' && fastifyError.statusCode >= 400
        ? fastifyError.statusCode
        : 500;

    if (statusCode >= 500) {
      request.log.error({ err: error }, 'Unhandled error');
      return reply.status(statusCode).send({
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      });
    }

    // Ошибки fastify-слоя (парсинг JSON, лимиты и т.п.).
    const code =
      statusCode === 401
        ? 'UNAUTHORIZED'
        : statusCode === 400
          ? 'BAD_REQUEST'
          : (fastifyError.code ?? 'ERROR');
    return reply.status(statusCode).send({
      error: { code, message: fastifyError.message ?? 'Request failed' },
    });
  });

  // 404 в том же формате.
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });

  app.get('/health', async () => ({ status: 'ok' }));

  registerAuthRoutes(app);
  registerMeRoutes(app);
  registerCatalogRoutes(app);
  registerPlanRoutes(app);
  registerProgressRoutes(app);
  registerFavoriteRoutes(app);

  return app;
}
