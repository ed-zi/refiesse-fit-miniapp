#!/bin/sh
# Entrypoint API-контейнера: сначала накатываем миграции, затем стартуем сервер.
# prisma migrate deploy применяет только уже созданные миграции (без генерации
# новых) — безопасно для прод-БД и идемпотентно при повторных деплоях.
set -e

echo "[entrypoint] prisma migrate deploy..."
npx prisma migrate deploy

# Опциональный засев БД при старте — чтобы не требовать shell на хостинге.
# Ставим SEED_ON_START=true в Variables на ПЕРВЫЙ деплой, затем убираем.
# Seed идемпотентен (upsert по slug), но повторный прогон перезапишет ручные
# правки контента из админки — поэтому держим его за флагом, а не всегда.
if [ "$SEED_ON_START" = "true" ]; then
  echo "[entrypoint] SEED_ON_START=true → npm run db:seed..."
  npm run db:seed
fi

echo "[entrypoint] starting API server (start:prod)..."
exec npm run start:prod
