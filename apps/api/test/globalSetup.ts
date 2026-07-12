import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TEST_DATABASE_URL } from './testDb.ts';

const apiRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * Перед тестами: создаём refiesse_test (если её нет) и накатываем миграции.
 * Делает прогон повторяемым на чистой машине с локальным PostgreSQL.
 */
export default function globalSetup(): void {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.replace(/^\//, '');

  try {
    execFileSync(
      'createdb',
      ['-h', url.hostname, '-p', url.port || '5432', '-U', url.username, dbName],
      {
        env: { ...process.env, PGPASSWORD: url.password },
        stdio: 'pipe',
      },
    );
  } catch (err) {
    const stderr = String((err as { stderr?: unknown }).stderr ?? '');
    if (!stderr.includes('already exists')) {
      throw err;
    }
  }

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });

  // Клиент генерируется в src/generated (gitignored) — на чистом клоне его нет.
  execFileSync('npx', ['prisma', 'generate'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}
