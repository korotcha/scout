# Market Radar

Внутренняя платформа поиска товаров и анализа ниш Wildberries: загрузки,
скринер, чистовик, история спроса MPStats, конкуренты, фабрики и юнит-экономика.

**Для продолжения в Codex начните с [START_HERE.md](START_HERE.md).**
Готовое вводное сообщение: [PROMPT_FOR_CODEX.md](PROMPT_FOR_CODEX.md).
Текущее ТЗ и ограничения: [docs/handoff](docs/handoff/).

React + TypeScript + Vinext/Vite + Cloudflare Workers/D1/R2.
Текущий сайт: https://wb-market-screening.korotcha.chatgpt.site

```sh
npm ci
npx tsc --noEmit
npx vinext build
npx vite --host 127.0.0.1
```

Полный запуск API требует локальной D1 и доверенной аутентификации; инструкция
в START_HERE.md. Секретов и живого дампа сервера в исходниках нет.

Дизайн намеренно упрощён по последнему запросу пользователя.
Исторические документы и прототипы сохраняются как наработки, но не заменяют
актуальные решения из docs/handoff.
