/**
 * Мягкие напоминания (MOTIV-1). У API есть и БД, и токен бота, поэтому
 * планировщик и отправка живут здесь — без изменений в процессе бота.
 *
 * Тон — Soft System: без давления и вины, только тёплый пинг тем, кто сам
 * включил напоминания и сегодня ещё не занимался. Время — по МСК (UTC+3,
 * без переходов на летнее время).
 */

import type { PrismaClient } from './generated/prisma/client.ts';

/** Москва — фиксированный UTC+3. */
const MSK_OFFSET_HOURS = 3;

/** Час суток по МСК (0..23) для момента now. */
export function mskHour(now: Date): number {
  return (now.getUTCHours() + MSK_OFFSET_HOURS) % 24;
}

/** Календарный день по МСК как YYYY-MM-DD (ключ дедупликации отправки). */
export function mskDateKey(now: Date): string {
  return new Date(now.getTime() + MSK_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10);
}

/** YYYY-MM-DD по UTC (для сравнения DATE-полей, которые хранятся в UTC-полночь). */
function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Час по умолчанию, если пользователь включил напоминания, но не выбрал время. */
export const DEFAULT_REMINDER_HOUR = 19;

/** Минимальная проекция пользователя для планировщика. */
export interface RemindableUser {
  id: string;
  telegramUserId: bigint;
  firstName: string | null;
  reminderOptIn: boolean;
  reminderHour: number | null;
  reminderLastSentOn: Date | null;
}

/**
 * Кого пингуем прямо сейчас: включили напоминания, наступил их час (МСК),
 * сегодня ещё не слали и сегодня не занимались. Чистая функция — тестируется
 * без БД и без времени (now передаётся явно).
 */
export function usersDueForReminder(
  users: readonly RemindableUser[],
  practicedTodayIds: ReadonlySet<string>,
  now: Date,
): RemindableUser[] {
  const hour = mskHour(now);
  const todayKey = mskDateKey(now);
  return users.filter((user) => {
    if (!user.reminderOptIn) {
      return false;
    }
    if ((user.reminderHour ?? DEFAULT_REMINDER_HOUR) !== hour) {
      return false;
    }
    if (practicedTodayIds.has(user.id)) {
      return false;
    }
    if (user.reminderLastSentOn !== null && utcDateKey(user.reminderLastSentOn) === todayKey) {
      return false;
    }
    return true;
  });
}

/** Мягкий текст напоминания (с именем, если есть). */
export function reminderText(firstName: string | null): string {
  const hi = firstName && firstName.trim() !== '' ? `${firstName.trim()}, ` : '';
  return (
    `${hi}мягкое напоминание 🌿\n\n` +
    'Даже 5–10 минут для тела сегодня — уже забота о себе. ' +
    'Загляни в Refiesse Fit, когда будет минутка — без спешки и обязательств.'
  );
}

/**
 * Отправляет сообщение через Telegram Bot API (raw fetch — без зависимостей).
 * fetchImpl инъектируется в тестах. Возвращает true при успехе.
 */
export async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
  opts: { webAppUrl?: string | undefined; fetchImpl?: typeof fetch } = {},
): Promise<boolean> {
  const doFetch = opts.fetchImpl ?? fetch;
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (opts.webAppUrl) {
    body['reply_markup'] = {
      inline_keyboard: [[{ text: 'Открыть Refiesse Fit', web_app: { url: opts.webAppUrl } }]],
    };
  }
  try {
    const response = await doFetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Один проход планировщика: находит, кому пора, шлёт пинг и помечает дату
 * отправки (чтобы не задваивать за день). Возвращает число отправленных.
 */
export async function runReminderTick(
  prisma: PrismaClient,
  botToken: string,
  now: Date = new Date(),
  opts: { webAppUrl?: string | undefined; fetchImpl?: typeof fetch } = {},
): Promise<{ sent: number }> {
  const optInUsers = await prisma.user.findMany({
    where: { reminderOptIn: true },
    select: {
      id: true,
      telegramUserId: true,
      firstName: true,
      reminderOptIn: true,
      reminderHour: true,
      reminderLastSentOn: true,
    },
  });
  if (optInUsers.length === 0) {
    return { sent: 0 };
  }

  const todayKey = mskDateKey(now);
  const todayDate = new Date(`${todayKey}T00:00:00.000Z`);
  const practiced = await prisma.progressEntry.findMany({
    where: { userId: { in: optInUsers.map((u) => u.id) }, entryDate: todayDate },
    select: { userId: true },
  });
  const practicedIds = new Set(practiced.map((p) => p.userId));

  const due = usersDueForReminder(optInUsers, practicedIds, now);
  let sent = 0;
  for (const user of due) {
    const ok = await sendTelegramMessage(
      botToken,
      user.telegramUserId.toString(),
      reminderText(user.firstName),
      opts,
    );
    if (ok) {
      await prisma.user.update({
        where: { id: user.id },
        data: { reminderLastSentOn: todayDate },
      });
      sent += 1;
    }
  }
  return { sent };
}
