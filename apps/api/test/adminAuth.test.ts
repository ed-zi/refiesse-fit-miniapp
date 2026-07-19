import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { buildInitData, TEST_ADMIN_TOKEN, testConfig } from './helpers.ts';

/**
 * TA-1: двойной guard admin-роутов (x-admin-token ИЛИ Bearer JWT админа)
 * и эффективный isAdmin в /me. Мок JWT — через реальный POST /auth/telegram.
 */

const ENV_ADMIN_TG = 940101; // попадает в ADMIN_TELEGRAM_IDS app'а с env-админом

// Основной app: adminToken задан, ADMIN_TELEGRAM_IDS пуст.
let app: FastifyInstance;
// App с env-админом: ADMIN_TELEGRAM_IDS содержит ENV_ADMIN_TG.
let envAdminApp: FastifyInstance;
// Полностью не сконфигурированная админка.
let disabledApp: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(testConfig);
  envAdminApp = await buildApp({
    ...testConfig,
    adminToken: undefined,
    adminTelegramIds: new Set([String(ENV_ADMIN_TG)]),
  });
  disabledApp = await buildApp({
    ...testConfig,
    adminToken: undefined,
    adminTelegramIds: new Set<string>(),
  });
  await Promise.all([app.ready(), envAdminApp.ready(), disabledApp.ready()]);
});

afterAll(async () => {
  await Promise.all([app.close(), envAdminApp.close(), disabledApp.close()]);
});

async function authAs(target: FastifyInstance, telegramId: number): Promise<string> {
  const res = await target.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: {
      initData: buildInitData({ user: { id: telegramId, first_name: `Adm${telegramId}` } }),
    },
  });
  return res.json().token;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('makeRequireAdmin — путь (b) Bearer JWT', () => {
  it('пользователь с isAdmin=true в БД → 200', async () => {
    const token = await authAs(app, 940001);
    await app.prisma.user.update({
      where: { telegramUserId: 940001n },
      data: { isAdmin: true },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/admin/workouts',
      headers: bearer(token),
    });

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().items)).toBe(true);
  });

  it('пользователь с telegramUserId в ADMIN_TELEGRAM_IDS → 200', async () => {
    const token = await authAs(envAdminApp, ENV_ADMIN_TG);

    const res = await envAdminApp.inject({
      method: 'GET',
      url: '/admin/workouts',
      headers: bearer(token),
    });

    expect(res.statusCode).toBe(200);
  });

  it('обычный пользователь (не админ) → 403', async () => {
    const token = await authAs(app, 940002);

    const res = await app.inject({
      method: 'GET',
      url: '/admin/workouts',
      headers: bearer(token),
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });
});

describe('makeRequireAdmin — путь (a) x-admin-token (регресс)', () => {
  it('верный x-admin-token → 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/workouts',
      headers: { 'x-admin-token': TEST_ADMIN_TOKEN },
    });
    expect(res.statusCode).toBe(200);
  });

  it('кривой x-admin-token и без Bearer → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/workouts',
      headers: { 'x-admin-token': 'wrong-token' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('без каких-либо кредов, но админка сконфигурирована → 403', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/workouts' });
    expect(res.statusCode).toBe(403);
  });
});

describe('админка полностью не сконфигурирована', () => {
  it('нет ADMIN_TOKEN и пустой ADMIN_TELEGRAM_IDS → 503 ADMIN_DISABLED', async () => {
    const res = await disabledApp.inject({
      method: 'GET',
      url: '/admin/workouts',
      headers: { 'x-admin-token': 'anything' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('ADMIN_DISABLED');
  });
});

describe('GET /me — эффективный isAdmin', () => {
  it('env-админ → isAdmin=true', async () => {
    const token = await authAs(envAdminApp, ENV_ADMIN_TG);
    const res = await envAdminApp.inject({
      method: 'GET',
      url: '/me',
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().isAdmin).toBe(true);
  });

  it('обычный пользователь → isAdmin=false', async () => {
    const token = await authAs(app, 940003);
    const res = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().isAdmin).toBe(false);
  });
});

describe('GET /admin/ui', () => {
  it('→ 200 text/html и подключает telegram-web-app.js', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/ui' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('telegram-web-app.js');
    expect(res.body).toContain('Refiesse Fit — админка');
  });
});
