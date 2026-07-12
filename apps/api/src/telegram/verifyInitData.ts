import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * Верификация Telegram WebApp initData.
 *
 * Алгоритм (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
 *   secret_key        = HMAC_SHA256(bot_token, key = "WebAppData")
 *   data_check_string = отсортированные по ключу пары "key=value" всех полей,
 *                       кроме hash, соединённые "\n"
 *   ожидаемый hash    = hex(HMAC_SHA256(data_check_string, secret_key))
 *
 * Дополнительно проверяется свежесть auth_date (максимальный возраст,
 * по умолчанию 24 часа).
 */

export type InitDataErrorReason =
  | 'MALFORMED'
  | 'HASH_MISSING'
  | 'HASH_MISMATCH'
  | 'AUTH_DATE_MISSING'
  | 'AUTH_DATE_EXPIRED'
  | 'USER_MISSING'
  | 'USER_MALFORMED';

/** Типизированная ошибка верификации initData. */
export class InitDataError extends Error {
  override name = 'InitDataError';
  readonly reason: InitDataErrorReason;

  constructor(reason: InitDataErrorReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

export interface TelegramUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
}

export interface VerifiedInitData {
  user: TelegramUser;
  /** Момент авторизации из auth_date. */
  authDate: Date;
}

export interface VerifyInitDataOptions {
  /** Максимальный возраст auth_date в секундах. Default: 86400 (24 часа). */
  maxAgeSeconds?: number;
  /** «Сейчас» для проверки возраста (для тестов). Default: new Date(). */
  now?: Date;
}

const telegramUserSchema = z.object({
  id: z.number().int(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
});

export const DEFAULT_INIT_DATA_MAX_AGE_SECONDS = 86_400;

/**
 * Чистая функция: проверяет подпись и свежесть initData.
 * Возвращает распарсенного пользователя или кидает InitDataError.
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  options: VerifyInitDataOptions = {},
): VerifiedInitData {
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_INIT_DATA_MAX_AGE_SECONDS;
  const now = options.now ?? new Date();

  if (typeof initData !== 'string' || initData.length === 0) {
    throw new InitDataError('MALFORMED', 'initData is empty');
  }

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    throw new InitDataError('MALFORMED', 'initData is not a valid query string');
  }

  const receivedHash = params.get('hash');
  if (!receivedHash) {
    throw new InitDataError('HASH_MISSING', 'initData has no hash field');
  }

  // data_check_string: все пары кроме hash, отсортированные по ключу.
  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const expectedBuf = Buffer.from(expectedHash, 'hex');
  let receivedBuf: Buffer;
  try {
    receivedBuf = Buffer.from(receivedHash, 'hex');
  } catch {
    throw new InitDataError('HASH_MISMATCH', 'initData signature is invalid');
  }
  if (receivedBuf.length !== expectedBuf.length || !timingSafeEqual(receivedBuf, expectedBuf)) {
    throw new InitDataError('HASH_MISMATCH', 'initData signature is invalid');
  }

  // Подпись валидна — теперь проверяем свежесть.
  const authDateRaw = params.get('auth_date');
  const authDateSec = authDateRaw === null ? Number.NaN : Number(authDateRaw);
  if (!Number.isInteger(authDateSec) || authDateSec <= 0) {
    throw new InitDataError('AUTH_DATE_MISSING', 'initData has no valid auth_date field');
  }
  const ageSeconds = now.getTime() / 1000 - authDateSec;
  if (ageSeconds > maxAgeSeconds) {
    throw new InitDataError(
      'AUTH_DATE_EXPIRED',
      `initData is too old: auth_date is ${Math.round(ageSeconds)}s old (max ${maxAgeSeconds}s)`,
    );
  }

  const userRaw = params.get('user');
  if (!userRaw) {
    throw new InitDataError('USER_MISSING', 'initData has no user field');
  }
  let userJson: unknown;
  try {
    userJson = JSON.parse(userRaw);
  } catch {
    throw new InitDataError('USER_MALFORMED', 'initData user field is not valid JSON');
  }
  const parsedUser = telegramUserSchema.safeParse(userJson);
  if (!parsedUser.success) {
    throw new InitDataError('USER_MALFORMED', 'initData user field has unexpected shape');
  }

  return {
    user: {
      id: parsedUser.data.id,
      firstName: parsedUser.data.first_name,
      lastName: parsedUser.data.last_name,
      username: parsedUser.data.username,
      languageCode: parsedUser.data.language_code,
    },
    authDate: new Date(authDateSec * 1000),
  };
}
