import { z } from "zod";
import { getRawDb } from "@/db";
import { encryptKey, decryptKey } from "@/lib/connection-crypto";
import { checkFrequency, frequencyPoints, readLimited, type MpstatsCheck } from "@/lib/mpstats-check";
import { canonicalPoints, normalizeDemandQuery, type DemandSnapshot } from "@/lib/search-demand";
import { getObjectStore } from "@/lib/object-store";
const bucket = getObjectStore();
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
const owner = (request: Request) => request.headers.get("oai-authenticated-user-email")?.toLowerCase() === "korotcha@yandex.ru";
const signedIn = (request: Request) => !!request.headers.get("oai-authenticated-user-id") || !!request.headers.get("oai-authenticated-user-email");
const secret = () => (process.env.INTEGRATION_ENCRYPTION_KEY ?? process.env.SCOUT_PASSWORD ?? "");
const context = "market-radar:mpstats:v1";
type Connection = { encrypted_key: string; revision: number; checked_at: string | null };
const readConnection = () => getRawDb().prepare("SELECT encrypted_key, revision, checked_at FROM api_connections WHERE provider = 'mpstats'").first<Connection>();
const querySchema = z.string().trim().min(2).max(200).transform(normalizeDemandQuery);
async function snapshotKey(query: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(query));
  return "search-demand/wb/" + Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("") + ".json";
}
async function readSnapshot(query: string): Promise<DemandSnapshot | null> {
  const key = await snapshotKey(query);
  const object = await bucket.get(key);
  if (object) return await object.json<DemandSnapshot>();
  // Reuse the user's successful diagnostic call without another request to MPStats.
  const legacy = await bucket.get("integration-checks/mpstats-latest.json");
  if (!legacy) return null;
  const report = await legacy.json<MpstatsCheck>();
  if (report.status !== "ok" || normalizeDemandQuery(report.query) !== query || report.request?.url?.startsWith("https://mpstats.io/api/analytics/v1/wb/keywords/frequency?") !== true) return null;
  const points = frequencyPoints(report.points);
  if (!points?.length) return null;
  const snapshot: DemandSnapshot = { version: 1, query, source: "mpstats-wb-frequency", fetchedAt: report.checkedAt, points: canonicalPoints(points) };
  // Preserve this already-saved diagnostic under its query before the next diagnostic replaces it.
  try { await bucket.put(key, JSON.stringify(snapshot), { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" } }); } catch { /* Original report remains readable. */ }
  return snapshot;
}
export async function GET(request: Request) {
  if (!signedIn(request)) return json({ error: "Войдите в аккаунт." }, 401);
  const parsed = querySchema.safeParse(new URL(request.url).searchParams.get("query"));
  if (!parsed.success) return json({ error: "Укажите поисковый запрос." }, 400);
  try {
    const [row, snapshot] = await Promise.all([readConnection(), readSnapshot(parsed.data)]);
    return json({ snapshot, connected: !!process.env.MPSTATS_API_KEY || !!row?.encrypted_key, canUpdate: signedIn(request), canConnect: owner(request), storageReady: !!secret() });
  } catch { return json({ error: "Не удалось открыть сохранённую историю. Повторите загрузку." }, 503); }
}
export async function POST(request: Request) {
  if (!signedIn(request)) return json({ error: "Войдите в аккаунт." }, 401);
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Недопустимый источник запроса." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Неверный формат запроса." }, 400);
  let input;
  try {
    input = z.object({ query: querySchema, action: z.enum(["load", "refresh", "disconnect"]),
      token: z.string().trim().min(20).max(1000).regex(/^[A-Za-z0-9._-]+$/).optional(), remember: z.boolean().default(false) }).strict().safeParse(JSON.parse(await readLimited(request.body, 5000)));
  } catch { return json({ error: "Не удалось прочитать форму." }, 400); }
  if (!input.success) return json({ error: "Проверьте запрос и API-токен." }, 400);
  if (!owner(request) && (input.data.token || input.data.remember || input.data.action === 'disconnect')) return json({ error: "Подключением MPStats управляет владелец." }, 403);
  const { query, action, remember } = input.data;
  if (input.data.token && query.includes(input.data.token.toLowerCase())) return json({ error: "В поле запроса нужен поисковый запрос, а не токен." }, 400);
  try {
    const db = getRawDb();
    if (action === "disconnect") {
      if (process.env.MPSTATS_API_KEY) return json({ error: 'Ключ настроен в окружении сервера. Для отключения удалите MPSTATS_API_KEY из настроек окружения.' }, 409);
      await db.prepare("UPDATE api_connections SET encrypted_key = '', revision = revision + 1, updated_at = ? WHERE provider = 'mpstats'").bind(new Date().toISOString()).run();
      return json({ disconnected: true, message: "MPStats отключён. Загруженные графики сохранены." });
    }
    const row = await readConnection();
    if (action === "load" && !input.data.token) {
      const snapshot = await readSnapshot(query);
      if (snapshot) return json({ snapshot, connected: !!process.env.MPSTATS_API_KEY || !!row?.encrypted_key, cached: true });
    }
    if (remember && !secret()) return json({ error: "Сохранение подключения пока недоступно. Снимите галочку сохранения ключа, чтобы выполнить разовую загрузку." }, 503);
    let token = input.data.token ?? (process.env.MPSTATS_API_KEY || (row?.encrypted_key ? await decryptKey(row.encrypted_key, secret(), context) : ""));
    if (!token) return json({ error: "Подключите MPStats: введите API-токен." }, 400);
    if (query.includes(token.toLowerCase())) return json({ error: "В поле запроса нужен поисковый запрос, а не токен." }, 400);
    // Atomic one-minute lease prevents double clicks and concurrent tabs spending extra calls.
    const now = new Date().toISOString();
    const lease = await db.prepare("INSERT INTO api_connections (provider, encrypted_key, revision, updated_at, checked_at) VALUES ('mpstats', '', 0, ?, ?) ON CONFLICT(provider) DO UPDATE SET checked_at = excluded.checked_at WHERE api_connections.checked_at IS NULL OR api_connections.checked_at < ? RETURNING revision")
      .bind(now, now, new Date(Date.now() - 60000).toISOString()).first<{ revision: number }>();
    if (!lease) return json({ error: "Следующая загрузка через API доступна через минуту. Сохранённую историю можно смотреть без ограничений." }, 429);
    const report = await checkFrequency(token, query);
    if (report.status !== "ok") {
      token = ""; input.data.token = undefined;
      return json({ error: report.message, httpStatus: report.httpStatus, code: report.errorCode, empty: report.status === "empty" }, 502);
    }
    let connected = !!process.env.MPSTATS_API_KEY || !!row?.encrypted_key, warning = "";
    if (input.data.token && remember) {
      const encrypted = await encryptKey(token, secret(), context);
      const saved = await db.prepare("UPDATE api_connections SET encrypted_key = ?, revision = revision + 1, updated_at = ?, last_error = NULL WHERE provider = 'mpstats' AND revision = ? RETURNING revision")
        .bind(encrypted, now, lease.revision).first();
      if (saved) connected = true;
      else warning = "История получена, но подключение параллельно изменилось. Новый ключ не сохранён.";
    }
    token = ""; input.data.token = undefined;
    const snapshot: DemandSnapshot = { version: 1, query, source: "mpstats-wb-frequency", fetchedAt: report.checkedAt, points: canonicalPoints(report.points) };
    try {
      await bucket.put(await snapshotKey(query), JSON.stringify(snapshot), { httpMetadata: { contentType: "application/json" } });
    } catch { return json({ snapshot, connected, saved: false, warning: "Данные получены, но не сохранены. Не закрывайте страницу: при повторном открытии будет показана прежняя история." }); }
    return json({ snapshot, connected, saved: true, warning });
  } catch { return json({ error: "Не удалось завершить загрузку. Ранее сохранённая история остаётся доступна." }, 503); }
}
