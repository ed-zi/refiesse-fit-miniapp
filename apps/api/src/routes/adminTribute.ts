import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { makeRequireAdmin } from '../adminAuth.ts';
import { AppError } from '../errors.ts';
import { applyTributeEvent, tributeEventSchema } from '../tribute/applyEvent.ts';
import type { TributeEvent } from '../generated/prisma/client.ts';

/** Admin: журнал Tribute-событий + ручной reprocess (S3-4 п.5). */

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

function tributeEventDto(event: TributeEvent) {
  return {
    id: event.id,
    eventId: event.eventId,
    name: event.type,
    telegramUserId: event.telegramUserId === null ? null : Number(event.telegramUserId),
    signatureOk: event.signatureOk,
    processedAt: event.processedAt?.toISOString() ?? null,
    error: event.error,
    receivedAt: event.receivedAt.toISOString(),
    payload: event.payload,
  };
}

export function registerAdminTributeRoutes(app: FastifyInstance): void {
  const requireAdmin = makeRequireAdmin(app);
  const adminOpts = { preHandler: requireAdmin };

  /** GET /admin/tribute-events?limit=50 — новые сверху. */
  app.get('/admin/tribute-events', adminOpts, async (request) => {
    const { limit } = listQuerySchema.parse(request.query ?? {});
    const events = await app.prisma.tributeEvent.findMany({
      orderBy: { receivedAt: 'desc' },
      take: limit,
    });
    return { items: events.map(tributeEventDto) };
  });

  /**
   * POST /admin/tribute-events/:id/reprocess — повторное применение payload
   * (architecture.md §6: ручной reprocess). Типовой случай: unmatched-событие,
   * юзер уже успел зайти в приложение → применяем. Применение state-setting,
   * поэтому повторный reprocess идемпотентен по эффекту.
   */
  app.post('/admin/tribute-events/:id/reprocess', adminOpts, async (request) => {
    const { id } = idParamsSchema.parse(request.params);

    const event = await app.prisma.tributeEvent.findUnique({ where: { id } });
    if (!event) {
      throw new AppError(404, 'NOT_FOUND', 'Tribute event not found');
    }

    // payload хранит исходное тело webhook — парсим той же схемой.
    const parsed = tributeEventSchema.safeParse(event.payload);
    if (!parsed.success) {
      throw new AppError(422, 'UNPROCESSABLE_PAYLOAD', 'Stored payload has unexpected shape');
    }

    const outcome = await applyTributeEvent(app.prisma, parsed.data);
    const updated = await app.prisma.tributeEvent.update({
      where: { id },
      data:
        outcome.status === 'ok'
          ? { processedAt: new Date(), error: null }
          : { error: outcome.error },
    });

    request.log.info(
      { tributeEventId: id, outcome: outcome.status },
      'admin tribute event reprocess',
    );
    return { status: outcome.status, event: tributeEventDto(updated) };
  });
}
