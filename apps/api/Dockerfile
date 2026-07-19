# syntax=docker/dockerfile:1
#
# Multi-stage образ для API (Fastify + Prisma, apps/api).
# Контекст сборки = apps/api (в Railway: Service → Settings → Root Directory = apps/api).
#
# Почему запуск через tsx, а не сборка в JS:
#   - весь код на ESM-TypeScript с явными расширениями импортов (./app.ts),
#     tsx исполняет его напрямую — как в dev, без отдельного шага компиляции
#     и без переписывания .ts→.js в путях импортов;
#   - сервис маленький, выигрыш прекомпиляции незначим, а рисков рассинхрона меньше.
#   tsx и prisma поэтому вынесены в dependencies (нужны в рантайме).
#
# Prisma + adapter-pg: в рантайме запросы идут через pg-драйвер (нативный
# query engine не нужен). openssl ставим для schema-engine (`migrate deploy`).

# ---- base: Node + openssl ----
FROM node:20-slim AS base
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# ---- build: prod-зависимости + генерация Prisma Client ----
FROM base AS build
# Нет per-app lockfile (npm workspaces держит его в корне монорепо) → install.
# --omit=dev: typescript/vitest в проде не нужны; prisma и tsx лежат в
# dependencies и ставятся.
COPY package.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
# Статика админки (GET /admin/ui читает public/admin.html через import.meta.url).
COPY public ./public
# Генерируем клиент в src/generated/prisma (см. generator в schema.prisma).
RUN npx prisma generate

# ---- runtime: финальный образ ----
FROM base AS runtime
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/public ./public
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && chown -R node:node /app
USER node
# PORT задаёт Railway; сервер слушает 0.0.0.0:$PORT (см. src/server.ts).
EXPOSE 3000
# ENTRYPOINT прогоняет миграции (prisma migrate deploy) перед стартом сервера.
ENTRYPOINT ["./docker-entrypoint.sh"]
