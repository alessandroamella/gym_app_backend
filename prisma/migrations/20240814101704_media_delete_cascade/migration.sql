-- DropForeignKey
ALTER TABLE "Media" DROP CONSTRAINT "Media_gymEntryId_fkey";

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_gymEntryId_fkey" FOREIGN KEY ("gymEntryId") REFERENCES "GymEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
