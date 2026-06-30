-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "is_emi" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Transaction" ADD COLUMN "emi_tenure_months" INTEGER;
ALTER TABLE "Transaction" ADD COLUMN "emi_monthly_amount" DOUBLE PRECISION;
ALTER TABLE "Transaction" ADD COLUMN "emi_start_date" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Transaction_is_emi_emi_start_date_idx" ON "Transaction"("is_emi", "emi_start_date");
