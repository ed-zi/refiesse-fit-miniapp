# Release checklist — перед включением реальных платежей / прод-релизом

Источник: security-ревью платёжного контура (S3-5, 2026-07-13). Вердикт ревью:
эксплуатируемых уязвимостей (CRITICAL/HIGH) в коде нет; контур fail-closed.
Пункты ниже — обязательные условия эксплуатации, а не дыры в коде.

## Обязательно ДО включения реальных платежей

1. **Сверить формат подписи Tribute с актуальной документацией** —
   `apps/api/src/tribute/verifySignature.ts` реализует допущение
   (HMAC-SHA256 hex от raw body ключом `TRIBUTE_API_KEY`). Проверить:
   алгоритм, hex vs base64, что именно подписывается, api key vs отдельный
   webhook secret. Добавить интеграционный тест на реальном событии Tribute
   (тестовая оплата). Также сверить имена полей payload
   (`telegram_user_id`, `expires_at`, `subscription_id`) — парсинг сейчас loose.
2. **Сильные секреты в проде**: `JWT_SECRET` и `ADMIN_TOKEN` ≥ 32 случайных
   символов (config.ts теперь отклоняет короткие при NODE_ENV=production);
   `TRIBUTE_API_KEY` и `ADMIN_TOKEN` реально заданы (иначе webhook/админка — 503).
3. **`CORS_ORIGIN`** выставлен на реальный origin фронта (без него в проде
   разрешены все origin — сервер пишет warning в лог).
4. **Перевыпустить токен бота** через BotFather — см. `bot-token-rotation.md`
   (текущий скомпрометирован, отложено до прод-релиза решением Эда).

## Сделано в рамках S3-5 (hardening)

- [x] Rate limit: глобально 300/мин, `/auth/telegram` 30/мин,
      `/api/tribute/webhook` 120/мин (@fastify/rate-limit, выключен в тестах).
- [x] Минимальная длина `JWT_SECRET`/`ADMIN_TOKEN` в production — 32 символа.
- [x] Сортировка initData data_check_string строго по ключу (спецификация Telegram).
- [x] Warning в лог при отсутствии `CORS_ORIGIN` в production.

## Желательно (не блокер, бэклог)

- Аудит и ротация admin-токена; персональные админ-идентичности.
- Reprocess unmatched Tribute-событий — уже есть в админке; настроить
  алёрт (Sentry, спринт 4) на события с error.
