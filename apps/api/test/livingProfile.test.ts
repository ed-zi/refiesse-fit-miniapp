import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import {
  appendCheckin,
  appendFeedback,
  CHECKIN_CAP,
  computeDifficultyBias,
  emptyProfileSignals,
  FEEDBACK_CAP,
  isCheckinDue,
  latestCheckin,
  parseProfileSignals,
  weeklyEasing,
  type FeedbackSignal,
  type ProfileSignals,
} from '../src/livingProfile.ts';
import {
  scoreWorkout,
  withDifficultyBias,
  type RecommendProfile,
  type ScorableWorkout,
} from '../src/recommend.ts';
import { buildInitData, testConfig } from './helpers.ts';

/** Живой профиль (LP-1): чистые функции + интеграция POST /feedback. */

function sig(rating: FeedbackSignal['rating'], at = '2026-07-19T10:00:00.000Z'): FeedbackSignal {
  return { workoutSlug: 'w', rating, at };
}

function wk(overrides: Partial<ScorableWorkout>): ScorableWorkout {
  return {
    categorySlug: 'kor',
    level: 'beginner',
    equipment: [],
    durationMin: 12,
    access: 'free',
    ...overrides,
  };
}

describe('parseProfileSignals', () => {
  it('null / не-объект / мусор → пустой профиль', () => {
    expect(parseProfileSignals(null)).toEqual(emptyProfileSignals());
    expect(parseProfileSignals(42)).toEqual(emptyProfileSignals());
    expect(parseProfileSignals({ feedback: 'nope' })).toEqual(emptyProfileSignals());
  });

  it('валидные записи проходят, битые отсеиваются', () => {
    const parsed = parseProfileSignals({
      feedback: [
        { workoutSlug: 'a', rating: 'hard', at: '2026-07-19T10:00:00.000Z' },
        { workoutSlug: 'b', rating: 'НЕВЕРНО', at: '2026-07-19T10:00:00.000Z' },
        { workoutSlug: 'c', rating: 'soft' }, // нет at
        { rating: 'right', at: '2026-07-19T10:00:00.000Z' }, // нет slug
      ],
    });
    expect(parsed.feedback).toEqual([
      { workoutSlug: 'a', rating: 'hard', at: '2026-07-19T10:00:00.000Z' },
    ]);
  });
});

describe('appendFeedback', () => {
  it('добавляет запись в конец', () => {
    const next = appendFeedback(emptyProfileSignals(), sig('hard'));
    expect(next.feedback).toHaveLength(1);
    expect(next.feedback[0]?.rating).toBe('hard');
  });

  it('та же тренировка в тот же день заменяет последний ответ (не задваивает)', () => {
    let s: ProfileSignals = emptyProfileSignals();
    s = appendFeedback(s, { workoutSlug: 'w', rating: 'soft', at: '2026-07-19T08:00:00.000Z' });
    s = appendFeedback(s, { workoutSlug: 'w', rating: 'hard', at: '2026-07-19T20:00:00.000Z' });
    expect(s.feedback).toHaveLength(1);
    expect(s.feedback[0]?.rating).toBe('hard');
  });

  it('другой день той же тренировки — новая запись', () => {
    let s: ProfileSignals = emptyProfileSignals();
    s = appendFeedback(s, { workoutSlug: 'w', rating: 'soft', at: '2026-07-19T08:00:00.000Z' });
    s = appendFeedback(s, { workoutSlug: 'w', rating: 'hard', at: '2026-07-20T08:00:00.000Z' });
    expect(s.feedback).toHaveLength(2);
  });

  it('хвост обрезается до FEEDBACK_CAP', () => {
    let s: ProfileSignals = emptyProfileSignals();
    for (let i = 0; i < FEEDBACK_CAP + 10; i += 1) {
      // разные slug/дни, чтобы каждая запись была новой
      s = appendFeedback(s, {
        workoutSlug: `w${i}`,
        rating: 'right',
        at: `2026-07-19T10:00:00.00${i % 10}Z`,
      });
    }
    expect(s.feedback).toHaveLength(FEEDBACK_CAP);
    expect(s.feedback[s.feedback.length - 1]?.workoutSlug).toBe(`w${FEEDBACK_CAP + 9}`);
  });
});

