import { readLimited } from './mpstats-check';

export async function mpstatsRequest(token: string, path: string, params: Record<string, string>, method: 'GET' | 'POST' | 'PUT' = 'POST') {
  const url = new URL('https://mpstats.io/api/analytics/v1/wb' + path);
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (method === 'POST' && path === '/search/items' && ['startRow', 'endRow', 'filterModel', 'sortModel', 'fields'].includes(key)) body[key] = JSON.parse(value);
    else url.searchParams.set(key, value);
  }
  let response: Response;
  try { response = await fetch(url, { method, headers: { 'X-Mpstats-TOKEN': token, Accept: 'application/json', ...(Object.keys(body).length ? { 'Content-Type': 'application/json' } : {}) }, ...(Object.keys(body).length ? { body: JSON.stringify(body) } : {}), redirect: 'manual', signal: AbortSignal.timeout(20000) }); }
  catch { throw Error('MPStats не ответил за отведённое время. Сохранённые результаты доступны.'); }
  if (!response.ok) throw Error(response.status === 429 ? 'MPStats ограничил число запросов. Продолжите позже.' : response.status === 403 || response.status === 401 ? 'MPStats не разрешил этот отчёт. Проверьте доступ к методу на тарифе.' : `MPStats вернул HTTP ${response.status}.`);
  try { return JSON.parse(await readLimited(response.body, 8_000_000)) as unknown; }
  catch { throw Error('Не удалось прочитать отчёт MPStats. Ранее сохранённые результаты доступны.'); }
}
