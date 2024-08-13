/*
  Warnings:

  - You are about to drop the column `type` on the `GymEntry` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "GymEntry" DROP COLUMN "type",
ADD COLUMN     "types" "WorkoutType"[];
