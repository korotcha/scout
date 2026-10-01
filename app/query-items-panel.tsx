"use client";

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { completedMonth, reportMonths, type ItemsMetrics, type ItemsRow } from '@/lib/query-items';
import { shiftMonth } from '@/lib/search-demand';
import { type QueryReportKind } from '@/lib/query-report-help';
import { ReportHelp } from './query-report-help';
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
    </div> : <p className="query-chart-empty">Нет сохранённых данных. Загрузите выбранные месяцы кнопкой выше. Прочерк — не ноль.</p>}
    <details className="query-chart-data"><summary>Данные по месяцам · {label}</summary><div className="demand-table-scroll"><table>
      <thead><tr><th scope="col">Месяц</th>{lines.map(s => <th scope="col" key={s.key}>{s.name}{unit ? `, ${unit}` : ''}</th>)}</tr></thead>
      <tbody>{rows.map(r => <tr key={r.month}><td>{monthLabel(r.month)}{!r.loaded && <small>Не загружен полностью</small>}</td>{lines.map(s => <td key={s.key}>{number(r.metrics?.[s.key], unit === '%' ? 1 : 0)}</td>)}</tr>)}</tbody>
    </table></div></details>
  </div>;
}
function Group({ title, kind, note, children }: { title: string; kind: QueryReportKind; note: string; children: React.ReactNode }) {
  return <section className="query-chart-card"><h3 className="query-items-heading">{title}<ReportHelp kind={kind} /></h3><p className="query-items-note">{note}</p>{children}</section>;
}
export function QueryItemsPanel({ query, canUpdate }: { query: string; canUpdate: boolean }) {
  const id = useId(), last = completedMonth();
  const [period, setPeriod] = useState({ from: shiftMonth(last, -1), to: last });
  const [saved, setSaved] = useState<ItemsRow[]>([]), [busy, setBusy] = useState(false), [reading, setReading] = useState(true);
  const [message, setMessage] = useState('');
  const flight = useRef<AbortController | null>(null);
  const dates = useMemo(() => reportMonths(period.from, period.to), [period.from, period.to]);
  const valid = dates.length > 0 && dates.length <= 36 && period.from >= '2020-01' && period.to <= last;
  const rows = dates.map(m => saved.find(r => r.month === m) ?? { month: m, loaded: false, fetchedAt: null, metrics: null, received: 0, total: null });
  const complete = rows.filter(r => r.loaded).length;
  const endpoint = '/api/query-items?' + new URLSearchParams({ query, ...period });
  useEffect(() => {
    const abort = new AbortController();
    setSaved([]); setMessage('');
    if (!valid) { setReading(false); return; }
    setReading(true);
    void fetch(endpoint, { signal: abort.signal, cache: 'no-store' }).then(async r => {
      const result = await r.json();
      if (!r.ok) throw Error(result.error || 'Не удалось открыть отчёты.');
      if (!abort.signal.aborted) setSaved(result.rows);
    }).catch(e => { if (!abort.signal.aborted) setMessage(e instanceof Error ? e.message : 'Не удалось открыть отчёты.'); })
      .finally(() => { if (!abort.signal.aborted) setReading(false); });
    return () => abort.abort();
  }, [endpoint, valid]);
  useEffect(() => () => flight.current?.abort(), []);
  async function load() {
    if (flight.current || !valid || reading) return;
    const abort = new AbortController(); flight.current = abort; setBusy(true); setMessage('Загрузка выбранных месяцев…');
    let calls = 0, steps = 0;
    try {
      // Oldest first: newcomers can use the previous month's cached identity sets.
      for (const month of dates.filter(m => !saved.some(r => r.month === m && r.loaded))) {
        let loaded = false;
        while (!loaded) {
          if (abort.signal.aborted) return;
          if (steps++ >= 40) throw Error('Лимит одного запуска: 40 страниц. Полученное сохранено; нажмите загрузку ещё раз для продолжения.');
          const response = await fetch('/api/query-items', { method: 'POST', signal: abort.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, month, action: 'load' }) });
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
      setSaved(result.rows); setMessage(`Все пять отчётов сохранены за выбранные месяцы. Обращений к MPStats: ${calls}. Повторное открытие — из кэша.`);
    } catch (e) { if (!abort.signal.aborted) setMessage((e instanceof Error ? e.message : 'Загрузка прервана.') + ` Обращений к MPStats: ${calls}. Сохранённые страницы не запрашиваются повторно.`); }
    finally { if (!abort.signal.aborted) setBusy(false); if (flight.current === abort) flight.current = null; }
  }
  return <section className="query-items-panel" aria-label="Дополнительные отчёты по запросу">
    <div className="query-items-controls">
      <h3>Остальные отчёты по запросу «{query}»</h3>
      <p>Один полный список товаров за месяц → пять отчётов. FBO, без добавления FBS. Это показатели карточек из выборки, а не заказы только по этой фразе.</p>
      <p>Состав выдачи меняется: повторный замер даже за прошлый месяц может дать другие товары и суммы. Сравнивайте дату загрузки и размер выборки. Сохранённые месяцы автоматически не перезаписываются.</p>
      <div className="query-items-range">
        <label htmlFor={id + '-from'}>От<Input id={id + '-from'} type="month" value={period.from} min="2020-01" max={period.to} disabled={busy} onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))} /></label>
        <label htmlFor={id + '-to'}>До<Input id={id + '-to'} type="month" value={period.to} min={period.from} max={last} disabled={busy} onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))} /></label>
        <Button variant="outline" disabled={busy} onClick={() => setPeriod({ from: shiftMonth(last, -1), to: last })}>Последние 2 месяца</Button>
        <Button variant="outline" disabled={busy} onClick={() => setPeriod({ from: shiftMonth(last, -35), to: last })}>Последние 3 года</Button>
      </div>
      <p>Начинаем с двух месяцев для экономии. Смена периода только читает кэш. Для новых данных нажмите загрузку: от одного API-вызова на месяц, по 500 карточек на страницу. Списание зависит от тарифа; это не обещание бесплатности.</p>
      {valid ? <p role="status">{reading ? 'Открываем сохранённые отчёты…' : `Полностью загружено: ${complete} из ${dates.length} месяцев.`}</p> : <p role="alert">Выберите от 1 до 36 завершённых месяцев, начиная с 2020 года.</p>}
      {canUpdate && <Button disabled={!valid || busy || reading || complete === dates.length} onClick={() => void load()}>{busy ? 'Загружаем отчёты…' : `Загрузить остальные отчёты · ${Math.max(0, dates.length - complete)} мес.`}</Button>}
      {busy && <Button variant="outline" onClick={() => { flight.current?.abort(); flight.current = null; setBusy(false); setMessage('Остановлено. Текущая серверная страница может завершиться; уже сохранённое останется в кэше. Перезагрузите страницу перед продолжением.'); }}>Остановить</Button>}
      {message && <p role="status">{message}</p>}
      <details><summary>Покрытие и дата загрузки</summary><ul>{rows.map(r => <li key={r.month}>{monthLabel(r.month)}: {r.loaded ? `${r.received} карточек, полный отчёт` : `${r.received} из ${r.total ?? '—'} карточек`}{r.fetchedAt ? ` · ${new Date(r.fetchedAt).toLocaleString('ru-RU')}` : ''}</li>)}</ul></details>
    </div>
    <Group title="Реклама в выдаче по месяцам" kind="advertising" note="Доля рекламных карточек в полной выборке. Не доля рекламных мест и не стоимость аукциона.">
      <Plot rows={rows} label="Рекламные карточки" unit="%" lines={[series('adShare', 'Доля с рекламным признаком', blue)]} />
      <details className="query-chart-data"><summary>Размер рекламной выборки</summary><div className="demand-table-scroll"><table><thead><tr><th>Месяц</th><th>Все карточки</th><th>С рекламой</th><th>Без рекламного признака</th></tr></thead><tbody>{rows.map(r => <tr key={r.month}><td>{monthLabel(r.month)}</td><td>{number(r.metrics?.cards)}</td><td>{number(r.metrics?.advertised)}</td><td>{number(r.metrics?.withoutAd)}</td></tr>)}</tbody></table></div></details>
    </Group>
    <Group title="Новинки по месяцам" kind="newcomers" note="Новые товары в выборке по дате появления на WB; новые бренды и продавцы — относительно предыдущего загруженного календарного месяца. Это не полная история первой страницы.">
      <Plot rows={rows} label="Новые товары и участники" lines={[series('newItems', 'Новые товары', blue), series('newBrands', 'Новые бренды', green), series('newSellers', 'Новые продавцы', orange)]} />
    </Group>
    <Group title="Деньги в нише по месяцам" kind="money" note="Объём заказов карточек выборки по запросу, не всего рынка и не прибыль. Топ — по заказам в рублях, не по месту в поиске.">
      <Plot rows={rows} label="Средний чек" unit="₽" lines={[series('averagePrice', 'Средний чек', green)]} />
      <Plot rows={rows} label="Средний объём заказов у лидеров" unit="₽" lines={[series('top1', 'Топ-1', red), series('top5', 'Топ-5 (среднее)', orange), series('top10', 'Топ-10 (среднее)', blue)]} />
    </Group>
    <Group title="Заказы и выкупы по месяцам" kind="orders" note="Выкупы — оценка: сумма заказов каждой карточки × её показатель выкупа MPStats. Расчётная серия — отдельная методика MPStats. Это не фактические выплаты.">
      <Plot rows={rows} label="Заказы и оценка выкупов · рубли" unit="₽" lines={[series('revenue', 'Заказы', blue), series('boughtRevenue', 'Выкупы (оценка)', green), series('estimatedRevenue', 'Расчётная MPStats', orange)]} />
      <Plot rows={rows} label="Заказы и оценка выкупов · штуки" lines={[series('orders', 'Заказано', blue), series('boughtOrders', 'Выкуплено (оценка)', green), series('estimatedOrders', 'Расчётная MPStats', orange)]} />
    </Group>
    <Group title="Монополия и конкуренция по месяцам" kind="competition" note="Концентрация объёма заказов у карточек-лидеров. Карточки и бренды могут принадлежать одному бизнесу.">
      <Plot rows={rows} label="Доли лидеров" unit="%" lines={[series('share1', 'Топ-1', red), series('share5', 'Топ-5', orange), series('share10', 'Топ-10', blue)]} />
      <Plot rows={rows} label="Бренды и продавцы в выборке" lines={[series('brands', 'Бренды', green), series('sellers', 'Продавцы', purple)]} />
    </Group>
  </section>;
}
