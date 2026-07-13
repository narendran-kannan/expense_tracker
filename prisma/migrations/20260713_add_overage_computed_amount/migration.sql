-- Snapshot the overage amount at the moment a closed month is recorded, so
-- retroactive budget/transaction edits no longer silently change what is owed.
ALTER TABLE "BudgetOverage" ADD COLUMN "computed_amount" DOUBLE PRECISION;
