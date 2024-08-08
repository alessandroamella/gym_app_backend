/*
  Warnings:

  - Made the column `gymEntryId` on table `Media` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "GymEntry" DROP CONSTRAINT "GymEntry_userId_fkey";

-- DropForeignKey
ALTER TABLE "Media" DROP CONSTRAINT "Media_gymEntryId_fkey";

-- DropForeignKey
ALTER TABLE "WeightEntry" DROP CONSTRAINT "WeightEntry_userId_fkey";

-- AlterTable
ALTER TABLE "Media" ALTER COLUMN "gymEntryId" SET NOT NULL;

-- AlterTable
ALTER TABLE "WeightEntry" ADD COLUMN     "notes" TEXT;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_gymEntryId_fkey" FOREIGN KEY ("gymEntryId") REFERENCES "GymEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymEntry" ADD CONSTRAINT "GymEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeightEntry" ADD CONSTRAINT "WeightEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
