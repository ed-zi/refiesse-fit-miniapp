import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { loadConfig, type AppConfig } from './config.ts';
import { createPrismaConnection } from './db/prisma.ts';
import { AppError } from './errors.ts';
import { captureException, initSentry } from './observability/sentry.ts';
import { registerAccessRoutes } from './routes/access.ts';
import { registerAdminRoutes } from './routes/admin.ts';
import { registerAdminContentRoutes } from './routes/adminContent.ts';
import { registerAdminTributeRoutes } from './routes/adminTribute.ts';
import { registerAdminUiRoutes } from './routes/adminUi.ts';
import { registerAdminUserRoutes } from './routes/adminUsers.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerCatalogRoutes } from './routes/catalog.ts';
import { registerFavoriteRoutes } from './routes/favorites.ts';
import { registerMeRoutes } from './routes/me.ts';
import { registerPaymentRoutes } from './routes/payments.ts';
import { registerPlanRoutes } from './routes/plans.ts';
import { registerProgressRoutes } from './routes/progress.ts';
import { registerTributeRoutes } from './routes/tribute.ts';
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

export interface BuildAppOptions {
  /**
   * Инъекция fetch для клиента ЮKassa (тесты подменяют HTTP без реальных
   * вызовов к api.yookassa.ru). В проде не задаётся — используется глобальный fetch.
   */
  yookassaFetch?: typeof fetch;
  /**
   * Инъекция готового клиента ЮKassa (тесты подменяют весь HTTP-слой).
   * null → интеграция считается не настроенной (503).
   */
  yookassaClientFactory?: () => import('./yookassa/client.ts').YookassaApi | null;
}

/**
 * Собирает Fastify-приложение без listen — для тестов через app.inject()
 * и для запуска в server.ts.
 */
export async function buildApp(
  config: AppConfig = loadConfig(),
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.nodeEnv !== 'test',
  });

  app.decorate('config', config);

  // Sentry (S4-2): включается ТОЛЬКО при заданном SENTRY_DSN, иначе no-op.
  // Инициализируем до регистрации роутов, чтобы ловить ошибки из хендлеров.
  const sentryEnabled = initSentry(config);
  if (sentryEnabled) {
    app.log.info('Sentry error monitoring enabled');
  }

  // CORS: явный origin из env; если не задан (dev) — разрешаем всё.
  await app.register(cors, {
    origin: config.corsOrigin ?? true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  if (config.nodeEnv === 'production' && config.corsOrigin === undefined) {
    app.log.warn('CORS_ORIGIN is not set in production — all origins are allowed');
  }

  // Rate limit (S3-5 security review): глобальный потолок + жёсткие лимиты
  // на auth/webhook/admin через route config. В тестах выключен (app.inject
  // шлёт всё с одного адреса и ложно упирался бы в лимит).
  if (config.nodeEnv !== 'test') {
    await app.register(rateLimit, {
      global: true,
      max: 300,
      timeWindow: '1 minute',
    });
  }

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
      // В Sentry уходит только объект ошибки (stack), без тела/заголовков запроса
      // (sendDefaultPii=false) — чтобы не утекли initData/JWT/подпись/секреты.
      captureException(error);
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
  registerAccessRoutes(app);
  registerAdminRoutes(app);
  registerAdminContentRoutes(app);
  registerAdminUserRoutes(app);
  registerAdminTributeRoutes(app);
  registerAdminUiRoutes(app);
  registerPaymentRoutes(app, {
    ...(options.yookassaFetch ? { yookassaFetch: options.yookassaFetch } : {}),
    ...(options.yookassaClientFactory ? { clientFactory: options.yookassaClientFactory } : {}),
  });
  // DEPRECATED (P1): Tribute-роут сохранён рабочим до e2e-проверки ЮKassa.
  registerTributeRoutes(app);

  return app;
}
