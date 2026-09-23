import { demandMonthSnapshots, shiftMonth, type DemandSnapshot } from './search-demand';

export type MarketMonth = { month: string; items: number | null; brands: number | null; sellers: number | null; orders: number | null; revenue: number | null; averagePrice: number | null };
export type MarketItem = { sku: string; name: string; revenue: number | null; orders: number | null; priceMin: number | null; priceMax: number | null; rating: number | null; reviews: number | null; brand: string; seller: string };
export type AnalysisTask = { id: string; kind: 'market' | 'leaders' | 'ads'; from: string; to: string; state: 'pending' | 'done' | 'error'; error?: string };

export type SeasonalPeak = {
  month: string; frequency: number; from: string; to: string;
};
export type QueryAnalysis = {
  version: 1; query: string; from: string; to: string; fetchedAt: string; requests: number;
  tasks: AnalysisTask[]; months: MarketMonth[]; leaders: Record<string, MarketItem[]>;
  ads?: { date: string; advertised: number; organic: number; total: number; share: number | null };
};
export const monthEndDate = (month: string) => new Date(Date.parse(shiftMonth(month, 1) + '-01') - 86400000).toISOString().slice(0, 10);
export function analysisPlan(snapshot: DemandSnapshot, asOf: string): QueryAnalysis {
  const history = demandMonthSnapshots(snapshot.points, snapshot.fetchedAt);
  const from = history[0]?.month ?? snapshot.points[0]?.date.slice(0, 7) ?? shiftMonth(asOf.slice(0, 7), -36);
  const to = shiftMonth(asOf.slice(0, 7), -1);
  const tasks: AnalysisTask[] = [];
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
    tasks.push({ id: `market-${year}`, kind: 'market', from: [from + '-01', `${year}-01-01`].sort().at(-1)!, to: [monthEndDate(to), `${year}-12-31`].sort()[0], state: 'pending' });
  }
  for (let month = from; month <= to; month = shiftMonth(month, 1)) tasks.push({ id: `leaders-${month}`, kind: 'leaders', from: month + '-01', to: monthEndDate(month), state: 'pending' });
  tasks.push({ id: 'ads-' + asOf.slice(0, 10), kind: 'ads', from: asOf.slice(0, 10), to: asOf.slice(0, 10), state: 'pending' });
  return { version: 1, query: snapshot.query, from, to, fetchedAt: asOf, requests: 0, tasks, months: [], leaders: {} };
}
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const numeric = (v: unknown) => (typeof v === 'number' || typeof v === 'string' && v.trim() !== '') && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null;
export function marketMonths(value: unknown, from: string, to: string): MarketMonth[] {
  const raw = Array.isArray(value) ? value : record(value).data;
  if (!Array.isArray(raw)) throw Error('Неизвестный формат месячного отчёта.');
  const seen = new Set<string>();
  return raw.map(item => {
    const r = record(item), period = String(r.period ?? '');
    if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(period)) throw Error('В отчёте нет периода.');
    const month = period.slice(0, 7);
    if (month < from.slice(0, 7) || month > to.slice(0, 7) || seen.has(month)) throw Error('API вернул другую группировку или период.');
    seen.add(month);
    const orders = numeric(r.sales), revenue = numeric(r.revenue);
    return { month, items: numeric(r.items), brands: numeric(r.brands), sellers: numeric(r.sellers), orders, revenue,
      averagePrice: orders && revenue != null ? revenue / orders : null };
  }).sort((a, b) => a.month.localeCompare(b.month));
}
export function marketItems(value: unknown): { total: number; items: MarketItem[] } {
  const r = record(value), raw = r.data;
  if (!Array.isArray(raw) || numeric(r.total) == null) throw Error('Неизвестный формат списка товаров.');
  const seen = new Set<string>();
  const items = raw.map(item => {
    const row = record(item), sku = String(row.id ?? '');
    if (!/^[1-9]\d{4,14}$/.test(sku) || seen.has(sku)) throw Error('В списке некорректные или повторные артикулы.');
    seen.add(sku);
    return { sku, name: String(row.name ?? '').slice(0, 1000), revenue: numeric(row.revenue), orders: numeric(row.sales), priceMin: numeric(row.final_price_min), priceMax: numeric(row.final_price_max),
      rating: numeric(row.rating) != null && Number(row.rating) <= 5 ? Number(row.rating) : null, reviews: Number.isInteger(numeric(row.comments)) ? numeric(row.comments) : null, brand: String(row.brand ?? '').slice(0, 200), seller: String(row.seller ?? '').slice(0, 200) };
  });
  if (!Number.isInteger(Number(r.total)) || Number(r.total) < items.length) throw Error('Некорректное число товаров в отчёте.');
  return { total: Number(r.total), items };
}
export function advertisingSnapshot(value: unknown, date: string): NonNullable<QueryAnalysis['ads']> {
  const rows = record(value).data;
  if (!Array.isArray(rows)) throw Error('Неизвестный формат рекламной выдачи.');
  const seen = new Set<string>(); let advertised = 0, organic = 0;
  for (const item of rows) {
    const r = record(item), id = String(r.id ?? '');
    if (!id || seen.has(id) || Number(r.page) !== 1) continue;
    if (![0, 1, '0', '1'].includes(r.organics as number | string)) throw Error('В рекламном отчёте нет признака органики для части карточек.');
    seen.add(id); if (Number(r.organics) === 1) organic++; else advertised++;
  }
  const total = advertised + organic;
  return { date, advertised, organic, total, share: total ? advertised / total * 100 : null };
}
export function analysisChartRows(snapshot: DemandSnapshot, report: QueryAnalysis | null, from: string, to: string) {
  const frequency = new Map(demandMonthSnapshots(snapshot.points, snapshot.fetchedAt).map(m => [m.month, m]));
  const market = new Map(report?.months.map(m => [m.month, m]) ?? []);
  const rows = [];
  for (let month = from; month <= to; month = shiftMonth(month, 1)) {
    const f = frequency.get(month), m = market.get(month), leaders = report?.leaders[month];
    const sum = (n: number) => leaders?.length && leaders.slice(0, n).every(i => i.revenue != null) ? leaders.slice(0, n).reduce((s, i) => s + i.revenue!, 0) : null;
    const share = (n: number) => { const total = sum(n); return total != null && m?.revenue && total <= m.revenue * 1.001 ? Math.min(100, total / m.revenue * 100) : null; };
    const average = (n: number) => { const total = sum(n); return total != null && leaders?.length ? total / Math.min(n, leaders.length) : null; };
    rows.push({ month, frequency: f?.frequency ?? null, approximate: f?.approximate ?? false, items: m?.items ?? null,
      perItem: f?.frequency != null && m?.items ? f.frequency / m.items : null, brands: m?.brands ?? null, sellers: m?.sellers ?? null,
      orders: m?.orders ?? null, revenue: m?.revenue ?? null, averagePrice: m?.averagePrice ?? null,
      top1: average(1), top5: average(5), top10: average(10), share1: share(1), share5: share(5), share10: share(10) });
  }
  return rows;
}
export function analysisVerdict(rows: ReturnType<typeof analysisChartRows>, report: QueryAnalysis | null) {
  const positive: string[] = [], risks: string[] = [], checks: string[] = [];
  const last = [...rows].reverse().find(r => r.frequency != null), earlier = last && rows.find(r => r.month === shiftMonth(last.month, -12));
  const n = (v: number) => Math.round(v).toLocaleString('ru-RU');
  if (last && earlier?.frequency && last.frequency != null) {
    const change = (last.frequency / earlier.frequency - 1) * 100;
    (change >= 0 ? positive : risks).push(`Частотность в ${last.month} ${change >= 0 ? 'выросла' : 'снизилась'} на ${n(Math.abs(change))}% к тому же месяцу прошлого года${last.approximate || earlier.approximate ? ' (ближайшие замеры)' : ''}.`);
  } else checks.push('Для сравнения спроса нужны значения за одинаковые месяцы разных лет.');
  const cash = [...rows].reverse().find(r => r.revenue != null);
  if (cash?.revenue) positive.push(`Объём заказов товаров выборки в ${cash.month}: ${n(cash.revenue)} ₽. Это не выручка, полученная только через этот запрос.`);
  const concentration = [...rows].reverse().find(r => r.share1 != null);
  if (concentration?.share1 != null) {
    (concentration.share1 >= 40 ? risks : positive).push(`Доля крупнейшей карточки в ${concentration.month}: ${n(concentration.share1)}%. Карточка не равна продавцу.`);
  }
  const price = [...rows].reverse().find(r => r.averagePrice != null);
  if (price?.averagePrice != null) checks.push(`Средняя цена заказа в ${price.month}: ${n(price.averagePrice)} ₽. Сопоставьте с себестоимостью, комиссией, логистикой и рекламой.`);
  if (report?.ads?.share != null && report.ads.share >= 50) risks.push(`В текущем замере ${n(report.ads.share)}% карточек первой страницы имеют рекламную позицию. Стоимость входа этим не определяется.`);
  checks.push('Проверьте, что в выборке именно нужная модель товара, затем рассчитайте юнит-экономику.');
  const peak = compareSeasonalPeaks(rows);
  if (peak) (peak.ratio >= 1 ? positive : risks).push(`Подтверждённый сезонный пик ${peak.current.month} ${peak.ratio >= 1 ? 'выше' : 'ниже'} предыдущего сопоставимого пика ${peak.previous.month} на ${n(Math.abs(peak.ratio - 1) * 100)}%. Это изменение спроса, не маржи.`);
  return { positive, risks, checks, title: risks.length ? 'Есть сигналы, требующие проверки' : positive.length ? 'Есть основания продолжить анализ' : 'Пока недостаточно данных' };
}

