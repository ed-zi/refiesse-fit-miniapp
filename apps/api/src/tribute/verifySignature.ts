import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Проверка подписи Tribute-webhook.
 *
 * Допущение по докам Tribute: header `trbt-signature` содержит hex-строку
 * HMAC-SHA256 от СЫРОГО тела запроса, ключ — API-ключ Tribute (TRIBUTE_API_KEY).
 *
 * TODO(перед продом): сверить с актуальной документацией Tribute —
 *   1) точный алгоритм и кодировку (hex vs base64);
 *   2) что именно подписывается (raw body vs canonical JSON);
 *   3) каким ключом (api key vs отдельный webhook secret).
 * Формат вынесен в одну функцию, чтобы правка была точечной.
 *
 * Сравнение — timingSafeEqual (устойчивость к тайм-атакам).
 */
export function verifyTributeSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  apiKey: string,
): boolean {
  if (signatureHeader === undefined || signatureHeader.length === 0) {
    return false;
  }

  const expectedHex = createHmac('sha256', apiKey).update(rawBody).digest('hex');
  const expected = Buffer.from(expectedHex, 'hex');

  let received: Buffer;
  try {
    received = Buffer.from(signatureHeader.trim(), 'hex');
  } catch {
    return false;
  }
  if (received.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(received, expected);
}
