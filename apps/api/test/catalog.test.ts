import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDatabase } from '../prisma/seed.ts';
import { buildApp } from '../src/app.ts';
import { buildInitData, testConfig } from './helpers.ts';

let app: FastifyInstance;
let token: string;

beforeAll(async () => {
  app = await buildApp(testConfig);
  await app.ready();

  const auth = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: buildInitData() },
  });
  token = auth.json().token;
});

afterAll(async () => {
  await app.close();
});

const authHeaders = () => ({ authorization: `Bearer ${token}` });

describe('seed', () => {
  it('идемпотентен: повторный прогон не дублирует данные', async () => {
    await seedDatabase(app.prisma); // первый прогон был в globalSetup

    expect(await app.prisma.category.count()).toBe(6);
    expect(await app.prisma.workout.count()).toBe(13);
    expect(await app.prisma.program.count()).toBe(3);
    expect(await app.prisma.programDay.count()).toBe(17);
  });
});

describe('GET /catalog', () => {
  it('без токена → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/catalog' });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('отдаёт 6 категорий и 13 карточек без videoUrl', async () => {
    const res = await app.inject({ method: 'GET', url: '/catalog', headers: authHeaders() });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.categories).toHaveLength(6);
    expect(body.categories[0].slug).toBe('spina'); // сортировка по sortOrder
    expect(body.workouts).toHaveLength(13);
    for (const workout of body.workouts) {
      expect(workout).not.toHaveProperty('videoUrl');
      expect(typeof workout.isPremium).toBe('boolean');
      expect(typeof workout.categorySlug).toBe('string');
      expect(Array.isArray(workout.equipment)).toBe(true);
      expect(typeof workout.cautions).toBe('string');
    }
  });

  it('фильтр category=spina', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/catalog?category=spina',
      headers: authHeaders(),
    });

    const slugs = res.json().workouts.map((w: { slug: string }) => w.slug);
    expect(slugs.sort()).toEqual(['mfr-back-roll', 'neck-deep-release', 'neck-shoulders-release']);
  });

  it('фильтр maxDuration=10', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/catalog?maxDuration=10',
      headers: authHeaders(),
    });

    const workouts = res.json().workouts;
    expect(workouts.map((w: { slug: string }) => w.slug).sort()).toEqual([
      'desk-reset-5',
      'evening-relax',
    ]);
    for (const w of workouts) {
      expect(w.durationMin).toBeLessThanOrEqual(10);
    }
  });

  it('фильтр premium=false → ровно 3 free-тренировки', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/catalog?premium=false',
      headers: authHeaders(),
    });

    const workouts = res.json().workouts;
    expect(workouts).toHaveLength(3);
    for (const w of workouts) {
      expect(w.isPremium).toBe(false);
    }
  });

  it('фильтр level=medium', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/catalog?level=medium',
      headers: authHeaders(),
    });

    const slugs = res.json().workouts.map((w: { slug: string }) => w.slug);
    expect(slugs.sort()).toEqual(['core-no-crunches', 'posture-band-reset']);
  });

  it('комбинация premium=true&category=osanka', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/catalog?premium=true&category=osanka',
      headers: authHeaders(),
    });

    const slugs = res.json().workouts.map((w: { slug: string }) => w.slug);
    expect(slugs.sort()).toEqual(['posture-band-reset', 'posture-open-chest', 'thoracic-mobility']);
  });

  it('невалидный фильтр level → 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/catalog?level=hard',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /workouts/:slug', () => {
  it('без токена → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/workouts/evening-relax' });

    expect(res.statusCode).toBe(401);
  });

  it('free-тренировка содержит videoUrl и isLocked=false', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/workouts/neck-shoulders-release',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const { workout } = res.json();
    expect(workout.videoUrl).toBe('https://placeholder/refiesse/neck-shoulders-release');
    expect(workout.isLocked).toBe(false);
    expect(workout.isPremium).toBe(false);
    expect(workout.categorySlug).toBe('spina');
  });

  it('premium без доступа: метаданные есть, videoUrl=null, isLocked=true', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/workouts/thoracic-mobility',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const { workout } = res.json();
    expect(workout.videoUrl).toBeNull();
    expect(workout.isLocked).toBe(true);
    expect(workout.isPremium).toBe(true);
    expect(workout.title).toBe('Мягкая мобилизация грудного отдела');
    expect(workout.cautions.length).toBeGreaterThan(0);
  });

  it('несуществующий slug → 404 NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/workouts/no-such-workout',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});

describe('GET /plans', () => {
  it('без токена → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/plans' });

    expect(res.statusCode).toBe(401);
  });

  it('отдаёт 3 плана с днями и isPremium', async () => {
    const res = await app.inject({ method: 'GET', url: '/plans', headers: authHeaders() });

    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items).toHaveLength(3);

    const backPosture = items.find((p: { slug: string }) => p.slug === 'plan-back-posture-7');
    expect(backPosture.isPremium).toBe(true);
    expect(backPosture.daysTotal).toBe(7);
    expect(backPosture.days).toHaveLength(7);
    expect(backPosture.days.map((d: { dayIndex: number }) => d.dayIndex)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(backPosture.days[0]).toMatchObject({
      dayIndex: 1,
      title: 'Разгрузка шеи и плеч',
      workoutSlug: 'neck-shoulders-release',
    });
    expect(backPosture.days[6].workoutSlug).toBe('evening-relax');

    const calmEvenings = items.find((p: { slug: string }) => p.slug === 'plan-calm-evenings-5');
    expect(calmEvenings.isPremium).toBe(false);
    expect(calmEvenings.days).toHaveLength(5);

    const softCore = items.find((p: { slug: string }) => p.slug === 'plan-soft-core-5');
    expect(softCore.isPremium).toBe(true);
    expect(softCore.days.map((d: { workoutSlug: string }) => d.workoutSlug)).toEqual([
      'soft-core-breathing',
      'core-no-crunches',
      'hips-release',
      'core-no-crunches',
      'evening-relax',
    ]);
  });
});
