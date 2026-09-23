MARKET RADAR v53 — DEPLOY SOURCE

This is the clean source package for the next deployment of the existing Market Radar site.
The existing Site Creator project id is preserved in .openai/hosting.json.

What changed after v52:
- Screener exposes exactly three manual statuses: «Не разобрано», «Чистовик», «Исключено».
- One or many selected queries move between these statuses immediately, without confirmation dialogs.
- «Не разобрано» is the default and can be assigned again without deleting saved analysis.
- Rows in «Чистовик» show derived progress: «Отобран» → «Менеджер» → «Решение», followed by the outcome when known.
- «Кандидат в закуп» and «Отложено» are workflow outcomes, not extra screener statuses.
- The downstream section is «Кандидаты + юнит».
- Purchase candidates auto-group by subject; groups can be renamed, requests can be dragged between groups, split out, or returned to subject grouping.
- Regrouping does not reset analysis, candidate stage or unit calculations.
- v52 seasonal-peak and resumable MPStats fixes remain included.

Build notes:
- This archive intentionally excludes node_modules, dist, runtime caches and secrets.
- Hosting should run npm ci and npm run build.
- A full production compile was not possible in this sandbox because registry.npmjs.org was not resolvable.
