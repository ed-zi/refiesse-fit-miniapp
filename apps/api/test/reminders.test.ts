import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import {
  DEFAULT_REMINDER_HOUR,
  mskDateKey,
  mskHour,
  runReminderTick,
  usersDueForReminder,
  type RemindableUser,
} from '../src/reminders.ts';
import { buildInitData, testConfig } from './helpers.ts';

/** Мягкие напоминания (MOTIV-1): чистые функции + /me/reminders + тик. */

function ru(overrides: Partial<RemindableUser>): RemindableUser {
  return {
    id: 'u1',
    telegramUserId: 111n,
    firstName: 'Rita',
    reminderOptIn: true,
    reminderHour: null,
    reminderLastSentOn: null,
    ...overrides,
  };
}

describe('mskHour / mskDateKey', () => {
  it('UTC 16:00 → МСК 19', () => {
    expect(mskHour(new Date('2026-07-19T16:00:00.000Z'))).toBe(19);
  });
  it('через полночь МСК: UTC 22:00 19-го → МСК 01:00 20-го', () => {
    const now = new Date('2026-07-19T22:00:00.000Z');
    expect(mskHour(now)).toBe(1);
    expect(mskDateKey(now)).toBe('2026-07-20');
  });
});

describe('usersDueForReminder', () => {
  const now = new Date('2026-07-19T16:00:00.000Z'); // МСК 19:00, день 2026-07-19
  const none = new Set<string>();

  it('дефолтный час = 19, если не выбран', () => {
    expect(DEFAULT_REMINDER_HOUR).toBe(19);
    expect(usersDueForReminder([ru({ reminderHour: null })], none, now)).toHaveLength(1);
  });
  it('не opt-in → не шлём', () => {
    expect(usersDueForReminder([ru({ reminderOptIn: false })], none, now)).toHaveLength(0);
  });
  it('другой час → не шлём', () => {
    expect(usersDueForReminder([ru({ reminderHour: 8 })], none, now)).toHaveLength(0);
  });
  it('уже занимался сегодня → не шлём', () => {
    expect(usersDueForReminder([ru({ id: 'x' })], new Set(['x']), now)).toHaveLength(0);
  });
  it('уже слали сегодня → не шлём', () => {
    const sent = ru({ reminderLastSentOn: new Date('2026-07-19T00:00:00.000Z') });
    expect(usersDueForReminder([sent], none, now)).toHaveLength(0);
  });
  it('слали вчера → снова можно', () => {
    const sent = ru({ reminderLastSentOn: new Date('2026-07-18T00:00:00.000Z') });
    expect(usersDueForReminder([sent], none, now)).toHaveLength(1);
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
    payload: { initData: buildInitData({ user: { id: telegramId, first_name: 'Rem' } }) },
  });
  return res.json().token;
}
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('PUT /me/reminders', () => {
  it('без auth → 401', async () => {
    const res = await app.inject({ method: 'PUT', url: '/me/reminders', payload: { optIn: true } });
    expect(res.statusCode).toBe(401);
  });

  it('невалидный час → 400', async () => {
    const token = await authAs(990001);
    const res = await app.inject({
      method: 'PUT',
      url: '/me/reminders',
      headers: bearer(token),
      payload: { optIn: true, hour: 25 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('включение с часом отражается в /me', async () => {
    const token = await authAs(990002);
    const put = await app.inject({
      method: 'PUT',
      url: '/me/reminders',
      headers: bearer(token),
      payload: { optIn: true, hour: 8 },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().reminders).toEqual({ optIn: true, hour: 8 });

    const me = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    expect(me.json().reminders).toEqual({ optIn: true, hour: 8 });
  });
});

describe('runReminderTick', () => {
  it('шлёт пинг opt-in пользователю и не задваивает за день', async () => {
    const now = new Date('2026-07-19T16:00:00.000Z'); // МСК 19:00
    const hour = mskHour(now);
    const token = await authAs(990100);
    await app.inject({
      method: 'PUT',
      url: '/me/reminders',
      headers: bearer(token),
      payload: { optIn: true, hour },
    });

    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return { ok: true } as Response;
    }) as unknown as typeof fetch;

    const first = await runReminderTick(app.prisma, 'test-token', now, { fetchImpl });
    expect(first.sent).toBeGreaterThanOrEqual(1);
    expect(calls).toBeGreaterThanOrEqual(1);

    // Повторный тик в тот же день — этому пользователю больше не шлём.
    const before = calls;
    const second = await runReminderTick(app.prisma, 'test-token', now, { fetchImpl });
    // sent может быть >0 из-за других opt-in юзеров, но повторно этому — нет.
    expect(second.sent).toBe(0);
    expect(calls).toBe(before);
  });

  it('кто занимался сегодня — пинг не получает', async () => {
    // Реальное «сейчас»: POST /progress ставит entryDate = сегодня (UTC),
    // и тик должен смотреть тот же день — иначе тест зависит от даты прогона.
    const now = new Date();
    const hour = mskHour(now);
    const token = await authAs(990200);
    await app.inject({
      method: 'PUT',
      url: '/me/reminders',
      headers: bearer(token),
      payload: { optIn: true, hour },
    });
    // Отмечаем тренировку сегодня (entryDate — UTC-день).
    await app.inject({
      method: 'POST',
      url: '/progress',
      headers: bearer(token),
      payload: { workoutSlug: 'desk-reset-5' },
    });

    // Чей-то тик: этот пользователь не должен попасть в отправку.
    const me = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    const myTgId = me.json().telegramUserId;

    const chatIds: string[] = [];
    const fetchImpl = (async (_url: string, init: { body: string }) => {
      chatIds.push(JSON.parse(init.body).chat_id);
      return { ok: true } as Response;
    }) as unknown as typeof fetch;

    await runReminderTick(app.prisma, 'test-token', now, { fetchImpl });
    expect(chatIds).not.toContain(String(myTgId));
  });
});