export function seasonalPeaks(rows: { month: string; frequency: number | null }[]): SeasonalPeak[] {
  const sorted = [...rows].sort((a, b) => a.month.localeCompare(b.month));
  const peaks: SeasonalPeak[] = [];
  const consecutive = (a: string, b: string) => shiftMonth(a, 1) === b;
  for (let i = 5; i < sorted.length - 3; i++) {
    const window = sorted.slice(i - 5, i + 4);
    if (window.some((row, j) => row.frequency == null || j > 0 && !consecutive(window[j - 1].month, row.month))) continue;
    const peak = sorted[i].frequency!;
    if (peak < sorted[i - 1].frequency! || peak <= sorted[i + 1].frequency!) continue;
    const before = sorted.slice(i - 5, i).map(row => row.frequency!);
    const after = sorted.slice(i + 1, i + 4).map(row => row.frequency!);
    // A seasonal peak needs a broad rise and a confirmed decline; a short local bump is not enough.
    if (peak < Math.min(...before) * 1.30 || Math.min(...after) > peak * .85) continue;
    const recentRise = sorted.slice(i - 3, i + 1).map(row => row.frequency!);
    const risingSteps = recentRise.slice(1).filter((value, j) => value >= recentRise[j] * 1.02).length;
    if (risingSteps < 2 || peak < recentRise[0] * 1.25) continue;
    const decline = [peak, ...after];
    const fallingSteps = decline.slice(1).filter((value, j) => value <= decline[j] * .98).length;
    if (fallingSteps < 2) continue;
    const riseStart = sorted.slice(i - 5, i).reduce((best, row) => row.frequency! < best.frequency! ? row : best);
    const candidate = { month: sorted[i].month, frequency: peak, from: riseStart.month, to: sorted[i + 3].month };
    const previous = peaks.at(-1);
    if (previous) {
      const elapsed = (Number(candidate.month.slice(0, 4)) - Number(previous.month.slice(0, 4))) * 12 + Number(candidate.month.slice(5, 7)) - Number(previous.month.slice(5, 7));
      if (elapsed < 8) {
        if (candidate.frequency > previous.frequency) peaks[peaks.length - 1] = candidate;
        continue;
      }
    }
    peaks.push(candidate);
  }
  return peaks;
}

export function compareSeasonalPeaks(rows: { month: string; frequency: number | null }[]) {
  const peaks = seasonalPeaks(rows);
  if (peaks.length < 2) return null;
  const current = peaks.at(-1)!, previous = peaks.at(-2)!;
  const monthNumber = (month: string) => Number(month.slice(5, 7));
  const distance = Math.abs(monthNumber(current.month) - monthNumber(previous.month));
  const circularDistance = Math.min(distance, 12 - distance);
  const elapsed = (Number(current.month.slice(0, 4)) - Number(previous.month.slice(0, 4))) * 12 + monthNumber(current.month) - monthNumber(previous.month);
  if (elapsed < 8 || elapsed > 16 || circularDistance > 2 || !previous.frequency) return null;
  return { previous, current, ratio: current.frequency / previous.frequency };
}
