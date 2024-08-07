/*
  Warnings:

  - The values [GYM_WORKOUT,HOME_WORKOUT,SPORTS_ACTIVITY] on the enum `WorkoutType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "WorkoutType_new" AS ENUM ('GYM', 'CARDIO', 'YOGA', 'SPORT', 'OTHER');
ALTER TABLE "GymEntry" ALTER COLUMN "type" TYPE "WorkoutType_new" USING ("type"::text::"WorkoutType_new");
ALTER TYPE "WorkoutType" RENAME TO "WorkoutType_old";
ALTER TYPE "WorkoutType_new" RENAME TO "WorkoutType";
DROP TYPE "WorkoutType_old";
COMMIT;