describe('computeDifficultyBias', () => {
  it('пусто → 0', () => {
    expect(computeDifficultyBias(emptyProfileSignals())).toBe(0);
  });

  it('в основном «тяжело» → −1 (легче)', () => {
    const s: ProfileSignals = { feedback: [sig('hard'), sig('hard'), sig('right')], checkins: [] };
    expect(computeDifficultyBias(s)).toBe(-1);
  });

  it('в основном «мягко» → +1 (сложнее)', () => {
    const s: ProfileSignals = { feedback: [sig('soft'), sig('soft')], checkins: [] };
    expect(computeDifficultyBias(s)).toBe(1);
  });

  it('баланс → 0', () => {
    const s: ProfileSignals = { feedback: [sig('soft'), sig('hard'), sig('right')], checkins: [] };
    expect(computeDifficultyBias(s)).toBe(0);
  });

  it('считает только по последним 5 ответам (старое не учитывается)', () => {
    const s: ProfileSignals = {
      // 5 свежих «мягко» после старых «тяжело» → +1
      feedback: [sig('hard'), sig('hard'), sig('hard'), sig('soft'), sig('soft'), sig('soft'), sig('soft'), sig('soft')],
      checkins: [],
    };
    expect(computeDifficultyBias(s)).toBe(1);
  });
});

describe('недельный чек-ин (WEEK-1)', () => {
  const DAY = 86_400_000;
  const now = new Date('2026-07-19T12:00:00.000Z');

  it('appendCheckin добавляет и обрезает до CHECKIN_CAP', () => {
    let s = emptyProfileSignals();
    for (let i = 0; i < CHECKIN_CAP + 5; i += 1) {
      s = appendCheckin(s, { answer: 'same', at: `2026-07-${String((i % 27) + 1).padStart(2, '0')}T00:00:00.000Z` });
    }
    expect(s.checkins).toHaveLength(CHECKIN_CAP);
  });

  it('latestCheckin возвращает последний / null', () => {
    expect(latestCheckin(emptyProfileSignals())).toBeNull();
    const s = appendCheckin(emptyProfileSignals(), { answer: 'harder', at: now.toISOString() });
    expect(latestCheckin(s)?.answer).toBe('harder');
  });

  it('appendFeedback НЕ теряет checkins (и наоборот)', () => {
    let s = appendCheckin(emptyProfileSignals(), { answer: 'same', at: now.toISOString() });
    s = appendFeedback(s, { workoutSlug: 'w', rating: 'hard', at: now.toISOString() });
    expect(s.checkins).toHaveLength(1);
    expect(s.feedback).toHaveLength(1);
  });

  it('isCheckinDue: новый аккаунт (<7 дней) → false', () => {
    const created = new Date(now.getTime() - 2 * DAY);
    expect(isCheckinDue(emptyProfileSignals(), created, now)).toBe(false);
  });

  it('isCheckinDue: старый аккаунт без чек-инов → true', () => {
    const created = new Date(now.getTime() - 30 * DAY);
    expect(isCheckinDue(emptyProfileSignals(), created, now)).toBe(true);
  });

  it('isCheckinDue: чек-ин 3 дня назад → false; 8 дней назад → true', () => {
    const created = new Date(now.getTime() - 30 * DAY);
    const recent = appendCheckin(emptyProfileSignals(), {
      answer: 'same',
      at: new Date(now.getTime() - 3 * DAY).toISOString(),
    });
    expect(isCheckinDue(recent, created, now)).toBe(false);
    const old = appendCheckin(emptyProfileSignals(), {
      answer: 'same',
      at: new Date(now.getTime() - 8 * DAY).toISOString(),
    });
    expect(isCheckinDue(old, created, now)).toBe(true);
  });

  it('weeklyEasing: harder → −1, better → +1, same/нет → 0', () => {
    expect(weeklyEasing(emptyProfileSignals())).toBe(0);
    expect(weeklyEasing(appendCheckin(emptyProfileSignals(), { answer: 'harder', at: now.toISOString() }))).toBe(-1);
    expect(weeklyEasing(appendCheckin(emptyProfileSignals(), { answer: 'better', at: now.toISOString() }))).toBe(1);
    expect(weeklyEasing(appendCheckin(emptyProfileSignals(), { answer: 'same', at: now.toISOString() }))).toBe(0);
  });
});

describe('withDifficultyBias', () => {
  it('bias 0 → профиль без изменений', () => {
    const p: RecommendProfile = { equipment: [], level: 'Новичок' };
    expect(withDifficultyBias(p, 0)).toBe(p);
    expect(withDifficultyBias(null, 0)).toBeNull();
  });

  it('нет onboarding, но есть сигнал → минимальный профиль со сдвигом', () => {
    expect(withDifficultyBias(null, -1)).toEqual({ equipment: [], levelBias: -1 });
  });

  it('профиль + сдвиг → сливаются', () => {
    const p: RecommendProfile = { equipment: [], level: 'Продвинутый' };
    expect(withDifficultyBias(p, -1)).toMatchObject({ level: 'Продвинутый', levelBias: -1 });
  });
});

