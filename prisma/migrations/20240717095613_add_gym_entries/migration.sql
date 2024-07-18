-- CreateTable
CREATE TABLE "GymEntry" (
    "userId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "points" INTEGER NOT NULL,

    PRIMARY KEY ("userId", "date"),
    CONSTRAINT "GymEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
