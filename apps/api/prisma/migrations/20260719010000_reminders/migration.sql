-- Мягкие напоминания (MOTIV-1): opt-in + удобный час (МСК) + защита от дубля за день.
ALTER TABLE "users"
  ADD COLUMN "reminder_opt_in" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reminder_hour" INTEGER,
  ADD COLUMN "reminder_last_sent_on" DATE;
