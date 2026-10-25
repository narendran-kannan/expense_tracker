-- CreateTable
CREATE TABLE "IgnoredTransaction" (
    "id" TEXT NOT NULL,
    "email_message_id" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "merchant" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "is_cc_payment" BOOLEAN NOT NULL DEFAULT false,
    "match_fingerprint" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'transaction',
    "original_transaction_id" TEXT,
    "snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IgnoredTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IgnoredTransaction_email_message_id_key" ON "IgnoredTransaction"("email_message_id");

-- CreateIndex
CREATE INDEX "IgnoredTransaction_created_at_idx" ON "IgnoredTransaction"("created_at");

-- CreateIndex
CREATE INDEX "IgnoredTransaction_amount_merchant_date_idx" ON "IgnoredTransaction"("amount", "merchant", "date");
