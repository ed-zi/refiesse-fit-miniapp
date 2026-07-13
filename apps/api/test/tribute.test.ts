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
 * S3-1 + S3-2: access-модель, admin grant/revoke, Tribute webhook.
 * Платёжный контур — негативные сценарии покрываются в первую очередь.
 */

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(testConfig);
  await app.ready();
  await app.prisma.user.deleteMany(); // каскадно чистит subscriptions
  await app.prisma.tributeEvent.deleteMany(); // идемпотентность между прогонами suite
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

function signBody(body: string, key: string = TEST_TRIBUTE_API_KEY): string {
  return createHmac('sha256', key).update(body, 'utf8').digest('hex');
}

interface TributePayloadOverrides {
  subscription_id?: string | number;
  telegram_user_id: number;
  expires_at?: string;
}

let sentAtCounter = 0;

/** Уникальное (в рамках прогона) тело события Tribute. */
function tributeBody(
  name: string,
  payload: TributePayloadOverrides,
  options: { omitExpiresAt?: boolean } = {},
): string {
  sentAtCounter += 1;
  const fullPayload: Record<string, unknown> = {
    subscription_id: payload.subscription_id ?? `sub_${payload.telegram_user_id}`,
    telegram_user_id: payload.telegram_user_id,
    price: 500, // лишнее поле — проверяем loose-парсинг
  };
  if (!options.omitExpiresAt && payload.expires_at !== undefined) {
    fullPayload['expires_at'] = payload.expires_at;
  }
  return JSON.stringify({
    name,
    created_at: new Date().toISOString(),
    sent_at: `${new Date().toISOString()}#${process.pid}.${sentAtCounter}`,
    payload: fullPayload,
  });
}

async function postWebhook(body: string, signature?: string) {
  return app.inject({
    method: 'POST',
    url: '/api/tribute/webhook',
    headers: {
      'content-type': 'application/json',
      ...(signature !== undefined ? { 'trbt-signature': signature } : {}),
    },
    payload: body,
  });
}

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

async function getAccess(token: string) {
  const res = await app.inject({ method: 'GET', url: '/access', headers: bearer(token) });
  expect(res.statusCode).toBe(200);
  return res.json();
}

describe('подпись webhook', () => {
  const TG_ID = 900101;

  it('битая подпись → 403, событие не логируется, подписка не появляется', async () => {
    const token = await authAs(TG_ID);
    const body = tributeBody('new_subscription', {
      telegram_user_id: TG_ID,
      expires_at: inDays(30),
    });

    const res = await postWebhook(body, 'f'.repeat(64));

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('INVALID_SIGNATURE');
    expect(await app.prisma.tributeEvent.count()).toBe(0);
    expect(await getAccess(token)).toEqual({ isPremium: false, status: 'none', expiresAt: null });
  });

  it('отсутствующая подпись → 403', async () => {
    const body = tributeBody('new_subscription', {
      telegram_user_id: TG_ID,
      expires_at: inDays(30),
    });

    const res = await postWebhook(body);

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('INVALID_SIGNATURE');
    expect(await app.prisma.tributeEvent.count()).toBe(0);
  });

  it('подпись другим ключом → 403', async () => {
    const body = tributeBody('new_subscription', {
      telegram_user_id: TG_ID,
      expires_at: inDays(30),
    });

    const res = await postWebhook(body, signBody(body, 'another-key'));

    expect(res.statusCode).toBe(403);
    expect(await app.prisma.tributeEvent.count()).toBe(0);
  });

  it('подпись валидна, но тело — не JSON → 400 INVALID_PAYLOAD', async () => {
    const body = 'not-a-json';

    const res = await postWebhook(body, signBody(body));

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PAYLOAD');
  });
});

