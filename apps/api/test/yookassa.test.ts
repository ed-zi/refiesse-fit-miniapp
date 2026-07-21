import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { chargeDueSubscriptions } from '../src/billing/chargeDue.ts';
import type {
  CreatePaymentParams,
  CreateRecurringParams,
  YookassaApi,
  YookassaPayment,
} from '../src/yookassa/client.ts';
import { buildInitData, testConfig } from './helpers.ts';

/**
 * P1: ЮKassa create / webhook (подлинность через getPayment) / recurring.
 * HTTP к api.yookassa.ru нигде не выполняется — везде мок клиента или fetch.
 */

// ---- мокабельный клиент ЮKassa: настраиваемые ответы getPayment/create ----
function makePayment(overrides: Partial<YookassaPayment> = {}): YookassaPayment {
  return {
    id: overrides.id ?? 'pay_test',
    status: overrides.status ?? 'succeeded',
    paid: overrides.paid ?? true,
    confirmationUrl: overrides.confirmationUrl ?? 'https://yookassa.test/confirm/pay_test',
    paymentMethodId: overrides.paymentMethodId ?? 'pm_saved_1',
    paymentMethodSaved: overrides.paymentMethodSaved ?? true,
    metadata: overrides.metadata ?? {},
  };
}

class FakeYookassa implements YookassaApi {
  public created: CreatePaymentParams[] = [];
  public recurring: CreateRecurringParams[] = [];
  public getById = new Map<string, YookassaPayment>();
  public createResult: YookassaPayment = makePayment({ id: 'pay_created' });
  public recurringResult: YookassaPayment = makePayment({ id: 'pay_recurring' });

  async createPayment(params: CreatePaymentParams): Promise<YookassaPayment> {
    this.created.push(params);
    return this.createResult;
  }

  async getPayment(id: string): Promise<YookassaPayment> {
    const payment = this.getById.get(id);
    if (!payment) {
      throw new Error(`FakeYookassa: no payment stubbed for ${id}`);
    }
    return payment;
  }

  async createRecurring(params: CreateRecurringParams): Promise<YookassaPayment> {
    this.recurring.push(params);
    return this.recurringResult;
  }
}

let app: FastifyInstance;
let fake: FakeYookassa;

// Инъекция клиента через buildApp: фабрика возвращает fake (или null → 503).
let sharedFake: YookassaApi | null;

beforeAll(async () => {
  fake = new FakeYookassa();
  sharedFake = fake;
  app = await buildApp(testConfig, { yookassaClientFactory: () => sharedFake });
  await app.ready();
  await app.prisma.user.deleteMany();
  await app.prisma.paymentEvent.deleteMany();
});

afterEach(() => {
  fake.created = [];
  fake.recurring = [];
  fake.getById.clear();
  fake.createResult = makePayment({ id: 'pay_created' });
  fake.recurringResult = makePayment({ id: 'pay_recurring' });
});

afterAll(async () => {
  await app.close();
});

async function authAs(telegramId: number): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: {
      initData: buildInitData({ user: { id: telegramId, first_name: `Pay${telegramId}` } }),
    },
  });
  return res.json().token;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

async function getAccess(token: string) {
  const res = await app.inject({ method: 'GET', url: '/access', headers: bearer(token) });
  return res.json();
}

async function postWebhook(paymentId: string, event = 'payment.succeeded') {
  return app.inject({
    method: 'POST',
    url: '/api/payments/yookassa/webhook',
    headers: { 'content-type': 'application/json' },
    payload: { type: 'notification', event, object: { id: paymentId } },
  });
}

