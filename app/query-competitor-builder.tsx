"use client";
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { newCompetitor, wbCardUrl, type Research } from '@/lib/niche-research';
import type { MarketItem } from '@/lib/query-analysis';

type Selection = { from: string; to: string; items: MarketItem[]; complete: boolean; groupId?: number; groupState?: string; groupSkus?: string[] };
export function QueryCompetitorBuilder({ query, research, onChange, onPendingChange }: { query: string; research: Research; onChange: (r: Research) => void; onPendingChange: (v: boolean) => void }) {
  const [from, setFrom] = useState(research.report?.start ?? ''), [to, setTo] = useState(research.report?.end ?? '');
  const [selection, setSelection] = useState<Selection | null>(null), [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => { if (research.report) { setFrom(research.report.start); setTo(research.report.end); } }, [research.report?.start, research.report?.end]);
  const matching = selection?.from === from && selection?.to === to;
  const rows = matching ? selection.items : [];
  const today = new Date().toISOString().slice(0, 10);
  const valid = !!from && !!to && from <= to && to < today;
  const locked = matching && !!selection.groupState;
  async function run(action: 'load' | 'create') {
    if (busy || !valid) return;
    setBusy(true); onPendingChange(true); setMessage('');
    try {
      if (research.report && (research.report.start !== from || research.report.end !== to)) throw Error('В разборе уже есть отчёт за другой сезон. Периоды нельзя смешивать.');
      for (let page = 0; page < 11; page++) {
        const response = await fetch('/api/query-competitors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, from, to, action, ...(action === 'create' ? { skus: selected } : {}) }) });
        const result = await response.json() as { selection?: Selection; error?: string };
        if (result.selection) { setSelection(result.selection); setSelected(result.selection.groupSkus ?? result.selection.items.map(i => i.sku)); }
        if (!response.ok || !result.selection) throw Error(result.error || 'Не удалось получить группу.');
        if (action === 'create') {
          apply(result.selection, result.selection.groupSkus ?? selected);
          setMessage('Группа создана в MPStats. Товары добавлены в разбор ниже; сохраните карточку запроса.');
          break;
        }
        if (result.selection.complete) { setMessage(result.selection.items.length ? 'Проверьте модели и снимите галочки с неподходящих товаров.' : 'За этот сезон товаров с заказами от 3 млн ₽ не найдено.'); break; }
      }
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Не удалось завершить действие.'); }
    finally { setBusy(false); onPendingChange(false); }
  }
  function apply(result: Selection, skus: string[]) {
    const existing = new Map(research.competitors.map(c => [c.sku, c]));
    for (const row of result.items.filter(i => skus.includes(i.sku))) {
      existing.set(row.sku, { ...(existing.get(row.sku) ?? newCompetitor(row.sku)), imported: true, name: row.name, revenue: row.revenue,
        priceFrom: row.priceMin || null, priceTo: row.priceMax || null, rating: row.rating, reviews: row.reviews, checkedAt: today });
    }
    if (existing.size > 1000) throw Error('В разборе получится больше 1000 товаров. Уточните состав группы.');
    onChange({ ...research, apiGroupId: result.groupId ?? research.apiGroupId, competitors: [...existing.values()].map((c, slot) => ({ ...c, slot })), repeatedModels: 'unknown', repeatedModelsThreshold: 3,
      report: { filename: `MPStats API · ${query}`, start: from, end: to, sourceStart: from, sourceEnd: to, importedAt: today, rows: skus.length } });
  }
  return <div className="query-competitor-builder">
    <h3>Подобрать конкурентов через MPStats</h3><p>Все товары по запросу с заказами от 3 млн ₽ за выбранный сезон. Проверьте характеристики: в выдаче могут оказаться другие модели.</p>
    <div className="query-competitor-controls"><label>Начало сезона<Input type="date" aria-label="Начало сезона конкурентов" value={from} max={to || today} disabled={busy || !!research.report} onChange={e => setFrom(e.target.value)} /></label><label>Конец сезона<Input type="date" aria-label="Конец сезона конкурентов" value={to} min={from} max={today} disabled={busy || !!research.report} onChange={e => setTo(e.target.value)} /></label><Button type="button" disabled={busy || !valid} onClick={() => void run('load')}>{busy ? 'Обрабатываем…' : 'Подобрать конкурентов'}</Button></div>
    <p className="research-hint">Укажите весь прошедший сезон продаж. Новый подбор расходует обращения к API; полученная выборка сохраняется.</p>
    {rows.length > 0 && <><div className="query-competitor-selection"><b>Выбрано {selected.length} из {rows.length}</b><span>Заказы за сезон, ₽</span></div><div className="query-competitor-list"><table><thead><tr><th><input type="checkbox" aria-label="Выбрать всех конкурентов" checked={selected.length === rows.length} disabled={busy || locked} onChange={e => setSelected(e.target.checked ? rows.map(r => r.sku) : [])} /></th><th>Товар</th><th>Заказы, ₽</th></tr></thead><tbody>{rows.map(row => <tr key={row.sku}><td><input type="checkbox" aria-label={'Выбрать ' + row.sku} checked={selected.includes(row.sku)} disabled={busy || locked} onChange={e => setSelected(s => e.target.checked ? [...s, row.sku] : s.filter(i => i !== row.sku))} /></td><td><a href={wbCardUrl(row.sku)} target="_blank" rel="noreferrer">{row.name || row.sku}</a><small>{row.sku}</small></td><td>{row.revenue?.toLocaleString('ru-RU')}</td></tr>)}</tbody></table></div>
      {selection?.complete && <div className="query-competitor-actions"><Button type="button" disabled={busy || !selected.length || selection.groupState === 'creating' || selection.groupState === 'done'} onClick={() => void run('create')}>{selection.groupState === 'adding' ? 'Завершить добавление в группу' : 'Создать группу MPStats'}</Button><Button type="button" variant="outline" disabled={busy || !selected.length} onClick={() => { try { apply(selection, selected); setMessage('Выбранные товары добавлены в разбор. Сохраните карточку запроса.'); } catch (e) { setMessage((e as Error).message); } }}>Добавить в разбор</Button></div>}
    </>}
    {(selection?.groupId || research.apiGroupId) && <p className="research-hint">Группа MPStats № {selection?.groupId ?? research.apiGroupId}{selection?.groupState === 'adding' ? ' · добавление товаров не завершено' : ''}</p>}
    {message && <p role="status" className="demand-message">{message}</p>}
  </div>;
}
