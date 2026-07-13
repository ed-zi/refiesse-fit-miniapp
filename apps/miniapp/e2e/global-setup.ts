import { resolveStackConfig, startStack, baseURL, apiURL } from './helpers/stack'

/**
 * Playwright globalSetup: поднимает весь стек до старта тестов.
 * Порядок: PostgreSQL → prisma migrate deploy → seed (идемпотентно) →
 * API (tsx src/server.ts, ждём /health) → фронт (vite dev с VITE_DEV_INIT_DATA,
 * ждём готовности порта). Гасится в global-teardown.
 */
async function globalSetup(): Promise<void> {
  const config = resolveStackConfig()
  console.log(`[e2e] поднимаю стек: API ${apiURL(config)}, фронт ${baseURL(config)}`)
  await startStack(config)
  console.log('[e2e] стек готов')
}

export default globalSetup
