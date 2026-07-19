# syntax=docker/dockerfile:1
#
# Статичный фронт Mini App для Railway.
#
# ВАЖНО: контекст сборки = КОРЕНЬ монорепо (в Railway: Service → Settings →
# Root Directory = "/" или пусто, dockerfilePath = apps/miniapp/Dockerfile).
# Причина: фронт импортирует workspace-пакет @refiesse-fit/shared, которого нет
# в npm — он резолвится только из корня npm workspaces.
#
# VITE_*-переменные пекутся в бандл на этапе build (это статика, рантайм-env нет).
# Railway прокидывает переменные сервиса как build-args (объявлены ARG ниже).

# ---- build: сборка Vite ----
FROM node:20-slim AS build
WORKDIR /app
# Манифесты монорепо + общий tsconfig (miniapp tsconfig extends ../../tsconfig.base.json).
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci

# Build-time переменные фронта. VITE_API_URL = публичный URL API-сервиса Railway,
# напр. https://${{ api.RAILWAY_PUBLIC_DOMAIN }} (задать в Variables сервиса фронта).
ARG VITE_API_URL
ARG VITE_PAYMENT_FALLBACK_LINK
ARG VITE_SENTRY_DSN
ENV VITE_API_URL=$VITE_API_URL \
    VITE_PAYMENT_FALLBACK_LINK=$VITE_PAYMENT_FALLBACK_LINK \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN
RUN npm run build --workspace apps/miniapp

# ---- serve: Caddy отдаёт статику на $PORT ----
FROM caddy:2-alpine AS serve
COPY apps/miniapp/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/miniapp/dist /srv
# Caddy слушает $PORT (Railway). EXPOSE — для наглядности.
EXPOSE 8080
