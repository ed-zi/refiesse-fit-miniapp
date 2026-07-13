import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.ts';
import { applyTributeEvent, tributeEventSchema } from '../tribute/applyEvent.ts';
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
 * применится повторно, но применение state-setting — эффект тот же.
 * TODO(перед продом): сверить с доками Tribute, есть ли настоящий event id.
 *
 * Поток (architecture.md §6): подпись → JSON/zod → запись TributeEvent
 * (create; P2002 = duplicate) → применение (tribute/applyEvent.ts) → processedAt.
 */

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

      // 4. Применение (общая логика с admin reprocess).
      const outcome = await applyTributeEvent(app.prisma, event);

      if (outcome.status === 'ok') {
        await app.prisma.tributeEvent.update({
          where: { id: eventRecord.id },
          data: { processedAt: new Date(), error: null },
        });
        request.log.info(
          { eventId, type: event.name, telegramUserId: Number(telegramUserId) },
          'tribute webhook applied',
        );
        return { status: 'ok' };
      }

      // unmatched: юзера нет в БД — сохраняем для reprocess из админки, отвечаем 200.
      // ignored: expires_at отсутствует/битый — подписку не трогаем.
      await app.prisma.tributeEvent.update({
        where: { id: eventRecord.id },
        data: { error: outcome.error },
      });
      request.log.warn(
        { eventId, type: event.name, telegramUserId: Number(telegramUserId), error: outcome.error },
        'tribute webhook not applied',
      );
      return { status: outcome.status };
    });
  });
}
