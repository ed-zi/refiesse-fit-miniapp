-- Финальная таксономия каталога и тегов (docs/product/catalog-taxonomy.md).
-- Эмодзи направления + теги тренировки (зона/место/нагрузка/ограничения).
ALTER TABLE "categories" ADD COLUMN "emoji" TEXT;

ALTER TABLE "workouts" ADD COLUMN "zones" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "workouts" ADD COLUMN "place" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "workouts" ADD COLUMN "intensity" TEXT;
ALTER TABLE "workouts" ADD COLUMN "restrictions" TEXT[] NOT NULL DEFAULT '{}';
