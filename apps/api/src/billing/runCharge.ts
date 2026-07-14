import { pathToFileURL } from 'node:url';
import { loadConfig } from '../config.ts';
import { createPrismaConnection } from '../db/prisma.ts';
import { YookassaHttpClient } from '../yookassa/client.ts';
import { chargeDueSubscriptions } from './chargeDue.ts';

/**
 * Тонкая обёртка-скрипт автосписаний для планировщика (Railway cron, P1).
 * Запуск: tsx src/billing/runCharge.ts
 *
 * НЕ включён по умолчанию: срабатывает только при BILLING_AUTOCHARGE_ENABLED=true
 * и наличии ключей ЮKassa. Планировщик/расписание подключает DevOps.
 */
export async function runCharge(): Promise<void> {
  const config = loadConfig();

  if (!config.billingAutochargeEnabled) {
    console.log('BILLING_AUTOCHARGE_ENABLED is false — skipping recurring charge');
    return;
  }
  if (config.yookassaShopId === undefined || config.yookassaSecretKey === undefined) {
    console.error('YooKassa is not configured — cannot run recurring charge');
    process.exitCode = 1;
    return;
  }

  const client = new YookassaHttpClient({
    shopId: config.yookassaShopId,
    secretKey: config.yookassaSecretKey,
  });
  const connection = await createPrismaConnection(config.databaseUrl);
  try {
    const result = await chargeDueSubscriptions(connection.prisma, client);
    console.log(
      `Recurring charge done: charged=${result.charged}, failed=${result.failed}`,
    );
  } finally {
    await connection.close();
  }
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  try {
    process.loadEnvFile(new URL('../../.env', import.meta.url).pathname);
  } catch {
    // .env отсутствует — используем переменные окружения процесса.
  }
  runCharge().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
