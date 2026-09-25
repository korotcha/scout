import { normalizeDemandQuery, shiftMonth } from './search-demand';

export const QUERY_DEMAND_SOURCE = 'mpstats-seo-keywords-selection' as const;
export const QUERY_DEMAND_BATCH = 6;
export type QueryDemandPoint = { date: string; frequency: number | null; items: number | null };
export type QueryDemandHistory = {
  version: 2; source: typeof QUERY_DEMAND_SOURCE; query: string;
  fetchedAt: string; requestedFrom: string; requestedTo: string;
  points: QueryDemandPoint[]; complete: boolean; warning?: string;
};

// Calendar boundaries, not successive 30-day jumps. The report itself supplies
// rolling 30-day frequency and all-page WB results for the selected report date.
export function queryDemandDates(asOf: string) {
  const current = asOf.slice(0, 7);
  return Array.from({ length: 36 }, (_, i) => shiftMonth(current, -i) + '-01');
}
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const count = (v: unknown) => (typeof v === 'number' || typeof v === 'string' && v.trim() !== '') && Number.isSafeInteger(Number(v)) && Number(v) >= 0 ? Number(v) : null;

export function queryDemandPoint(value: unknown, query: string, reportDate: string): QueryDemandPoint {
  const report = record(value);
  if (report.error || !Array.isArray(report.data)) throw Error('В ответе MPStats нет таблицы подбора запросов.');
  const total = count(report.total);
  if (total === 0 && report.data.length === 0) return { date: reportDate, frequency: null, items: null };
  if (total !== 1 || report.data.length !== 1) throw Error('MPStats не вернул однозначную строку точного запроса.');
  const row = record(report.data[0]);
  if (typeof row.word !== 'string' || normalizeDemandQuery(row.word) !== normalizeDemandQuery(query)) throw Error('MPStats вернул другой поисковый запрос.');
  const frequency = count(row.wb_count), items = count(row.results);
  if (frequency == null || items == null) throw Error('В ответе MPStats отсутствует частотность или количество результатов WB.');
  // Upstream "items" is the first-page cohort, NOT the all-page "results" count.
  return { date: reportDate, frequency, items };
}

export function queryDemandRows(history: QueryDemandHistory) {
  const byDate = new Map(history.points.map(p => [p.date, p]));
  const rows = [];
  for (let boundary = history.requestedFrom; boundary <= history.requestedTo; boundary = shiftMonth(boundary.slice(0, 7), 1) + '-01') {
    const p = byDate.get(boundary);
    rows.push({ month: shiftMonth(boundary.slice(0, 7), -1), sourceDate: p?.date ?? null,
      frequency: p?.frequency ?? null, items: p?.items ?? null,
      perItem: p?.frequency != null && p.items != null && p.items > 0 ? p.frequency / p.items : null,
      paired: p?.frequency != null && p.items != null, loaded: !!p });
  }
  return rows;
}
