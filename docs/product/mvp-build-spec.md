# Refiesse Fit Mini App — MVP Build Spec Draft

## Status

- Design direction: Soft System confirmed.
- Content: not filling yet.
- Tribute: integrate later, but keep access/paywall architecture ready.
- Current goal: set up development system and GitHub repository.

## MVP modules

1. Telegram Mini App frontend.
2. Backend API.
3. Telegram auth.
4. Catalog skeleton.
5. Plans skeleton.
6. Workout detail skeleton.
7. Progress skeleton.
8. Profile/subscription placeholder.
9. Admin/content skeleton later.
10. Tribute integration later.

## Initial technical direction

Recommended stack:

```text
Frontend: React + Vite + TypeScript
Telegram SDK: @telegram-apps/sdk-react or official WebApp API
Backend: Node.js + TypeScript + Fastify/NestJS
DB: PostgreSQL + Prisma
Bot: grammY or Telegraf
Deploy: TBD
```

## Non-goals for first repo setup

- No real content filling yet.
- No Tribute secrets.
- No payment integration implementation yet.
- No production deployment yet.
