import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { buildInitData, TEST_ADMIN_TOKEN, testConfig } from './helpers.ts';

/**
 * CD-1: безопасное удаление контента (DELETE workouts/categories/programs).
 * Тестовые сущности с префиксом qa-del- удаляются в afterAll, чтобы не влиять
 * на seed-счётчики других тестов.
 */

let app: FastifyInstance;
const adminHeaders = { 'x-admin-token': TEST_ADMIN_TOKEN };
const run = `${process.pid}${Date.now() % 100000}`;

async function cleanupQa(): Promise<void> {
  await app.prisma.progressEntry.deleteMany({
    where: { workout: { slug: { startsWith: 'qa-del-' } } },
  });
  await app.prisma.favorite.deleteMany({
    where: { workout: { slug: { startsWith: 'qa-del-' } } },
  });
  await app.prisma.program.deleteMany({ where: { slug: { startsWith: 'qa-del-' } } });
  await app.prisma.workout.deleteMany({ where: { slug: { startsWith: 'qa-del-' } } });
  await app.prisma.category.deleteMany({ where: { slug: { startsWith: 'qa-del-' } } });
}

beforeAll(async () => {
  app = await buildApp(testConfig);
  await app.ready();
  await cleanupQa();
});

afterAll(async () => {
  await cleanupQa();
  await app.close();
});

async function spinaCategoryId(): Promise<string> {
  const res = await app.inject({ method: 'GET', url: '/admin/categories', headers: adminHeaders });
  return res.json().items.find((c: { slug: string }) => c.slug === 'spina').id;
}

async function createWorkout(suffix: string, categoryId: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/admin/workouts',
    headers: adminHeaders,
    payload: {
      slug: `qa-del-${suffix}-${run}`,
      title: `QA удаление ${suffix}`,
      goal: 'x',
      durationMin: 10,
      level: 'beginner',
      equipment: [],
      access: 'free',
      description: 'x',
      cautions: 'x',
      categoryId,
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json().workout.id;
}

async function authAs(telegramId: number): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: buildInitData({ user: { id: telegramId, first_name: 'Del' } }) },
  });
  return res.json().token;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('DELETE /admin/workouts/:id', () => {
  it('без ссылок → 200, исчезает из /admin/workouts и из каталога', async () => {
    const categoryId = await spinaCategoryId();
    const id = await createWorkout('free', categoryId);
    const slug = `qa-del-free-${run}`;

    const del = await app.inject({
      method: 'DELETE',
      url: `/admin/workouts/${id}`,
      headers: adminHeaders,
    });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ deleted: true });

    const adminList = await app.inject({
      method: 'GET',
      url: '/admin/workouts',
      headers: adminHeaders,
    });
    expect(adminList.json().items.some((w: { id: string }) => w.id === id)).toBe(false);

    const token = await authAs(960001);
    const catalog = await app.inject({ method: 'GET', url: '/catalog', headers: bearer(token) });
    expect(catalog.json().workouts.some((w: { slug: string }) => w.slug === slug)).toBe(false);
  });

  it('со ссылкой ProgressEntry → 409 WORKOUT_REFERENCED, тренировка на месте', async () => {
    const categoryId = await spinaCategoryId();
    const id = await createWorkout('progress', categoryId);
    const slug = `qa-del-progress-${run}`;

    const token = await authAs(960002);
    const progress = await app.inject({
      method: 'POST',
      url: '/progress',
      headers: bearer(token),
      payload: { workoutSlug: slug },
    });
    expect(progress.statusCode).toBe(200);

    const del = await app.inject({
      method: 'DELETE',
      url: `/admin/workouts/${id}`,
      headers: adminHeaders,
    });
    expect(del.statusCode).toBe(409);
    expect(del.json().error.code).toBe('WORKOUT_REFERENCED');
    expect(del.json().error.message).toContain('выполнени');

    const still = await app.prisma.workout.findUnique({ where: { id } });
    expect(still).not.toBeNull();
  });

  it('со ссылкой Favorite → 409', async () => {
    const categoryId = await spinaCategoryId();
    const id = await createWorkout('fav', categoryId);
    const slug = `qa-del-fav-${run}`;

    const token = await authAs(960003);
    await app.inject({
      method: 'POST',
      url: '/favorites',
      headers: bearer(token),
      payload: { workoutSlug: slug },
    });

    const del = await app.inject({
      method: 'DELETE',
      url: `/admin/workouts/${id}`,
      headers: adminHeaders,
    });
    expect(del.statusCode).toBe(409);
    expect(del.json().error.code).toBe('WORKOUT_REFERENCED');
    expect(del.json().error.message).toContain('избранн');
  });

  it('несуществующий id → 404', async () => {
    const del = await app.inject({
      method: 'DELETE',
      url: '/admin/workouts/no-such-id',
      headers: adminHeaders,
    });
    expect(del.statusCode).toBe(404);
    expect(del.json().error.code).toBe('NOT_FOUND');
  });
});

