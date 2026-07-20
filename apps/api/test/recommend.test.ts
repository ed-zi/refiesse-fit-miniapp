import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import {
  buildProfileFromOnboarding,
  effectiveCareAreas,
  pickRecommendedPlan,
  rankWorkouts,
  rankWorkoutsScored,
  recommendedCount,
  scoreWorkout,
  type RecommendProfile,
  type ScorableWorkout,
} from '../src/recommend.ts';
import { buildInitData, testConfig } from './helpers.ts';

/** Юнит-тесты чистого скоринга + интеграция GET /recommendations. */

function wk(overrides: Partial<ScorableWorkout>): ScorableWorkout {
  return {
    categorySlug: 'spina',
    level: 'beginner',
    equipment: [],
    durationMin: 12,
    access: 'free',
    ...overrides,
  };
}

describe('scoreWorkout / rankWorkouts (юнит)', () => {
  it('новичок: advanced-тренировка получает меньший балл, чем beginner той же категории', () => {
    const profile: RecommendProfile = { goal: 'Кор и живот', equipment: [], level: 'Новичок' };
    const beginner = wk({ categorySlug: 'kor', level: 'beginner' });
    const advanced = wk({ categorySlug: 'kor', level: 'advanced' });

    expect(scoreWorkout(beginner, profile)).toBeGreaterThan(scoreWorkout(advanced, profile));
  });

  it('пользователь без резинки: тренировка с резинкой ниже тренировки без инвентаря', () => {
    const profile: RecommendProfile = { equipment: [] }; // ничего нет
    const noEquip = wk({ equipment: [] });
    const needsBand = wk({ equipment: ['резинка'] });

    const ranked = rankWorkouts([needsBand, noEquip], profile);
    expect(ranked[0]).toBe(noEquip);
    expect(scoreWorkout(needsBand, profile)).toBeLessThan(scoreWorkout(noEquip, profile));
  });

  it('инвентарь сравнивается регистронезависимо (Коврик из квиза ↔ коврик в БД)', () => {
    const profile: RecommendProfile = { equipment: ['Коврик'] };
    const needsMat = wk({ equipment: ['коврик'] });

    // Хватает инвентаря → +15, а не −40.
    expect(scoreWorkout(needsMat, profile)).toBe(scoreWorkout(wk({ equipment: [] }), profile));
  });

  it('«Без инвентаря» = пустое множество (тренировке с инвентарём −40)', () => {
    const profile: RecommendProfile = { equipment: ['Без инвентаря'] };
    expect(scoreWorkout(wk({ equipment: ['коврик'] }), profile)).toBeLessThan(
      scoreWorkout(wk({ equipment: [] }), profile),
    );
  });

  it('цель «Кор и живот»: kor-тренировки идут выше прочих категорий', () => {
    const profile: RecommendProfile = { goal: 'Кор и живот', equipment: [] };
    const kor = wk({ categorySlug: 'kor' });
    const relax = wk({ categorySlug: 'relaxation' });

    const ranked = rankWorkouts([relax, kor], profile);
    expect(ranked[0]).toBe(kor);
  });

  it('длительность: тренировка дольше лимита времени штрафуется', () => {
    const profile: RecommendProfile = { time: '5–10 минут', equipment: [] };
    const short = wk({ durationMin: 8 });
    const long = wk({ durationMin: 30 });
    expect(scoreWorkout(short, profile)).toBeGreaterThan(scoreWorkout(long, profile));
  });

  it('без профиля (null): free сверху, затем по длительности', () => {
    const freeLong = wk({ access: 'free', durationMin: 20 });
    const freeShort = wk({ access: 'free', durationMin: 5 });
    const premium = wk({ access: 'premium', durationMin: 3 });

    const ranked = rankWorkouts([premium, freeLong, freeShort], null);
    expect(ranked[0]).toBe(freeShort);
    expect(ranked[1]).toBe(freeLong);
    expect(ranked[2]).toBe(premium);
  });
});

