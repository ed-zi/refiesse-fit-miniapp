import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../errors.ts';
import { verifyTributeSignature } from '../tribute/verifySignature.ts';
import type { Prisma } from '../generated/prisma/client.ts';

/**
 * POST /api/tribute/webhook (S3-2).
 *
 * Внешний вызов от Tribute: БЕЗ JWT, аутентификация — подпись trbt-signature
 * (HMAC-SHA256 от сырого тела, ключ TRIBUTE_API_KEY, см. tribute/verifySignature.ts).
 *
 * Идемпотентность: eventId = SHA-256(raw body). Обоснование: в допущенном
 * формате событий Tribute нет явного event_id; ретраи шлют байт-в-байт то же
 * тело → тот же hash → уникальный индекс TributeEvent.eventId гасит дубль.
 * Если Tribute при ретрае перегенерирует sent_at (тело изменится), событие
 * применится повторно, но обработчики state-setting (status/expiresAt
 * присваиваются из payload, ничего не инкрементируется) — эффект тот же.
 * TODO(перед продом): сверить с доками Tribute, есть ли настоящий event id.
 *
 * Поток (architecture.md §6): подпись → JSON/zod → запись TributeEvent
 * (create; P2002 = duplicate) → матчинг юзера → применение → processedAt.
 */

const TRIBUTE_EVENT_NAMES = [
  'new_subscription',
  'renewed_subscription',
  'cancelled_subscription',
] as const;

// Защищённый парсинг: реальные поля Tribute могут отличаться/добавляться —
// неизвестные ключи пропускаем (loose), обязательны только name и telegram_user_id.
const tributeEventSchema = z.looseObject({
  name: z.enum(TRIBUTE_EVENT_NAMES),
  created_at: z.string().optional(),
  sent_at: z.string().optional(),
  payload: z.looseObject({
    subscription_id: z.union([z.string(), z.number()]).optional(),
    telegram_user_id: z.union([z.number().int(), z.string().regex(/^\d+$/)]),
    expires_at: z.string().optional(),
  }),
});

/** ISO-строка → Date; отсутствие/мусор → null (не роняем платёжный контур). */
function parseExpiresAt(value: string | undefined): Date | null {
  if (value === undefined) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

type WebhookResult =
  | { status: 'ok' }
  | { status: 'duplicate' }
  | { status: 'unmatched' }
  | { status: 'ignored' };

export function registerTributeRoutes(app: FastifyInstance): void {
  // Изолированный scope: свой content-type parser (raw buffer) ТОЛЬКО для
  // webhook-роута — остальное приложение продолжает парсить JSON как обычно.
  void app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => {
      done(null, body);
    });

    scope.post('/api/tribute/webhook', async (request): Promise<WebhookResult> => {
      const apiKey = app.config.tributeApiKey;
      if (apiKey === undefined) {
        throw new AppError(503, 'TRIBUTE_DISABLED', 'TRIBUTE_API_KEY is not configured');
      }

      const raw = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
      const signatureHeader = request.headers['trbt-signature'];
      const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

      // 1. Подпись. Невалидна → 403, событие НЕ применяется и НЕ логируется.
      if (!verifyTributeSignature(raw, signature, apiKey)) {
        throw new AppError(403, 'INVALID_SIGNATURE', 'Invalid or missing trbt-signature');
      }

      // 2. Защищённый парсинг тела.
      let json: unknown;
      try {
        json = JSON.parse(raw.toString('utf8'));
      } catch {
        throw new AppError(400, 'INVALID_PAYLOAD', 'Webhook body is not valid JSON');
      }
      const parsed = tributeEventSchema.safeParse(json);
      if (!parsed.success) {
        throw new AppError(400, 'INVALID_PAYLOAD', 'Unexpected Tribute event shape');
      }
      const event = parsed.data;
      const telegramUserId = BigInt(event.payload.telegram_user_id);

      // 3. Регистрируем событие. Уникальный eventId = SHA-256(raw body) —
      //    ретрай того же тела упирается в индекс → duplicate, без повторного применения.
      const eventId = createHash('sha256').update(raw).digest('hex');
      let eventRecord;
      try {
        eventRecord = await app.prisma.tributeEvent.create({
          data: {
            eventId,
            type: event.name,
            telegramUserId,
            payload: json as Prisma.InputJsonValue,
            signatureOk: true,
          },
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          request.log.info({ eventId, type: event.name }, 'tribute webhook duplicate');
          return { status: 'duplicate' };
        }
        throw error;
      }

      // 4. Матчинг пользователя. Нет в БД → сохраняем как unmatched, отвечаем 200
      //    (Tribute не должен ретраить вечно). TODO(S3+): reprocess из админки.
      const user = await app.prisma.user.findUnique({ where: { telegramUserId } });
      if (!user) {
        await app.prisma.tributeEvent.update({
          where: { id: eventRecord.id },
          data: { error: 'UNMATCHED_USER' },
        });
        request.log.warn(
          { eventId, type: event.name, telegramUserId: Number(telegramUserId) },
          'tribute webhook: user not found (unmatched)',
        );
        return { status: 'unmatched' };
      }

      // 5. Применение к Subscription.
      const now = new Date();
      const tributeSubscriptionId =
        event.payload.subscription_id !== undefined
          ? String(event.payload.subscription_id)
          : undefined;

      if (event.name === 'cancelled_subscription') {
        // Отмена: статус cancelled, expiresAt НЕ трогаем — доступ до конца периода.
        const existing = await app.prisma.subscription.findUnique({
          where: { userId: user.id },
        });
        if (existing) {
          await app.prisma.subscription.update({
            where: { userId: user.id },
            data: {
              status: 'cancelled',
              cancelledAt: now,
              ...(tributeSubscriptionId !== undefined ? { tributeSubscriptionId } : {}),
            },
          });
        } else {
          // Отмена без известной подписки — фиксируем состояние как есть.
          await app.prisma.subscription.create({
            data: {
              userId: user.id,
              status: 'cancelled',
              expiresAt: parseExpiresAt(event.payload.expires_at),
              cancelledAt: now,
              tributeSubscriptionId: tributeSubscriptionId ?? null,
            },
          });
        }
      } else {
        // new_subscription / renewed_subscription: активируем до payload.expires_at.
        const expiresAt = parseExpiresAt(event.payload.expires_at);
        if (expiresAt === null) {
          await app.prisma.tributeEvent.update({
            where: { id: eventRecord.id },
            data: { error: 'MISSING_OR_INVALID_EXPIRES_AT' },
          });
          request.log.warn(
            { eventId, type: event.name },
            'tribute webhook: expires_at missing/invalid, subscription untouched',
          );
          return { status: 'ignored' };
        }
        await app.prisma.subscription.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            status: 'active',
            expiresAt,
            startedAt: now,
            tributeSubscriptionId: tributeSubscriptionId ?? null,
          },
          update: {
            status: 'active',
            expiresAt,
            cancelledAt: null,
            ...(tributeSubscriptionId !== undefined ? { tributeSubscriptionId } : {}),
          },
        });
      }

      // 6. Помечаем применённым.
      await app.prisma.tributeEvent.update({
        where: { id: eventRecord.id },
        data: { processedAt: new Date() },
      });
      request.log.info(
        { eventId, type: event.name, telegramUserId: Number(telegramUserId) },
        'tribute webhook applied',
      );
      return { status: 'ok' };
    });
  });
}
