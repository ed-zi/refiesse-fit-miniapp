import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { makeRequireAdmin } from '../adminAuth.ts';
import { AppError } from '../errors.ts';

/**
 * Картинки контента (STEP). Хранятся в БД (bytea) — без внешнего S3/volume,
 * переживают редеплой Railway. Загрузка — admin, отдача — публичная по id.
 */

/** Потолок размера картинки (декодированной). */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const uploadSchema = z.object({
  mimeType: z.string().regex(/^image\/(png|jpe?g|webp|gif)$/i, 'mimeType: только image/*'),
  /** base64 (допускается data-URL префикс — отбросим). */
  data: z.string().min(1),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

export function registerImageRoutes(app: FastifyInstance): void {
  const requireAdmin = makeRequireAdmin(app);

  /** POST /admin/images — загрузка картинки (base64) → { id, url }. */
  app.post(
    '/admin/images',
    { preHandler: requireAdmin, bodyLimit: 8 * 1024 * 1024 },
    async (request, reply) => {
      const { mimeType, data } = uploadSchema.parse(request.body ?? {});
      const base64 = data.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64, 'base64');
      if (buffer.length === 0) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Пустая или некорректная картинка');
      }
      if (buffer.length > MAX_IMAGE_BYTES) {
        throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'Картинка больше 3 МБ');
      }
      const image = await app.prisma.image.create({
        data: { mimeType, data: buffer },
        select: { id: true },
      });
      request.log.info({ imageId: image.id, bytes: buffer.length }, 'admin image uploaded');
      return reply.status(201).send({ id: image.id, url: `/images/${image.id}` });
    },
  );

  /** GET /images/:id — публичная отдача бинаря (иммутабельный кэш). */
  app.get('/images/:id', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const image = await app.prisma.image.findUnique({ where: { id } });
    if (!image) {
      throw new AppError(404, 'NOT_FOUND', 'Image not found');
    }
    return reply
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .type(image.mimeType)
      .send(Buffer.from(image.data));
  });
}
