import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { runReminderTick } from './reminders.ts';

/** Как часто планировщик проверяет, кому пора напомнить (МСК-час меняется раз в час). */
const REMINDER_TICK_MS = 10 * 60 * 1000;

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

  // Мягкие напоминания (MOTIV-1): периодический тик (не в тестах — там app.inject).
  let reminderTimer: NodeJS.Timeout | undefined;
  if (config.remindersEnabled) {
    app.log.info('Reminders scheduler enabled');
    reminderTimer = setInterval(() => {
      void runReminderTick(app.prisma, config.botToken, new Date(), {
        webAppUrl: config.webappUrl,
      })
        .then((result) => {
          if (result.sent > 0) {
            app.log.info({ sent: result.sent }, 'Reminders sent');
          }
        })
        .catch((err: unknown) => {
          app.log.error({ err }, 'Reminder tick failed');
        });
    }, REMINDER_TICK_MS);
    reminderTimer.unref?.();
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down');
    if (reminderTimer) {
      clearInterval(reminderTimer);
    }
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
