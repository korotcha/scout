# SCOUT agent instructions

Read `CODEX_MIGRATION.md` before making changes.

Principles:
- Reproduce bugs before editing.
- Use browser/network/runtime/database evidence instead of speculative patches.
- Keep screener primary statuses limited to: unreviewed, shortlisted, excluded.
- Preserve the existing marketplace analysis workflow and approved UI unless a task explicitly changes it.
- After any UI change, visually verify the relevant screen.
- After backend changes, verify both API response and persisted Neon state.
- Prefer small root-cause changes over compatibility layers.
- Do not restore Cloudflare D1/R2 dependencies; production target is Vercel + Neon.