describe('«Бережём зоны» (CARE)', () => {
  it('effectiveCareAreas отсеивает «Нет, всё ок» и пустые', () => {
    expect(effectiveCareAreas(['Нет, всё ок', 'Поясница', ''])).toEqual(['Поясница']);
    expect(effectiveCareAreas(['Нет, всё ок'])).toEqual([]);
    expect(effectiveCareAreas(undefined)).toEqual([]);
  });

  it('при отмеченных зонах advanced штрафуется сильнее beginner', () => {
    const profile: RecommendProfile = { equipment: [], careAreas: ['Поясница'] };
    const beginner = wk({ level: 'beginner' });
    const advanced = wk({ level: 'advanced' });
    expect(scoreWorkout(beginner, profile)).toBeGreaterThan(scoreWorkout(advanced, profile));
  });

  it('только «Нет, всё ок» — нейтрально (как без CARE)', () => {
    const withNone: RecommendProfile = { equipment: [], careAreas: ['Нет, всё ок'] };
    const without: RecommendProfile = { equipment: [] };
    const workout = wk({ level: 'advanced' });
    expect(scoreWorkout(workout, withNone)).toBe(scoreWorkout(workout, without));
  });

  it('расслабление получает бонус при отмеченных зонах', () => {
    const profile: RecommendProfile = { equipment: [], careAreas: ['Колени'] };
    const relax = wk({ categorySlug: 'relaxation', level: 'beginner' });
    const other = wk({ categorySlug: 'spina', level: 'beginner' });
    expect(scoreWorkout(relax, profile)).toBeGreaterThan(scoreWorkout(other, profile));
  });
});

describe('rankWorkoutsScored / recommendedCount (секции «Вам» / «Ещё»)', () => {
  const profile: RecommendProfile = {
    goal: 'Шея и плечи зажаты', // → категория spina
    equipment: [],
    level: 'Новичок',
    time: '15–20 минут',
  };

  it('scored отсортирован по убыванию балла', () => {
    const list = [
      wk({ categorySlug: 'kor', equipment: ['коврик'] }), // слабое совпадение
      wk({ categorySlug: 'spina', durationMin: 12 }), // цель + free + без инвентаря
    ];
    const scored = rankWorkoutsScored(list, profile);
    expect(scored[0]!.workout.categorySlug).toBe('spina');
    expect(scored[0]!.score).toBeGreaterThan(scored[1]!.score);
  });

  it('recommendedCount = число уверенных совпадений, в пределах [3..6]', () => {
    // 8 тренировок в категории цели без инвентаря → все с положительным баллом,
    // но секция «Вам» ограничена сверху шестью.
    const many = Array.from({ length: 8 }, (_, i) =>
      wk({ categorySlug: 'spina', durationMin: 10 + i }),
    );
    const scored = rankWorkoutsScored(many, profile);
    expect(recommendedCount(scored, profile)).toBe(6);
  });

  it('когда совпадений мало — берём именно столько (не добиваем слабыми)', () => {
    // 1 сильное (spina, без инвентаря) + 3 слабых (нужен инвентарь → отрицательный балл).
    const list = [
      wk({ categorySlug: 'spina', durationMin: 12 }),
      wk({ categorySlug: 'kor', equipment: ['коврик'] }),
      wk({ categorySlug: 'osanka', equipment: ['резинка'] }),
      wk({ categorySlug: 'mobility', equipment: ['коврик'] }),
    ];
    const scored = rankWorkoutsScored(list, profile);
    // Ровно одно положительное → секция «Вам» = 1 (min-«добивка» не тянет слабых вверх).
    expect(recommendedCount(scored, profile)).toBe(1);
  });

  it('нет профиля → recommendedCount 0 (единый список без секций)', () => {
    const list = [wk({}), wk({ categorySlug: 'kor' })];
    const scored = rankWorkoutsScored(list, null);
    expect(scored.every((entry) => entry.score === 0)).toBe(true);
    expect(recommendedCount(scored, null)).toBe(0);
  });
});

describe('pickRecommendedPlan (юнит)', () => {
  const plans = [
    { slug: 'plan-back-posture-7', days: [{ categorySlug: 'spina' }, { categorySlug: 'osanka' }] },
    { slug: 'plan-soft-core-5', days: [{ categorySlug: 'kor' }, { categorySlug: 'kor' }] },
  ];

  it('цель kor → план с днями kor', () => {
    const chosen = pickRecommendedPlan(plans, { goal: 'Кор и живот', equipment: [] });
    expect(chosen?.slug).toBe('plan-soft-core-5');
  });

  it('нет цели → дефолтный план', () => {
    const chosen = pickRecommendedPlan(plans, null);
    expect(chosen?.slug).toBe('plan-back-posture-7');
  });

  it('планов нет → null', () => {
    expect(pickRecommendedPlan([], { goal: 'Кор и живот', equipment: [] })).toBeNull();
  });
});

