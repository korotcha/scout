import type { SummaryRow } from "./market-types";

export const filterDefinitions = [
  { key: "yoyDemand", label: "Рост г/г", percent: true, threshold: 0, standard: true },
  { key: "perArticle", label: "На товар", percent: false, threshold: 0, standard: true },
  { key: "yoyPressure", label: "Рост/товар", percent: true, threshold: 0, standard: true },
  { key: "frequency", label: "Спрос", percent: false, threshold: 1000, standard: false },
  { key: "articles", label: "Артикулов", percent: false, threshold: 0, standard: false },
  { key: "mom", label: "Рост 30д", percent: true, threshold: 0, standard: false },
] as const;
export type NumericKey = typeof filterDefinitions[number]["key"];
export type FilterOperator = "gt" | "gte" | "lt" | "lte";
export type NumericFilter = { enabled: boolean; threshold: number; operator: FilterOperator };
export type ScreenerFilters = Record<NumericKey, NumericFilter>;
export type SourcePeriods = { period: string; comparisonPeriod: string };
export type ScreenerState = { search: string; filters: ScreenerFilters; sort: NumericKey; direction: "desc" | "asc"; page: number; status?: string; minScore?: number | null; sortByScore?: boolean };

export const operators: Record<FilterOperator, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤" };
export function defaultFilters(): ScreenerFilters {
  return Object.fromEntries(filterDefinitions.map((f) => [f.key, { enabled: f.standard, threshold: f.threshold, operator: "gt" }])) as ScreenerFilters;
}
export const initialScreenerState = (): ScreenerState => ({ search: "", filters: defaultFilters(), sort: "frequency", direction: "desc", page: 0 });
export function clearNumericFilters(filters: ScreenerFilters): ScreenerFilters {
  return Object.fromEntries(filterDefinitions.map(({ key }) => [key, { ...filters[key], enabled: false }])) as ScreenerFilters;
}
export function selectScreenerRows(rows: SummaryRow[], state: ScreenerState): SummaryRow[] {
  const needle = state.search.trim().toLocaleLowerCase("ru");
  return rows.filter((row) => {
    if (needle && !`${row.query} ${row.subject}`.toLocaleLowerCase("ru").includes(needle)) return false;
    return filterDefinitions.every(({ key, percent }) => {
      const filter = state.filters[key];
      if (!filter.enabled) return true;
      const value = row[key];
      if (value == null || !Number.isFinite(value)) return false;
      const threshold = percent ? filter.threshold / 100 : filter.threshold;
      switch (filter.operator) {
        case "gt": return value > threshold;
        case "gte": return value >= threshold;
        case "lt": return value < threshold;
        case "lte": return value <= threshold;
      }
    });
  }).sort((a, b) => {
    const left = a[state.sort], right = b[state.sort];
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    return state.direction === "desc" ? right - left : left - right;
  });
}

// Expand the stored decimal representation. Moving the decimal point for percent
// display avoids additional binary multiplication noise or decimal rounding.
export function sourceNumber(value: number | null | undefined, percent = false): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const [mantissa, exponent = "0"] = Math.abs(value).toString().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const digits = whole + fraction;
  const point = whole.length + Number(exponent) + (percent ? 2 : 0);
  const expanded = point <= 0 ? `0.${"0".repeat(-point)}${digits}` : point >= digits.length ? digits + "0".repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`;
  const [integer, decimals = ""] = expanded.split(".");
  const tail = decimals.replace(/0+$/, "");
  return `${value < 0 ? "−" : percent && value > 0 ? "+" : ""}${integer.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")}${tail ? `,${tail}` : ""}${percent ? "%" : ""}`;
}

const queryPercent = new Intl.NumberFormat("ru-RU", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" });
const queryRatio = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const queryCount = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

// Display precision is separate from the raw values used by filters and sorting.
export function formatQueryValue(value: number | null | undefined, key: NumericKey): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (key === "yoyDemand" || key === "yoyPressure" || key === "mom") return queryPercent.format(value);
  return (key === "perArticle" ? queryRatio : queryCount).format(value);
}
