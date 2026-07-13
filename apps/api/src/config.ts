import { z } from 'zod';

/**
 * Конфигурация приложения. Загружается из env-переменных с валидацией zod.
 * Отсутствие обязательной переменной даёт понятную ошибку при старте,
 * а не загадочный сбой где-то в глубине приложения.
 */

const envSchema = z.object({
  DATABASE_URL: z
    .string({ error: 'DATABASE_URL is required (PostgreSQL connection string)' })
    .min(1, 'DATABASE_URL must not be empty (PostgreSQL connection string)'),
  BOT_TOKEN: z
    .string({ error: 'BOT_TOKEN is required (Telegram bot token, used to verify initData signatures)' })
    .min(1, 'BOT_TOKEN must not be empty (Telegram bot token, used to verify initData signatures)'),
  JWT_SECRET: z
    .string({ error: 'JWT_SECRET is required (secret used to sign session JWTs)' })
    .min(1, 'JWT_SECRET must not be empty (secret used to sign session JWTs)'),
  /** Время жизни сессионного JWT (формат @fastify/jwt, напр. "1h"). */
  JWT_EXPIRES_IN: z.string().min(1).default('1h'),
  /** Максимальный возраст auth_date в initData, секунды. Default: 24 часа. */
  INIT_DATA_MAX_AGE_SEC: z.coerce.number().int().positive().default(86_400),
  /** Разрешённый origin фронта. Не задан → dev-режим, разрешаем всё. */
  CORS_ORIGIN: z.string().min(1).optional(),
  /**
   * API-ключ Tribute — ключ HMAC-проверки подписи webhook (trbt-signature).
   * Не задан → POST /api/tribute/webhook отвечает 503 TRIBUTE_DISABLED.
   */
  TRIBUTE_API_KEY: z.string().min(1).optional(),
  /**
   * Токен ручных admin-операций (header x-admin-token).
   * Не задан → /admin/* отвечают 503 ADMIN_DISABLED.
   */
  ADMIN_TOKEN: z.string().min(1).optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export interface AppConfig {
  databaseUrl: string;
  botToken: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  initDataMaxAgeSec: number;
  corsOrigin: string | undefined;
  tributeApiKey: string | undefined;
  adminToken: string | undefined;
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** Читает и валидирует конфигурацию из env (по умолчанию — process.env). */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(env)'}: ${issue.message}`)
      .join('\n');
    throw new ConfigError(`Invalid environment configuration:\n${details}`);
  }
  const e = parsed.data;
  // В production слабые секреты недопустимы (S3-5 security review):
  // короткий JWT_SECRET уязвим к офлайн-подбору HS256, короткий ADMIN_TOKEN — к перебору.
  if (e.NODE_ENV === 'production') {
    const weak: string[] = [];
    if (e.JWT_SECRET.length < 32) {
      weak.push('JWT_SECRET must be at least 32 characters in production');
    }
    if (e.ADMIN_TOKEN !== undefined && e.ADMIN_TOKEN.length < 32) {
      weak.push('ADMIN_TOKEN must be at least 32 characters in production');
    }
    if (weak.length > 0) {
      throw new ConfigError(
        `Invalid environment configuration:\n${weak.map((m) => `  - ${m}`).join('\n')}`,
      );
    }
  }
  return {
    databaseUrl: e.DATABASE_URL,
    botToken: e.BOT_TOKEN,
    jwtSecret: e.JWT_SECRET,
    jwtExpiresIn: e.JWT_EXPIRES_IN,
    initDataMaxAgeSec: e.INIT_DATA_MAX_AGE_SEC,
    corsOrigin: e.CORS_ORIGIN,
    tributeApiKey: e.TRIBUTE_API_KEY,
    adminToken: e.ADMIN_TOKEN,
    port: e.PORT,
    nodeEnv: e.NODE_ENV,
  };
}
