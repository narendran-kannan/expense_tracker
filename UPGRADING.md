# Upgrading

This document describes how to safely upgrade existing installations of Expense Tracker.

## Upgrade policy

- Prisma schema migrations are kept in the repo permanently.
- Default category sync is idempotent and safe to re-run.
- Historical backfill scripts are upgrade tools for older installs and should be run when release notes say they are required.

## Upgrading to category hierarchy support

This release adds:

- parent/subcategory relationships in `Category`
- `Transaction.categoryId`
- `Transaction.subcategoryId`
- analytics and UI support for category modes

### Required steps

1. Deploy code that contains the Prisma migration files.
2. Run schema migrations:

```bash
npx prisma migrate deploy
```

3. Sync default categories and subcategories:

```bash
npm run db:sync-categories
```

4. Run a dry-run backfill for old transactions:

```bash
npm run db:backfill-categories:dry
```

5. Review any unmatched legacy category values.
6. Run the real backfill:

```bash
npm run db:backfill-categories
```

### Notes

- Existing `Transaction.category` values are preserved.
- Historical transactions are backfilled to `categoryId` when a safe mapping exists.
- Historical `subcategoryId` values are not inferred automatically.
- It is safe to re-run category sync and backfill scripts.

## Upgrading to EMI spreading support

This release adds the ability to convert a credit-card purchase into an EMI so its cost is recognized evenly across the tenure instead of as one upfront spike.

It adds these columns to `Transaction`:

- `is_emi` (boolean, default `false`)
- `emi_tenure_months`
- `emi_monthly_amount`
- `emi_start_date`

### Required steps

1. Deploy code that contains the Prisma migration files.
2. Run schema migrations:

```bash
npx prisma migrate deploy
```

### Notes

- This is a purely additive migration (new nullable columns plus one boolean defaulting to `false`). **No data backfill is required.**
- Existing transactions are unaffected: they default to `is_emi = false` and behave exactly as before.
- EMI and recoverable status are mutually exclusive; converting a transaction to EMI clears any recoverable tracking and its repayments.
- EMI installments are computed, not stored: the original purchase row is the source of truth, and analytics/insights/dashboard spread it across months on read. The credit-card bill payment stays excluded to avoid double-counting.

## Deployment sequencing

Use this order for upgrades:

1. Backup database
2. Apply Prisma migrations
3. Sync reference data
4. Run required backfills
5. Start or deploy the new application version

This repository follows an expand -> migrate data -> contract approach. Old fields remain in place until all active installs have crossed the upgrade boundary.
