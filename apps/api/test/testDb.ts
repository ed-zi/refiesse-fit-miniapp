/** Тестовая БД: отдельная база refiesse_test на том же локальном PostgreSQL. */
export const TEST_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgresql://refiesse:refiesse@localhost:5432/refiesse_test';
