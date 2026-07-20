import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { buildInitData, testConfig } from './helpers.ts';

/**
 * S2-A: онбординг, тренировка дня, прогресс, избранное.
 * Каждый describe работает под своим telegram-пользователем — тесты не пересекаются.
 */

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(testConfig);
  await app.ready();
  await app.prisma.user.deleteMany(); // каскадно чистит progress/favorites
});

afterAll(async () => {
  await app.close();
});

async function authAs(telegramId: number): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: {
      initData: buildInitData({ user: { id: telegramId, first_name: `User${telegramId}` } }),
    },
  });
  return res.json().token;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

const sampleOnboarding = {
  goal: 'Расслабиться перед сном',
  time: '5–10 минут',
  equipment: [],
  intensity: 'Очень мягко',
};

describe('401 без токена', () => {
  it.each([
    ['PUT', '/me/onboarding'],
    ['GET', '/workouts/day'],
    ['POST', '/progress'],
    ['GET', '/progress'],
    ['POST', '/favorites'],
    ['GET', '/favorites'],
  ] as const)('%s %s → 401', async (method, url) => {
    const res = await app.inject({ method, url, payload: method === 'GET' ? undefined : {} });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });
});

describe('PUT /me/onboarding', () => {
  it('сохраняет подбор и возвращает его в /me', async () => {
    const token = await authAs(700101);

    const put = await app.inject({
      method: 'PUT',
      url: '/me/onboarding',
      headers: bearer(token),
      payload: sampleOnboarding,
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual({ onboarding: sampleOnboarding });

    const me = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    expect(me.statusCode).toBe(200);
    expect(me.json().onboarding).toEqual(sampleOnboarding);
  });

  it('пустой goal → 400 VALIDATION_ERROR', async () => {
    const token = await authAs(700101);

    const res = await app.inject({
      method: 'PUT',
      url: '/me/onboarding',
      headers: bearer(token),
      payload: { ...sampleOnboarding, goal: '' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /workouts/day', () => {
  it('отдаёт free-тренировку с videoUrl и детерминирован в рамках дня', async () => {
    const token = await authAs(700201); // без онбординга

    const first = await app.inject({ method: 'GET', url: '/workouts/day', headers: bearer(token) });
    const second = await app.inject({
      method: 'GET',
      url: '/workouts/day',
      headers: bearer(token),
    });

    expect(first.statusCode).toBe(200);
    const workout = first.json().workout;
    expect(workout.isPremium).toBe(false);
    expect(workout.isLocked).toBe(false);
    expect(typeof workout.videoUrl).toBe('string');
    expect(second.json().workout.slug).toBe(workout.slug); // детерминизм
  });

  it('учитывает onboarding.goal (Расслабиться перед сном → evening-relax)', async () => {
    const token = await authAs(700202);
    await app.inject({
      method: 'PUT',
      url: '/me/onboarding',
      headers: bearer(token),
      payload: sampleOnboarding, // goal → категория relaxation
    });

    const res = await app.inject({ method: 'GET', url: '/workouts/day', headers: bearer(token) });

    expect(res.statusCode).toBe(200);
    // Единственная free-тренировка в relaxation.
    expect(res.json().workout.slug).toBe('evening-relax');
  });

  it('goal без free-тренировок в категории → фолбэк на общую ротацию free', async () => {
    const token = await authAs(700203);
    await app.inject({
      method: 'PUT',
      url: '/me/onboarding',
      headers: bearer(token),
      payload: { ...sampleOnboarding, goal: 'Кор и живот' }, // в kor нет free
    });

    const res = await app.inject({ method: 'GET', url: '/workouts/day', headers: bearer(token) });

    expect(res.statusCode).toBe(200);
    expect(res.json().workout.isPremium).toBe(false);
  });
});

describe('POST /progress', () => {
  it('создаёт запись и отдаёт summary; дубль в тот же день не создаёт вторую', async () => {
    const token = await authAs(700301);

    const first = await app.inject({
      method: 'POST',
      url: '/progress',
      headers: bearer(token),
      payload: { workoutSlug: 'desk-reset-5' },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().summary.workouts).toBe(1);
    expect(first.json().summary.minutes).toBe(5);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/progress',
      headers: bearer(token),
      payload: { workoutSlug: 'desk-reset-5' },
    });
    expect(duplicate.statusCode).toBe(200); // мягкий UX — без ошибки
    expect(duplicate.json().summary.workouts).toBe(1);

    expect(await app.prisma.progressEntry.count()).toBeGreaterThanOrEqual(1);
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { telegramUserId: 700301n },
    });
    expect(
      await app.prisma.progressEntry.count({ where: { userId: user.id } }),
    ).toBe(1);
  });

  it('несуществующий slug → 404', async () => {
    const token = await authAs(700301);

    const res = await app.inject({
      method: 'POST',
      url: '/progress',
      headers: bearer(token),
      payload: { workoutSlug: 'no-such' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('честный таймер: durationMin пишет реальное время вместо номинала', async () => {
    const token = await authAs(700310);
    // desk-reset-5 номинально 5 минут — отмечаем как реально 14.
    const res = await app.inject({
      method: 'POST',
      url: '/progress',
      headers: bearer(token),
      payload: { workoutSlug: 'desk-reset-5', durationMin: 14 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().summary.minutes).toBe(14);
  });

  it('durationMin вне диапазона (0 / >180) → 400', async () => {
    const token = await authAs(700311);
    const zero = await app.inject({
      method: 'POST',
      url: '/progress',
      headers: bearer(token),
      payload: { workoutSlug: 'desk-reset-5', durationMin: 0 },
    });
    expect(zero.statusCode).toBe(400);
    const huge = await app.inject({
      method: 'POST',
      url: '/progress',
      headers: bearer(token),
      payload: { workoutSlug: 'desk-reset-5', durationMin: 500 },
    });
    expect(huge.statusCode).toBe(400);
  });
});

describe('GET /progress — summary и история', () => {
  it('считает недельные метрики, streak и planProgress', async () => {
    const token = await authAs(700401);
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { telegramUserId: 700401n },
    });

    // Сегодня (через API): день 1 и день 7 плана plan-back-posture-7.
    for (const workoutSlug of ['neck-shoulders-release', 'evening-relax']) {
      const res = await app.inject({
        method: 'POST',
        url: '/progress',
        headers: bearer(token),
        payload: { workoutSlug },
      });
      expect(res.statusCode).toBe(200);
    }

    // 10 дней назад (напрямую): вне текущей недели, streak не задевает.
    const old = new Date(Date.now() - 10 * 86_400_000);
    const oldDate = new Date(
      Date.UTC(old.getUTCFullYear(), old.getUTCMonth(), old.getUTCDate()),
    );
    const deskReset = await app.prisma.workout.findFirstOrThrow({
      where: { slug: 'desk-reset-5' },
    });
    await app.prisma.progressEntry.create({
      data: {
        userId: user.id,
        workoutId: deskReset.id,
        durationMin: deskReset.durationMin,
        completedAt: old,
        entryDate: oldDate,
      },
    });

    const res = await app.inject({ method: 'GET', url: '/progress', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    const { summary, entries } = res.json();

    // Неделя: только 2 сегодняшние записи (12 + 9 минут).
    expect(summary.workouts).toBe(2);
    expect(summary.minutes).toBe(21);
    // Streak: сегодня есть, вчера нет → 1.
    expect(summary.streakDays).toBe(1);
    // plan-back-posture-7: выполнены workout'ы дней 1 и 7.
    expect(summary.planProgress).toEqual({ done: 2, total: 7 });

    // История: 3 записи, новые сверху.
    expect(entries).toHaveLength(3);
    expect(entries[2].workoutSlug).toBe('desk-reset-5');
    expect(typeof entries[0].completedAt).toBe('string');
    expect(entries[0].workoutTitle.length).toBeGreaterThan(0);
  });

  it('запись вчера + сегодня → streak 2', async () => {
    const token = await authAs(700402);
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { telegramUserId: 700402n },
    });

    await app.inject({
      method: 'POST',
      url: '/progress',
      headers: bearer(token),
      payload: { workoutSlug: 'evening-relax' },
    });

    const yesterday = new Date(Date.now() - 86_400_000);
    const yesterdayDate = new Date(
      Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate()),
    );
    const neck = await app.prisma.workout.findFirstOrThrow({
      where: { slug: 'neck-shoulders-release' },
    });
    await app.prisma.progressEntry.create({
      data: {
        userId: user.id,
        workoutId: neck.id,
        durationMin: neck.durationMin,
        completedAt: yesterday,
        entryDate: yesterdayDate,
      },
    });

    const res = await app.inject({ method: 'GET', url: '/progress', headers: bearer(token) });

    expect(res.json().summary.streakDays).toBe(2);
  });
});

describe('favorites', () => {
  it('toggle туда-обратно', async () => {
    const token = await authAs(700501);

    const on = await app.inject({
      method: 'POST',
      url: '/favorites',
      headers: bearer(token),
      payload: { workoutSlug: 'evening-relax' },
    });
    expect(on.statusCode).toBe(200);
    expect(on.json()).toEqual({ favorited: true, slugs: ['evening-relax'] });

    const second = await app.inject({
      method: 'POST',
      url: '/favorites',
      headers: bearer(token),
      payload: { workoutSlug: 'desk-reset-5' },
    });
    expect(second.json()).toEqual({
      favorited: true,
      slugs: ['evening-relax', 'desk-reset-5'],
    });

    const list = await app.inject({ method: 'GET', url: '/favorites', headers: bearer(token) });
    expect(list.json()).toEqual({ slugs: ['evening-relax', 'desk-reset-5'] });

    const off = await app.inject({
      method: 'POST',
      url: '/favorites',
      headers: bearer(token),
      payload: { workoutSlug: 'evening-relax' },
    });
    expect(off.json()).toEqual({ favorited: false, slugs: ['desk-reset-5'] });
  });

  it('несуществующий slug → 404', async () => {
    const token = await authAs(700501);

    const res = await app.inject({
      method: 'POST',
      url: '/favorites',
      headers: bearer(token),
      payload: { workoutSlug: 'nope' },
    });

    expect(res.statusCode).toBe(404);
  });
});
