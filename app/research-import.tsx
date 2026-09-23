"use client";
import { useState } from "react";
import { Upload, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readProductReport, mergeProductReport } from "@/lib/mpstats-import";
import type { Research } from "@/lib/niche-research";
import { prettyDate } from "@/lib/market-types";

export function ResearchImport({ research: r, today, onChange, onPendingChange }: { research: Research; today: string; onChange: (r: Research) => void; onPendingChange: (v: boolean) => void }) {
  const [start, setStart] = useState(r.report?.start ?? ''), [end, setEnd] = useState(r.report?.end ?? '');
  const [pending, setPending] = useState<{ file: File; data: Awaited<ReturnType<typeof readProductReport>> } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const mismatch = Boolean(pending?.data.start && (pending.data.start !== start || pending.data.end !== end));
  const invalid = !start || !end || end < start || end > today;
  async function choose(file?: File) {
    if (!file) return;
    setBusy(true); setError(''); onPendingChange(true);
    try { const data = await readProductReport(file, today); setPending({ file, data }); if (!start && !end && data.start) { setStart(data.start); setEnd(data.end); } }
    catch (e) { setPending(null); setError(e instanceof Error ? e.message : 'Не удалось прочитать файл'); onPendingChange(false); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!pending || invalid || mismatch) return;
    setBusy(true); setError('');
    try {
      if (r.report && (r.report.start !== start || r.report.end !== end)) throw new Error('Этот разбор уже содержит отчёт за другой период. Для сравнения другого сезона создайте отдельный разбор — данные периодов не смешиваются.');
      const competitors = mergeProductReport(r.competitors, pending.data.rows);
      const response = await fetch('/api/research-report', { method: 'POST', body: pending.file });
      const stored = await response.json() as { objectKey?: string; error?: string }; if (!response.ok) throw new Error(stored.error || 'Не удалось сохранить файл');
      onChange({ ...r, competitors, repeatedModels: 'unknown', repeatedModelsThreshold: 3, report: { filename: pending.file.name, start, end, sourceStart: pending.data.start, sourceEnd: pending.data.end, importedAt: today, rows: pending.data.rows.length, objectKey: stored.objectKey } });
      setPending(null); onPendingChange(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить отчёт'); }
    finally { setBusy(false); }
  }
  return <div className="research-import">
    <div className="research-import-warning"><AlertTriangle className="size-5 shrink-0" /><div><b>Перед скачиванием выберите весь сезон продаж в MPStats</b><p>Проверьте начало и конец периода. По умолчанию могут стоять последние 30 дней. Суммы заказов, выкупов и цены должны относиться ко всему анализируемому сезону.</p></div></div>
    <div className="research-import-controls"><label>Период отчёта: с<Input type="date" value={start} max={today} disabled={busy || Boolean(r.report)} onChange={e => setStart(e.target.value)} /></label><label>По<Input type="date" value={end} max={today} disabled={busy || Boolean(r.report)} onChange={e => setEnd(e.target.value)} /></label><label className="research-file-picker"><Upload className="size-4" />{busy ? 'Читаем отчёт…' : 'Выбрать CSV / ZIP'}<input aria-label="Загрузить отчёт группы MPStats" type="file" accept=".csv,.zip" disabled={busy} onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} /></label></div>
    <p className="research-hint mt-2">Это прошедший сезон продаж. Будущий сезон запуска задаётся в следующем блоке. Базовый отбор группы — заказы от 3 млн ₽; загружаются все товары файла.</p>
    {r.report && <div className="research-report-saved"><b>{r.report.filename}</b><span>{prettyDate(r.report.start)} — {prettyDate(r.report.end)} · {r.report.rows} товаров в файле · импорт {prettyDate(r.report.importedAt)}</span>{r.report.objectKey && <a href={'/api/research-report?key=' + encodeURIComponent(r.report.objectKey)} download={r.report.filename}>Скачать исходный отчёт</a>}<small>Данные сохраняются вместе с разбором кнопкой «Сохранить».</small></div>}
    {pending && <div className="research-import-preview"><b>{pending.file.name}</b><p>{pending.data.rows.length} товаров · {pending.data.rows.filter(c => (c.revenue ?? 0) >= 3e6).length} с заказами от 3 млн ₽ · {pending.data.rows.filter(c => c.revenue != null && c.revenue < 3e6).length} ниже порога</p><p>{pending.data.start ? `Период по имени файла: ${prettyDate(pending.data.start)} — ${prettyDate(pending.data.end)}.` : 'В имени файла нет периода. Укажите даты по настройкам выгрузки MPStats.'}</p>{mismatch && <p role="alert">Период файла отличается от указанного. Проверьте даты и выгрузите отчёт за нужный сезон.</p>}{invalid && <p role="alert">Укажите корректный завершённый период отчёта.</p>}<p className="research-hint">Подтвердите, что в MPStats был выбран весь сезон. При повторном импорте цифры обновятся, ручные оценки и ранее добавленные товары сохранятся.</p><div className="flex gap-2 mt-3"><Button type="button" disabled={busy || invalid || mismatch} onClick={() => void apply()}>Период верный — загрузить {pending.data.rows.length} товаров</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setPending(null); setError(''); onPendingChange(false); }}>Отмена</Button></div></div>}
    <div role="status" className="research-import-message">{error}</div>
  </div>;
}