describe('buildProfileFromOnboarding', () => {
  it('null/пустое → null', () => {
    expect(buildProfileFromOnboarding(null)).toBeNull();
    expect(buildProfileFromOnboarding({ equipment: [] })).toBeNull();
  });
  it('новый квиз (level/frequency без intensity) → профиль', () => {
    const p = buildProfileFromOnboarding({
      goal: 'Кор и живот',
      time: '15–20 минут',
      equipment: ['Коврик'],
      level: 'Новичок',
      frequency: '3 раза в неделю',
    });
    expect(p).toMatchObject({ goal: 'Кор и живот', level: 'Новичок', equipment: ['Коврик'] });
  });
});

// ---------------------------------------------------------------- интеграция

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(testConfig);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

async function authAs(telegramId: number): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: buildInitData({ user: { id: telegramId, first_name: 'Rec' } }) },
  });
  return res.json().token;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('GET /recommendations', () => {
  it('без auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/recommendations' });
    expect(res.statusCode).toBe(401);
  });

  it('без onboarding → 200, непустой список, карточки без videoUrl', async () => {
    const token = await authAs(970001);
    const res = await app.inject({
      method: 'GET',
      url: '/recommendations',
      headers: bearer(token),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.workouts.length).toBeGreaterThan(0);
    expect(body.workouts[0]).not.toHaveProperty('videoUrl');
    expect(typeof body.workouts[0].isLocked).toBe('boolean');
    // recommendedPlan — Program с днями или null; в сиде планы есть.
    expect(body.recommendedPlan).not.toBeNull();
    expect(Array.isArray(body.recommendedPlan.days)).toBe(true);
  });

  it('цель «Кор и живот» → топ-рекомендации из категории kor, план soft-core', async () => {
    const token = await authAs(970002);
    await app.inject({
      method: 'PUT',
      url: '/me/onboarding',
      headers: bearer(token),
      payload: {
        goal: 'Кор и живот',
        time: '15–20 минут',
        equipment: ['Коврик'],
        level: 'Новичок',
        frequency: '3 раза в неделю',
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/recommendations',
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Верхняя тренировка — из kor.
    expect(body.workouts[0].categorySlug).toBe('kor');
    expect(body.recommendedPlan.slug).toBe('plan-soft-core-5');
    // Секция «Точно вам»: есть уверенные совпадения, но не весь каталог.
    expect(body.recommendedCount).toBeGreaterThan(0);
    expect(body.recommendedCount).toBeLessThan(body.workouts.length);
  });

  it('новичок: advanced-тренировки не в самом топе относительно beginner той же цели', async () => {
    const token = await authAs(970003);
    await app.inject({
      method: 'PUT',
      url: '/me/onboarding',
      headers: bearer(token),
      payload: { goal: 'Кор и живот', time: '25–35 минут', equipment: ['Коврик'], level: 'Новичок' },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/recommendations',
      headers: bearer(token),
    });
    const body = res.json();
    const korCards = body.workouts.filter((w: { categorySlug: string }) => w.categorySlug === 'kor');
    // среди kor beginner-карточка идёт раньше любой advanced kor-карточки
    const firstBeginner = korCards.findIndex((w: { level: string }) => w.level === 'beginner');
    const firstAdvanced = korCards.findIndex((w: { level: string }) => w.level === 'advanced');
    if (firstAdvanced !== -1 && firstBeginner !== -1) {
      expect(firstBeginner).toBeLessThan(firstAdvanced);
    }
    expect(korCards.length).toBeGreaterThan(0);
  });
});

describe('PUT /me/onboarding — совместимость форматов', () => {
  it('новый формат (level/frequency, без intensity) → 200 и виден в /me', async () => {
    const token = await authAs(970101);
    const payload = {
      goal: 'Поясница устала',
      time: '5–10 минут',
      equipment: [],
      level: 'Уверенный',
      frequency: '2 раза в неделю',
    };
    const put = await app.inject({
      method: 'PUT',
      url: '/me/onboarding',
      headers: bearer(token),
      payload,
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().onboarding).toEqual(payload);

    const me = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    expect(me.json().onboarding).toEqual(payload);
  });

  it('старый формат (с intensity) → 200', async () => {
    const token = await authAs(970102);
    const payload = {
      goal: 'Расслабиться перед сном',
      time: '15–20 минут',
      equipment: ['Коврик'],
      intensity: 'Очень мягко',
    };
    const put = await app.inject({
      method: 'PUT',
      url: '/me/onboarding',
      headers: bearer(token),
      payload,
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().onboarding).toEqual(payload);
  });
});
