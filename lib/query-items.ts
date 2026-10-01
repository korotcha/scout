import { shiftMonth } from './search-demand';

export const ITEMS_SOURCE = 'mpstats-search-items-fbo-v1';
export const ITEMS_PAGE_SIZE = 500;
export const ITEMS_MAX_CARDS = 10000;
export const itemFields = ['id', 'brand', 'supplier_id', 'sku_first_date', 'sales', 'revenue', 'sales_estimated', 'revenue_estimated', 'purchase', 'search_ad_position_avg', 'search_organic_position_avg'] as const;
export type QueryItem = Record<(typeof itemFields)[number], string | number | null>;
export type ItemsMonth = { version: 1; source: typeof ITEMS_SOURCE; query: string; month: string; fbs: 0; fetchedAt: string; total: number; items: QueryItem[]; complete: boolean; pages: number };
export const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
export function completedMonth(now = new Date()) { return shiftMonth(now.toISOString().slice(0, 7), -1); }
export function reportMonths(from: string, to: string) {
  if (!monthPattern.test(from) || !monthPattern.test(to) || from > to) return [];
  const months: string[] = [];
  for (let m = from; m <= to && months.length < 37; m = shiftMonth(m, 1)) months.push(m);
  return months;
}
export function itemRequestParams(query: string, month: string, startRow: number) {
  const next = shiftMonth(month, 1) + '-01';
  return { path: query, d1: month + '-01', d2: new Date(Date.parse(next) - 86400000).toISOString().slice(0, 10), fbs: '0',
    startRow: String(startRow), endRow: String(startRow + ITEMS_PAGE_SIZE), filterModel: '{}', sortModel: JSON.stringify([{ colId: 'revenue', sort: 'desc' }]) };
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const metric = (v: unknown): number | null => (typeof v === 'number' || typeof v === 'string' && v.trim() !== '') && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null;

/** Only complete, validated pages enter the checkpoint. Never treat an error envelope as an empty month. */
export function appendItemsPage(query: string, month: string, payload: unknown, previous: ItemsMonth | null, fetchedAt = new Date().toISOString()): ItemsMonth {
  if (!record(payload) || payload.error || !Array.isArray(payload.data) || !Number.isSafeInteger(payload.total) || Number(payload.total) < 0) throw Error('В ответе MPStats нет полного описания списка товаров.');
  const total = Number(payload.total), offset = previous?.items.length ?? 0;
  if (total > ITEMS_MAX_CARDS) throw Error(`В ответе MPStats более ${ITEMS_MAX_CARDS} карточек. Автоматическая загрузка остановлена для защиты лимита.`);
  if (previous && (previous.query !== query || previous.month !== month || previous.source !== ITEMS_SOURCE || previous.total !== total)) throw Error('В ответе MPStats изменился состав выборки. Нельзя объединить страницы разных снимков.');
  if (payload.startRow != null && Number(payload.startRow) !== offset) throw Error('В ответе MPStats неожиданное смещение страницы.');
  if (payload.data.length !== Math.min(ITEMS_PAGE_SIZE, total - offset)) throw Error('В ответе MPStats неполная страница товаров. Месяц не завершён.');
  const seen = new Set(previous?.items.map(i => String(i.id)) ?? []);
  const items = payload.data.map((raw): QueryItem => {
    if (!record(raw) || !/^\d+$/.test(String(raw.id)) || Number(raw.id) <= 0 || seen.has(String(raw.id))) throw Error('В ответе MPStats отсутствует или повторяется артикул. Месяц не завершён.');
    seen.add(String(raw.id));
    return Object.fromEntries(itemFields.map(key => [key, typeof raw[key] === 'string' || typeof raw[key] === 'number' ? raw[key] : null])) as QueryItem;
  });
  return { version: 1, source: ITEMS_SOURCE, query, month, fbs: 0, fetchedAt, total, items: [...previous?.items ?? [], ...items], complete: offset + items.length === total, pages: (previous?.pages ?? 0) + 1 };
}

function sum(items: QueryItem[], field: keyof QueryItem) {
  const numbers = items.map(i => metric(i[field]));
  return numbers.some(v => v === null) ? null : numbers.reduce<number>((n, v) => n + v!, 0);
}
function identities(items: QueryItem[], field: 'brand' | 'supplier_id') {
  if (items.some(i => i[field] === null)) return null;
  return new Set(items.map(i => String(i[field]).trim()).filter(Boolean));
}
function bought(items: QueryItem[], field: 'sales' | 'revenue') {
  if (items.some(i => metric(i[field]) === null || metric(i.purchase) === null || Number(i.purchase) > 100)) return null;
  return Math.round(items.reduce((n, i) => n + Number(i[field]) * Number(i.purchase) / 100, 0));
}
export function aggregateItems(current: ItemsMonth, previous: ItemsMonth | null = null) {
  if (!current.complete || current.items.length !== current.total) throw Error('Нельзя строить отчёт по неполной выборке.');
  const items = current.items, revenue = sum(items, 'revenue'), orders = sum(items, 'sales');
  const sorted = [...items].sort((a, b) => Number(b.revenue) - Number(a.revenue));
  const top = (n: number) => revenue === null || !items.length ? null : sorted.slice(0, n).reduce((v, i) => v + Number(i.revenue), 0);
  const share = (n: number) => revenue && top(n) !== null ? top(n)! / revenue * 100 : null;
  const mean = (n: number) => top(n) === null ? null : top(n)! / Math.min(n, items.length);
  const brands = identities(items, 'brand'), sellers = identities(items, 'supplier_id');
  const prior = previous?.complete && previous.query === current.query && previous.source === current.source && previous.month === shiftMonth(current.month, -1) ? previous : null;
  const added = (field: 'brand' | 'supplier_id', currentIds: Set<string> | null) => {
    const old = prior ? identities(prior.items, field) : null;
    return old && currentIds ? [...currentIds].filter(i => !old.has(i)).length : null;
  };
  const adsKnown = items.every(i => metric(i.search_ad_position_avg) !== null);
  const advertised = adsKnown ? items.filter(i => Number(i.search_ad_position_avg) > 0).length : null;
  return { month: current.month, cards: items.length, revenue, orders,
    advertised, withoutAd: advertised === null ? null : items.length - advertised,
    adShare: advertised !== null && items.length ? advertised / items.length * 100 : null,
    newItems: items.every(i => typeof i.sku_first_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(i.sku_first_date)) ? items.filter(i => String(i.sku_first_date).startsWith(current.month + '-')).length : null,
    newBrands: added('brand', brands), newSellers: added('supplier_id', sellers),
    brands: brands?.size ?? null, sellers: sellers?.size ?? null,
    averagePrice: orders && revenue !== null ? revenue / orders : null,
    top1: mean(1), top5: mean(5), top10: mean(10), share1: share(1), share5: share(5), share10: share(10),
    boughtRevenue: bought(items, 'revenue'), boughtOrders: bought(items, 'sales'),
    estimatedRevenue: sum(items, 'revenue_estimated'), estimatedOrders: sum(items, 'sales_estimated'),
  };
}
export type ItemsMetrics = ReturnType<typeof aggregateItems>;
export type ItemsRow = { month: string; loaded: boolean; fetchedAt: string | null; received: number; total: number | null; metrics: ItemsMetrics | null };
