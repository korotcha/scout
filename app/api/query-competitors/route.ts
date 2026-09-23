import { z } from 'zod';
import { getRawDb } from '@/db';
import { decryptKey } from '@/lib/connection-crypto';
import { readLimited } from '@/lib/mpstats-check';
import { normalizeDemandQuery } from '@/lib/search-demand';
import { marketItems, type MarketItem } from '@/lib/query-analysis';
import { mpstatsRequest } from '@/lib/mpstats-request';
import { getObjectStore } from "@/lib/object-store";

type Selection = { query: string; from: string; to: string; items: MarketItem[]; offset: number; complete: boolean; updatedAt: string; groupId?: number; groupState?: 'creating' | 'adding' | 'done'; groupSkus?: string[]; error?: string };
const bucket = getObjectStore();
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const validDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
export async function POST(request: Request) {
  if (!request.headers.get('oai-authenticated-user-id') && !request.headers.get('oai-authenticated-user-email')) return json({ error: 'Войдите в аккаунт.' }, 401);
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Недопустимый источник запроса.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Неверный формат.' }, 400);
  let parsed;
  try { parsed = z.object({ query: z.string().trim().min(2).max(200).transform(normalizeDemandQuery), from: validDate, to: validDate, action: z.enum(['load', 'create']), skus: z.array(z.string().regex(/^[1-9]\d{4,14}$/)).min(1).max(1000).optional() }).strict().safeParse(JSON.parse(await readLimited(request.body, 30000))); }
  catch { return json({ error: 'Не удалось прочитать запрос.' }, 400); }
  if (!parsed.success) return json({ error: 'Проверьте запрос и период сезона.' }, 400);
  const { query, from, to, action, skus } = parsed.data;
  if (from > to || to >= new Date().toISOString().slice(0, 10)) return json({ error: 'Выберите завершённый период продаж.' }, 400);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode([query, from, to].join('|')))), b => b.toString(16).padStart(2, '0')).join('');
  const key = `query-competitors/wb/${hash}.json`, leaseKey = `competitors-${hash}`, leaseId = crypto.randomUUID(), db = getRawDb();
  let leased = false;
  try {
    const now = new Date().toISOString();
    const lease = await db.prepare('INSERT INTO query_analysis_jobs (query_key, object_key, lease_until, lease_id, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(query_key) DO UPDATE SET lease_until = excluded.lease_until, lease_id = excluded.lease_id WHERE query_analysis_jobs.lease_until IS NULL OR query_analysis_jobs.lease_until < ? RETURNING query_key')
      .bind(leaseKey, key, new Date(Date.now() + 90000).toISOString(), leaseId, now, now).first();
    if (!lease) return json({ error: 'Эта группа уже обрабатывается. Подождите завершения.' }, 409);
    leased = true;
    const object = await bucket.get(key);
    const selection: Selection = object ? await object.json<Selection>() : { query, from, to, items: [], offset: 0, complete: false, updatedAt: now };
    if (action === 'load' && selection.complete) return json({ selection, cached: true });
    if (action === 'create' && selection.groupState === 'done') return json({ selection, cached: true });
    if (action === 'create' && selection.groupState === 'creating') return json({ error: 'Результат предыдущего создания не подтверждён. Проверьте список групп в MPStats, чтобы не создать дубликат.' }, 409);
    const connection = await db.prepare("SELECT encrypted_key FROM api_connections WHERE provider = 'mpstats'").first<{ encrypted_key: string }>();
    if (!connection?.encrypted_key) return json({ error: 'Для формирования группы владелец должен сохранить подключение MPStats.' }, 400);
    const token = await decryptKey(connection.encrypted_key, (process.env.INTEGRATION_ENCRYPTION_KEY ?? process.env.SCOUT_PASSWORD ?? ''), 'market-radar:mpstats:v1');
    if (action === 'load') {
      if (selection.offset >= 1000) return json({ error: 'Получено 1000 товаров. Сузьте запрос или период перед формированием группы.', selection }, 400);
      const page = marketItems(await mpstatsRequest(token, '/search/items', { path: query, d1: from, d2: to, fbs: '1', startRow: String(selection.offset), endRow: String(selection.offset + 100), sortModel: JSON.stringify([{ colId: 'revenue', sort: 'desc' }]), filterModel: JSON.stringify({ revenue: { filterType: 'number', type: 'greaterThanOrEqual', filter: 3000000 } }) }));
      if (page.items.some((item, i) => item.revenue == null || i && item.revenue! > page.items[i - 1].revenue!)) throw Error('MPStats не подтвердил сортировку по объёму заказов.');
      selection.items = [...new Map([...selection.items, ...page.items.filter(i => i.revenue! >= 3000000)].map(i => [i.sku, i])).values()];
      selection.offset += page.items.length;
      selection.complete = !page.items.length || selection.offset >= page.total || page.items.at(-1)!.revenue! < 3000000;
    } else {
      if (!selection.complete || !skus?.length || skus.some(sku => !selection.items.some(i => i.sku === sku))) return json({ error: 'Сначала получите товары и выберите нужные карточки.' }, 400);
      if (selection.groupSkus && [...selection.groupSkus].sort().join(',') !== [...new Set(skus)].sort().join(',')) return json({ error: 'Создание группы уже начато с другим составом. Завершите его с прежним выбором.' }, 409);
      if (!selection.groupId) {
        selection.groupSkus = [...new Set(skus)]; selection.groupState = 'creating';
        await bucket.put(key, JSON.stringify(selection));
        const created = await mpstatsRequest(token, '/groups', { name: `${query} · ${from}—${to} · от 3 млн ₽` }, 'PUT') as { success?: boolean; id?: number };
        if (!created.success || !Number.isInteger(created.id) || created.id! <= 0) throw Error('MPStats не подтвердил создание группы. Проверьте список групп перед повтором.');
        selection.groupId = created.id; selection.groupState = 'adding';
        await bucket.put(key, JSON.stringify(selection));
      }
      const added = await mpstatsRequest(token, `/groups/${selection.groupId}`, { skus: selection.groupSkus!.join(',') }, 'PUT') as { success?: boolean };
      if (!added.success) throw Error('Группа создана, но добавление товаров не подтверждено. Повторите добавление в ту же группу.');
      selection.groupState = 'done';
    }
    selection.updatedAt = now;
    await bucket.put(key, JSON.stringify(selection), { httpMetadata: { contentType: 'application/json' } });
    return json({ selection });
  } catch (e) { return json({ error: e instanceof Error && /MPStats|Группа/.test(e.message) ? e.message : 'Не удалось завершить формирование группы. Сохранённые данные доступны.' }, 502); }
  finally { if (leased) await db.prepare('UPDATE query_analysis_jobs SET lease_until = NULL, lease_id = NULL WHERE query_key = ? AND lease_id = ?').bind(leaseKey, leaseId).run().catch(() => {}); }
}
