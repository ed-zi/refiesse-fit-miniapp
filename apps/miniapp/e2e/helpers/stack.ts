// Поднятие полного стека для E2E: PostgreSQL → миграции + сид → API → фронт.
//
// Всё детерминированно: globalSetup вызывает startStack(), globalTeardown —
// stopStack(). Процессы (API, vite) держим в модульной области и гасим по PID.
//
// Идемпотентность: prisma migrate deploy + seed можно гонять повторно
// (upsert по slug). БД в CI поднимается сервисом postgres, локально —
// `service postgresql start` (best-effort, если 5432 недоступен).

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createConnection } from 'node:net'
import { createHmac } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
/** apps/api — рабочая директория для prisma/tsx. */
export const apiDir = resolve(here, '../../../api')
/** apps/miniapp — рабочая директория для vite. */
export const miniappDir = resolve(here, '../..')

export interface StackConfig {
  databaseUrl: string
  botToken: string
  jwtSecret: string
  apiPort: number
  webPort: number
  /** Управлять локальным postgres (`service postgresql start`). В CI не нужно. */
  manageDb: boolean
}

export function resolveStackConfig(): StackConfig {
  return {
    databaseUrl:
      process.env.E2E_DATABASE_URL ??
      process.env.DATABASE_URL ??
      'postgresql://refiesse:refiesse@localhost:5432/refiesse_dev',
    botToken: process.env.E2E_BOT_TOKEN ?? 'e2e-bot-token',
    jwtSecret: process.env.E2E_JWT_SECRET ?? 'e2e-jwt-secret',
    apiPort: Number(process.env.E2E_API_PORT ?? 3011),
    webPort: Number(process.env.E2E_WEB_PORT ?? 4173),
    // По умолчанию управляем БД, если явно не выключено (CI выставляет E2E_MANAGE_DB=false).
    manageDb: process.env.E2E_MANAGE_DB !== 'false',
  }
}

export function baseURL(config: StackConfig): string {
  return `http://127.0.0.1:${config.webPort}`
}

export function apiURL(config: StackConfig): string {
  return `http://127.0.0.1:${config.apiPort}`
}

// --- initData -------------------------------------------------------------

/**
 * Подписанная строка initData (алгоритм Telegram WebApp):
 *   secret = HMAC_SHA256('WebAppData', botToken)
 *   data_check_string = отсортированные "key=value" (кроме hash) через \n
 *   hash = hex(HMAC_SHA256(dataCheckString, secret))
 * Свежий auth_date → проходит проверку возраста на бэкенде.
 */
export function generateInitData(botToken: string): string {
  const user = JSON.stringify({
    id: 777001,
    first_name: 'Катя',
    username: 'katya_e2e',
    language_code: 'ru',
  })
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAE2E-e2e-query',
    user,
  }
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex')
  const params = new URLSearchParams(fields)
  params.set('hash', hash)
  return params.toString()
}

// --- утилиты ожидания -----------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function tcpReachable(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolveP) => {
    const socket = createConnection({ host, port })
    const done = (ok: boolean) => {
      socket.destroy()
      resolveP(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

async function waitForHttp(url: string, timeoutMs: number, label: string): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError = ''
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status < 500) {
        return
      }
      lastError = `status ${res.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await delay(400)
  }
  throw new Error(`[e2e] ${label} не поднялся за ${timeoutMs}ms (${url}): ${lastError}`)
}

// --- PostgreSQL -----------------------------------------------------------

async function ensurePostgres(config: StackConfig): Promise<void> {
  const url = new URL(config.databaseUrl)
  const host = url.hostname
  const port = Number(url.port || 5432)
  if (await tcpReachable(host, port)) {
    return
  }
  if (config.manageDb) {
    // Локальный dev-контейнер: поднимаем кластер (best-effort).
    spawnSync('service', ['postgresql', 'start'], { stdio: 'inherit' })
    for (let i = 0; i < 20; i += 1) {
      if (await tcpReachable(host, port)) {
        return
      }
      await delay(500)
    }
  }
  throw new Error(`[e2e] PostgreSQL недоступен на ${host}:${port}`)
}

function runInApi(command: string, args: string[], databaseUrl: string, label: string): void {
  const result = spawnSync(command, args, {
    cwd: apiDir,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  })
  if (result.status !== 0) {
    throw new Error(`[e2e] ${label} завершился с кодом ${result.status}`)
  }
}

// --- процессы -------------------------------------------------------------

let apiProcess: ChildProcess | null = null
let webProcess: ChildProcess | null = null

function startApi(config: StackConfig): void {
  apiProcess = spawn('npx', ['tsx', 'src/server.ts'], {
    cwd: apiDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: config.databaseUrl,
      BOT_TOKEN: config.botToken,
      JWT_SECRET: config.jwtSecret,
      TRIBUTE_API_KEY: 'trbt-e2e-key',
      ADMIN_TOKEN: 'admin-e2e-token',
      PORT: String(config.apiPort),
      NODE_ENV: 'development',
    },
  })
  apiProcess.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`[e2e] API-процесс завершился с кодом ${code}`)
    }
  })
}

function startFrontend(config: StackConfig, initData: string): void {
  // Vite dev-сервер: VITE_* читаются из env при старте процесса и инлайнятся
  // в модули (в отличие от `vite preview`, где значения зашиты на build-time).
  webProcess = spawn(
    'npx',
    ['vite', '--host', '127.0.0.1', '--port', String(config.webPort), '--strictPort'],
    {
      cwd: miniappDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_API_URL: apiURL(config),
        VITE_DEV_INIT_DATA: initData,
        // VITE_TRIBUTE_LINK намеренно не задаём: paywall остаётся «мягким»
        // (toast «Оплата скоро подключится», без внешнего перехода).
      },
    },
  )
  webProcess.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`[e2e] Vite-процесс завершился с кодом ${code}`)
    }
  })
}

/** Поднять весь стек. Возвращает готовый baseURL. */
export async function startStack(config: StackConfig): Promise<void> {
  await ensurePostgres(config)
  runInApi('npx', ['prisma', 'migrate', 'deploy'], config.databaseUrl, 'prisma migrate deploy')
  runInApi('npx', ['tsx', 'prisma/seed.ts'], config.databaseUrl, 'db seed')

  startApi(config)
  await waitForHttp(`${apiURL(config)}/health`, 45_000, 'API')

  const initData = generateInitData(config.botToken)
  startFrontend(config, initData)
  await waitForHttp(baseURL(config), 45_000, 'Frontend (vite)')
}

/** Погасить процессы стека (API + фронт). БД оставляем как есть. */
export async function stopStack(): Promise<void> {
  for (const proc of [webProcess, apiProcess]) {
    if (proc && proc.pid && !proc.killed) {
      try {
        proc.kill('SIGTERM')
      } catch {
        // процесс уже мёртв — игнорируем
      }
    }
  }
  // Небольшая пауза, чтобы порты освободились до следующего прогона.
  await delay(500)
  webProcess = null
  apiProcess = null
}
