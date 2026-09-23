import { z } from 'zod';
import { getRawDb } from '@/db';
import { decryptKey } from '@/lib/connection-crypto';
import { readLimited } from '@/lib/mpstats-check';
import { normalizeDemandQuery, type DemandSnapshot } from '@/lib/search-demand';
import { analysisPlan, marketMonths, marketItems, advertisingSnapshot, type QueryAnalysis } from '@/lib/query-analysis';
import { mpstatsRequest } from '@/lib/mpstats-request';
import { getObjectStore } from "@/lib/object-store";

const bucket = getObjectStore();
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const signedIn = (r: Request) => !!r.headers.get('oai-authenticated-user-id') || !!r.headers.get('oai-authenticated-user-email');
const querySchema = z.string().trim().min(2).max(200).transform(normalizeDemandQuery);
async function hash(query: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(query))), b => b.toString(16).padStart(2, '0')).join(''); }
export async function GET(request: Request) {
  if (!signedIn(request)) return json({ error: 'Войдите в аккаунт.' }, 401);
  const query = querySchema.safeParse(new URL(request.url).searchParams.get('query'));
  if (!query.success) return json({ error: 'Укажите запрос.' }, 400);
  try {
    const key = 'query-analysis/wb/' + await hash(query.data) + '.json';
    const report = await bucket.get(key);
    return json({ report: report ? await report.json() : null });
  } catch { return json({ error: 'Не удалось открыть сохранённый анализ.' }, 503); }
}
export async function POST(request: Request) {
  if (!signedIn(request)) return json({ error: 'Войдите в аккаунт.' }, 401);
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Недопустимый источник запроса.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Неверный формат.' }, 400);
  let input;
  try { input = z.object({ query: querySchema, action: z.enum(['step', 'retry']), token: z.string().min(20).max(1000).regex(/^[A-Za-z0-9._-]+$/).optional() }).strict().safeParse(JSON.parse(await readLimited(request.body, 5000))); }
  catch { return json({ error: 'Не удалось прочитать запрос.' }, 400); }
  if (!input.success || input.data.token && input.data.query.includes(input.data.token.toLowerCase())) return json({ error: 'Проверьте поля запроса.' }, 400);
  const { query, action } = input.data;
  const db = getRawDb(), keyHash = await hash(query), key = 'query-analysis/wb/' + keyHash + '.json', leaseId = crypto.randomUUID();
  let leased = false;
  try {
    const now = new Date().toISOString();
    const lease = await db.prepare('INSERT INTO query_analysis_jobs (query_key, object_key, lease_until, lease_id, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(query_key) DO UPDATE SET lease_until = excluded.lease_until, lease_id = excluded.lease_id, updated_at = excluded.updated_at WHERE query_analysis_jobs.lease_until IS NULL OR query_analysis_jobs.lease_until < ? RETURNING query_key')
      .bind(keyHash, key, new Date(Date.now() + 90000).toISOString(), leaseId, now, now).first();
    if (!lease) return json({ error: 'Анализ уже выполняется. Подождите завершения текущего шага.' }, 409);
    leased = true;
    const frequency = await bucket.get('search-demand/wb/' + keyHash + '.json');
    if (!frequency) return json({ error: 'Сначала загрузите историю частотности.' }, 400);
    const snapshot = await frequency.json<DemandSnapshot>();
    const object = await bucket.get(key), saved = object ? await object.json<QueryAnalysis>() : null;
    const report = analysisPlan(snapshot, now);
    if (saved) {
      report.months = saved.months; report.leaders = saved.leaders; report.ads = saved.ads; report.requests = saved.requests;
      for (const task of report.tasks) {
        const previous = saved.tasks.find(t => t.id === task.id && t.from === task.from && t.to === task.to);
        if (previous && !(action === 'retry' && previous.state === 'error')) Object.assign(task, previous);
      }
    }
    const task = report.tasks.find(t => t.state === 'pending');
    if (!task) return json({ report, finished: true });
    const connection = await db.prepare("SELECT encrypted_key FROM api_connections WHERE provider = 'mpstats'").first<{ encrypted_key: string }>();
    const token = input.data.token ?? (connection?.encrypted_key ? await decryptKey(connection.encrypted_key, (process.env.INTEGRATION_ENCRYPTION_KEY ?? process.env.SCOUT_PASSWORD ?? ''), 'market-radar:mpstats:v1') : '');
    if (!token) return json({ error: 'Нужно подключение MPStats.', needsToken: true }, 400);
    const params = { path: query, d1: task.from, d2: task.to, fbs: '1' };
    report.requests++;
    let halt = false;
    try {
      if (task.kind === 'market') {
        const rows = marketMonths(await mpstatsRequest(token, '/search/by_date', { ...params, groupBy: 'month' }), task.from, task.to);
        report.months = [...report.months.filter(m => m.month < task.from.slice(0, 7) || m.month > task.to.slice(0, 7)), ...rows].sort((a, b) => a.month.localeCompare(b.month));
      } else if (task.kind === 'leaders') {
        const data = marketItems(await mpstatsRequest(token, '/search/items', { ...params, startRow: '0', endRow: '10', sortModel: JSON.stringify([{ colId: 'revenue', sort: 'desc' }]) }));
        if (data.items.length < Math.min(10, data.total)) throw Error('MPStats вернул неполный список лидеров.');
        if (data.items.some((item, i) => item.revenue == null || i > 0 && item.revenue! > data.items[i - 1].revenue!)) throw Error('Не подтверждена сортировка лидеров по заказам.');
        report.leaders[task.from.slice(0, 7)] = data.items;
      } else report.ads = advertisingSnapshot(await mpstatsRequest(token, '/keywords/positions', { keyword: query, region_id: '1' }, 'GET'), now.slice(0, 10));
      task.state = 'done';
    } catch (e) {
      task.state = 'error'; task.error = e instanceof Error ? e.message : 'Отчёт не получен.'; halt = true;
    }
    await bucket.put(key, JSON.stringify(report), { httpMetadata: { contentType: 'application/json' } });
    return json({ report, finished: !report.tasks.some(t => t.state === 'pending'), halt });
  } catch { return json({ error: 'Не удалось сохранить шаг анализа. Сохранённые ранее отчёты доступны.' }, 503); }
  finally {
    input.data.token = undefined;
    if (leased) await db.prepare('UPDATE query_analysis_jobs SET lease_until = NULL, lease_id = NULL WHERE query_key = ? AND lease_id = ?').bind(keyHash, leaseId).run().catch(() => {});
  }
}
