import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import {
  buildInitData,
  TEST_ADMIN_TOKEN,
  TEST_TRIBUTE_API_KEY,
  testConfig,
} from './helpers.ts';

/**
 * S3-4: admin API + админ-страница.
 * Все создаваемые сущности имеют slug с префиксом qa- и удаляются в afterAll,
 * чтобы не ломать seed-счётчики в catalog.test.ts.
 */

let app: FastifyInstance;
const adminHeaders = { 'x-admin-token': TEST_ADMIN_TOKEN };
const run = `${process.pid}${Date.now() % 100000}`; // уникальные slug между прогонами

async function cleanupQa(): Promise<void> {
  await app.prisma.program.deleteMany({ where: { slug: { startsWith: 'qa-' } } }); // days каскадом
  await app.prisma.workout.deleteMany({ where: { slug: { startsWith: 'qa-' } } });
  await app.prisma.category.deleteMany({ where: { slug: { startsWith: 'qa-' } } });
}

beforeAll(async () => {
  app = await buildApp(testConfig);
  await app.ready();
  await cleanupQa();
  await app.prisma.tributeEvent.deleteMany();
});

afterAll(async () => {
  await cleanupQa();
  await app.close();
});

async function authAs(telegramId: number): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: {
      initData: buildInitData({ user: { id: telegramId, first_name: `Admin${telegramId}` } }),
    },
  });
  return res.json().token;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

function signBody(body: string): string {
  return createHmac('sha256', TEST_TRIBUTE_API_KEY).update(body, 'utf8').digest('hex');
}

