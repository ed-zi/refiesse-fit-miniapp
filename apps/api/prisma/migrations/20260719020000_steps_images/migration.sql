-- Пошаговое описание тренировок + картинки в БД (STEP).
ALTER TABLE "workouts" ADD COLUMN "steps" JSONB;

CREATE TABLE "images" (
  "id" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "images_pkey" PRIMARY KEY ("id")
);
