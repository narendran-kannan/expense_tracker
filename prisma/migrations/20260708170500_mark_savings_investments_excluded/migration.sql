-- One-time upgrade for existing installs: flag the default "Savings &
-- Investments" category as "tracked, not counted". New installs get this via
-- scripts/sync-categories.mjs on first insert. Users can toggle it off later;
-- this migration runs once and never re-applies.
UPDATE "Category"
SET "excluded_from_spend" = true
WHERE "name" = 'Savings & Investments'
  AND "parentId" IS NULL;