describe('POST /api/payments/create', () => {
  it('без JWT → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/payments/create', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('без email/согласия → 400 CONSENT_REQUIRED (платёж не создаётся)', async () => {
    const token = await authAs(920003);
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/create',
      headers: bearer(token),
      payload: { consent: true }, // email отсутствует
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('CONSENT_REQUIRED');
    expect(fake.created).toHaveLength(0);
  });

  it('с JWT + email/согласие → confirmationUrl; email в чеке и согласие сохранены', async () => {
    const token = await authAs(920001);
    fake.createResult = makePayment({
      id: 'pay_created',
      confirmationUrl: 'https://yookassa.test/confirm/xyz',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/create',
      headers: bearer(token),
      payload: { email: 'katya@example.com', consent: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ confirmationUrl: 'https://yookassa.test/confirm/xyz' });
    expect(fake.created).toHaveLength(1);
    const createParams = fake.created[0]!;
    expect(createParams.amountRub).toBe(500);
    expect(createParams.savePaymentMethod).toBe(true);
    expect(createParams.telegramUserId).toBe(920001);
    expect(createParams.returnUrl).toBe(testConfig.yookassaReturnUrl);
    // Email проброшен для чека (ФФД).
    expect(createParams.customerEmail).toBe('katya@example.com');

    // Согласие (152-ФЗ) зафиксировано у пользователя: email + дата + версия.
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { telegramUserId: 920001n },
    });
    expect(user.email).toBe('katya@example.com');
    expect(user.consentAcceptedAt).not.toBeNull();
    expect(user.consentDocVersion).toBe('2026-07-21');
  });

  it('без ключей ЮKassa → 503 PAYMENTS_DISABLED', async () => {
    sharedFake = null; // как будто конфиг без shopId/secretKey
    const token = await authAs(920001);

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/create',
      headers: bearer(token),
      payload: {},
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('PAYMENTS_DISABLED');
    sharedFake = fake; // восстановить
  });

  it('рекуррент выключен → save_payment_method:false (разовый платёж)', async () => {
    // Отдельное приложение с yookassaRecurringEnabled:false — как боевой магазин
    // без подключённых автоплатежей (иначе ЮKassa даёт 403 на save_payment_method).
    const oneTimeFake = new FakeYookassa();
    oneTimeFake.createResult = makePayment({
      id: 'pay_onetime',
      confirmationUrl: 'https://yookassa.test/confirm/onetime',
    });
    const oneTimeApp = await buildApp(
      { ...testConfig, yookassaRecurringEnabled: false },
      { yookassaClientFactory: () => oneTimeFake },
    );
    await oneTimeApp.ready();
    try {
      const authRes = await oneTimeApp.inject({
        method: 'POST',
        url: '/auth/telegram',
        payload: { initData: buildInitData({ user: { id: 920009, first_name: 'One' } }) },
      });
      const token = authRes.json().token as string;

      const res = await oneTimeApp.inject({
        method: 'POST',
        url: '/api/payments/create',
        headers: { authorization: `Bearer ${token}` },
        payload: { email: 'one@example.com', consent: true },
      });

      expect(res.statusCode).toBe(200);
      expect(oneTimeFake.created).toHaveLength(1);
      expect(oneTimeFake.created[0]!.savePaymentMethod).toBe(false);
    } finally {
      await oneTimeApp.close();
    }
  });
});

describe('POST /api/payments/yookassa/webhook — подлинность через getPayment', () => {
  it('succeeded (реальный статус из API) открывает доступ + paymentMethodId + premium-видео', async () => {
    const token = await authAs(920101);

    // До оплаты premium-карточка заперта.
    const before = await app.inject({
      method: 'GET',
      url: '/workouts/thoracic-mobility',
      headers: bearer(token),
    });
    expect(before.json().workout.isLocked).toBe(true);

    fake.getById.set(
      'pay_succ_1',
      makePayment({
        id: 'pay_succ_1',
        status: 'succeeded',
        paymentMethodId: 'pm_920101',
        metadata: { telegram_user_id: '920101' },
      }),
    );

    const res = await postWebhook('pay_succ_1');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });

    const access = await getAccess(token);
    expect(access.isPremium).toBe(true);
    expect(access.status).toBe('active');
    // ~30 дней.
    const ms = new Date(access.expiresAt).getTime() - Date.now();
    expect(ms).toBeGreaterThan(29.9 * 86_400_000);
    expect(ms).toBeLessThan(30.1 * 86_400_000);

    const user = await app.prisma.user.findUniqueOrThrow({
      where: { telegramUserId: 920101n },
    });
    const sub = await app.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    expect(sub.provider).toBe('yookassa');
    expect(sub.paymentMethodId).toBe('pm_920101');

    // Premium-видео открылось.
    const detail = await app.inject({
      method: 'GET',
      url: '/workouts/thoracic-mobility',
      headers: bearer(token),
    });
    expect(detail.json().workout.isLocked).toBe(false);
    expect(typeof detail.json().workout.videoUrl).toBe('string');
  });

  it('тело говорит succeeded, но реальный статус canceled → доступ НЕ открыт', async () => {
    const token = await authAs(920102);
    // Атакующий шлёт payment.succeeded, но API возвращает canceled.
    fake.getById.set(
      'pay_forged',
      makePayment({
        id: 'pay_forged',
        status: 'canceled',
        metadata: { telegram_user_id: '920102' },
      }),
    );

    const res = await postWebhook('pay_forged', 'payment.succeeded');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ignored' });

    expect(await getAccess(token)).toEqual({
      isPremium: false,
      status: 'none',
      expiresAt: null,
    });
    const event = await app.prisma.paymentEvent.findFirstOrThrow({
      where: { eventId: 'pay_forged' },
    });
    expect(event.processedAt).toBeNull();
    expect(event.error).toContain('NOT_SUCCEEDED');
  });

  it('pending реальный статус → ignored, доступ не открыт', async () => {
    const token = await authAs(920103);
    fake.getById.set(
      'pay_pending',
      makePayment({ id: 'pay_pending', status: 'pending', metadata: { telegram_user_id: '920103' } }),
    );

    const res = await postWebhook('pay_pending', 'payment.waiting_for_capture');
    expect(res.json()).toEqual({ status: 'ignored' });
    expect((await getAccess(token)).isPremium).toBe(false);
  });

  it('duplicate payment id → идемпотентно (доступ не задваивается)', async () => {
    const token = await authAs(920104);
    fake.getById.set(
      'pay_dup',
      makePayment({
        id: 'pay_dup',
        status: 'succeeded',
        paymentMethodId: 'pm_dup',
        metadata: { telegram_user_id: '920104' },
      }),
    );

    const first = await postWebhook('pay_dup');
    expect(first.json()).toEqual({ status: 'ok' });
    const accessAfterFirst = await getAccess(token);

    const second = await postWebhook('pay_dup');
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ status: 'duplicate' });

    expect(
      await app.prisma.paymentEvent.count({ where: { eventId: 'pay_dup' } }),
    ).toBe(1);
    expect(await getAccess(token)).toEqual(accessAfterFirst);
  });

  it('неизвестный telegram_user_id → 200 unmatched', async () => {
    fake.getById.set(
      'pay_unmatched',
      makePayment({
        id: 'pay_unmatched',
        status: 'succeeded',
        metadata: { telegram_user_id: '999888777' },
      }),
    );

    const res = await postWebhook('pay_unmatched');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'unmatched' });

    const event = await app.prisma.paymentEvent.findFirstOrThrow({
      where: { eventId: 'pay_unmatched' },
    });
    expect(event.error).toBe('UNMATCHED_USER');
    expect(event.processedAt).toBeNull();
  });
});

