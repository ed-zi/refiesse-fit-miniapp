/**
 * Конфигурация бота. Единственный источник — переменные окружения.
 * Токен НИКОГДА не хранится в коде и не логируется
 * (политика: docs/ops/bot-token-rotation.md).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface BotConfig {
  /** Токен бота от @BotFather. Обязателен. */
  botToken: string;
  /** URL Mini App для кнопки web_app. */
  webappUrl: string;
}

export const DEFAULT_WEBAPP_URL = "https://ed-zi.github.io/refiesse-fit-miniapp/";

/**
 * Минимальная загрузка apps/bot/.env (KEY=VALUE, # — комментарий) без зависимостей.
 * Уже установленные переменные окружения имеют приоритет над .env.
 */
function loadDotEnv(): void {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");
  let raw: string;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return; // .env нет — это нормально (CI/прод задают env напрямую)
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Читает и валидирует конфигурацию. При отсутствии BOT_TOKEN завершает процесс
 * с понятным сообщением (без stacktrace grammY).
 */
export function loadConfig(): BotConfig {
  loadDotEnv();

  const botToken = process.env.BOT_TOKEN?.trim();
  if (!botToken) {
    console.error(
      [
        "[bot] Ошибка конфигурации: не задана переменная окружения BOT_TOKEN.",
        "",
        "Как исправить:",
        "  1. Получите токен бота у @BotFather (для @refiessefit_bot).",
        "  2. Скопируйте apps/bot/.env.example в apps/bot/.env и впишите BOT_TOKEN=<токен>.",
        "     Либо задайте переменную окружения BOT_TOKEN напрямую.",
        "",
        "Токен хранится только в env/secrets и не должен попадать в код, git или чаты",
        "(см. docs/ops/bot-token-rotation.md).",
      ].join("\n"),
    );
    process.exit(1);
  }

  const webappUrl = process.env.WEBAPP_URL?.trim() || DEFAULT_WEBAPP_URL;

  return { botToken, webappUrl };
}