describe('жизненный цикл подписки через webhook', () => {
  const TG_ID = 900201;

  it('new_subscription открывает premium: /access и videoUrl в premium-карточке', async () => {
    const token = await authAs(TG_ID);
    const expiresAt = inDays(30);

    // До события — доступа нет, premium-карточка заперта.
    const lockedBefore = await app.inject({
      method: 'GET',
      url: '/workouts/thoracic-mobility',
      headers: bearer(token),
    });
    expect(lockedBefore.json().workout.videoUrl).toBeNull();
    expect(lockedBefore.json().workout.isLocked).toBe(true);

    const body = tributeBody('new_subscription', {
      telegram_user_id: TG_ID,
      subscription_id: 'sub_lifecycle_1',
      expires_at: expiresAt,
    });
    const res = await postWebhook(body, signBody(body));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });

    const access = await getAccess(token);
    expect(access.isPremium).toBe(true);
    expect(access.status).toBe('active');
    expect(access.expiresAt).toBe(new Date(expiresAt).toISOString());

    // Premium unlock: детальная карточка отдаёт видео.
    const unlocked = await app.inject({
      method: 'GET',
      url: '/workouts/thoracic-mobility',
      headers: bearer(token),
    });
    expect(unlocked.json().workout.videoUrl).toBe(
      'https://placeholder/refiesse/thoracic-mobility',
    );
    expect(unlocked.json().workout.isLocked).toBe(false);

    // /me.access — та же функция.
    const me = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    expect(me.json().access).toEqual(access);

    // Событие записано и применено.
    const event = await app.prisma.tributeEvent.findFirstOrThrow({
      where: { telegramUserId: BigInt(TG_ID), type: 'new_subscription' },
    });
    expect(event.processedAt).not.toBeNull();
    expect(event.signatureOk).toBe(true);
  });

  it('renewed_subscription продлевает expiresAt', async () => {
    const token = await authAs(TG_ID);
    const renewedUntil = inDays(60);

    const body = tributeBody('renewed_subscription', {
      telegram_user_id: TG_ID,
      subscription_id: 'sub_lifecycle_1',
      expires_at: renewedUntil,
    });
    const res = await postWebhook(body, signBody(body));
    expect(res.json()).toEqual({ status: 'ok' });

    const access = await getAccess(token);
    expect(access.status).toBe('active');
    expect(access.expiresAt).toBe(new Date(renewedUntil).toISOString());
  });

  it('cancelled_subscription: доступ живёт до expiresAt со статусом cancelled', async () => {
    const token = await authAs(TG_ID);
    const before = await getAccess(token);

    const body = tributeBody('cancelled_subscription', {
      telegram_user_id: TG_ID,
      subscription_id: 'sub_lifecycle_1',
    });
    const res = await postWebhook(body, signBody(body));
    expect(res.json()).toEqual({ status: 'ok' });

    const access = await getAccess(token);
    expect(access.isPremium).toBe(true); // отмена НЕ рубит доступ раньше срока
    expect(access.status).toBe('cancelled');
    expect(access.expiresAt).toBe(before.expiresAt); // expiresAt не тронут

    // Premium-контент всё ещё открыт.
    const detail = await app.inject({
      method: 'GET',
      url: '/workouts/thoracic-mobility',
      headers: bearer(token),
    });
    expect(detail.json().workout.isLocked).toBe(false);
  });

  it('после истечения периода доступ пропадает (status=expired)', async () => {
    const token = await authAs(TG_ID);
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { telegramUserId: BigInt(TG_ID) },
    });
    await app.prisma.subscription.update({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 60_000) }, // минуту назад
    });

    const access = await getAccess(token);
    expect(access).toEqual({ isPremium: false, status: 'expired', expiresAt: null });

    const detail = await app.inject({
      method: 'GET',
      url: '/workouts/thoracic-mobility',
      headers: bearer(token),
    });
    expect(detail.json().workout.videoUrl).toBeNull();
    expect(detail.json().workout.isLocked).toBe(true);
  });
});

describe('идемпотентность webhook', () => {
  const TG_ID = 900301;

  it('то же тело дважды → duplicate, эффект не задваивается', async () => {
    const token = await authAs(TG_ID);
    const expiresAt = inDays(15);
    const body = tributeBody('new_subscription', {
      telegram_user_id: TG_ID,
      expires_at: expiresAt,
    });
    const signature = signBody(body);

    const first = await postWebhook(body, signature);
    expect(first.json()).toEqual({ status: 'ok' });
    const accessAfterFirst = await getAccess(token);

    const second = await postWebhook(body, signature);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ status: 'duplicate' });

    // Ровно одна запись события, подписка не изменилась.
    expect(
      await app.prisma.tributeEvent.count({ where: { telegramUserId: BigInt(TG_ID) } }),
    ).toBe(1);
    expect(await getAccess(token)).toEqual(accessAfterFirst);
  });

  it('событие для неизвестного telegram_user_id → 200 unmatched, записано для reprocess', async () => {
    const UNKNOWN_TG_ID = 999999333;
    const body = tributeBody('new_subscription', {
      telegram_user_id: UNKNOWN_TG_ID,
      expires_at: inDays(30),
    });

    const res = await postWebhook(body, signBody(body));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'unmatched' });
    const event = await app.prisma.tributeEvent.findFirstOrThrow({
      where: { telegramUserId: BigInt(UNKNOWN_TG_ID) },
    });
    expect(event.error).toBe('UNMATCHED_USER');
    expect(event.processedAt).toBeNull();
  });

  it('new_subscription без expires_at → 200 ignored, подписка не создаётся', async () => {
    const token = await authAs(900302);
    const body = tributeBody(
      'new_subscription',
      { telegram_user_id: 900302 },
      { omitExpiresAt: true },
    );

    const res = await postWebhook(body, signBody(body));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ignored' });
    expect(await getAccess(token)).toEqual({ isPremium: false, status: 'none', expiresAt: null });
  });
});

