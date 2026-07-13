import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'
import { baseURL, resolveStackConfig } from './e2e/helpers/stack'

const stack = resolveStackConfig()

/**
 * Путь к бинарю chromium.
 *   - Локально (этот контейнер): готовый браузер лежит по /opt/pw-browsers/chromium
 *     (симлинк на chrome). Используем его напрямую — надёжнее, чем полагаться
 *     на PLAYWRIGHT_BROWSERS_PATH.
 *   - В CI: /opt/pw-browsers нет, браузер ставится `playwright install chromium`
 *     в дефолтный кэш → executablePath оставляем undefined (дефолт Playwright).
 * Переопределить можно через E2E_CHROMIUM_PATH.
 */
function resolveChromiumPath(): string | undefined {
  const explicit = process.env.E2E_CHROMIUM_PATH
  if (explicit && existsSync(explicit)) {
    return explicit
  }
  const local = '/opt/pw-browsers/chromium'
  if (existsSync(local)) {
    return local
  }
  return undefined
}

const chromiumExecutablePath = resolveChromiumPath()

export default defineConfig({
  testDir: './e2e',
  // Полный стек (postgres + API + фронт) — общий на весь прогон, поэтому
  // без параллельных воркеров, чтобы не плодить конфликтующие процессы.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list']],
  timeout: 30_000,
  expect: { timeout: 7_500 },

  // Стек поднимается здесь (postgres → миграции → сид → API → vite), а не через
  // webServer: фронту нужен сгенерированный на лету initData (VITE_DEV_INIT_DATA).
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  use: {
    baseURL: baseURL(stack),
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: chromiumExecutablePath
          ? { executablePath: chromiumExecutablePath }
          : {},
      },
    },
  ],
})
