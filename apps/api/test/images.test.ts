import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { buildInitData, TEST_ADMIN_TOKEN, testConfig } from './helpers.ts';

/** Картинки контента + пошаговое описание (STEP). */

// 1×1 прозрачный PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(testConfig);
  await app.ready();
});
afterAll(async () => {
  // Чистим за собой, чтобы не ломать счётчики каталога в общей тестовой БД.
  await app.prisma.workout.deleteMany({ where: { slug: { startsWith: 'step-' } } });
  await app.prisma.image.deleteMany();
  await app.close();
});

const adminHeaders = { 'x-admin-token': TEST_ADMIN_TOKEN };
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

async function authAs(telegramId: number): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: buildInitData({ user: { id: telegramId, first_name: 'Img' } }) },
  });
  return res.json().token;
}

async function spinaId(): Promise<string> {
  const res = await app.inject({ method: 'GET', url: '/admin/categories', headers: adminHeaders });
  return res.json().items.find((c: { slug: string }) => c.slug === 'spina').id;
}

describe('POST /admin/images + GET /images/:id', () => {
  it('без админ-доступа → 401/403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/images',
      payload: { mimeType: 'image/png', data: PNG_BASE64 },
    });
    expect([401, 403]).toContain(res.statusCode);
  });

  it('не-картинка (mimeType) → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/images',
      headers: adminHeaders,
      payload: { mimeType: 'application/pdf', data: PNG_BASE64 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('загрузка PNG → 201 { id, url }, отдача → 200 image/png', async () => {
    const up = await app.inject({
      method: 'POST',
      url: '/admin/images',
      headers: adminHeaders,
      payload: { mimeType: 'image/png', data: PNG_BASE64 },
    });
    expect(up.statusCode).toBe(201);
    const { id, url } = up.json();
    expect(typeof id).toBe('string');
    expect(url).toBe(`/images/${id}`);

    const get = await app.inject({ method: 'GET', url: `/images/${id}` });
    expect(get.statusCode).toBe(200);
    expect(get.headers['content-type']).toContain('image/png');
    expect(get.rawPayload.length).toBeGreaterThan(0);
  });

  it('картинка больше 3 МБ → 413', async () => {
    const big = Buffer.alloc(3 * 1024 * 1024 + 10, 1).toString('base64');
    const res = await app.inject({
      method: 'POST',
      url: '/admin/images',
      headers: adminHeaders,
      payload: { mimeType: 'image/png', data: big },
    });
    expect(res.statusCode).toBe(413);
  });

  it('неизвестный id → 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/images/nope' });
    expect(res.statusCode).toBe(404);
  });
});

describe('Workout.steps (пошаговое описание)', () => {
  it('free-тренировка со steps: картинка → imageUrl, текст без картинки → null', async () => {
    const image = await app.inject({
      method: 'POST',
      url: '/admin/images',
      headers: adminHeaders,
      payload: { mimeType: 'image/png', data: PNG_BASE64 },
    });
    const imageId = image.json().id;

    const created = await app.inject({
      method: 'POST',
      url: '/admin/workouts',
      headers: adminHeaders,
      payload: {
        slug: 'step-free-demo',
        title: 'Со steps',
        goal: 'Проверить steps',
        durationMin: 8,
        level: 'beginner',
        equipment: [],
        access: 'free',
        description: 'Есть пошаговое описание.',
        cautions: 'Аккуратно.',
        categoryId: await spinaId(),
        steps: [
          { text: 'Сядьте ровно', imageId },
          { text: 'Опустите плечи' },
        ],
      },
    });
    expect(created.statusCode).toBe(201);

    const token = await authAs(992001);
    const detail = await app.inject({
      method: 'GET',
      url: '/workouts/step-free-demo',
      headers: bearer(token),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().workout.steps).toEqual([
      { text: 'Сядьте ровно', imageUrl: `/images/${imageId}` },
      { text: 'Опустите плечи', imageUrl: null },
    ]);
  });

  it('premium без доступа: steps скрыты (пусто), isLocked=true', async () => {
    await app.inject({
      method: 'POST',
      url: '/admin/workouts',
      headers: adminHeaders,
      payload: {
        slug: 'step-premium-demo',
        title: 'Premium со steps',
        goal: 'Проверить гейтинг',
        durationMin: 12,
        level: 'beginner',
        equipment: [],
        access: 'premium',
        description: 'Закрытая.',
        cautions: 'Аккуратно.',
        categoryId: await spinaId(),
        steps: [{ text: 'Секретный шаг' }],
      },
    });

    const token = await authAs(992002);
    const detail = await app.inject({
      method: 'GET',
      url: '/workouts/step-premium-demo',
      headers: bearer(token),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().workout.isLocked).toBe(true);
    expect(detail.json().workout.steps).toEqual([]);
  });

  it('PUT обновляет steps', async () => {
    const list = await app.inject({ method: 'GET', url: '/admin/workouts', headers: adminHeaders });
    const w = list.json().items.find((x: { slug: string }) => x.slug === 'step-free-demo');
    const upd = await app.inject({
      method: 'PUT',
      url: `/admin/workouts/${w.id}`,
      headers: adminHeaders,
      payload: { steps: [{ text: 'Единственный шаг' }] },
    });
    expect(upd.statusCode).toBe(200);

    const token = await authAs(992003);
    const detail = await app.inject({
      method: 'GET',
      url: '/workouts/step-free-demo',
      headers: bearer(token),
    });
    expect(detail.json().workout.steps).toEqual([{ text: 'Единственный шаг', imageUrl: null }]);
  });
});
