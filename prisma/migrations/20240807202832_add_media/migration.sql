/*
  Warnings:

  - You are about to drop the column `media` on the `GymEntry` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- AlterTable
ALTER TABLE "GymEntry" DROP COLUMN "media";

-- CreateTable
CREATE TABLE "Media" (
    "id" SERIAL NOT NULL,
    "path" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "gymEntryId" INTEGER,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_gymEntryId_fkey" FOREIGN KEY ("gymEntryId") REFERENCES "GymEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
