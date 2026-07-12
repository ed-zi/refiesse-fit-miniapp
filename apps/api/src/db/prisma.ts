import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';

export interface PrismaConnection {
  prisma: PrismaClient;
  close(): Promise<void>;
}

export async function createPrismaConnection(databaseUrl: string): Promise<PrismaConnection> {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  let closed = false;
  return {
    prisma,
    close: async () => {
      if (closed) {
        return;
      }
      closed = true;
      await prisma.$disconnect();
    },
  };
}
