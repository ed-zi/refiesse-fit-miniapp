import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { buildInitData, testConfig } from './helpers.ts';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(testConfig);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.prisma.user.deleteMany();
});

describe('GET /health', () => {
  it('отвечает 200 { status: "ok" }', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});

describe('POST /auth/telegram', () => {
  it('валидный initData → 200, token и user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: buildInitData() },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(20);
    expect(body.expiresIn).toBe('1h');
    expect(body.user.telegramUserId).toBe('424242');
    expect(body.user.firstName).toBe('Rita');
    expect(body.user.username).toBe('rita_fit');

    const dbUser = await app.prisma.user.findUnique({
      where: { telegramUserId: 424242n },
    });
    expect(dbUser).not.toBeNull();
  });

  it('повторный вызов идемпотентен: второй юзер не создаётся', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: buildInitData() },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: buildInitData({ user: { id: 424242, first_name: 'Rita Updated' } }) },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().user.id).toBe(first.json().user.id);
    expect(second.json().user.firstName).toBe('Rita Updated');

    const count = await app.prisma.user.count();
    expect(count).toBe(1);
  });

  it('битый hash → 401 INVALID_INIT_DATA, юзер не создаётся', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: buildInitData({ overrideHash: 'f'.repeat(64) }) },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_INIT_DATA');
    expect(await app.prisma.user.count()).toBe(0);
  });

  it('просроченный auth_date → 401 INVALID_INIT_DATA', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: {
        initData: buildInitData({ authDate: Math.floor(Date.now() / 1000) - 48 * 60 * 60 }),
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_INIT_DATA');
  });

  it('тело без initData → 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /me', () => {
  it('с валидным токеном → 200, плоский UserProfile (контракт S2-A)', async () => {
    const auth = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: buildInitData() },
    });
    const { token } = auth.json();

    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.telegramUserId).toBe(424242);
    expect(body.firstName).toBe('Rita');
    expect(body.onboarding).toBeNull();
    expect(body.access).toEqual({ isPremium: false, status: 'none', expiresAt: null });
    expect(typeof body.id).toBe('string');
  });

  it('без токена → 401 в едином формате ошибок', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: expect.any(String) },
    });
  });

  it('битый токен → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer not-a-real-token' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });
});

describe('формат ошибок', () => {
  it('404 для неизвестного роута в формате { error: { code, message } }', async () => {
    const res = await app.inject({ method: 'GET', url: '/no-such-route' });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
    expect(typeof res.json().error.message).toBe('string');
  });
});