describe('admin grant/revoke', () => {
  const TG_ID = 900401;
  const adminHeaders = { 'x-admin-token': TEST_ADMIN_TOKEN };

  it('grant с верным токеном открывает premium на N дней', async () => {
    const token = await authAs(TG_ID);

    const res = await app.inject({
      method: 'POST',
      url: '/admin/access/grant',
      headers: adminHeaders,
      payload: { telegramUserId: TG_ID, days: 30 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().access.isPremium).toBe(true);
    expect(res.json().access.status).toBe('active');

    const access = await getAccess(token);
    expect(access.isPremium).toBe(true);
    const grantedMs = new Date(access.expiresAt).getTime() - Date.now();
    expect(grantedMs).toBeGreaterThan(29.9 * 86_400_000);
    expect(grantedMs).toBeLessThan(30.1 * 86_400_000);

    // Premium-контент открылся.
    const detail = await app.inject({
      method: 'GET',
      url: '/workouts/posture-open-chest',
      headers: bearer(token),
    });
    expect(detail.json().workout.isLocked).toBe(false);
    expect(typeof detail.json().workout.videoUrl).toBe('string');
  });

  it('повторный grant продлевает от текущего expiresAt (max(now, expiresAt) + days)', async () => {
    const token = await authAs(TG_ID);
    const before = new Date((await getAccess(token)).expiresAt).getTime();

    const res = await app.inject({
      method: 'POST',
      url: '/admin/access/grant',
      headers: adminHeaders,
      payload: { telegramUserId: TG_ID, days: 10 },
    });
    expect(res.statusCode).toBe(200);

    const after = new Date((await getAccess(token)).expiresAt).getTime();
    expect(after - before).toBeGreaterThan(9.9 * 86_400_000);
    expect(after - before).toBeLessThan(10.1 * 86_400_000);
  });

  it('revoke немедленно закрывает доступ', async () => {
    const token = await authAs(TG_ID);

    const res = await app.inject({
      method: 'POST',
      url: '/admin/access/revoke',
      headers: adminHeaders,
      payload: { telegramUserId: TG_ID },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().access).toEqual({ isPremium: false, status: 'expired', expiresAt: null });

    const detail = await app.inject({
      method: 'GET',
      url: '/workouts/posture-open-chest',
      headers: bearer(token),
    });
    expect(detail.json().workout.isLocked).toBe(true);
  });

  it('неверный / отсутствующий x-admin-token → 403', async () => {
    const wrong = await app.inject({
      method: 'POST',
      url: '/admin/access/grant',
      headers: { 'x-admin-token': 'wrong-token' },
      payload: { telegramUserId: TG_ID, days: 30 },
    });
    expect(wrong.statusCode).toBe(403);

    const missing = await app.inject({
      method: 'POST',
      url: '/admin/access/grant',
      payload: { telegramUserId: TG_ID, days: 30 },
    });
    expect(missing.statusCode).toBe(403);
  });

  it('неизвестный telegramUserId → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/access/grant',
      headers: adminHeaders,
      payload: { telegramUserId: 111111111, days: 5 },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('выключенные интеграции (env не задан)', () => {
  let disabledApp: FastifyInstance;

  beforeAll(async () => {
    disabledApp = await buildApp({
      ...testConfig,
      tributeApiKey: undefined,
      adminToken: undefined,
    });
    await disabledApp.ready();
  });

  afterAll(async () => {
    await disabledApp.close();
  });

  it('webhook без TRIBUTE_API_KEY → 503 TRIBUTE_DISABLED', async () => {
    const body = tributeBody('new_subscription', {
      telegram_user_id: 900501,
      expires_at: inDays(30),
    });

    const res = await disabledApp.inject({
      method: 'POST',
      url: '/api/tribute/webhook',
      headers: { 'content-type': 'application/json', 'trbt-signature': signBody(body) },
      payload: body,
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('TRIBUTE_DISABLED');
  });

  it('admin-роуты без ADMIN_TOKEN → 503 ADMIN_DISABLED', async () => {
    const res = await disabledApp.inject({
      method: 'POST',
      url: '/admin/access/grant',
      headers: { 'x-admin-token': 'anything' },
      payload: { telegramUserId: 900501, days: 30 },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('ADMIN_DISABLED');
  });
});
