/**
 * Тонкий клиент к API ЮKassa на встроенном fetch (без SDK-зависимостей, P1).
 *
 * Docs: https://yookassa.ru/developers/api
 * Аутентификация — HTTP Basic: shopId:secretKey.
 * Idempotence-Key — обязателен для POST (защита от двойного создания платежа).
 *
 * fetchImpl инъектируется (тесты подменяют HTTP без реальных вызовов к
 * api.yookassa.ru); baseUrl тоже переопределяем.
 */

const DEFAULT_BASE_URL = 'https://api.yookassa.ru/v3';
const CURRENCY = 'RUB';

/** Статусы платежа ЮKassa. */
export type YookassaPaymentStatus =
  | 'pending'
  | 'waiting_for_capture'
  | 'succeeded'
  | 'canceled';

/** Нормализованный платёж, возвращаемый клиентом. */
export interface YookassaPayment {
  id: string;
  status: YookassaPaymentStatus;
  paid: boolean;
  /** URL платёжной страницы (для confirmation.type = redirect). */
  confirmationUrl: string | null;
  /** Токен встроенного виджета (для confirmation.type = embedded). */
  confirmationToken: string | null;
  /** Сохранённый способ оплаты (при save_payment_method и успехе). */
  paymentMethodId: string | null;
  /** Признак, что способ можно использовать для recurring. */
  paymentMethodSaved: boolean;
  /** metadata, которую мы передали при создании (эхо от ЮKassa). */
  metadata: Record<string, unknown>;
}

export interface CreatePaymentParams {
  amountRub: number;
  description: string;
  telegramUserId: number | string;
  savePaymentMethod: boolean;
  /** return_url: обязателен для redirect; для embedded — только для 3DS-возврата. */
  returnUrl?: string;
  idempotenceKey: string;
  /**
   * E-mail плательщика для чека (ФФД). Если задан — в платёж добавляется receipt,
   * и ЮKassa пробивает чек через облачную кассу. Без контакта чек не пробить.
   */
  customerEmail?: string;
  /**
   * true → confirmation.type=embedded (встроенный виджет, confirmation_token).
   * false/undefined → confirmation.type=redirect (страница ЮKassa, confirmation_url).
   */
  embedded?: boolean;
}

export interface CreateRecurringParams {
  amountRub: number;
  paymentMethodId: string;
  telegramUserId: number | string;
  description?: string;
  idempotenceKey: string;
  /** E-mail плательщика для чека при автосписании (см. createPayment). */
  customerEmail?: string;
}

/** Ставка НДС в чеке: ИП на УСН → «без НДС» (код 1). */
const VAT_CODE_USN = 1;

/**
 * Данные чека (ФФД) для ЮKassa. Одна позиция — подписка; сумма в рублях (строкой).
 * customer.email обязателен, иначе чек не пробьётся. payment_subject=service —
 * услуга; payment_mode=full_payment — полная оплата.
 */
function buildReceipt(email: string, amountRub: number, description: string): unknown {
  return {
    customer: { email },
    items: [
      {
        description,
        quantity: '1.00',
        amount: { value: toAmountValue(amountRub), currency: CURRENCY },
        vat_code: VAT_CODE_USN,
        payment_mode: 'full_payment',
        payment_subject: 'service',
      },
    ],
  };
}

export interface YookassaApi {
  createPayment(params: CreatePaymentParams): Promise<YookassaPayment>;
  getPayment(id: string): Promise<YookassaPayment>;
  createRecurring(params: CreateRecurringParams): Promise<YookassaPayment>;
}

export interface YookassaClientOptions {
  shopId: string;
  secretKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class YookassaError extends Error {
  override name = 'YookassaError';
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

/** Рубли (число) → строка суммы ЮKassa: "500.00". */
function toAmountValue(amountRub: number): string {
  return amountRub.toFixed(2);
}

/** Сырой объект платежа ЮKassa → нормализованный YookassaPayment. */
function normalizePayment(raw: unknown): YookassaPayment {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const confirmation = (obj['confirmation'] ?? {}) as Record<string, unknown>;
  const paymentMethod = (obj['payment_method'] ?? {}) as Record<string, unknown>;
  const metadata = (obj['metadata'] ?? {}) as Record<string, unknown>;

  return {
    id: String(obj['id'] ?? ''),
    status: (obj['status'] as YookassaPaymentStatus) ?? 'pending',
    paid: obj['paid'] === true,
    confirmationUrl:
      typeof confirmation['confirmation_url'] === 'string'
        ? confirmation['confirmation_url']
        : null,
    confirmationToken:
      typeof confirmation['confirmation_token'] === 'string'
        ? confirmation['confirmation_token']
        : null,
    paymentMethodId:
      typeof paymentMethod['id'] === 'string' ? paymentMethod['id'] : null,
    paymentMethodSaved: paymentMethod['saved'] === true,
    metadata,
  };
}

export class YookassaHttpClient implements YookassaApi {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: YookassaClientOptions) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.authHeader =
      'Basic ' + Buffer.from(`${options.shopId}:${options.secretKey}`).toString('base64');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    idempotenceKey?: string,
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: 'application/json',
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (idempotenceKey !== undefined) {
      headers['Idempotence-Key'] = idempotenceKey;
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    if (!response.ok) {
      const description =
        (json as { description?: unknown } | null)?.description ??
        `YooKassa request failed (${response.status})`;
      throw new YookassaError(response.status, String(description));
    }
    return json;
  }

  async createPayment(params: CreatePaymentParams): Promise<YookassaPayment> {
    const confirmation = params.embedded
      ? {
          type: 'embedded',
          ...(params.returnUrl ? { return_url: params.returnUrl } : {}),
        }
      : { type: 'redirect', return_url: params.returnUrl };
    const body = {
      amount: { value: toAmountValue(params.amountRub), currency: CURRENCY },
      capture: true,
      confirmation,
      description: params.description,
      save_payment_method: params.savePaymentMethod,
      metadata: { telegram_user_id: String(params.telegramUserId) },
      ...(params.customerEmail
        ? { receipt: buildReceipt(params.customerEmail, params.amountRub, params.description) }
        : {}),
    };
    return normalizePayment(await this.request('POST', '/payments', body, params.idempotenceKey));
  }

  async getPayment(id: string): Promise<YookassaPayment> {
    return normalizePayment(await this.request('GET', `/payments/${encodeURIComponent(id)}`));
  }

  async createRecurring(params: CreateRecurringParams): Promise<YookassaPayment> {
    const description = params.description ?? 'Refiesse Fit — продление подписки';
    const body = {
      amount: { value: toAmountValue(params.amountRub), currency: CURRENCY },
      capture: true,
      payment_method_id: params.paymentMethodId,
      description,
      metadata: { telegram_user_id: String(params.telegramUserId) },
      ...(params.customerEmail
        ? { receipt: buildReceipt(params.customerEmail, params.amountRub, description) }
        : {}),
    };
    return normalizePayment(await this.request('POST', '/payments', body, params.idempotenceKey));
  }
}
