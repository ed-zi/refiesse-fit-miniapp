import { stopStack } from './helpers/stack'

/** Playwright globalTeardown: гасит API и vite, поднятые в globalSetup. */
async function globalTeardown(): Promise<void> {
  console.log('[e2e] гашу стек')
  await stopStack()
}

export default globalTeardown
