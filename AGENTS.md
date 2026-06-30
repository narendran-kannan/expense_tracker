# AGENTS.md — Expense Tracker

Single-user Next.js 16 dashboard that parses Indian bank alert emails (Gmail API) with Gemini AI to extract debits.

## Stack quirks worth knowing

- Next.js 16 (App Router), React 19, TypeScript strict
- Prisma 7 (PostgreSQL) — client generated to `src/generated/prisma/`, import via `@/lib/prisma`
- NextAuth v5 beta (credentials provider, single password)
- Vercel AI SDK + `@ai-sdk/google` (`gemini-2.5-flash`) with Zod schemas for structured output
- Tailwind CSS 4 + shadcn/ui (new-york style) — do NOT hand-edit `src/components/ui/*`
- Dev/prod port is **3003**, not 3000 (README still says 3000 — config is the source of truth)
- Node 24 (`.nvmrc`)

## Commands

```bash
npm run dev                          # next dev on :3003 with --inspect
npm run build                        # prisma generate -> migrate deploy -> sync categories -> next build
npm run lint                         # eslint flat config (next core-web-vitals + typescript)
npm test                             # vitest run (one-shot)
npm run test:watch                   # vitest watch
npx vitest run src/lib/email.test.ts # single file
npx vitest run -t "parses dd-Mon"    # by test name
npx tsc --noEmit                     # type check (no script — run directly)

npm run db:push                      # dev: sync schema without migration
npm run db:migrate                   # prisma migrate dev (create migration)
npm run db:sync-categories           # idempotent; seeds default Category rows
npm run db:backfill-categories:dry   # dry-run legacy → categoryId backfill
npm run db:backfill-categories       # real backfill (upgrade-only, not per-deploy)
npm run db:seed                      # POSTs to localhost:3003/api/seed — server must be running
```

After changes, run: `npm run lint && npx tsc --noEmit && npm test`. Run `npm run build` before declaring a deploy-affecting change done — it executes migrations.

In production NEVER use `prisma db push`; `npm run build` runs `prisma migrate deploy`. See `DEPLOYMENT.md` and `UPGRADING.md`.

## Layout

```
src/
  app/
    page.tsx              # Dashboard (RSC). searchParams is Promise<...> (Next 16 async)
    actions.ts            # "use server" — all DB writes; revalidates /, /analytics, /categories
    analytics/page.tsx
    categories/           # category management page
    import/               # XLSX import flow (uses xlsx lib)
    login/page.tsx
    api/
      auth/[...nextauth]/
      process-emails/     # GET — Gmail → Gemini → DB. Bearer CRON_SECRET in prod
      seed/               # POST — disabled when NODE_ENV=production
  components/             # client components, co-located *.test.tsx
    ui/                   # shadcn primitives — generated, do not edit
  lib/
    prisma.ts             # singleton; auto-switches between PrismaPg adapter and Accelerate
    auth.ts               # NextAuth credentials config
    schemas.ts            # Zod schemas — fields use .describe() for AI structured output
    categories.ts         # DEFAULT_CATEGORIES (source for db:sync-categories)
    email.ts              # html-to-text helpers
    date-extraction.ts    # regex + AI date reconciliation
  middleware.ts           # auth guard — allows /login, /api/auth, /api/process-emails, /api/seed
  generated/prisma/       # gitignored Prisma client output
prisma/
  schema.prisma           # 6 models: Category, Transaction, Repayment, Budget, SkippedEmail, Insight
  migrations/             # committed; required for prod
scripts/
  sync-categories.mjs       # run by npm build
  backfill-category-refs.mjs
```

## Conventions that aren't obvious

- Path alias `@/*` → `src/*`. Use it; do not use relative `../` across dirs.
- Prisma client import: `@/generated/prisma/client` (not `@prisma/client`).
- DB fields are snake_case (`is_cc_payment`, `confidence_score`, `needs_review`, `email_message_id`). TS code in `src/` is camelCase — preserve the mismatch.
- Server actions in `src/app/actions.ts` revalidate three paths (`/`, `/analytics`, `/categories`) via the `revalidateAppPaths()` helper. Use it after mutations.
- Page components: `searchParams: Promise<{...}>` then `await searchParams` (Next.js 16 async params — easy to get wrong).
- Use `useTransition` for invoking server actions from client components.
- Prisma `Date` → serialize to ISO string before passing to client components.
- Currency/locale: `Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" })` everywhere.
- CC payments excluded from spend totals: `filter(t => !t.is_cc_payment)`. Don't double-count.
- EMI purchases (`is_emi`): the original lump-sum row is the source of truth; cost is spread across `emi_tenure_months` on read, never as stored installment rows. `effectiveSpend()` returns the start-month installment for an EMI row; later months come from `expandTransactionsForRange()` (analytics/insights) or `getEmiInstallmentsForMonth()` (dashboard). EMI installments are NOT `is_cc_payment` — the CC bill exclusion still applies to the bill payment, so each rupee counts once. EMI and recoverable are mutually exclusive. See `src/lib/emi.ts`.
- Transactions with `confidence_score < 0.8` get `needs_review: true` (auto-flagged).
- Dedup: by `email_message_id` (unique constraint) + `idx_dedup` on `(amount, merchant, date)`.

## Testing

Vitest 4, happy-dom, setup at `src/test-setup.ts` (loads `@testing-library/jest-dom`). Tests co-located as `*.test.ts(x)`. For component tests use `@testing-library/react` + `user-event`. Mock server actions with `vi.mock("@/app/actions", ...)`. Use `vi.setSystemTime()` for time-dependent tests and reset with `vi.useRealTimers()` + `vi.clearAllMocks()` in `afterEach`.

## Env vars

Required: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_PASSWORD`.
Email: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, optional `GMAIL_SEARCH_QUERY`.
AI: `GOOGLE_GENERATIVE_AI_API_KEY`.
Cron: `CRON_SECRET` (required to call `/api/process-emails` in prod; bypassed in dev).
`DATABASE_URL` starting with `prisma+` triggers Accelerate path in `src/lib/prisma.ts`; otherwise PgAdapter is used and the `schema` query param is honored.

## Adding things

- New default categories: edit `src/lib/categories.ts`, then `npm run db:sync-categories` (idempotent; build runs it too).
- New shadcn primitive: `npx shadcn add <name>` — never hand-write into `src/components/ui/`.
- New Prisma migration: edit `prisma/schema.prisma`, then `npm run db:migrate` (dev). Commit the generated migration folder.
- New AI-extracted field: add to `src/lib/schemas.ts` with `.describe()`; the AI SDK uses descriptions as prompts.

## Related docs

- `README.md` — user-facing setup (note: says port 3000, actual is 3003)
- `DEPLOYMENT.md` — Vercel build command + what NOT to run per-deploy
- `UPGRADING.md` — category hierarchy migration steps for older installs
