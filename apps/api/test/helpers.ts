import { createHmac } from 'node:crypto';
import type { AppConfig } from '../src/config.ts';
import { TEST_DATABASE_URL } from './testDb.ts';

/** Фейковый bot token: подпись в тестах строится тем же алгоритмом, что у Telegram. */
export const TEST_BOT_TOKEN = '123456789:TEST-FAKE-BOT-TOKEN-for-vitest';

/** Фейковый API-ключ Tribute — подпись webhook в тестах строится им же. */
export const TEST_TRIBUTE_API_KEY = 'test-tribute-api-key';

export const TEST_ADMIN_TOKEN = 'test-admin-token';

/** Фейковые ЮKassa-ключи — включают /api/payments/* в тестах. */
export const TEST_YOOKASSA_SHOP_ID = 'test-shop-id';
export const TEST_YOOKASSA_SECRET_KEY = 'test-secret-key';
export const TEST_YOOKASSA_RETURN_URL = 'https://miniapp.test/return';

export const testConfig: AppConfig = {
  databaseUrl: TEST_DATABASE_URL,
  botToken: TEST_BOT_TOKEN,
  jwtSecret: 'test-jwt-secret',
  jwtExpiresIn: '1h',
  initDataMaxAgeSec: 86_400,
  corsOrigin: undefined,
  tributeApiKey: TEST_TRIBUTE_API_KEY,
  adminToken: TEST_ADMIN_TOKEN,
  adminTelegramIds: new Set<string>(),
  port: 0,
  nodeEnv: 'test',
  yookassaShopId: TEST_YOOKASSA_SHOP_ID,
  yookassaSecretKey: TEST_YOOKASSA_SECRET_KEY,
  yookassaReturnUrl: TEST_YOOKASSA_RETURN_URL,
  billingAutochargeEnabled: false,
};

export interface BuildInitDataOptions {
  user?: Record<string, unknown>;
  authDate?: number;
  botToken?: string;
  /** Дополнительные поля initData (query_id и т.п.). */
  extra?: Record<string, string>;
  /** Подменить hash после подписи (для негативных тестов). */
  overrideHash?: string;
}

/**
 * Генерирует initData, подписанный по алгоритму Telegram WebApp:
 * secret = HMAC_SHA256(botToken, key="WebAppData"),
 * hash = hex(HMAC_SHA256(data_check_string, secret)).
 */
export function buildInitData(options: BuildInitDataOptions = {}): string {
  const {
    user = { id: 424242, first_name: 'Rita', username: 'rita_fit', language_code: 'ru' },
    authDate = Math.floor(Date.now() / 1000),
    botToken = TEST_BOT_TOKEN,
    extra = { query_id: 'AAE2Eq1UAAAAADYSrVSyu1Nz' },
    overrideHash,
  } = options;

  const params = new URLSearchParams();
  params.set('user', JSON.stringify(user));
  params.set('auth_date', String(authDate));
  for (const [key, value] of Object.entries(extra)) {
    params.set(key, value);
  }

  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  params.set('hash', overrideHash ?? hash);
  return params.toString();
}
