import { z } from "zod";
import { checkFrequency, readLimited } from "@/lib/mpstats-check";
import { getObjectStore } from "@/lib/object-store";

const reportKey = "integration-checks/mpstats-latest.json";
const bucket = getObjectStore();
const json = (body: unknown, status = 200) => Response.json(body, { status,
  headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
function authorized(request: Request) {
  return request.headers.get("oai-authenticated-user-email")?.toLowerCase() === "korotcha@yandex.ru";
}
export async function GET(request: Request) {
  if (!authorized(request)) return json({ error: "Проверка доступна только владельцу сайта." }, 403);
  try { const object = await bucket.get(reportKey); return json({ report: object ? await object.json() : null }); }
  catch { return json({ error: "Не удалось прочитать результат проверки." }, 503); }
}
export async function POST(request: Request) {
  if (!authorized(request)) return json({ error: "Проверка доступна только владельцу сайта." }, 403);
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Недопустимый источник запроса." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Неверный формат запроса." }, 400);
  let input;
  try {
    input = z.object({ token: z.string().trim().min(20).max(1000).regex(/^[A-Za-z0-9._-]+$/),
      query: z.string().trim().min(2).max(200) }).strict().safeParse(JSON.parse(await readLimited(request.body, 5000)));
  } catch { return json({ error: "Не удалось прочитать форму. Проверьте поля." }, 400); }
  if (!input.success) return json({ error: "Укажите запрос и корректный API-токен MPStats." }, 400);
  // A pasted token must never become the persisted search phrase.
  if (input.data.query.includes(input.data.token)) return json({ error: "В поле запроса нужен поисковый запрос, а не токен." }, 400);
  const report = await checkFrequency(input.data.token, input.data.query);
  input.data.token = "";
  try {
    await bucket.put(reportKey, JSON.stringify(report), { httpMetadata: { contentType: "application/json" } });
    return json({ report, saved: true });
  } catch { return json({ report, saved: false, warning: "Результат показан, но не сохранён. Скопируйте его перед закрытием страницы." }); }
}
