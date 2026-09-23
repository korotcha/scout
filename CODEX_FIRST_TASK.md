# First Codex task for SCOUT

Work in repository `korotcha/scout` on branch `codex-migration`.

Read `AGENTS.md` and `CODEX_MIGRATION.md` first.

## Phase 1 — normalize the repository

Run:

```bash
node scripts/materialize-for-codex.mjs
npm install
npm run build
npm test
```

Do not merge to main yet.

After materialization:
- inspect the full source tree;
- confirm `bundle/` and the build-time override mechanism are gone;
- keep the Vercel + Neon architecture;
- remove obsolete Cloudflare/Vinext-only files only if they are provably unused;
- commit the normalized source tree to `codex-migration`.

## Phase 2 — reproduce and fix the screener bug

Before changing code, reproduce the problem in a browser:

1. Start the dev server.
2. Open the screener.
3. Select one query.
4. Click `В чистовик`.
5. Inspect the exact frontend request, API response, console output, server logs, and Neon state.
6. Determine the root cause.
7. Fix it without a localStorage-only workaround.

Verify all of these:
- one query → Чистовик;
- several queries → Чистовик;
- one/several → Исключено;
- Не разобрано removes the mark;
- reload preserves the server-persisted state;
- a fresh browser session sees the same state;
- no confirmation dialog appears for these three screening status actions.

## Phase 3 — screener UI cleanup

Only after server persistence is verified:

- rename `Стандартный отбор` → `Стандартный фильтр`;
- standard filter should enable:
  - YoY growth > 0;
  - per-product metric > 0;
  - growth per product > 0;
- add `Сбросить фильтры`;
- remove horizontal page/table scrolling at desktop widths;
- make the status column compact, aligned, and visually clean;
- keep exactly three primary screening statuses.

## Phase 4 — verify deployment

Use the Vercel and Neon plugins/connections available in Codex.
Deploy a preview, open it in a browser, repeat the screener test end-to-end, and only then report completion.

Do not claim success based only on a green build.
