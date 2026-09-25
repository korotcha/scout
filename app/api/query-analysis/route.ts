import { z } from 'zod';
import { normalizeDemandQuery } from '@/lib/search-demand';
import { getObjectStore } from '@/lib/object-store';

const bucket = getObjectStore();
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const signedIn = (r: Request) => !!r.headers.get('oai-authenticated-user-id') || !!r.headers.get('oai-authenticated-user-email');
const querySchema = z.string().trim().min(2).max(200).transform(normalizeDemandQuery);
async function hash(query: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(query))), b => b.toString(16).padStart(2, '0')).join(''); }

// Preserve access to already saved reports without fetching anything upstream.
export async function GET(request: Request) {
  if (!signedIn(request)) return json({ error: 'Войдите в аккаунт.' }, 401);
  const query = querySchema.safeParse(new URL(request.url).searchParams.get('query'));
  if (!query.success) return json({ error: 'Укажите запрос.' }, 400);
  try {
    const report = await bucket.get('query-analysis/wb/' + await hash(query.data) + '.json');
    return json({ report: report ? await report.json() : null });
  } catch { return json({ error: 'Не удалось открыть сохранённый анализ.' }, 503); }
}

export async function POST(request: Request) {
  if (!signedIn(request)) return json({ error: 'Войдите в аккаунт.' }, 401);
  // Old browser tabs must not continue the formerly automatic paid pipeline.
  return json({ error: 'Дополнительные отчёты отключены. Используйте первый график спроса и товаров.' }, 409);
}
