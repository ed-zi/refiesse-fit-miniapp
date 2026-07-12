-- CreateEnum
CREATE TYPE "WorkoutLevel" AS ENUM ('beginner', 'medium', 'advanced');

-- CreateEnum
CREATE TYPE "AccessType" AS ENUM ('free', 'premium');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "TributeEventType" AS ENUM ('new_subscription', 'renewed_subscription', 'cancelled_subscription');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "telegram_user_id" BIGINT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "username" TEXT,
    "language_code" TEXT,
    "onboarding_goal" TEXT,
    "onboarding_time" TEXT,
    "onboarding_equipment" TEXT[],
    "onboarding_intensity" TEXT,
    "onboarding_updated_at" TIMESTAMP(3),
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workouts" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "level" "WorkoutLevel" NOT NULL DEFAULT 'beginner',
    "equipment" TEXT[],
    "access" "AccessType" NOT NULL DEFAULT 'free',
    "video_url" TEXT,
    "description" TEXT NOT NULL,
    "cautions" TEXT NOT NULL,
    "thumb_color" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "category_id" TEXT NOT NULL,

    CONSTRAINT "workouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programs" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "days_total" INTEGER NOT NULL,
    "access" "AccessType" NOT NULL DEFAULT 'free',
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_days" (
    "id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "day_index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "workout_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "workout_id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration_min" INTEGER NOT NULL,
    "entry_date" DATE NOT NULL,

    CONSTRAINT "progress_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "workout_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'expired',
    "expires_at" TIMESTAMP(3),
    "tribute_subscription_id" TEXT,
    "started_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tribute_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "type" "TributeEventType" NOT NULL,
    "telegram_user_id" BIGINT,
    "payload" JSONB NOT NULL,
    "signature_ok" BOOLEAN NOT NULL,
    "processed_at" TIMESTAMP(3),
    "error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tribute_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_user_id_key" ON "users"("telegram_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "workouts_slug_key" ON "workouts"("slug");

-- CreateIndex
CREATE INDEX "workouts_category_id_idx" ON "workouts"("category_id");

-- CreateIndex
CREATE INDEX "workouts_access_idx" ON "workouts"("access");

-- CreateIndex
CREATE INDEX "workouts_level_idx" ON "workouts"("level");

-- CreateIndex
CREATE INDEX "workouts_duration_min_idx" ON "workouts"("duration_min");

-- CreateIndex
CREATE UNIQUE INDEX "programs_slug_key" ON "programs"("slug");

-- CreateIndex
CREATE INDEX "programs_access_idx" ON "programs"("access");

-- CreateIndex
CREATE INDEX "program_days_workout_id_idx" ON "program_days"("workout_id");

-- CreateIndex
CREATE UNIQUE INDEX "program_days_program_id_day_index_key" ON "program_days"("program_id", "day_index");

-- CreateIndex
CREATE INDEX "progress_entries_user_id_idx" ON "progress_entries"("user_id");

-- CreateIndex
CREATE INDEX "progress_entries_user_id_completed_at_idx" ON "progress_entries"("user_id", "completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "progress_entries_user_id_workout_id_entry_date_key" ON "progress_entries"("user_id", "workout_id", "entry_date");

-- CreateIndex
CREATE INDEX "favorites_user_id_idx" ON "favorites"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_user_id_workout_id_key" ON "favorites"("user_id", "workout_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_expires_at_idx" ON "subscriptions"("status", "expires_at");

-- CreateIndex
CREATE INDEX "subscriptions_tribute_subscription_id_idx" ON "subscriptions"("tribute_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "tribute_events_event_id_key" ON "tribute_events"("event_id");

-- CreateIndex
CREATE INDEX "tribute_events_telegram_user_id_idx" ON "tribute_events"("telegram_user_id");

-- CreateIndex
CREATE INDEX "tribute_events_type_idx" ON "tribute_events"("type");

-- AddForeignKey
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_days" ADD CONSTRAINT "program_days_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_days" ADD CONSTRAINT "program_days_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "workouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "workouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "workouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
