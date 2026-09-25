import { z } from 'zod';
import { getRawDb } from '@/db';
import { getObjectStore } from '@/lib/object-store';
import { decryptKey } from '@/lib/connection-crypto';
import { readLimited } from '@/lib/mpstats-check';
import { mpstatsSelectionRequest } from '@/lib/mpstats-request';
import { normalizeDemandQuery } from '@/lib/search-demand';
import { QUERY_DEMAND_BATCH, QUERY_DEMAND_SOURCE, queryDemandPoint, queryDemandDates, type QueryDemandHistory } from '@/lib/query-demand';

export const maxDuration = 120;
const store = getObjectStore();
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const signedIn = (r: Request) => !!r.headers.get('oai-authenticated-user-email') || !!r.headers.get('oai-authenticated-user-id');
const querySchema = z.string().trim().min(2).max(200).transform(normalizeDemandQuery);
async function queryDemandKey(query: string) {
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(query))).toString('hex');
  // Legacy SKU snapshots remain untouched; never mix them into this source.
  return 'query-demand/seo-wb/' + hash + '.json';
}
async function read(key: string) {
  const object = await store.get(key);
  return object ? await object.json<QueryDemandHistory>() : null;
}
async function save(key: string, history: QueryDemandHistory) {
  await store.put(key, JSON.stringify(history), { httpMetadata: { contentType: 'application/json' } });
}
export async function GET(request: Request) {
  if (!signedIn(request)) return json({ error: 'Войдите в аккаунт.' }, 401);
  const parsed = querySchema.safeParse(new URL(request.url).searchParams.get('query'));
  if (!parsed.success) return json({ error: 'Укажите запрос.' }, 400);
  try {
    const key = await queryDemandKey(parsed.data);
    const [saved, progress] = await Promise.all([read(key), read(key + '.progress')]);
    return json({ history: saved ?? progress, pending: !!progress && !progress.complete });
  } catch { return json({ error: 'Не удалось открыть историю запроса.' }, 503); }
}
export async function POST(request: Request) {
  if (!signedIn(request)) return json({ error: 'Войдите в аккаунт.' }, 401);
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Недопустимый источник запроса.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Неверный формат.' }, 400);
  let input;
  try { input = z.object({ query: querySchema, action: z.enum(['load', 'refresh', 'resume']),
    token: z.string().min(20).max(1000).regex(/^[A-Za-z0-9._-]+$/).optional() }).strict().safeParse(JSON.parse(await readLimited(request.body, 5000))); }
  catch { return json({ error: 'Не удалось прочитать запрос.' }, 400); }
  if (!input.success) return json({ error: 'Проверьте поисковый запрос.' }, 400);
  if (input.data.token && request.headers.get('oai-authenticated-user-email')?.toLowerCase() !== 'korotcha@yandex.ru') return json({ error: 'Подключением управляет владелец.' }, 403);
  const { query, action } = input.data;
  if (input.data.token && query.includes(input.data.token.toLowerCase())) return json({ error: 'В поле запроса не должно быть токена.' }, 400);
  const key = await queryDemandKey(query), leaseKey = 'demand:' + key, leaseId = crypto.randomUUID();
  const db = getRawDb(); let leased = false;
  let saved: QueryDemandHistory | null = null, progress: QueryDemandHistory | null = null;
  let activeDate = '';
  try {
    saved = await read(key);
    if (action === 'load' && saved) return json({ history: saved, cached: true });
    const now = new Date().toISOString();
    const lease = await db.prepare('INSERT INTO query_analysis_jobs (query_key, object_key, lease_until, lease_id, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(query_key) DO UPDATE SET lease_until = excluded.lease_until, lease_id = excluded.lease_id, updated_at = excluded.updated_at WHERE query_analysis_jobs.lease_until IS NULL OR query_analysis_jobs.lease_until < ? RETURNING query_key')
      .bind(leaseKey, key, new Date(Date.now() + 150000).toISOString(), leaseId, now, now).first();
    if (!lease) return json({ error: 'История уже загружается. Дождитесь завершения.' }, 409);
    leased = true;
    const pending = await read(key + '.progress');
    const dates = queryDemandDates(action !== 'refresh' && pending && !pending.complete ? pending.requestedTo : now);
    progress = action !== 'refresh' && pending && !pending.complete ? pending : {
      version: 2, source: QUERY_DEMAND_SOURCE, query, fetchedAt: now,
      requestedFrom: dates.at(-1)!, requestedTo: dates[0], points: [], complete: false,
    };
    if (action === 'resume' && pending?.complete && saved) return json({ history: saved, cached: true });
    const connection = await db.prepare("SELECT encrypted_key FROM api_connections WHERE provider = 'mpstats'").first<{ encrypted_key: string }>();
    const token = input.data.token ?? (process.env.MPSTATS_API_KEY || (connection?.encrypted_key ? await decryptKey(connection.encrypted_key, process.env.INTEGRATION_ENCRYPTION_KEY ?? process.env.SCOUT_PASSWORD ?? '', 'market-radar:mpstats:v1') : ''));
    if (!token) return json({ error: 'Подключите MPStats.' }, 400);
    if (query.includes(token.toLowerCase())) return json({ error: 'В поле запроса не должно быть токена.' }, 400);
    const existing = new Set(progress.points.map(p => p.date));
    const remaining = dates.filter(d => !existing.has(d));
    let requests = 0;
    for (const date of remaining.slice(0, QUERY_DEMAND_BATCH)) {
      activeDate = date;
      const point = queryDemandPoint(await mpstatsSelectionRequest(token, query, date), query, date);
      requests++;
      const next: QueryDemandHistory = { ...progress, fetchedAt: new Date().toISOString(), warning: undefined,
        points: [...progress.points, point].sort((a, b) => a.date.localeCompare(b.date)) };
      await save(key + '.progress', next);
      progress = next;
    }
    progress.complete = dates.every(d => progress!.points.some(p => p.date === d));
    if (progress.complete) {
      await save(key, progress);
      await save(key + '.progress', progress);
    }
    return json({ history: progress, saved: true, requests, remaining: 36 - progress.points.length });
  } catch (e) {
    const message = e instanceof Error && /^(MPStats |В ответе MPStats|Не удалось прочитать отчёт)/.test(e.message) ? e.message : 'Не удалось сохранить историю. Ранее сохранённые месяцы доступны.';
    const error = message + (activeDate ? ' Дата отчёта: ' + activeDate + '.' : '');
    return json({ error, history: saved ?? progress, pending: !!progress && !progress.complete }, 502);
  } finally {
    input.data.token = undefined;
    if (leased) await db.prepare('UPDATE query_analysis_jobs SET lease_until = NULL, lease_id = NULL WHERE query_key = ? AND lease_id = ?').bind(leaseKey, leaseId).run().catch(() => {});
  }
}
