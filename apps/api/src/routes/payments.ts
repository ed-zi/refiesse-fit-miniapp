import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../auth.ts';
import {
  SUBSCRIPTION_PERIOD_DAYS,
  activateSubscription,
  computeExtendedExpiry,
} from '../billing/subscription.ts';
import { AppError } from '../errors.ts';
import {
  YookassaError,
  YookassaHttpClient,
  type YookassaApi,
  type YookassaPayment,
} from '../yookassa/client.ts';
import type { Prisma } from '../generated/prisma/client.ts';

/**
 * Версия юр. документов (оферта + политика), которую фиксируем в согласии
 * пользователя (152-ФЗ). Держим локально в API: образ apps/api собирается
 * ИЗОЛИРОВАННО (Root Directory = apps/api) и не видит packages/shared —
 * кросс-пакетный импорт уронил бы старт сервиса. Значение синхронно с
 * shared LEGAL_DOC_VERSION (меняем в обоих местах при обновлении текста).
 */
const LEGAL_DOC_VERSION = '2026-07-21';

/**
 * ЮKassa-платежи (P1).
 *
 * ПОДЛИННОСТЬ ВЕБХУКА: ЮKassa НЕ подписывает уведомления HMAC. Тело вебхука
 * само по себе не доказательство. Поэтому на каждый вебхук мы ПЕРЕЗАПРАШИВАЕМ
 * объект платежа через API (getPayment) и доверяем СТАТУСУ ИЗ ОТВЕТА API,
 * а не статусу из тела. Подделанное тело с "succeeded" не откроет доступ,
 * если реальный платёж не succeeded.
 *
 * Идемпотентность: PaymentEvent уникален по (provider, eventId=payment.id).
 * processedAt != null означает, что доступ по этому платежу уже открыт —
 * повторный вебхук → duplicate.
 */

const SUBSCRIPTION_PRICE_RUB = 500;

/**
 * Тело POST /api/payments/create. Чек ЮKassa (ФФД) требует контакт плательщика —
 * без email платёж не создать. consent=true — согласие с офертой и обработкой
 * ПДн (152-ФЗ); фиксируем факт/дату/версию в пользователе.
 */
const createBodySchema = z.object({
  email: z.string().trim().email(),
  consent: z.literal(true),
});

const webhookSchema = z.looseObject({
  event: z.string().optional(),
  object: z.looseObject({
    id: z.string().min(1),
  }),
});

type WebhookResult =
  | { status: 'ok' }
  | { status: 'duplicate' }
  | { status: 'unmatched' }
  | { status: 'ignored' };

export interface PaymentRoutesOptions {
  /** Инъекция fetch для клиента (без реальных вызовов к api.yookassa.ru). */
  yookassaFetch?: typeof fetch;
  /**
   * Инъекция готового клиента ЮKassa (тесты подменяют весь HTTP-слой).
   * Возвращает null → интеграция считается не настроенной (503). Если не задан —
   * клиент строится из конфига (buildYookassaClient).
   */
  clientFactory?: () => YookassaApi | null;
}

/** Строит клиент ЮKassa из конфига; null — интеграция не настроена. */
export function buildYookassaClient(
  app: FastifyInstance,
  options: PaymentRoutesOptions = {},
): YookassaApi | null {
  const { yookassaShopId, yookassaSecretKey } = app.config;
  if (yookassaShopId === undefined || yookassaSecretKey === undefined) {
    return null;
  }
  return new YookassaHttpClient({
    shopId: yookassaShopId,
    secretKey: yookassaSecretKey,
    fetchImpl: options.yookassaFetch,
  });
}

/** telegram_user_id из metadata платежа (строка цифр) → BigInt | null. */
function telegramIdFromMetadata(metadata: Record<string, unknown>): bigint | null {
  const raw = metadata['telegram_user_id'];
  if (typeof raw === 'number' && Number.isInteger(raw)) {
    return BigInt(raw);
  }
  if (typeof raw === 'string' && /^\d+$/.test(raw)) {
    return BigInt(raw);
  }
  return null;
}

