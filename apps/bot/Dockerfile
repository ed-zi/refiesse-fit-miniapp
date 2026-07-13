# syntax=docker/dockerfile:1
#
# Образ для Telegram-бота (grammY, apps/bot). Отдельный worker-сервис Railway
# (long polling, без входящего HTTP → без healthcheck-порта).
# Контекст сборки = apps/bot (Railway: Service → Settings → Root Directory = apps/bot).
#
# Запуск через tsx (ESM-TypeScript исполняется напрямую) — tsx в dependencies.

# ---- base ----
FROM node:20-slim AS base
ENV NODE_ENV=production
WORKDIR /app

# ---- deps: prod-зависимости (grammy + tsx) ----
FROM base AS deps
COPY package.json ./
# Нет per-app lockfile (workspaces) → install, а не ci. typescript в проде не нужен.
RUN npm install --omit=dev --no-audit --no-fund

# ---- runtime ----
FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
RUN chown -R node:node /app
USER node
# BOT_TOKEN и WEBAPP_URL приходят из Railway Variables (в образ не зашиты).
CMD ["npm", "run", "start:prod"]
