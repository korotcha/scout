import type { FrequencyPoint } from "./mpstats-check";

export type DemandSnapshot = {
  version: 1; query: string; fetchedAt: string; points: FrequencyPoint[];
  source: "mpstats-wb-frequency";
};
export type DemandMonth = {
  month: string; date: string; mean: number | null; maximum: number | null; count: number;
  complete: boolean; yoy: number | null;
};
export type DemandPeak = { date: string; frequency: number; from: string; to: string };
const DAY = 86400000;
export const normalizeDemandQuery = (query: string) => query.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
export function canonicalPoints(points: FrequencyPoint[]) {
  return [...new Map(points.map(p => [p.date, p])).values()].sort((a, b) => a.date.localeCompare(b.date));
}
export function shiftMonth(month: string, amount: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + amount, 1)).toISOString().slice(0, 7);
}
export type DemandMonthSnapshot = {
  month: string; boundaryDate: string; sourceDate: string | null;
  frequency: number | null; approximate: boolean;
};
// One rolling-frequency observation at the boundary of each completed month.
// Weekly history may miss the first day: use only the preceding observation,
// at most six days old, and retain that fact. Never average, interpolate or sum.
export function demandMonthSnapshots(points: FrequencyPoint[], fetchedAt: string): DemandMonthSnapshot[] {
  const asOf = fetchedAt.slice(0, 10);
  const sorted = canonicalPoints(points).filter(p => p.date <= asOf);
  if (!sorted.length) return [];
  const first = sorted[0].date;
  const from = first.endsWith("-01") ? shiftMonth(first.slice(0, 7), -1) : first.slice(0, 7);
  const to = [sorted.at(-1)!.date.slice(0, 7), shiftMonth(asOf.slice(0, 7), -1)].sort()[0];
  const result: DemandMonthSnapshot[] = [];
  let index = -1;
  for (let month = from; month <= to; month = shiftMonth(month, 1)) {
    const boundaryDate = shiftMonth(month, 1) + "-01";
    while (index + 1 < sorted.length && sorted[index + 1].date <= boundaryDate) index++;
    const point = sorted[index];
    const valid = !!point && Date.parse(boundaryDate) - Date.parse(point.date) <= 6 * DAY;
    result.push({ month, boundaryDate, sourceDate: valid ? point.date : null,
      frequency: valid ? point.frequency : null, approximate: valid && point.date !== boundaryDate });
  }
  // Keep holes inside history, but do not extend it past available boundary data.
  while (result.length && result.at(-1)!.frequency == null) result.pop();
  return result;
}
function monthEnd(month: string) { return Date.parse(shiftMonth(month, 1) + "-01") - DAY; }
const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b), i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};
export function demandMonths(points: FrequencyPoint[], fetchedAt: string): DemandMonth[] {
  const sorted = canonicalPoints(points); if (!sorted.length) return [];
  const result: DemandMonth[] = [];
  const groups = new Map<string, FrequencyPoint[]>();
  for (const p of sorted) { const key = p.date.slice(0, 7); groups.set(key, [...(groups.get(key) ?? []), p]); }
  for (let month = sorted[0].date.slice(0, 7); month <= sorted.at(-1)!.date.slice(0, 7); month = shiftMonth(month, 1)) {
    const rows = groups.get(month) ?? [], dates = rows.map(p => Date.parse(p.date));
    // A monthly value is a mean of API observations, never a sum of unknown/overlapping windows.
    const complete = rows.length >= 4 && month < fetchedAt.slice(0, 7) &&
      dates[0] - Date.parse(month + "-01") <= 7 * DAY && monthEnd(month) - dates.at(-1)! <= 7 * DAY &&
      dates.every((d, i) => !i || d - dates[i - 1] <= 10 * DAY);
    result.push({ month, date: month + "-01", mean: rows.length ? rows.reduce((s, p) => s + p.frequency, 0) / rows.length : null,
      maximum: rows.length ? Math.max(...rows.map(p => p.frequency)) : null, count: rows.length, complete, yoy: null });
  }
  const byMonth = new Map(result.map(m => [m.month, m]));
  return result.map(m => {
    const previous = byMonth.get(shiftMonth(m.month, -12));
    return { ...m, yoy: m.complete && previous?.complete && previous.mean! > 0 ? (m.mean! / previous.mean! - 1) * 100 : null };
  });
}
export function compareDemand(months: DemandMonth[], from: string, to: string) {
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(from) && /^\d{4}-(0[1-9]|1[0-2])$/.test(to);
  const previousFrom = valid ? shiftMonth(from, -12) : "", previousTo = valid ? shiftMonth(to, -12) : "";
  const base = { from, to, previousFrom, previousTo, ratio: null as number | null, percent: null as number | null, current: null as number | null, previous: null as number | null, matched: 0, expected: 0, reason: "" };
  if (!valid || from > to) return { ...base, reason: "Укажите корректный период сравнения." };
  const index = new Map(months.map(m => [m.month, m]));
  let current = 0, previous = 0;
  for (let m = from; m <= to && base.expected <= 36; m = shiftMonth(m, 1)) {
    base.expected++;
    const a = index.get(m), b = index.get(shiftMonth(m, -12));
    if (!a?.complete || !b?.complete) continue;
    base.matched++; current += a.mean!; previous += b.mean!;
  }
  if (base.expected > 36) return { ...base, reason: "Выберите период не длиннее трёх лет." };
  if (base.matched !== base.expected || !base.matched) return { ...base, reason: `Полные сопоставимые месяцы: ${base.matched} из ${base.expected}. Для точного сравнения не хватает данных.` };
  base.current = current / base.matched; base.previous = previous / base.matched;
  if (!previous) return { ...base, reason: "В прошлом периоде частотность равна нулю. Рост в разах не рассчитываем." };
  return { ...base, ratio: current / previous, percent: (current / previous - 1) * 100 };
}
export function defaultComparison(months: DemandMonth[]) {
  const to = months.filter(m => m.complete).at(-1)?.month ?? new Date().toISOString().slice(0, 7);
  return { from: shiftMonth(to, -11), to };
}
export function demandPeaks(input: FrequencyPoint[]): DemandPeak[] {
  const points = canonicalPoints(input); if (points.length < 9) return [];
  const dates = points.map(p => Date.parse(p.date));
  // Three-observation median suppresses isolated spikes. Do not smooth over missing weeks.
  const smooth = points.map((p, i) => i && i < points.length - 1 && dates[i] - dates[i - 1] <= 10 * DAY && dates[i + 1] - dates[i] <= 10 * DAY
    ? median([points[i - 1].frequency, p.frequency, points[i + 1].frequency]) : p.frequency);
  const candidates: { i: number; value: number }[] = [];
  for (let i = 2; i < points.length - 2; i++) {
    const value = smooth[i];
    if (!value || value < smooth[i - 1] || value < smooth[i + 1]) continue;
    const left: number[] = [], right: number[] = [];
    for (let k = i - 1; k >= 0 && dates[i] - dates[k] <= 70 * DAY; k--) { if (dates[k + 1] - dates[k] > 10 * DAY) break; left.push(smooth[k]); }
    for (let k = i + 1; k < points.length && dates[k] - dates[i] <= 70 * DAY; k++) { if (dates[k] - dates[k - 1] > 10 * DAY) break; right.push(smooth[k]); }
    const year = smooth.filter((_, k) => Math.abs(dates[k] - dates[i]) <= 183 * DAY);
    if (left.length < 3 || right.length < 3 || Math.min(...left) > value * .75 || Math.min(...right) > value * .75 || value < median(year) * 1.35) continue;
    candidates.push({ i, value });
  }
  const chosen: typeof candidates = [];
  for (const c of candidates.sort((a, b) => b.value - a.value)) {
    if (chosen.every(p => Math.abs(dates[p.i] - dates[c.i]) >= 70 * DAY)) chosen.push(c);
  }
  return chosen.map(({ i, value }) => {
    let first = i, last = i;
    while (first > 0 && smooth[first - 1] >= value * .8 && dates[first] - dates[first - 1] <= 10 * DAY) first--;
    while (last < points.length - 1 && smooth[last + 1] >= value * .8 && dates[last + 1] - dates[last] <= 10 * DAY) last++;
    const top = points.slice(first, last + 1).reduce((a, b) => a.frequency >= b.frequency ? a : b);
    return { date: top.date, frequency: top.frequency, from: points[first].date, to: points[last].date };
  }).sort((a, b) => a.date.localeCompare(b.date));
}
export function chartObservations(points: FrequencyPoint[]) {
  const result: { date: string; time: number; frequency: number | null }[] = [];
  for (const p of canonicalPoints(points)) {
    const time = Date.parse(p.date), previous = result.at(-1);
    if (previous && time - previous.time > 14 * DAY) result.push({ date: new Date(previous.time + DAY).toISOString().slice(0, 10), time: previous.time + DAY, frequency: null });
    result.push({ ...p, time });
  }
  return result;
}