export function registerPaymentRoutes(
  app: FastifyInstance,
  options: PaymentRoutesOptions = {},
): void {
  const resolveClient = options.clientFactory ?? (() => buildYookassaClient(app, options));
  const getClientOr503 = (): YookassaApi => {
    const client = resolveClient();
    if (client === null) {
      throw new AppError(503, 'PAYMENTS_DISABLED', 'YooKassa is not configured');
    }
    return client;
  };

  /**
   * POST /api/payments/create (JWT) — создаёт платёж ЮKassa на 500 ₽
   * (save_payment_method:true) → { confirmationUrl }.
   */
  app.post(
    '/api/payments/create',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request): Promise<{ confirmationUrl: string }> => {
      const client = getClientOr503();
      const returnUrl = app.config.yookassaReturnUrl;
      if (returnUrl === undefined) {
        throw new AppError(503, 'PAYMENTS_DISABLED', 'YOOKASSA_RETURN_URL is not configured');
      }

      // Email (для чека) + согласие (оферта/ПДн) обязательны: без email ЮKassa
      // не пробьёт чек, без согласия нельзя брать оплату и хранить ПДн.
      const parsed = createBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw new AppError(400, 'CONSENT_REQUIRED', 'Требуется email и согласие с офертой');
      }
      const email = parsed.data.email;

      const user = await app.prisma.user.findUnique({ where: { id: request.user.userId } });
      if (!user) {
        throw new AppError(401, 'UNAUTHORIZED', 'User for this token no longer exists');
      }

      // Фиксируем контакт и факт согласия (152-ФЗ): дата + версия документов.
      await app.prisma.user.update({
        where: { id: user.id },
        data: {
          email,
          consentAcceptedAt: new Date(),
          consentDocVersion: LEGAL_DOC_VERSION,
        },
      });

      let payment: YookassaPayment;
      try {
        payment = await client.createPayment({
          amountRub: SUBSCRIPTION_PRICE_RUB,
          description: 'Refiesse Fit — подписка на месяц',
          telegramUserId: Number(user.telegramUserId),
          savePaymentMethod: true,
          returnUrl,
          idempotenceKey: randomUUID(),
          customerEmail: email,
        });
      } catch (error) {
        // ЮKassa отклонила запрос (напр. 403 «магазин не активирован для приёма
        // платежей», неверные ключи, тест/боевой режим). Логируем ДОСЛОВНО
        // статус и описание от ЮKassa — иначе причина не видна в логах.
        if (error instanceof YookassaError) {
          request.log.error(
            { yookassaStatus: error.statusCode, yookassaMessage: error.message },
            'yookassa createPayment rejected',
          );
          throw new AppError(
            502,
            'PAYMENT_PROVIDER_REJECTED',
            `ЮKassa отклонила платёж (${error.statusCode}): ${error.message}`,
          );
        }
        throw error;
      }

      if (payment.confirmationUrl === null) {
        throw new AppError(502, 'PAYMENT_CREATE_FAILED', 'YooKassa did not return a confirmation URL');
      }

      request.log.info(
        { paymentId: payment.id, telegramUserId: Number(user.telegramUserId) },
        'yookassa payment created',
      );
      return { confirmationUrl: payment.confirmationUrl };
    },
  );

  /**
   * POST /api/payments/yookassa/webhook (без JWT). Подлинность — перезапрос
   * платежа через API (см. заголовок файла). Всегда 200 при валидной
   * обработке (ЮKassa ретраит на не-200).
   */
  app.post(
    '/api/payments/yookassa/webhook',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request): Promise<WebhookResult> => {
      const client = getClientOr503();

      const parsed = webhookSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw new AppError(400, 'INVALID_PAYLOAD', 'Unexpected YooKassa webhook shape');
      }
      const paymentId = parsed.data.object.id;
      const eventType = parsed.data.event ?? 'unknown';

      request.log.info({ paymentId, eventType }, 'yookassa webhook received');

      // Уже применён ранее → duplicate, доступ не трогаем.
      const existing = await app.prisma.paymentEvent.findUnique({
        where: { provider_eventId: { provider: 'yookassa', eventId: paymentId } },
      });
      if (existing?.processedAt) {
        return { status: 'duplicate' };
      }

      // ПОДЛИННОСТЬ: доверяем статусу из ответа API, а не телу вебхука.
      const payment = await client.getPayment(paymentId);
      const telegramUserId = telegramIdFromMetadata(payment.metadata);

      const recordEvent = async (
        error: string | null,
        processed: boolean,
      ): Promise<void> => {
        const data = {
          provider: 'yookassa' as const,
          eventType,
          telegramUserId,
          payload: (request.body ?? {}) as Prisma.InputJsonValue,
          error,
          processedAt: processed ? new Date() : null,
        };
        await app.prisma.paymentEvent.upsert({
          where: { provider_eventId: { provider: 'yookassa', eventId: paymentId } },
          create: { eventId: paymentId, ...data },
          update: data,
        });
      };

      // Реальный статус НЕ succeeded → доступ не открываем (защита от подделки тела).
      if (payment.status !== 'succeeded') {
        await recordEvent(`NOT_SUCCEEDED:${payment.status}`, false);
        request.log.info(
          { paymentId, realStatus: payment.status },
          'yookassa webhook: payment not succeeded, access untouched',
        );
        return { status: 'ignored' };
      }

      // Неизвестный юзер → сохраняем для reprocess, отвечаем 200.
      if (telegramUserId === null) {
        await recordEvent('UNMATCHED_USER', false);
        request.log.warn({ paymentId }, 'yookassa webhook: telegram_user_id missing/unmatched');
        return { status: 'unmatched' };
      }
      const user = await app.prisma.user.findUnique({ where: { telegramUserId } });
      if (!user) {
        await recordEvent('UNMATCHED_USER', false);
        request.log.warn(
          { paymentId, telegramUserId: Number(telegramUserId) },
          'yookassa webhook: user not found (unmatched)',
        );
        return { status: 'unmatched' };
      }

      // Открываем/продлеваем доступ на 30 дней + сохраняем способ оплаты.
      const now = new Date();
      const subscription = await app.prisma.subscription.findUnique({
        where: { userId: user.id },
      });
      const expiresAt = computeExtendedExpiry(
        subscription?.expiresAt ?? null,
        SUBSCRIPTION_PERIOD_DAYS,
        now,
      );
      await activateSubscription(
        app.prisma,
        user.id,
        {
          expiresAt,
          provider: 'yookassa',
          ...(payment.paymentMethodId !== null
            ? { paymentMethodId: payment.paymentMethodId }
            : {}),
        },
        now,
      );
      await recordEvent(null, true);

      request.log.info(
        { paymentId, telegramUserId: Number(telegramUserId), expiresAt: expiresAt.toISOString() },
        'yookassa webhook applied: access opened',
      );
      return { status: 'ok' };
    },
  );
}
