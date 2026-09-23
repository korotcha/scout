# SCOUT → Codex migration

## Current state

SCOUT is the WB/Ozon niche-screening platform.

Infrastructure:
- GitHub: `korotcha/scout`
- Frontend/runtime: Next.js on Vercel
- Database: Neon Postgres, project `scout`, region Singapore
- Production/preview deployments are connected to GitHub.
- Vercel environment contains `DATABASE_URL`, `SCOUT_PASSWORD`, and encryption configuration.

The repository was temporarily bootstrapped from:
- `bundle/market-radar-v53-deploy-source.zip`
- `bundle/vercel-overrides.*`
- `scripts/unpack.mjs`

That layout was only a bridge from the old ChatGPT-hosted/Cloudflare version to Vercel.

## First Codex task

Do not debug the product before materializing the repository.

1. Run:
   ```bash
   node scripts/materialize-for-codex.mjs
   npm install
   npm run build
   npm test
   ```
2. Inspect the resulting normal source tree.
3. Remove any remaining obsolete Cloudflare/Vinext-only configuration only after confirming it is unused.
4. Commit the materialized source tree to a migration branch.
5. Deploy a preview to Vercel and verify it.
6. Only after the preview works, merge the cleanup.

## First product bug to reproduce

In **Скринер / Поиск ниш**, selecting a query and pressing **В чистовик** does not persist/move the query as expected.

Do not patch by hypothesis. Reproduce end-to-end:

1. Start the app.
2. Open the screener.
3. Select one query.
4. Click **В чистовик**.
5. Inspect the browser request to `/api/screener-marks`.
6. Inspect the API response and Vercel/runtime logs.
7. Inspect Neon rows in `screener_marks`.
8. Fix the root cause.
9. Verify:
   - one query → Чистовик;
   - multiple queries → Чистовик;
   - one/multiple → Исключено;
   - Не разобрано restores the default state;
   - reload preserves state;
   - another browser/session sees server-persisted state.

Do not consider localStorage-only fallback a completed fix. Server persistence must work.

## Intended screener status model

Exactly three primary screening states:
- Не разобрано — default, no stored mark
- Чистовик — stored as `shortlisted`
- Исключено — stored as `excluded`

Changing these states must not show confirmation dialogs for either one or multiple selected queries.

## Next UI pass after persistence is verified

- Rename **Стандартный отбор** to **Стандартный фильтр**.
- Standard filter enables:
  - YoY growth > 0
  - per-product metric > 0
  - growth per product > 0
- Add **Сбросить фильтры** near the standard filter in an unobtrusive location.
- Remove horizontal scrolling from the screener table at desktop widths.
- Make the status column compact and aligned.
- Avoid over-wide status controls that push the table beyond the viewport.
- Keep the screen visually clean and dense rather than adding more statuses.

## Important

The old Cloudflare implementation used D1/R2. The current target architecture is Vercel + Neon Postgres. Do not reintroduce Cloudflare runtime dependencies.
