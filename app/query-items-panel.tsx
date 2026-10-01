"use client";

import { useEffect, useRef, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { reportMonths, type ItemsMetrics, type ItemsRow } from '@/lib/query-items';
import { type QueryPeriod } from '@/lib/query-period';
import './query-items.css';

type Series = { key: keyof ItemsMetrics; name: string; color: string };
const monthLabel = (m: string) => new Date(m + '-01').toLocaleDateString('ru-RU', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const number = (v: unknown, digits = 0) => typeof v === 'number' ? v.toLocaleString('ru-RU', { maximumFractionDigits: digits }) : '—';
const blue = '#2563eb', green = '#15803d', orange = '#d97706', red = '#dc2626', purple = '#7c3aed';
const series = (key: keyof ItemsMetrics, name: string, color: string): Series => ({ key, name, color });
function Plot({ rows, lines, unit = '', label }: { rows: ItemsRow[]; lines: Series[]; unit?: string; label: string }) {
  const values = rows.map(r => ({ ...r.metrics, month: r.month }));
  const hasData = rows.some(r => lines.some(l => typeof r.metrics?.[l.key] === 'number'));
  return <div className="query-items-plot">
    <h4>{label}</h4>
    {hasData ? <div className="query-chart-canvas" role="img" aria-label={label + '. Точные значения в таблице ниже.'}>
      <ResponsiveContainer width="100%" height="100%"><LineChart data={values} margin={{ top: 12, right: 12, bottom: 8, left: 4 }} accessibilityLayer>
        <CartesianGrid strokeDasharray="3 5" vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthLabel} minTickGap={35} tick={{ fontSize: 12 }} />
        <YAxis width={76} tickFormatter={v => Intl.NumberFormat('ru-RU', { notation: 'compact' }).format(v) + unit} tick={{ fontSize: 12 }} />
        <Tooltip labelFormatter={v => monthLabel(String(v))} formatter={(value, name) => [number(value, unit === '%' ? 1 : 0) + (unit ? ' ' + unit : ''), name]} />
        <Legend />{lines.map(s => <Line key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />)}
      </LineChart></ResponsiveContainer>
    </div> : <p className="query-chart-empty">Нет сохранённых данных. Нажмите «Анализировать».</p>}
    <details className="query-chart-data"><summary>Данные по месяцам · {label}</summary><div className="demand-table-scroll"><table>
      <thead><tr><th scope="col">Месяц</th>{lines.map(s => <th scope="col" key={s.key}>{s.name}{unit ? `, ${unit}` : ''}</th>)}</tr></thead>
      <tbody>{rows.map(r => <tr key={r.month}><td>{monthLabel(r.month)}{!r.loaded && <small>Не загружен полностью</small>}</td>{lines.map(s => <td key={s.key}>{number(r.metrics?.[s.key], unit === '%' ? 1 : 0)}</td>)}</tr>)}</tbody>
    </table></div></details>
  </div>;
}
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="query-chart-card"><h3 className="query-items-heading">{title}</h3>{children}</section>;
}
// This hook only reads the cache on mount. The form is the sole upstream trigger.
export function useQueryItems(query: string, full: QueryPeriod, enabled: boolean) {
  const [saved, setSaved] = useState<ItemsRow[]>([]), [reading, setReading] = useState(true);
  const [message, setMessage] = useState('');
  const flight = useRef<AbortController | null>(null);
  const dates = reportMonths(full.from, full.to);
  const rows = dates.map(m => saved.find(r => r.month === m) ?? { month: m, loaded: false, fetchedAt: null, metrics: null, received: 0, total: null });
  const endpoint = '/api/query-items?' + new URLSearchParams({ query, ...full });
  useEffect(() => {
    const abort = new AbortController();
    setSaved([]); setMessage('');
    if (!enabled) { setReading(false); return; }
    setReading(true);
    void fetch(endpoint, { signal: abort.signal, cache: 'no-store' }).then(async r => {
      const result = await r.json();
      if (!r.ok) throw Error(result.error || 'Не удалось открыть отчёты.');
      if (!abort.signal.aborted && !flight.current) setSaved(result.rows);
    }).catch(e => { if (!abort.signal.aborted) setMessage(e instanceof Error ? e.message : 'Не удалось открыть отчёты.'); })
      .finally(() => { if (!abort.signal.aborted) setReading(false); });
    return () => { abort.abort(); flight.current?.abort(); };
  }, [endpoint, enabled]);
  useEffect(() => () => flight.current?.abort(), []);
  async function load(token?: string) {
    if (flight.current || !enabled) throw Error('Дождитесь открытия отчётов.');
    const abort = new AbortController(); flight.current = abort; setMessage('Загружаем отчёты за три года…');
    let calls = 0, steps = 0;
    try {
      const cachedResponse = await fetch(endpoint, { signal: abort.signal, cache: 'no-store' });
      const cached = await cachedResponse.json();
      if (!cachedResponse.ok) throw Error(cached.error || 'Не удалось открыть отчёты.');
      setSaved(cached.rows);
      // Oldest first: newcomers can use the previous month's cached identity sets.
      for (const month of dates.filter(m => !cached.rows.some((r: ItemsRow) => r.month === m && r.loaded))) {
        let loaded = false;
        while (!loaded) {
          if (abort.signal.aborted) throw Error('Загрузка остановлена.');
          if (steps++ >= 40) throw Error('Лимит одного запуска: 40 страниц. Полученное сохранено; нажмите «Анализировать» для продолжения.');
          const response = await fetch('/api/query-items', { method: 'POST', signal: abort.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, month, action: 'load', ...(token ? { token } : {}) }) });
          const result = await response.json(); calls += result.requests ?? 0;
          if (!response.ok) throw Error(result.error || 'Не удалось загрузить месяц.');
          if (!result.row) throw Error('Сервер не подтвердил сохранение месяца.');
          const row = result.row as ItemsRow; loaded = row.loaded;
          setSaved(previous => [...previous.filter(r => r.month !== month), row]);
          setMessage(`${monthLabel(month)}: сохранено ${row.received} из ${row.total} карточек. Обращений к MPStats: ${calls}.`);
        }
      }
      // Recompute set differences from the cache only; never fetch upstream on GET.
      const response = await fetch(endpoint, { signal: abort.signal, cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Не удалось перечитать отчёты.');
      setSaved(result.rows); setMessage('');
      return calls;
    } catch (e) {
      if (!abort.signal.aborted) setMessage('');
      throw e;
    } finally { if (flight.current === abort) flight.current = null; }

  }
  return { rows, reading, message, load };
}
export function QueryItemsPanel({ rows }: { rows: ItemsRow[] }) {
  return <section className="query-items-panel" aria-label="Дополнительные отчёты по запросу">
    <Group title="Реклама в выдаче по месяцам">
      <Plot rows={rows} label="Рекламные карточки" unit="%" lines={[series('adShare', 'Доля с рекламным признаком', blue)]} />
      <details className="query-chart-data"><summary>Размер рекламной выборки</summary><div className="demand-table-scroll"><table><thead><tr><th>Месяц</th><th>Все карточки</th><th>С рекламой</th><th>Без рекламного признака</th></tr></thead><tbody>{rows.map(r => <tr key={r.month}><td>{monthLabel(r.month)}</td><td>{number(r.metrics?.cards)}</td><td>{number(r.metrics?.advertised)}</td><td>{number(r.metrics?.withoutAd)}</td></tr>)}</tbody></table></div></details>
    </Group>
    <Group title="Новинки по месяцам">
      <Plot rows={rows} label="Новые товары и участники" lines={[series('newItems', 'Новые товары', blue), series('newBrands', 'Новые бренды', green), series('newSellers', 'Новые продавцы', orange)]} />
    </Group>
    <Group title="Деньги в нише по месяцам">
      <Plot rows={rows} label="Средний чек" unit="₽" lines={[series('averagePrice', 'Средний чек', green)]} />
      <Plot rows={rows} label="Средний объём заказов у лидеров" unit="₽" lines={[series('top1', 'Топ-1', red), series('top5', 'Топ-5 (среднее)', orange), series('top10', 'Топ-10 (среднее)', blue)]} />
    </Group>
    <Group title="Заказы и выкупы по месяцам">
      <Plot rows={rows} label="Заказы и оценка выкупов · рубли" unit="₽" lines={[series('revenue', 'Заказы', blue), series('boughtRevenue', 'Выкупы (оценка)', green), series('estimatedRevenue', 'Расчётная MPStats', orange)]} />
      <Plot rows={rows} label="Заказы и оценка выкупов · штуки" lines={[series('orders', 'Заказано', blue), series('boughtOrders', 'Выкуплено (оценка)', green), series('estimatedOrders', 'Расчётная MPStats', orange)]} />
    </Group>
    <Group title="Монополия и конкуренция по месяцам">
      <Plot rows={rows} label="Доли лидеров" unit="%" lines={[series('share1', 'Топ-1', red), series('share5', 'Топ-5', orange), series('share10', 'Топ-10', blue)]} />
      <Plot rows={rows} label="Бренды и продавцы в выборке" lines={[series('brands', 'Бренды', green), series('sellers', 'Продавцы', purple)]} />
    </Group>
  </section>;
}
