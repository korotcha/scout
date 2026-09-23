import { z } from "zod";
import type { Analysis } from "./candidate-workflow";

const date = z.string().refine(v => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v), "Некорректная дата");
const amount = z.number().finite().min(0).max(1e12).nullable();
const note = z.string().max(6000);
export const competitorSchema = z.object({
  sku: z.string().regex(/^[1-9]\d{4,14}$/, "Укажите артикул WB"),
  slot: z.number().int().min(0).max(999).optional(),
  revenue: amount, price: amount,
  buyouts: amount.optional(), name: z.string().max(1000).optional(), photo: z.string().max(2000).optional(), imported: z.boolean().optional(),
  priceFrom: amount.default(null), priceTo: amount.default(null),
  priceTrend: z.enum(["unknown", "rising", "stable", "falling", "waves"]),
  stock: z.enum(["unknown", "available", "replenished", "sold_out", "unavailable"]),
  endStock: z.number().int().min(0).max(1e12).nullable(), endStockRisk: z.enum(["unknown", "normal", "large", "out", "unavailable"]),
  rating: z.number().finite().min(0).max(5).nullable(),
  reviews: z.number().int().min(0).max(1e8).nullable(),
  checkedAt: date,
  glue: z.enum(["unknown", "no", "suspected", "confirmed"]),
  glueEvidence: note,
  content: z.enum(["unknown", "excellent", "good", "poor"]),
  ratingIssue: z.enum(["unknown", "none", "fixable", "inherent"]),
  coverage: z.enum(["unknown", "adequate", "gap"]),
  modelGroup: z.string().max(100), note,
});
export type Competitor = z.infer<typeof competitorSchema>;
export const researchSchema = z.object({
  version: z.number().int().min(1).max(2).default(1),
  cohortUrl: z.string().max(2000).refine(v => { if (!v) return true; try { return ["https:", "http:"].includes(new URL(v).protocol); } catch { return false; } }, "Ссылка должна начинаться с https://"),
  apiGroupId: z.number().int().positive().optional(),
  historyStart: date, historyEnd: date, seasonEnd: date,
  report: z.object({ filename: z.string().max(500), start: date, end: date, importedAt: date, rows: z.number().int().min(1).max(1000), sourceStart: date, sourceEnd: date, objectKey: z.string().max(200).optional() }).optional(),
  seasonFollowsHistory: z.boolean().default(false),
  repeatedModels: z.enum(["unknown", "yes", "no"]).default("unknown"),
  repeatedModelsThreshold: z.union([z.literal(3), z.literal(4)]).default(4),
  seasonPattern: z.enum(["unknown", "single", "waves", "steady"]),
  peakMonths: z.array(z.string().regex(/^(?:$|(?:\d{4}-)?(?:0[1-9]|1[0-2]))$/).transform(v => v ? v.slice(-2) : "")).max(2).default([]),
  demandScope: z.enum(["legacy", "query"]).default("legacy"),
  queryTrend: z.enum(["unknown", "growing", "stable", "falling"]).default("unknown"),
  topQueries: z.array(z.object({ query: z.string().max(500), trend: z.enum(["unknown", "growing", "double", "stable", "falling", "mixed"]) })).max(3),
  trendSource: note,
  supply: z.enum(["unknown", "ahead", "balanced", "behind"]),
  yearPrice: z.enum(["unknown", "rising", "stable", "falling"]),
  sellerShare: z.number().finite().min(0).max(100).nullable(),
  sellerSource: note,
  averageCheck: z.object({ start: date, end: date, previous: amount, current: amount }).nullable().default(null),
  certificationMode: z.enum(["parallel", "before_production", "after_production"]),
  competitors: z.array(competitorSchema).max(1000),
});
export type Research = z.infer<typeof researchSchema>;
export function newResearch(version = 2): Research {
  return { version, cohortUrl: "", historyStart: "", historyEnd: "", seasonEnd: "", seasonPattern: "unknown", peakMonths: [], seasonFollowsHistory: false, repeatedModels: "unknown", repeatedModelsThreshold: 3,
    demandScope: "query", queryTrend: "unknown", topQueries: Array.from({ length: 3 }, () => ({ query: "", trend: "unknown" as const })),
    trendSource: "", supply: "unknown", yearPrice: "unknown", sellerShare: null, sellerSource: "", averageCheck: null,
    certificationMode: "parallel", competitors: [] };
}
export function newCompetitor(sku: string): Competitor {
  return { sku, revenue: null, price: null, priceFrom: null, priceTo: null, priceTrend: "unknown", stock: "unknown", endStock: null,
    endStockRisk: "unknown", rating: null, reviews: null, checkedAt: "", glue: "unknown", glueEvidence: "",
    content: "unknown", ratingIssue: "unknown", coverage: "unknown", modelGroup: "", note: "" };
}
export function queryKey(value: string) { return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU"); }
export function wbSearchUrl(query: string) { return "https://www.wildberries.ru/catalog/0/search.aspx?search=" + encodeURIComponent(query); }
export function wbCardUrl(sku: string) { return "https://www.wildberries.ru/catalog/" + sku + "/detail.aspx"; }
export function parseSkus(value: string) {
  const tokens = value.trim().split(/[\s,;]+/).filter(Boolean);
  const valid: string[] = [], invalid: string[] = [];
  for (const token of tokens) {
    let sku = token;
    if (/^https?:/i.test(token)) {
      try { const u = new URL(token); sku = /(^|\.)wildberries\.ru$/i.test(u.hostname) ? u.pathname.match(/\/catalog\/([1-9]\d{4,14})\/detail\.aspx/)?.[1] ?? "" : ""; } catch { sku = ""; }
    }
    if (/^[1-9]\d{4,14}$/.test(sku)) valid.push(sku); else invalid.push(token);
  }
  return { skus: [...new Set(valid)], invalid, duplicates: valid.length - new Set(valid).size };
}
const DAY = 86400000;
export function daysBetween(start: string, end: string) {
  if (!start || !end) return null;
  const result = (Date.parse(end) - Date.parse(start)) / DAY;
  return Number.isFinite(result) ? Math.round(result) : null;
}
export function shiftedDate(date: string, days: number) {
  const time = Date.parse(date) + days * DAY;
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : "";
}
export function calendarMonthsLater(value: string, months: number) {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  const d = new Date(value + "T00:00:00Z"), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
// One editable reference season; preparation dates follow the selected launch month.
// A January launch belongs to the season that began in the preceding calendar year.
export function alignResearchSeason(a: Analysis, launchMonth: string): Analysis {
  const r = a.research;
  if (!r.seasonFollowsHistory || !/^\d{4}-\d{2}$/.test(launchMonth)) return a;
  if (!r.historyStart || !r.historyEnd || r.historyEnd < r.historyStart) return { ...a, launchDate: "", research: { ...r, seasonEnd: "" } };
  const startYear = Number(r.historyStart.slice(0, 4));
  const crossesYear = Number(r.historyEnd.slice(0, 4)) > startYear;
  const anchorYear = startYear + (crossesYear && Number(launchMonth.slice(5, 7)) < Number(r.historyStart.slice(5, 7)) ? 1 : 0);
  const shift = (Number(launchMonth.slice(0, 4)) - anchorYear) * 12;
  return { ...a, launchDate: calendarMonthsLater(r.historyStart, shift), research: { ...r, seasonEnd: calendarMonthsLater(r.historyEnd, shift) } };
}
export function preparation(a: Analysis, today = new Date().toISOString().slice(0, 10), actualProduction?: number | null) {
  const production = actualProduction ?? a.productionDays;
  const cert = a.certification === "needed" ? a.certificationDays : 0;
  const manufacturing = a.research.certificationMode === "parallel" ? Math.max(production, cert) : production + cert;
  const requiredDays = manufacturing + a.deliveryDays;
  const untilStart = daysBetween(today, a.launchDate);
  return { today, production, requiredDays, untilStart,
    reserve: untilStart == null ? null : untilStart - requiredDays,
    orderBy: a.launchDate ? shiftedDate(a.launchDate, -requiredDays) : "",
    arrival: shiftedDate(today, requiredDays),
    seasonDays: daysBetween(a.launchDate, a.research.seasonEnd) == null ? null : daysBetween(a.launchDate, a.research.seasonEnd)! + 1,
    certificationUnknown: a.certification === "unknown" };
}
export function coreCompetitors(r: Research) {
  return [...r.competitors].sort((a, b) => (b.revenue ?? -1) - (a.revenue ?? -1) || a.sku.localeCompare(b.sku));
}
export function modelRepetition(r: Research) {
  if (r.repeatedModels === "yes" || r.repeatedModelsThreshold === 3 && r.repeatedModels === "no") return r.repeatedModels;
  const core = coreCompetitors(r);
  // Preserve usable observations from previously saved per-card model groups.
  if (!core.length || core.some(c => !c.modelGroup)) return "unknown";
  const counts = core.reduce<Record<string, number>>((acc, c) => { acc[c.modelGroup] = (acc[c.modelGroup] ?? 0) + 1; return acc; }, {});
  return Object.values(counts).some(count => count >= 3) ? "yes" : "no";
}
export function competitorPriceRange(c: Competitor) {
  if (c.priceFrom != null || c.priceTo != null) return { from: c.priceFrom, to: c.priceTo };
  return { from: c.price, to: c.price };
}
export function priceScreening(r: Research) {
  const core = coreCompetitors(r), priced = core.map(competitorPriceRange).filter(p => p.from != null && p.from > 0 && p.to != null && p.to >= p.from);
  const minimum = priced.length ? priced.reduce((sum, p) => sum + p.from!, 0) / priced.length : null;
  const maximum = priced.length ? priced.reduce((sum, p) => sum + p.to!, 0) / priced.length : null;
  const average = minimum === maximum ? minimum : null;
  const complete = core.length > 0 && priced.length === core.length && r.competitors.every(c => c.revenue != null);
  return { average, minimum, maximum, checked: priced.length, complete, rejected: complete && maximum! < 1000, uncertain: complete && minimum! < 1000 && maximum! >= 1000 };
}
// Empty UI slots are not competitors. Stored slots preserve row placement after reload.
export function competitorSlots(rows: Competitor[]): (Competitor | undefined)[] {
  const slots: (Competitor | undefined)[] = Array(Math.max(1, rows.length)).fill(undefined);
  for (const c of rows.filter(c => c.slot != null)) slots[c.slot!] = c;
  for (const c of rows.filter(c => c.slot == null)) {
    const free = slots.findIndex(c => !c);
    slots[free < 0 ? slots.length : free] = c;
  }
  return slots;
}
export function modelSignals(r: Research) {
  return coreCompetitors(r).filter(c => c.revenue != null && c.revenue > 0).map(c => ({
    sku: c.sku,
    signals: [...(c.priceTrend === "rising" ? ["Цена росла в сезоне"] : []), ...(["replenished", "sold_out"].includes(c.stock) ? ["Заканчивались остатки"] : [])],
  })).filter(c => c.signals.length);
}
export function competitorFieldErrors(c: Competitor, today?: string) {
  const errors: Partial<Record<keyof Competitor, string>> = {};
  if (c.revenue == null) errors.revenue = "сумма заказов";
  const range = competitorPriceRange(c);
  if (!c.imported && (range.from == null || range.from <= 0)) errors.priceFrom = "цена от–до";
  if (!c.imported && (range.to == null || range.to <= 0)) errors.priceTo = "цена от–до";
  if (range.from != null && range.to != null && range.to < range.from) errors.priceTo = "цена «до» меньше цены «от»";
  if (c.rating == null) errors.rating = "рейтинг";
  if (c.reviews == null) errors.reviews = "отзывы";
  if (!c.checkedAt) errors.checkedAt = "дата проверки";
  else if (today && c.checkedAt > today) errors.checkedAt = "дата проверки в будущем";
  for (const [key, label] of [["priceTrend", "динамика цены"], ["stock", "остатки"], ["endStockRisk", "остатки в конце"], ["glue", "склейки"]] as const) {
    if (c[key] === "unknown") errors[key] = label;
  }
  return errors;
}
export function competitorMissing(c: Competitor) {
  return [...new Set(Object.values(competitorFieldErrors(c)))];
}
export function compareAverageCheck(r: Research, today = new Date().toISOString().slice(0, 10)) {
  const c = r.averageCheck;
  const missing: string[] = [];
  const fieldErrors: Partial<Record<"start" | "end" | "previous" | "current", string>> = {};
  if (!c?.start || !c?.end) {
    missing.push("Средний чек: укажите первый период сравнения");
    if (!c?.start) fieldErrors.start = missing[0];
    if (!c?.end) fieldErrors.end = missing[0];
  } else if (c.end < c.start) {
    missing.push("Средний чек: конец периода раньше начала"); fieldErrors.end = missing[0];
  } else if (calendarMonthsLater(c.end, 12) >= today) {
    missing.push("Средний чек: выберите два завершённых периода");
    fieldErrors.start = fieldErrors.end = missing[0];
  }
  if (c?.previous == null || c.previous <= 0) missing.push(fieldErrors.previous = "Средний чек за первый период должен быть больше нуля");
  if (c?.current == null || c.current <= 0) missing.push(fieldErrors.current = "Средний чек за второй период должен быть больше нуля");
  const change = !missing.length && c ? (c.current! / c.previous! - 1) * 100 : null;
  return { missing, fieldErrors, change, nextStart: calendarMonthsLater(c?.start ?? "", 12), nextEnd: calendarMonthsLater(c?.end ?? "", 12) };
}
export function researchFindings(a: Analysis, today = new Date().toISOString().slice(0, 10), actualProduction?: number | null) {
  const r = a.research, missing: string[] = [], risks: string[] = [], stops: string[] = [];
  const p = preparation(a, today, actualProduction), core = coreCompetitors(r);
  if (!r.cohortUrl && !r.apiGroupId) missing.push("Ссылка на группу или отчёт MPStats");
  if (!a.launchDate || !r.seasonEnd) missing.push("Начало и конец будущего сезона");
  else if (r.seasonEnd < a.launchDate) missing.push("Конец сезона раньше начала");
  else if (shiftedDate(r.seasonEnd, 1) < calendarMonthsLater(a.launchDate, 3)) stops.push("Сезон короче трёх месяцев");
  const peaks = (r.peakMonths ?? []).map(month => month.slice(-2));
  if (a.launchDate && r.seasonEnd && r.seasonEnd >= a.launchDate) {
    const firstMonth = Number(a.launchDate.slice(0, 4)) * 12 + Number(a.launchDate.slice(5, 7)) - 1;
    const lastMonth = Number(r.seasonEnd.slice(0, 4)) * 12 + Number(r.seasonEnd.slice(5, 7)) - 1;
    const allowed = new Set(Array.from({ length: Math.min(12, lastMonth - firstMonth + 1) }, (_, i) => String((firstMonth + i) % 12 + 1).padStart(2, "0")));
    if (peaks.filter(Boolean).some(month => !allowed.has(month))) missing.push("Месяц пика должен быть внутри сезона");
  }
  if (peaks.filter(Boolean).length > new Set(peaks.filter(Boolean)).size) missing.push("Месяцы пиков не должны повторяться");
  if (r.seasonPattern === "unknown") missing.push("Характер сезона");
  if (p.reserve != null && p.reserve < 0) stops.push("По текущим срокам опаздываем на " + Math.abs(p.reserve) + " дн.");
  if (p.reserve != null && p.reserve >= 0 && p.reserve < 14) risks.push("До заказа осталось меньше 14 дней");
  if (r.demandScope === "query") {
    if (r.queryTrend === "unknown") missing.push("Многолетний спрос: выберите вердикт по текущему запросу");
    if (r.queryTrend === "falling") risks.push("Спрос по анализируемому запросу падает за несколько лет");
  } else {
    if (r.topQueries.length !== 3 || r.topQueries.some(q => !q.query.trim() || q.trend === "unknown")) missing.push("Динамика трёх основных запросов");
    if (new Set(r.topQueries.map(q => queryKey(q.query))).size !== r.topQueries.length) missing.push("Основные запросы повторяются");
    if (r.topQueries.some(q => q.trend === "falling")) risks.push("Есть падающие основные запросы: проверьте перетекание спроса");
  }
  if (!r.trendSource.trim()) missing.push("Источник многолетней динамики");
  if (!core.length) missing.push("Добавьте конкурентов из релевантной группы");
  if (r.report && (!r.report.start || !r.report.end || r.report.end < r.report.start)) missing.push("Проверьте период отчёта конкурентов");
  if (r.report && r.report.sourceStart && (r.report.start !== r.report.sourceStart || r.report.end !== r.report.sourceEnd)) missing.push("Период отчёта конкурентов не совпадает с именем файла");
  if (r.report && r.report.end > today) missing.push("Период отчёта конкурентов должен быть завершён");
  if (["single", "waves"].includes(r.seasonPattern) && peaks.filter(Boolean).length !== (r.seasonPattern === "single" ? 1 : 2)) missing.push("Укажите месяцы пиков сезона");
  if (r.competitors.some(c => c.revenue == null)) missing.push("Сумма заказов всех добавленных карточек");
  for (const c of core) {
    const fields = competitorMissing(c);
    if (fields.length) missing.push(c.sku + ": " + fields.join(", "));
    if (c.checkedAt > today) missing.push(c.sku + ": дата проверки в будущем");
  }
  if (core.some(c => c.glue === "confirmed")) risks.push("Менеджер отметил склейки");
  if (core.some(c => c.glue === "suspected")) risks.push("Есть подозрения на склейки — требуют проверки");
  if (core.some(c => c.endStockRisk === "large")) risks.push("У конкурентов остались значительные запасы к концу сезона");
  if (priceScreening(r).rejected) stops.unshift("Ценовой диапазон группы ниже 1 000 ₽ — нишу не рассматриваем");
  if (priceScreening(r).uncertain) risks.push("Ценовой диапазон группы пересекает 1 000 ₽ — уточните уровень цен в активной части сезона");
  if (modelRepetition(r) === "unknown") missing.push("Повторяется ли одна модель три раза и более в группе");
  if (modelRepetition(r) === "yes") risks.push("Одна модель встречается три раза и более в группе");
  if (!a.comment.trim()) missing.push("Общий комментарий менеджера");
  return { risks, missing: [...new Set(missing)], stops, complete: missing.length === 0, canProceed: missing.length === 0 && stops.length === 0 };
}
export type ScoreLine = { label: string; points: number; max: number; detail: string; block: "market" | "entry" | "risk" };
// Working method v2. No regional-coverage score; each per-card fact is counted once.
// Ratios use the actual group size; content is not scored.
export function scoreResearch(a: Analysis, today = new Date().toISOString().slice(0, 10), actualProduction?: number | null) {
  const r = a.research, core = coreCompetitors(r), findings = researchFindings(a, today, actualProduction);
  const lines: ScoreLine[] = [];
  const fraction = (fn: (c: Competitor) => boolean) => core.filter(fn).length / Math.max(1, core.length);
  const row = (label: string, points: number, max: number, detail: string, block: ScoreLine["block"]) => lines.push({ label, points, max, detail, block });
  const demand = r.demandScope === "query" ? (r.queryTrend === "growing" ? 2 / 3 : 0) : r.topQueries.reduce((s, q) => s + (q.trend === "double" ? 1 : q.trend === "growing" ? 2 / 3 : 0), 0) / 3;
  row(r.demandScope === "query" ? "Многолетний спрос по запросу" : "Спрос по трём запросам", 15 * demand, 15, r.demandScope === "query" ? "Рост текущего запроса: 10 баллов; стабильность и падение не дают баллов роста. Вердикт не доказывает рост ×2." : "Рост ×2: полный вес; обычный рост: 2/3. Стабильность, спад и волны не дают баллов роста.", "market");
  row("Заказы от 3 млн ₽ за сезон", 15 * fraction(c => c.revenue != null && c.revenue >= 3e6), 15, "Доля товаров группы с заказами от 3 млн ₽. Это ориентир, не запрет для меньшей выручки.", "market");
  const proven = (c: Competitor) => c.revenue != null && c.revenue > 0;
  row("Рейтинг ниже 4,8", 10 * fraction(c => proven(c) && c.rating != null && c.rating < 4.8), 10, "Рабочий ориентир для доли конкурентов с продажами и рейтингом ниже 4,8. Причины низких оценок оцениваются при выборе модели; это не гарантия простого входа.", "entry");
  row("Перерывы в наличии", 10 * fraction(c => proven(c) && ["replenished", "sold_out"].includes(c.stock)), 10, "Один признак остатков учитывается один раз. Проверьте, не забрали ли спрос другие продавцы.", "entry");
  row("Цена росла в активном сезоне", 15 * fraction(c => proven(c) && c.priceTrend === "rising"), 15, "Устойчивое повышение на сопоставимый товар; волны и разовый пик не дают баллов.", "entry");
  row("Запасы в конце сезона", -10 * fraction(c => c.endStockRisk === "large"), 10, "Доля конкурентов со значительными непроданными запасами.", "risk");
  row("Склейки по проверке менеджера", -10 * fraction(c => c.glue === "confirmed"), 10, "Доля конкурентов, у которых менеджер визуально обнаружил склейки.", "risk");
  const marketMax = lines.filter(l => l.block === "market").reduce((s, l) => s + l.max, 0);
  const entryMax = lines.filter(l => l.block === "entry").reduce((s, l) => s + l.max, 0);
  const market = lines.filter(l => l.block === "market").reduce((s, l) => s + l.points, 0);
  const entry = lines.filter(l => l.block === "entry").reduce((s, l) => s + l.points, 0);
  const penalties = lines.filter(l => l.block === "risk").reduce((s, l) => s + l.points, 0);
  // Opportunity points scale with demonstrated market potential; a dead market cannot
  // become attractive only because competitors have poor photos or ratings.
  const total = Math.round(Math.max(0, Math.min(100, (market + entry * (market / marketMax) + penalties) / (marketMax + entryMax) * 100)));
  return { total, market, marketMax, entry, entryMax, penalties, lines, complete: findings.complete,
    tone: findings.stops.length ? "red" : !findings.complete ? "neutral" : total < 40 ? "red" : total >= 70 ? "green" : "yellow",
    checked: core.filter(c => competitorMissing(c).length === 0).length, sample: core.length,
    leaders: core.filter(c => c.revenue != null && c.revenue >= 3e6).length,
    revenues: core.filter(c => c.revenue != null).length, findings };
}
