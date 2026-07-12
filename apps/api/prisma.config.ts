// Prisma CLI v7 config (заменяет url в datasource-блоке schema.prisma).
// CLI-команды (migrate/generate/studio) берут DATABASE_URL из окружения;
// .env подхватываем сами — Prisma 7 больше не читает .env автоматически.
import { defineConfig } from 'prisma/config';

try {
  // Node >= 20.12: встроенная загрузка .env (не перетирает уже заданные переменные).
  process.loadEnvFile(new URL('./.env', import.meta.url).pathname);
} catch {
  // .env отсутствует — полагаемся на переменные окружения процесса.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Требуется для migrate/introspect. В runtime клиент получает подключение
    // через src/db/prisma.ts, а не отсюда.
    url: process.env.DATABASE_URL ?? '',
  },
});
