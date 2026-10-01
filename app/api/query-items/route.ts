import { z } from 'zod';
import { getRawDb } from '@/db';
import { getObjectStore } from '@/lib/object-store';
import { decryptKey } from '@/lib/connection-crypto';
import { readLimited } from '@/lib/mpstats-check';
import { mpstatsRequest } from '@/lib/mpstats-request';
import { normalizeDemandQuery, shiftMonth } from '@/lib/search-demand';
import { aggregateItems, appendItemsPage, completedMonth, itemRequestParams, ITEMS_SOURCE, monthPattern, reportMonths, type ItemsMonth, type ItemsRow } from '@/lib/query-items';

export const maxDuration = 60;
const store = getObjectStore();
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const signedIn = (r: Request) => !!r.headers.get('oai-authenticated-user-email') || !!r.headers.get('oai-authenticated-user-id');
const querySchema = z.string().trim().min(2).max(200).transform(normalizeDemandQuery);
const monthSchema = z.string().regex(monthPattern).refine(m => m >= '2020-01' && m <= completedMonth());
async function prefix(query: string) {
  return 'query-items/fbo-v1/' + Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(query))).toString('hex') + '/';
}
async function read(base: string, month: string) {
  const object = await store.get(base + month + '.json');
  if (!object) return null;
  const data = await object.json<ItemsMonth>();
  if (data.source !== ITEMS_SOURCE || data.month !== month) throw Error('Invalid cache');
  return data;
}
function row(month: string, data: ItemsMonth | null, previous: ItemsMonth | null): ItemsRow {
  return { month, loaded: !!data?.complete, fetchedAt: data?.fetchedAt ?? null, received: data?.items.length ?? 0, total: data?.total ?? null, metrics: data?.complete ? aggregateItems(data, previous) : null };
}
export async function GET(request: Request) {
  if (!signedIn(request)) return json({ error: 'Войдите в аккаунт.' }, 401);
  const params = new URL(request.url).searchParams;
  const input = z.object({ query: querySchema, from: monthSchema, to: monthSchema }).safeParse(Object.fromEntries(params));
  if (!input.success) return json({ error: 'Проверьте запрос и завершённые месяцы.' }, 400);
  const months = reportMonths(input.data.from, input.data.to);
  if (!months.length || months.length > 36) return json({ error: 'Выберите от 1 до 36 месяцев.' }, 400);
  try {
    const base = await prefix(input.data.query), dates = [shiftMonth(months[0], -1), ...months];
    const data = await Promise.all(dates.map(m => read(base, m)));
    return json({ query: input.data.query, source: ITEMS_SOURCE, rows: months.map((m, i) => row(m, data[i + 1], data[i])) });
  } catch { return json({ error: 'Не удалось открыть сохранённые отчёты.' }, 503); }
}
export async function POST(request: Request) {
  if (!signedIn(request)) return json({ error: 'Войдите в аккаунт.' }, 401);
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Недопустимый источник запроса.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Неверный формат.' }, 400);
  let input;
  try { input = z.object({ query: querySchema, month: monthSchema, action: z.literal('load') }).strict().safeParse(JSON.parse(await readLimited(request.body, 2000))); }
  catch { return json({ error: 'Не удалось прочитать запрос.' }, 400); }
  if (!input.success) return json({ error: 'Проверьте запрос и завершённый месяц.' }, 400);
  const { query, month } = input.data;
  const base = await prefix(query), key = base + month + '.json', leaseId = crypto.randomUUID(), db = getRawDb();
  let leased = false, upstreamRequests = 0;
  try {
    const now = new Date().toISOString();
    const lease = await db.prepare('INSERT INTO query_analysis_jobs (query_key, object_key, lease_until, lease_id, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(query_key) DO UPDATE SET lease_until = excluded.lease_until, lease_id = excluded.lease_id, updated_at = excluded.updated_at WHERE query_analysis_jobs.lease_until IS NULL OR query_analysis_jobs.lease_until < ? RETURNING query_key')
      .bind(key, key, new Date(Date.now() + 90000).toISOString(), leaseId, now, now).first();
    if (!lease) return json({ error: 'Этот месяц уже загружается. Повторите после завершения.' }, 409);
    leased = true;
    const saved = await read(base, month), previous = await read(base, shiftMonth(month, -1));
    if (saved?.complete) return json({ row: row(month, saved, previous), cached: true, requests: 0 });
    const connection = await db.prepare("SELECT encrypted_key FROM api_connections WHERE provider = 'mpstats'").first<{ encrypted_key: string }>();
    const token = process.env.MPSTATS_API_KEY || (connection?.encrypted_key ? await decryptKey(connection.encrypted_key, process.env.INTEGRATION_ENCRYPTION_KEY ?? process.env.SCOUT_PASSWORD ?? '', 'market-radar:mpstats:v1') : '');
    if (!token) return json({ error: 'Сначала сохраните подключение MPStats в настройках.' }, 400);
    if (query.includes(token.toLowerCase())) return json({ error: 'В поле запроса не должно быть ключа.' }, 400);
    upstreamRequests = 1;
    const response = await mpstatsRequest(token, '/search/items', itemRequestParams(query, month, saved?.items.length ?? 0));
    const next = appendItemsPage(query, month, response, saved);
    await store.put(key, JSON.stringify(next), { httpMetadata: { contentType: 'application/json' } });
    return json({ row: row(month, next, previous), saved: true, requests: upstreamRequests });
  } catch (e) {
    const error = e instanceof Error && /^(MPStats |В ответе MPStats|Не удалось прочитать отчёт)/.test(e.message) ? e.message : 'Не удалось сохранить отчёт. Ранее сохранённые месяцы доступны.';
    return json({ error, requests: upstreamRequests }, 502);
  } finally {
    if (leased) await db.prepare('UPDATE query_analysis_jobs SET lease_until = NULL, lease_id = NULL WHERE query_key = ? AND lease_id = ?').bind(key, leaseId).run().catch(() => {});
  }
}
