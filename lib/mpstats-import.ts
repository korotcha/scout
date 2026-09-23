import { Unzip, UnzipInflate } from "fflate";
import { competitorSchema, newCompetitor, type Competitor } from "./niche-research";

export const MAX_REPORT_BYTES = 10 * 1024 * 1024;
export function reportDates(name: string) {
  const m = name.match(/(\d{2})\.(\d{2})\.(\d{4})\s*[-–]\s*(\d{2})\.(\d{2})\.(\d{4})/);
  const start = m ? `${m[3]}-${m[2]}-${m[1]}` : "", end = m ? `${m[6]}-${m[5]}-${m[4]}` : "";
  const valid = (s: string) => s && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  return valid(start) && valid(end) && end >= start ? { start, end } : { start: "", end: "" };
}
export function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (ch === ';' || ch === '\n' || ch === '\r')) {
      row.push(cell); cell = "";
      if (ch !== ';') { if (row.some(v => v.trim())) rows.push(row); row = []; if (ch === '\r' && text[i + 1] === '\n') i++; }
    } else cell += ch;
  }
  if (quoted) throw new Error("В CSV не закрыты кавычки. Повторите выгрузку.");
  row.push(cell); if (row.some(v => v.trim())) rows.push(row);
  return rows;
}
export function parseProductReport(text: string, today: string): Competitor[] {
  const [header, ...rows] = csvRows(text.replace(/^\uFEFF/, ""));
  if (!header || !['SKU', 'Revenue, ₽', 'Min Price, ₽', 'Max Price, ₽'].every(k => header.includes(k))) throw new Error("Нужен отчёт MPStats по товарам группы. Отчёт по дням не подходит.");
  if (!rows.length || rows.length > 1000) throw new Error("Загрузите релевантную группу от 1 до 1 000 товаров, а не всю категорию.");
  const seen = new Set<string>();
  return rows.map((row, slot) => {
    if (row.length !== header.length) throw new Error(`Строка ${slot + 2}: число столбцов не совпадает с заголовками.`);
    const get = (k: string) => row[header.indexOf(k)]?.trim() ?? "";
    const number = (k: string, positive = false): number | null => {
      const raw = get(k); if (!raw || ['—', '-'].includes(raw)) return null;
      const n = Number(raw.replace(/[\s₽%]/g, '').replace(',', '.'));
      if (!Number.isFinite(n) || n < 0) throw new Error(`Строка ${slot + 2}: некорректное значение «${k}».`);
      return positive && n === 0 ? null : n;
    };
    const sku = get('SKU'); if (seen.has(sku)) throw new Error(`В файле повторяется артикул ${sku}.`); seen.add(sku);
    const photo = get('Photo');
    const result = competitorSchema.safeParse({ ...newCompetitor(sku), slot, imported: true, name: get('Name'), photo: /^https:\/\//i.test(photo) ? photo : '', revenue: number('Revenue, ₽'), buyouts: number('Bayout, ₽'), priceFrom: number('Min Price, ₽', true), priceTo: number('Max Price, ₽', true), rating: number('Fractional rating') ?? number('Rating'), reviews: number('Comments'), checkedAt: today });
    if (!result.success) throw new Error(`Строка ${slot + 2}: проверьте артикул, рейтинг и числовые значения.`);
    return result.data;
  });
}
export async function readProductReport(file: File, today: string) {
  if (file.size > MAX_REPORT_BYTES) throw new Error("Файл больше 10 МБ. Выгрузите только релевантную группу.");
  let text = '';
  if (/\.csv$/i.test(file.name)) text = await file.text();
  else if (/\.zip$/i.test(file.name)) {
    let count = 0, size = 0, complete = false;
    const decoder = new TextDecoder();
    const unzip = new Unzip(entry => {
      if (!/\.csv$/i.test(entry.name)) return;
      if (++count > 1) throw new Error("В архиве несколько CSV. Загрузите один отчёт группы.");
      if (entry.originalSize && entry.originalSize > MAX_REPORT_BYTES) throw new Error("CSV в архиве больше 10 МБ. Выгрузите только группу.");
      entry.ondata = (error, bytes, final) => {
        if (error) throw error;
        size += bytes.length; if (size > MAX_REPORT_BYTES) throw new Error("Распакованный отчёт больше 10 МБ.");
        text += decoder.decode(bytes, { stream: !final }); complete = final;
      }; entry.start();
    });
    unzip.register(UnzipInflate);
    const reader = file.stream().getReader();
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; unzip.push(chunk.value); } unzip.push(new Uint8Array(), true); }
    finally { await reader.cancel(); }
    if (!count || !complete) throw new Error("В архиве нет полного CSV-отчёта.");
  } else throw new Error("Выберите CSV или ZIP из MPStats.");
  return { rows: parseProductReport(text, today), ...reportDates(file.name) };
}
export function mergeProductReport(existing: Competitor[], incoming: Competitor[]) {
  const bySku = new Map(existing.map(c => [c.sku, c]));
  const rows = incoming.map(c => {
    const old = bySku.get(c.sku); bySku.delete(c.sku);
    return old ? { ...old, ...c, priceTrend: old.priceTrend, stock: old.stock, endStockRisk: old.endStockRisk, endStock: old.endStock, glue: old.glue, glueEvidence: old.glueEvidence, note: old.note, modelGroup: old.modelGroup } : c;
  });
  rows.push(...bySku.values());
  if (rows.length > 1000) throw new Error("После объединения больше 1 000 товаров. Уточните состав группы.");
  return rows.map((c, slot) => ({ ...c, slot }));
}