describe('DELETE /admin/categories/:id', () => {
  it('пустая категория → 200', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/admin/categories',
      headers: adminHeaders,
      payload: { slug: `qa-del-cat-${run}`, title: 'QA пустая', sortOrder: 90 },
    });
    const id = created.json().category.id;

    const del = await app.inject({
      method: 'DELETE',
      url: `/admin/categories/${id}`,
      headers: adminHeaders,
    });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ deleted: true });
    expect(await app.prisma.category.findUnique({ where: { id } })).toBeNull();
  });

  it('непустая категория → 409 CATEGORY_NOT_EMPTY', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/admin/categories',
      headers: adminHeaders,
      payload: { slug: `qa-del-catfull-${run}`, title: 'QA непустая', sortOrder: 91 },
    });
    const categoryId = created.json().category.id;
    await createWorkout('incat', categoryId);

    const del = await app.inject({
      method: 'DELETE',
      url: `/admin/categories/${categoryId}`,
      headers: adminHeaders,
    });
    expect(del.statusCode).toBe(409);
    expect(del.json().error.code).toBe('CATEGORY_NOT_EMPTY');

    expect(await app.prisma.category.findUnique({ where: { id: categoryId } })).not.toBeNull();
  });

  it('несуществующая категория → 404', async () => {
    const del = await app.inject({
      method: 'DELETE',
      url: '/admin/categories/no-such',
      headers: adminHeaders,
    });
    expect(del.statusCode).toBe(404);
  });
});

describe('DELETE /admin/programs/:id', () => {
  it('план с днями → 200, дни удалены', async () => {
    const categoryId = await spinaCategoryId();
    const workoutId = await createWorkout('planwk', categoryId);

    const created = await app.inject({
      method: 'POST',
      url: '/admin/programs',
      headers: adminHeaders,
      payload: { slug: `qa-del-plan-${run}`, title: 'QA план', daysTotal: 2, access: 'free' },
    });
    const programId = created.json().program.id;

    await app.inject({
      method: 'PUT',
      url: `/admin/programs/${programId}/days`,
      headers: adminHeaders,
      payload: {
        days: [
          { dayIndex: 1, title: 'День 1', workoutId },
          { dayIndex: 2, title: 'День 2', workoutId: null },
        ],
      },
    });
    expect(await app.prisma.programDay.count({ where: { programId } })).toBe(2);

    const del = await app.inject({
      method: 'DELETE',
      url: `/admin/programs/${programId}`,
      headers: adminHeaders,
    });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ deleted: true });
    expect(await app.prisma.program.findUnique({ where: { id: programId } })).toBeNull();
    expect(await app.prisma.programDay.count({ where: { programId } })).toBe(0);
  });

  it('несуществующий план → 404', async () => {
    const del = await app.inject({
      method: 'DELETE',
      url: '/admin/programs/no-such',
      headers: adminHeaders,
    });
    expect(del.statusCode).toBe(404);
  });
});

describe('все DELETE под admin guard', () => {
  it.each([
    ['/admin/workouts/x'],
    ['/admin/categories/x'],
    ['/admin/programs/x'],
  ])('DELETE %s без админ-креды → 403', async (url) => {
    const res = await app.inject({ method: 'DELETE', url });
    expect(res.statusCode).toBe(403);
  });
});
