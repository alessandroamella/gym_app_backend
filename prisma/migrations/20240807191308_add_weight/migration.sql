-- CreateTable
CREATE TABLE "WeightUpdate" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "WeightUpdate_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "WeightUpdate" ADD CONSTRAINT "WeightUpdate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
