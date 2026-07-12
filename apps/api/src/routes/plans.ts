import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth.ts';
import { toProgramDto, type ProgramDto } from '../mappers.ts';

export function registerPlanRoutes(app: FastifyInstance): void {
  /** GET /plans — мини-планы с днями (dayIndex, title, workoutSlug) и isPremium. */
  app.get('/plans', { preHandler: authenticate }, async (): Promise<{ items: ProgramDto[] }> => {
    const programs = await app.prisma.program.findMany({
      where: { isPublished: true },
      include: {
        days: {
          orderBy: { dayIndex: 'asc' },
          include: { workout: { select: { slug: true } } },
        },
      },
      orderBy: { slug: 'asc' },
    });

    return { items: programs.map(toProgramDto) };
  });
}