describe('scoreWorkout со сдвигом сложности', () => {
  it('продвинутый + «тяжело» (−1): medium-тренировка получает бонус как «в самый раз»', () => {
    const base: RecommendProfile = { equipment: [], level: 'Продвинутый' }; // ранг 2
    const shifted: RecommendProfile = { ...base, levelBias: -1 }; // эффективный ранг 1
    const medium = wk({ level: 'medium' });
    // Без сдвига medium ниже уровня (+10), со сдвигом — «в самый раз» (+20).
    expect(scoreWorkout(medium, shifted)).toBeGreaterThan(scoreWorkout(medium, base));
  });

  it('нет уровня в квизе, но есть сигнал: сдвиг задаёт базовый ранг', () => {
    const profile: RecommendProfile = { equipment: [], levelBias: 1 }; // seedRank 0 + 1 = 1
    const medium = wk({ level: 'medium' });
    const advanced = wk({ level: 'advanced' });
    // Эффективный ранг 1 → medium «в самый раз» (+20) выше advanced (выше уровня −30).
    expect(scoreWorkout(medium, profile)).toBeGreaterThan(scoreWorkout(advanced, profile));
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
    payload: { initData: buildInitData({ user: { id: telegramId, first_name: 'LP' } }) },
  });
  return res.json().token;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** Берёт slug любой опубликованной тренировки из каталога. */
async function anyWorkoutSlug(token: string): Promise<string> {
  const res = await app.inject({ method: 'GET', url: '/catalog', headers: bearer(token) });
  return res.json().workouts[0].slug;
}

describe('POST /feedback', () => {
  it('без auth → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/feedback',
      payload: { workoutSlug: 'x', rating: 'hard' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('несуществующая тренировка → 404', async () => {
    const token = await authAs(980001);
    const res = await app.inject({
      method: 'POST',
      url: '/feedback',
      headers: bearer(token),
      payload: { workoutSlug: 'no-such-workout', rating: 'hard' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('невалидный rating → 400', async () => {
    const token = await authAs(980002);
    const slug = await anyWorkoutSlug(token);
    const res = await app.inject({
      method: 'POST',
      url: '/feedback',
      headers: bearer(token),
      payload: { workoutSlug: slug, rating: 'meh' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('валидный ответ → 200 { ok, bias }; повтор «тяжело» → bias −1', async () => {
    const token = await authAs(980003);
    const slug = await anyWorkoutSlug(token);

    const first = await app.inject({
      method: 'POST',
      url: '/feedback',
      headers: bearer(token),
      payload: { workoutSlug: slug, rating: 'hard' },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().ok).toBe(true);
    // Первый ответ (тот же день/тренировка) заменяется, поэтому bias копим на разных.
    expect(typeof first.json().bias).toBe('number');

    // Тот же день — нужно несколько РАЗНЫХ тренировок, чтобы накопить сигнал.
    const catalog = await app.inject({ method: 'GET', url: '/catalog', headers: bearer(token) });
    const slugs: string[] = catalog
      .json()
      .workouts.map((w: { slug: string }) => w.slug)
      .slice(0, 3);
    let bias = 0;
    for (const s of slugs) {
      const r = await app.inject({
        method: 'POST',
        url: '/feedback',
        headers: bearer(token),
        payload: { workoutSlug: s, rating: 'hard' },
      });
      bias = r.json().bias;
    }
    expect(bias).toBe(-1);

    // /recommendations продолжает отвечать 200 с учётом сдвига.
    const recs = await app.inject({ method: 'GET', url: '/recommendations', headers: bearer(token) });
    expect(recs.statusCode).toBe(200);
    expect(recs.json().workouts.length).toBeGreaterThan(0);
  });
});

describe('POST /checkin (WEEK-1)', () => {
  it('без auth → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/checkin', payload: { answer: 'same' } });
    expect(res.statusCode).toBe(401);
  });

  it('невалидный ответ → 400', async () => {
    const token = await authAs(981001);
    const res = await app.inject({
      method: 'POST',
      url: '/checkin',
      headers: bearer(token),
      payload: { answer: 'meh' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('валидный ответ → 200 { ok, weeklyCheckin.due=false }; /me отражает', async () => {
    const token = await authAs(981002);
    const res = await app.inject({
      method: 'POST',
      url: '/checkin',
      headers: bearer(token),
      payload: { answer: 'harder' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, weeklyCheckin: { due: false } });

    const me = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    // Свежий аккаунт (<7 дней) → чек-ин не показываем.
    expect(me.json().weeklyCheckin).toEqual({ due: false });

    // Подборка продолжает работать (harder → мягкий сдвиг к щадящему).
    const recs = await app.inject({ method: 'GET', url: '/recommendations', headers: bearer(token) });
    expect(recs.statusCode).toBe(200);
  });
});