describe('chargeDueSubscriptions (recurring)', () => {
  async function seedYookassaSub(
    telegramId: number,
    opts: { expiresInDays: number; paymentMethodId: string | null },
  ) {
    const token = await authAs(telegramId);
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { telegramUserId: BigInt(telegramId) },
    });
    await app.prisma.subscription.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        status: 'active',
        provider: 'yookassa',
        paymentMethodId: opts.paymentMethodId,
        expiresAt: new Date(Date.now() + opts.expiresInDays * 86_400_000),
        startedAt: new Date(),
      },
      update: {
        status: 'active',
        provider: 'yookassa',
        paymentMethodId: opts.paymentMethodId,
        expiresAt: new Date(Date.now() + opts.expiresInDays * 86_400_000),
      },
    });
    return { token, user };
  }

  it('продлевает подписку при succeeded, не трогает не-истекающие', async () => {
    const due = await seedYookassaSub(920201, { expiresInDays: 0.5, paymentMethodId: 'pm_due' });
    const notDue = await seedYookassaSub(920202, { expiresInDays: 20, paymentMethodId: 'pm_far' });
    const dueBefore = await app.prisma.subscription.findUniqueOrThrow({
      where: { userId: due.user.id },
    });

    fake.recurringResult = makePayment({ id: 'pay_rec_ok', status: 'succeeded' });
    const result = await chargeDueSubscriptions(app.prisma, fake);

    expect(result.charged).toBe(1);
    expect(fake.recurring).toHaveLength(1);
    expect(fake.recurring[0]?.paymentMethodId).toBe('pm_due');

    const dueAfter = await app.prisma.subscription.findUniqueOrThrow({
      where: { userId: due.user.id },
    });
    // Продлена примерно на 30 дней от прежнего expiresAt.
    const delta = dueAfter.expiresAt!.getTime() - dueBefore.expiresAt!.getTime();
    expect(delta).toBeGreaterThan(29.9 * 86_400_000);
    expect(delta).toBeLessThan(30.1 * 86_400_000);

    // Не-истекающая не списывалась.
    expect(result.outcomes.some((o) => o.userId === notDue.user.id)).toBe(false);
  });

  it('при неуспехе (canceled) не продлевает и помечает failed', async () => {
    const sub = await seedYookassaSub(920203, { expiresInDays: 0.2, paymentMethodId: 'pm_fail' });
    const before = await app.prisma.subscription.findUniqueOrThrow({
      where: { userId: sub.user.id },
    });

    fake.recurringResult = makePayment({ id: 'pay_rec_fail', status: 'canceled', paid: false });
    const result = await chargeDueSubscriptions(app.prisma, fake);

    const failed = result.outcomes.find((o) => o.userId === sub.user.id);
    expect(failed?.outcome).toBe('failed');

    const after = await app.prisma.subscription.findUniqueOrThrow({
      where: { userId: sub.user.id },
    });
    expect(after.expiresAt!.getTime()).toBe(before.expiresAt!.getTime()); // не продлена
    expect(after.status).toBe('active'); // доступ пока не рубим (grace)
  });

  it('подписки без paymentMethodId игнорируются', async () => {
    await seedYookassaSub(920204, { expiresInDays: 0.1, paymentMethodId: null });

    const result = await chargeDueSubscriptions(app.prisma, fake);
    expect(result.outcomes.every((o) => o.subscriptionId !== undefined)).toBe(true);
    expect(fake.recurring.every((r) => r.paymentMethodId !== null)).toBe(true);
  });
});
