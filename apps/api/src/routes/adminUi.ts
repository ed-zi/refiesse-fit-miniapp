import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';

/**
 * GET /admin/ui — статическая админ-страница (public/admin.html).
 * Vanilla JS + fetch, без сборки и CDN; сама страница токена не требует —
 * все данные ходят через /admin/* с header x-admin-token (вводится на странице,
 * хранится в sessionStorage).
 */

const ADMIN_HTML_URL = new URL('../../public/admin.html', import.meta.url);

export function registerAdminUiRoutes(app: FastifyInstance): void {
  app.get('/admin/ui', async (_request, reply) => {
    const html = await readFile(ADMIN_HTML_URL, 'utf8');
    return reply.type('text/html; charset=utf-8').send(html);
  });
}
