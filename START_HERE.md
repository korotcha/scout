# Market Radar — начать здесь

Передача проекта в Codex, 21 сентября 2026 года. Это существующее приложение,
а не задача сделать новый сайт с нуля. Сначала прочитайте этот файл,
`docs/handoff/PRODUCT_DECISIONS.md`, `docs/handoff/MPSTATS.md` и
`docs/handoff/NEXT_STEPS.md`.

## Что внутри

- Полные текущие исходники React/TypeScript, API, формулы, тесты и зависимости с lockfile.
- Миграции D1 `0000`–`0010`, схема Drizzle и интеграция R2.
- Исторический пользовательский свод `public/source-summary.json`.
- Предыдущие наработки и документация. Старые документы помечены как исторические.
- В переносимом ZIP: `history.bundle` с историей Git и `reference-materials/`
  с доступными оригиналами CSV, YAML API и скриншотами. Это материалы, не данные для подстановки в production.
- `PROMPT_FOR_CODEX.md` — готовое первое сообщение новому агенту.

ZIP не содержит node_modules, сборку dist, временные окружения, API-токены,
секрет шифрования, живой дамп D1 или сохранённые на сервере файлы R2.
Рабочие данные не удалены: они остаются на действующем сайте.

## Состояние

Сайт: https://wb-market-screening.korotcha.chatgpt.site
Идентификатор существующего Site находится в `.openai/hosting.json`.
Исходный репозиторий Sites — не GitHub. При работе с этим Site нужно переиспользовать
его идентификатор и доступ, а не создавать замену. Перенос кода сам по себе не даёт
доступ к production-хранилищу и не переносит авторизацию.

Последний функциональный этап перед упрощением дизайна:
`d86d655384ea298648bad5c76cc13c735ae947a5` — сохранённая аналитика MPStats и подбор групп.
Ранее: `e1da005ab348257dcf3590348d762a492f0fd3c2` — месячные средние (эта методика
затем изменена); `c3969a8` — первая история частотности.
Точный итоговый коммит экспорта записан в `EXPORT_MANIFEST.json` внутри ZIP.

По просьбе пользователя прежний декоративный дизайн убран. Сейчас базовый интерфейс:
системный шрифт, нейтральные поверхности, небольшие углы, без декоративных теней.
Структура и функциональные цвета сохранены. Не восстанавливать старую тему или
обязательные GitHub-дизайн-скиллы без нового запроса. Правила — в `DESIGN.md`.

## Стек и карта кода

| Область | Файлы |
|---|---|
| Основной экран, навигация | `app/page.tsx`, остальные компоненты в `app/` |
| Общие стили | `app/globals.css`, `DESIGN.md` |
| Доступные UI-примитивы | `components/ui/`, Tailwind и локальный vendor CSS |
| Свод, скринер, статусы | `lib/screener.ts`, `lib/subject-demand.ts`, `lib/query-status.ts`, `lib/workflow-screener.ts` |
| Карточка и бизнес-переходы | `lib/candidate-workflow.ts`, `app/api/candidates/route.ts` |
| Исследование и оценка | `lib/niche-research.ts`, `app/research-panel.tsx` |
| История спроса | `lib/search-demand.ts`, `app/search-demand-panel.tsx`, `app/api/search-demand/route.ts` |
| Отчёты MPStats и сводка | `lib/query-analysis.ts`, `lib/mpstats-request.ts`, `app/query-analysis-charts.tsx`, `app/api/query-analysis/route.ts` |
| API-группа конкурентов | `app/query-competitor-builder.tsx`, `app/api/query-competitors/route.ts` |
| Импорт CSV/ZIP группы | `lib/mpstats-import.ts`, `app/research-import.tsx` |
| Юнит-экономика | `lib/candidate-workflow.ts`, `lib/unit-inputs.ts`, `lib/calculator-settings.ts` |
| WB, подключение ключей | `lib/wb-tariffs.ts`, `lib/connection-crypto.ts`, API connections/wb-tariffs |
| База и Worker | `db/`, `drizzle/`, `worker/`, `vite.config.ts`, `build/` |

Среда исполнения — Cloudflare Workers через Vinext/Vite; синтаксис App Router
не означает, что сервер можно без изменений перенести в обычный Next.js на Vercel.
Используются `cloudflare:workers`, D1 (`DB`), R2 (`BUCKET`).

## Запуск для разработки

Рекомендуется Node 22.18+ (или совместимая современная версия); npm.
Из каталога `project/` в архиве:

```sh
npm ci
npx tsc --noEmit
npx vinext build
npx vite --host 127.0.0.1
```

`npm run build` и `npm run install:ci` — существующие Linux-хелперы с GNU timeout/flock.
На macOS используйте прямые команды выше. Lockfile не обновлять без причины.
Сборка не требует настоящего MPStats-токена.

Для новой локальной D1 есть отдельный конфиг, который НЕ является production-конфигом:

```sh
npx wrangler d1 migrations apply site-creator-d1 --local --config config/wrangler.local.jsonc
```

Vite использует те же логические имена локальных DB/R2. При смене working directory
проверьте, что Wrangler и Vite используют одну `.wrangler/state`.

**Авторизация:** в Sites доверенный шлюз добавляет `oai-authenticated-user-email` и ID.
В обычном localhost этого шлюза нет: часть интерфейса загрузится, защищённые API
вернут 401. Для полноценной локальной работы следующему агенту нужно настроить
изолированный loopback-only dev auth или реальную аутентификацию. Не снимать
проверки в production и не доверять таким заголовкам напрямую из интернета.
Адрес владельца сейчас явно задан в нескольких route-файлах; централизовать при переносе.

## Секреты и данные

- `INTEGRATION_ENCRYPTION_KEY`: отдельный серверный секрет, 32 байта в base64.
  Шифрует сохранённые ключи AES-GCM, не находится в Git.
- MPStats/WB-токены сохраняются зашифрованными в `api_connections`.
  Их нельзя восстановить из этого ZIP. На новом окружении проще подключить их заново.
- `OPENAI_API_KEY` не настроен. Автоматическая сводка сейчас **не AI**.
- На текущем Sites AI-ключ подключается через OpenAI Developers по правилам среды.
  На ином хостинге нужен его собственный защищённый механизм секретов.

D1 содержит проекты, метаданные загрузок, исключения, статусы, карточки,
истории изменений, настройки калькулятора, подключения и блокировки заданий.
R2 содержит исходные файлы, отчёты групп и сохранённые JSON-отчёты запросов.
Подробности переноса: `docs/handoff/DATA_AND_DEPLOYMENT.md`.

## Проверки

```sh
node --test tests/search-demand.test.mjs tests/search-demand-api.test.mjs tests/query-analysis.test.mjs
node --test tests/niche-research.test.mjs tests/mpstats-import.test.mjs
node --test tests/candidate-workflow.test.mjs tests/candidate-api.test.mjs
```

Некоторые тесты используют `node:sqlite`, esbuild и прямой импорт TypeScript;
не использовать старый Node. Полный набор: `npm test` (с Linux build-хелпером)
или отдельно `npx vinext build`, затем `node --test tests/*.test.mjs`.

Перед предыдущей публикацией прошли 36 профильных проверок и сборка; для новых
MPStats-отчётов проверены контракты на mock-ответах. Их реальная доступность на
тарифе пользователя пока не подтверждена. Не выдавать mock-проверки за live-тест.
