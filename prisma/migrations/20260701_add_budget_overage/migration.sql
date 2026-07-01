-- CreateTable
CREATE TABLE "BudgetOverage" (
    "id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "override_amount" DOUBLE PRECISION,
    "owed_to" TEXT,
    "status" TEXT NOT NULL DEFAULT 'outstanding',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetOverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OveragePayment" (
    "id" TEXT NOT NULL,
    "overage_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OveragePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BudgetOverage_year_month_idx" ON "BudgetOverage"("year", "month");

-- CreateIndex
CREATE INDEX "BudgetOverage_status_idx" ON "BudgetOverage"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetOverage_month_year_key" ON "BudgetOverage"("month", "year");

-- CreateIndex
CREATE INDEX "OveragePayment_overage_id_idx" ON "OveragePayment"("overage_id");

-- AddForeignKey
ALTER TABLE "OveragePayment" ADD CONSTRAINT "OveragePayment_overage_id_fkey" FOREIGN KEY ("overage_id") REFERENCES "BudgetOverage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

