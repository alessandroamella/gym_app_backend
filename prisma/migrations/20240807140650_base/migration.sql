-- CreateEnum
CREATE TYPE "WorkoutType" AS ENUM ('GYM_WORKOUT', 'HOME_WORKOUT', 'SPORTS_ACTIVITY', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "telegramId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "profilePic" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GymEntry" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "points" INTEGER NOT NULL,
    "type" "WorkoutType" NOT NULL,
    "notes" TEXT,
    "media" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "GymEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- AddForeignKey
ALTER TABLE "GymEntry" ADD CONSTRAINT "GymEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
