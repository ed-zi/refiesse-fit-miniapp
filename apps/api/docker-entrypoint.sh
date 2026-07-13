#!/bin/sh
# Entrypoint API-контейнера: сначала накатываем миграции, затем стартуем сервер.
# prisma migrate deploy применяет только уже созданные миграции (без генерации
# новых) — безопасно для прод-БД и идемпотентно при повторных деплоях.
set -e

echo "[entrypoint] prisma migrate deploy..."
npx prisma migrate deploy

echo "[entrypoint] starting API server (start:prod)..."
exec npm run start:prod
