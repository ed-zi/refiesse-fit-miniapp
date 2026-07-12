import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './test/globalSetup.ts',
    // Тесты ходят в одну тестовую БД — гоняем файлы последовательно,
    // чтобы beforeEach-очистки не пересекались.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
