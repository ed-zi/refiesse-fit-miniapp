import { describe, expect, it } from 'vitest';
import { YookassaHttpClient } from '../src/yookassa/client.ts';

/**
 * Юнит-тесты формирования чека (ФФД) в HTTP-теле запроса к ЮKassa.
 * ИП на УСН + облачная касса: без receipt.customer.email платёж не создаётся,
 * поэтому проверяем именно тело запроса, а не интерфейс-заглушку.
 */

interface Captured {
  body: Record<string, unknown> | null;
}

function clientCapturing(captured: Captured): YookassaHttpClient {
  const fetchImpl = (async (_url: string, init: { body?: string }) => {
    captured.body = init.body ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    return {
      ok: true,
      json: async () => ({
        id: 'pay_1',
        status: 'pending',
        confirmation: { confirmation_url: 'https://yookassa.test/c' },
      }),
    } as unknown as Response;
  }) as unknown as typeof fetch;

  return new YookassaHttpClient({ shopId: 'shop', secretKey: 'secret', fetchImpl });
}

describe('YookassaHttpClient — чек (receipt)', () => {
  it('createPayment с email → receipt с customer.email и позицией (vat_code 1, service)', async () => {
    const captured: Captured = { body: null };
    const client = clientCapturing(captured);

    await client.createPayment({
      amountRub: 500,
      description: 'Refiesse Fit — подписка на месяц',
      telegramUserId: 111,
      savePaymentMethod: true,
      returnUrl: 'https://app.test/return',
      idempotenceKey: 'idem-1',
      customerEmail: 'katya@example.com',
    });

    const receipt = captured.body?.['receipt'] as
      | { customer?: { email?: string }; items?: Array<Record<string, unknown>> }
      | undefined;
    expect(receipt).toBeDefined();
    expect(receipt?.customer?.email).toBe('katya@example.com');
    const item = receipt?.items?.[0];
    expect(item?.['vat_code']).toBe(1); // УСН — без НДС
    expect(item?.['payment_subject']).toBe('service');
    expect(item?.['payment_mode']).toBe('full_payment');
    expect((item?.['amount'] as { value?: string })?.value).toBe('500.00');
  });

  it('createPayment без email → receipt не добавляется (обратная совместимость)', async () => {
    const captured: Captured = { body: null };
    const client = clientCapturing(captured);

    await client.createPayment({
      amountRub: 500,
      description: 'Refiesse Fit',
      telegramUserId: 111,
      savePaymentMethod: true,
      returnUrl: 'https://app.test/return',
      idempotenceKey: 'idem-2',
    });

    expect(captured.body?.['receipt']).toBeUndefined();
  });

  it('createRecurring с email → receipt для чека при автосписании', async () => {
    const captured: Captured = { body: null };
    const client = clientCapturing(captured);

    await client.createRecurring({
      amountRub: 500,
      paymentMethodId: 'pm_1',
      telegramUserId: 111,
      idempotenceKey: 'idem-3',
      customerEmail: 'katya@example.com',
    });

    const receipt = captured.body?.['receipt'] as { customer?: { email?: string } } | undefined;
    expect(receipt?.customer?.email).toBe('katya@example.com');
  });
});
