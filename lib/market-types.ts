export type QueryRow = {
  query: string; frequency: number | null; yoyDemand: number | null;
  perArticle: number | null; yoyPressure: number | null; articles: number | null;
  mom: number | null; segment?: string;
};
export type SummaryRow = QueryRow & { subject: string };
export type SubjectRow = {
  subject: string; comment: string; interestingQueries: string;
  topRevenueSeason: number | null; salesVolume: number | null;
  interestingArticles: string; modelCharacteristics: string; queryCount: number;
  positiveYoyCount: number; positivePressureCount: number;
  medianYoyDemand: number | null; medianYoyPressure: number | null;
  topQueries: QueryRow[];
};

export const fmt = (n: number | null | undefined, digits = 0) => n == null || !Number.isFinite(n) ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(n);
export const rub = (n: number | null | undefined) => n == null ? '—' : `${fmt(n)} ₽`;
export const pct = (n: number | null | undefined) => n == null ? '—' : `${n > 0 ? '+' : ''}${fmt(n * 100, 1)}%`;
export const prettyDate = (s: string) => s ? new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC' }).format(new Date(`${s.slice(0, 10)}T00:00:00Z`)) : '—';
export const prettyMonth = (s: string) => {
  if (!/^\d{4}-\d{2}$/.test(s)) return 'Выберите месяц';
  const label = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${s}-01T00:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1).replace(' г.', '');
};
