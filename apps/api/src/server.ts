import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';

// Подхватываем .env (dev-удобство; в проде переменные приходят из окружения).
try {
  process.loadEnvFile(new URL('../.env', import.meta.url).pathname);
} catch {
  // .env отсутствует — работаем только с переменными окружения процесса.
}

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const app = await buildApp(config);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