describe('admin guard', () => {
  it.each([
    ['GET', '/admin/workouts'],
    ['POST', '/admin/workouts'],
    ['GET', '/admin/categories'],
    ['GET', '/admin/programs'],
    ['GET', '/admin/users'],
    ['GET', '/admin/tribute-events'],
    ['POST', '/admin/tribute-events/some-id/reprocess'],
  ] as const)('%s %s без токена → 403', async (method, url) => {
    const res = await app.inject({
      method,
      url,
      ...(method === 'POST' ? { payload: {} } : {}),
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });
});

describe('admin workouts CRUD', () => {
  const slug = `qa-workout-${run}`;
  let workoutId: string;

  it('create → 201, виден в админ-списке и в каталоге юзера', async () => {
    const categories = await app.inject({
      method: 'GET',
      url: '/admin/categories',
      headers: adminHeaders,
    });
    const spina = categories.json().items.find((c: { slug: string }) => c.slug === 'spina');

    const created = await app.inject({
      method: 'POST',
      url: '/admin/workouts',
      headers: adminHeaders,
      payload: {
        slug,
        title: 'QA тренировка',
        goal: 'Проверить админку',
        durationMin: 11,
        level: 'beginner',
        equipment: ['коврик'],
        zones: ['Шея', 'Плечи'],
        place: ['В офисе'],
        intensity: 'Мягкая',
        restrictions: ['Без прыжков'],
        access: 'free',
        videoUrl: 'https://placeholder/refiesse/qa',
        description: 'Тестовая тренировка.',
        cautions: 'Только для тестов.',
        categoryId: spina.id,
      },
    });
    expect(created.statusCode).toBe(201);
    workoutId = created.json().workout.id;
    expect(created.json().workout.category.slug).toBe('spina');
    // Теги каталога сохранены.
    expect(created.json().workout.zones).toEqual(['Шея', 'Плечи']);
    expect(created.json().workout.intensity).toBe('Мягкая');

    const adminList = await app.inject({
      method: 'GET',
      url: '/admin/workouts',
      headers: adminHeaders,
    });
    expect(adminList.json().items.some((w: { id: string }) => w.id === workoutId)).toBe(true);

    const token = await authAs(910001);
    const catalog = await app.inject({ method: 'GET', url: '/catalog', headers: bearer(token) });
    expect(catalog.json().workouts.some((w: { slug: string }) => w.slug === slug)).toBe(true);
  });

  it('update: title + premium toggle отражаются в каталоге', async () => {
    const updated = await app.inject({
      method: 'PUT',
      url: `/admin/workouts/${workoutId}`,
      headers: adminHeaders,
      payload: { title: 'QA тренировка v2', access: 'premium' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().workout.title).toBe('QA тренировка v2');

    const token = await authAs(910001);
    const catalog = await app.inject({ method: 'GET', url: '/catalog', headers: bearer(token) });
    const card = catalog.json().workouts.find((w: { slug: string }) => w.slug === slug);
    expect(card.isPremium).toBe(true);
    expect(card.title).toBe('QA тренировка v2');
  });

  it('unpublish: юзер не видит (каталог и 404 детальной), админ видит', async () => {
    await app.inject({
      method: 'PUT',
      url: `/admin/workouts/${workoutId}`,
      headers: adminHeaders,
      payload: { isPublished: false },
    });

    const token = await authAs(910001);
    const catalog = await app.inject({ method: 'GET', url: '/catalog', headers: bearer(token) });
    expect(catalog.json().workouts.some((w: { slug: string }) => w.slug === slug)).toBe(false);

    const detail = await app.inject({
      method: 'GET',
      url: `/workouts/${slug}`,
      headers: bearer(token),
    });
    expect(detail.statusCode).toBe(404);

    const adminList = await app.inject({
      method: 'GET',
      url: '/admin/workouts',
      headers: adminHeaders,
    });
    const row = adminList.json().items.find((w: { id: string }) => w.id === workoutId);
    expect(row.isPublished).toBe(false);
  });

  it('дубликат slug → 409, несуществующий id → 404, битое тело → 400', async () => {
    const categories = await app.inject({
      method: 'GET',
      url: '/admin/categories',
      headers: adminHeaders,
    });
    const spina = categories.json().items.find((c: { slug: string }) => c.slug === 'spina');

    const duplicate = await app.inject({
      method: 'POST',
      url: '/admin/workouts',
      headers: adminHeaders,
      payload: {
        slug,
        title: 'Дубль',
        goal: 'x',
        durationMin: 5,
        level: 'beginner',
        description: 'x',
        cautions: 'x',
        categoryId: spina.id,
      },
    });
    expect(duplicate.statusCode).toBe(409);

    const missing = await app.inject({
      method: 'PUT',
      url: '/admin/workouts/nonexistent-id',
      headers: adminHeaders,
      payload: { title: 'X' },
    });
    expect(missing.statusCode).toBe(404);

    const invalid = await app.inject({
      method: 'POST',
      url: '/admin/workouts',
      headers: adminHeaders,
      payload: { slug: 'НЕ-КЕБАБ', title: '' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('admin categories', () => {
  it('create + update', async () => {
    const slug = `qa-cat-${run}`;
    const created = await app.inject({
      method: 'POST',
      url: '/admin/categories',
      headers: adminHeaders,
      payload: { slug, title: 'QA категория', sortOrder: 99 },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().category.id;

    const updated = await app.inject({
      method: 'PUT',
      url: `/admin/categories/${id}`,
      headers: adminHeaders,
      payload: { title: 'QA категория v2', sortOrder: 98 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().category.title).toBe('QA категория v2');

    const list = await app.inject({
      method: 'GET',
      url: '/admin/categories',
      headers: adminHeaders,
    });
    expect(list.json().items.some((c: { slug: string }) => c.slug === slug)).toBe(true);
  });
});

describe('admin programs', () => {
  it('create + update + полная замена дней', async () => {
    const slug = `qa-plan-${run}`;
    const created = await app.inject({
      method: 'POST',
      url: '/admin/programs',
      headers: adminHeaders,
      payload: { slug, title: 'QA план', daysTotal: 2, access: 'premium' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().program.id;

    const updated = await app.inject({
      method: 'PUT',
      url: `/admin/programs/${id}`,
      headers: adminHeaders,
      payload: { title: 'QA план v2', access: 'free' },
    });
    expect(updated.json().program.access).toBe('free');

    const eveningRelax = await app.prisma.workout.findFirstOrThrow({
      where: { slug: 'evening-relax' },
    });
    const withDays = await app.inject({
      method: 'PUT',
      url: `/admin/programs/${id}/days`,
      headers: adminHeaders,
      payload: {
        days: [
          { dayIndex: 1, title: 'День 1', workoutId: eveningRelax.id },
          { dayIndex: 2, title: 'День отдыха', workoutId: null },
        ],
      },
    });
    expect(withDays.statusCode).toBe(200);
    expect(withDays.json().program.days).toHaveLength(2);
    expect(withDays.json().program.days[0].workout.slug).toBe('evening-relax');

    // Полная замена: остаётся один день.
    const replaced = await app.inject({
      method: 'PUT',
      url: `/admin/programs/${id}/days`,
      headers: adminHeaders,
      payload: { days: [{ dayIndex: 1, title: 'Единственный день', workoutId: null }] },
    });
    expect(replaced.json().program.days).toHaveLength(1);
    expect(replaced.json().program.days[0].title).toBe('Единственный день');

    // Дубликат dayIndex → 400.
    const dup = await app.inject({
      method: 'PUT',
      url: `/admin/programs/${id}/days`,
      headers: adminHeaders,
      payload: {
        days: [
          { dayIndex: 1, title: 'A', workoutId: null },
          { dayIndex: 1, title: 'B', workoutId: null },
        ],
      },
    });
    expect(dup.statusCode).toBe(400);
  });
});

describe('admin users', () => {
  it('поиск по telegramUserId и имени, карточка с прогрессом', async () => {
    const token = await authAs(910101);
    await app.inject({
      method: 'POST',
      url: '/progress',
      headers: bearer(token),
      payload: { workoutSlug: 'desk-reset-5' },
    });
    // Пост-тренировочный ответ (живой профиль) — должен попасть в карточку.
    await app.inject({
      method: 'POST',
      url: '/feedback',
      headers: bearer(token),
      payload: { workoutSlug: 'desk-reset-5', rating: 'hard' },
    });

    const byId = await app.inject({
      method: 'GET',
      url: '/admin/users?query=910101',
      headers: adminHeaders,
    });
    expect(byId.statusCode).toBe(200);
    const found = byId.json().items.find(
      (u: { telegramUserId: number }) => u.telegramUserId === 910101,
    );
    expect(found).toBeDefined();
    expect(found.access.status).toBe('none');

    const byName = await app.inject({
      method: 'GET',
      url: `/admin/users?query=${encodeURIComponent('admin9101')}`,
      headers: adminHeaders,
    });
    expect(
      byName.json().items.some((u: { telegramUserId: number }) => u.telegramUserId === 910101),
    ).toBe(true);

    const card = await app.inject({
      method: 'GET',
      url: `/admin/users/${found.id}`,
      headers: adminHeaders,
    });
    expect(card.statusCode).toBe(200);
    expect(card.json().subscription).toBeNull();
    expect(card.json().progressEntries).toHaveLength(1);
    expect(card.json().progressEntries[0].workoutSlug).toBe('desk-reset-5');
    // Агрегаты и живой профиль в карточке.
    expect(card.json().stats.totalWorkouts).toBe(1);
    expect(card.json().stats.totalMinutes).toBeGreaterThan(0);
    expect(card.json().feedback).toHaveLength(1);
    expect(card.json().feedback[0]).toMatchObject({ workoutSlug: 'desk-reset-5', rating: 'hard' });
  });
});

describe('admin tribute events + reprocess', () => {
  const TG_ID = 910777;

  it('unmatched-событие после появления юзера применяется через reprocess', async () => {
    const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const body = JSON.stringify({
      name: 'new_subscription',
      created_at: new Date().toISOString(),
      sent_at: `${new Date().toISOString()}#reprocess-${run}`,
      payload: {
        subscription_id: `sub_reprocess_${run}`,
        telegram_user_id: TG_ID,
        expires_at: expiresAt,
      },
    });

    // 1. Юзера ещё нет → unmatched.
    const webhook = await app.inject({
      method: 'POST',
      url: '/api/tribute/webhook',
      headers: { 'content-type': 'application/json', 'trbt-signature': signBody(body) },
      payload: body,
    });
    expect(webhook.json()).toEqual({ status: 'unmatched' });

    // 2. Событие видно в журнале с ошибкой.
    const list = await app.inject({
      method: 'GET',
      url: '/admin/tribute-events?limit=50',
      headers: adminHeaders,
    });
    const event = list
      .json()
      .items.find((e: { telegramUserId: number | null }) => e.telegramUserId === TG_ID);
    expect(event).toBeDefined();
    expect(event.error).toBe('UNMATCHED_USER');
    expect(event.processedAt).toBeNull();
    expect(event.payload.payload.telegram_user_id).toBe(TG_ID);

    // 3. Юзер появился → reprocess применяет событие.
    const token = await authAs(TG_ID);
    const reprocess = await app.inject({
      method: 'POST',
      url: `/admin/tribute-events/${event.id}/reprocess`,
      headers: adminHeaders,
    });
    expect(reprocess.statusCode).toBe(200);
    expect(reprocess.json().status).toBe('ok');
    expect(reprocess.json().event.processedAt).not.toBeNull();
    expect(reprocess.json().event.error).toBeNull();

    const access = await app.inject({ method: 'GET', url: '/access', headers: bearer(token) });
    expect(access.json().isPremium).toBe(true);
    expect(access.json().expiresAt).toBe(new Date(expiresAt).toISOString());

    // 4. Повторный reprocess идемпотентен по эффекту.
    const again = await app.inject({
      method: 'POST',
      url: `/admin/tribute-events/${event.id}/reprocess`,
      headers: adminHeaders,
    });
    expect(again.json().status).toBe('ok');
    const accessAgain = await app.inject({
      method: 'GET',
      url: '/access',
      headers: bearer(token),
    });
    expect(accessAgain.json()).toEqual(access.json());
  });

  it('reprocess несуществующего события → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/tribute-events/nonexistent/reprocess',
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('админ-страница', () => {
  it('GET /admin/ui → 200 text/html', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/ui' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Refiesse Fit — админка');
    expect(res.body).toContain('x-admin-token');
  });
});
