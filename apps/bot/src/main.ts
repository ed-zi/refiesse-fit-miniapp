/**
 * Refiesse Fit — Telegram bot (@refiessefit_bot).
 * Тонкий grammY-процесс: открывает Mini App, отдаёт кнопки. Бизнес-логики нет.
 */
import { Bot, GrammyError, HttpError, InlineKeyboard } from "grammy";
import { loadConfig } from "./config.js";

const config = loadConfig();

const bot = new Bot(config.botToken);

/** Кнопка входа в Mini App (web_app). */
const openAppKeyboard = new InlineKeyboard().webApp(
  "Открыть Refiesse Fit",
  config.webappUrl,
);

const START_TEXT = [
  "Привет! Это Refiesse Fit — мягкая система заботы о теле.",
  "",
  "Здесь без гонки и жёстких челленджей: короткие тренировки, свой темп и бережное отношение к себе.",
  "",
  "Когда будете готовы — просто откройте приложение.",
].join("\n");

bot.command("start", async (ctx) => {
  await ctx.reply(START_TEXT, { reply_markup: openAppKeyboard });
});

bot.command("app", async (ctx) => {
  await ctx.reply("Mini App здесь:", { reply_markup: openAppKeyboard });
});

const ADMIN_TEXT = "Управление контентом Refiesse Fit.";

bot.command("admin", async (ctx) => {
  const fromId = ctx.from?.id;
  const isAdmin =
    fromId !== undefined && config.adminTelegramIds.has(String(fromId));

  if (!isAdmin) {
    // Мягкий отказ + свой ID, чтобы человек мог прислать его для whitelist.
    await ctx.reply(
      `Админка доступна только администраторам. Ваш Telegram ID: ${fromId ?? "неизвестен"}`,
    );
    return;
  }

  if (!config.adminUrl) {
    await ctx.reply("Админка ещё не настроена.");
    return;
  }

  // web_app-кнопка в inline-клавиатуре — только HTTPS (ADMIN_URL по https).
  const adminKeyboard = new InlineKeyboard().webApp(
    "🛠 Открыть админку",
    config.adminUrl,
  );
  await ctx.reply(ADMIN_TEXT, { reply_markup: adminKeyboard });
});

// Ошибки обработчиков логируем без падения процесса (и без токена в логах).
bot.catch(({ ctx, error }) => {
  const prefix = `[bot] ошибка при обработке update ${ctx.update.update_id}:`;
  if (error instanceof GrammyError) {
    console.error(prefix, "Telegram API:", error.description);
  } else if (error instanceof HttpError) {
    console.error(prefix, "сеть/HTTP:", error);
  } else {
    console.error(prefix, error);
  }
});

async function main(): Promise<void> {
  // Меню команд бота (видно пользователю в клиенте Telegram).
  await bot.api.setMyCommands([
    { command: "start", description: "Приветствие и вход в Mini App" },
    { command: "app", description: "Открыть Mini App" },
    { command: "admin", description: "Управление контентом (для админов)" },
  ]);

  // Graceful shutdown: завершаем long polling, не бросая обработку текущего update.
  const shutdown = (signal: NodeJS.Signals): void => {
    console.log(`[bot] получен ${signal}, останавливаю long polling...`);
    void bot.stop();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  // ВАЖНО: токен в логи не выводим.
  console.log(`[bot] старт: long polling, WebApp URL: ${config.webappUrl}`);

  await bot.start({
    onStart: (me) => {
      console.log(`[bot] запущен как @${me.username} (id ${me.id})`);
    },
  });

  console.log("[bot] long polling остановлен, выходим.");
}

main().catch((error: unknown) => {
  if (error instanceof GrammyError) {
    console.error(`[bot] Telegram API отклонил запрос: ${error.description}`);
    if (error.error_code === 401) {
      console.error(
        "[bot] Похоже, BOT_TOKEN неверный или отозван. Проверьте env (docs/ops/bot-token-rotation.md).",
      );
    }
  } else if (error instanceof HttpError) {
    console.error("[bot] Не удалось связаться с Telegram:", error);
  } else {
    console.error("[bot] Непредвиденная ошибка:", error);
  }
  process.exit(1);
});
