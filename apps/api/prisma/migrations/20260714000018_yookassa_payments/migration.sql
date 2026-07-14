-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('tribute', 'yookassa');

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "payment_method_id" TEXT,
ADD COLUMN     "provider" "PaymentProvider";

-- CreateTable
CREATE TABLE "payment_events" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "telegram_user_id" BIGINT,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),
    "error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_events_telegram_user_id_idx" ON "payment_events"("telegram_user_id");

-- CreateIndex
CREATE INDEX "payment_events_provider_event_type_idx" ON "payment_events"("provider", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_event_id_key" ON "payment_events"("provider", "event_id");
