/*
  Warnings:

  - You are about to drop the column `onboarding_equipment` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `onboarding_goal` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `onboarding_intensity` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `onboarding_time` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `onboarding_updated_at` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "onboarding_equipment",
DROP COLUMN "onboarding_goal",
DROP COLUMN "onboarding_intensity",
DROP COLUMN "onboarding_time",
DROP COLUMN "onboarding_updated_at",
ADD COLUMN     "onboarding" JSONB;
