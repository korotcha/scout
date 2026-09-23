"use client";
import { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { analysisChartRows, analysisVerdict, type AnalysisTask, type QueryAnalysis } from '@/lib/query-analysis';
import type { DemandSnapshot } from '@/lib/search-demand';
import { HelpTip } from './help-tip';

const month = (v: string) => new Date(v + '-01').toLocaleDateString('ru-RU', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const number = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
type Row = ReturnType<typeof analysisChartRows>[number];
type Series = { key: keyof Row; name: string; color: string };
type Coverage = { text: string; incomplete: boolean } | null;

function taskCoverage(report: QueryAnalysis | null, kind: AnalysisTask['kind'], from: string, to: string): Coverage {
  const tasks = report?.tasks.filter(task => task.kind === kind && task.to.slice(0, 7) >= from && task.from.slice(0, 7) <= to) ?? [];
  if (!tasks.length) return null;
  const done = tasks.filter(task => task.state === 'done').length;
  const missing = tasks.filter(task => task.state !== 'done');
  if (!missing.length) return null;
  const first = missing[0].from.slice(0, 7), last = missing.at(-1)!.to.slice(0, 7);
  const errors = missing.filter(task => task.state === 'error').length;
  const range = first === last ? month(first) : `${month(first)} — ${month(last)}`;
  return {
    incomplete: true,
    text: `Загружено ${done} из ${tasks.length} частей периода · нет данных: ${range}${errors ? ` · ошибок: ${errors}` : ''}. Обрыв линии означает отсутствие отчёта, а не нулевое значение.`,
  };
}

function Chart({ title, rows, series, unit = '', note, coverage }: { title: string; rows: Row[]; series: Series[]; unit?: string; note?: string; coverage?: Coverage }) {
  const hasData = rows.some(r => series.some(s => typeof r[s.key] === 'number'));
  return <section className="query-chart-card">
    <h3 className="flex items-center gap-1.5">{title}{note && <HelpTip label={title}>{note}</HelpTip>}</h3>
    {coverage?.incomplete && <p className="query-chart-status" role="status">{coverage.text}</p>}
    {hasData ? <><div className="query-chart-canvas" role="img" aria-label={title + '. Значения в таблице.'}>
      <ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{ top: 16, right: 12, bottom: 4, left: 0 }} accessibilityLayer>
        <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e4e9e4" />
        <XAxis dataKey="month" interval="preserveStartEnd" tickFormatter={month} minTickGap={40} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis width={62} tickFormatter={v => Intl.NumberFormat('ru-RU', { notation: 'compact' }).format(v) + unit} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip labelFormatter={label => month(String(label))} formatter={(value, name) => [typeof value === 'number' ? number(value) + ' ' + unit : '—', name]} />
        <Legend />{series.map(s => <Line key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5} dot={rows.length === 1} connectNulls={false} isAnimationActive={false} />)}
      </LineChart></ResponsiveContainer>
    </div><details className="query-chart-data"><summary>Данные по месяцам</summary><div className="demand-table-scroll"><table><thead><tr><th>Месяц</th>{series.map(s => <th key={s.key}>{s.name}{unit ? `, ${unit}` : ''}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.month}><td>{month(r.month)}</td>{series.map(s => <td key={s.key}>{typeof r[s.key] === 'number' ? number(r[s.key] as number) : '—'}</td>)}</tr>)}</tbody></table></div></details></>
      : <p className="query-chart-empty">Нет сохранённых данных за выбранный период. Они появятся после успешной загрузки отчёта.</p>}
  </section>;
}
export function QueryAnalysisCharts({ snapshot, report, period }: { snapshot: DemandSnapshot; report: QueryAnalysis | null; period: { from: string; to: string } }) {
  const rows = useMemo(() => analysisChartRows(snapshot, report, period.from, period.to), [snapshot, report, period]);
  const verdict = useMemo(() => analysisVerdict(rows, report), [rows, report]);
  const marketCoverage = useMemo(() => taskCoverage(report, 'market', period.from, period.to), [report, period]);
  const leaderCoverage = useMemo(() => taskCoverage(report, 'leaders', period.from, period.to), [report, period]);
  const adsTask = report?.tasks.find(task => task.kind === 'ads');
  return <div className="query-analysis-charts">
    <section className="query-chart-card"><h3 className="flex items-center gap-1.5">Реклама в выдаче <HelpTip label="Реклама в выдаче">Замер текущей первой страницы по Москве. Подключённый метод MPStats не отдаёт исторический ряд рекламы по месяцам.</HelpTip></h3>
      {adsTask && adsTask.state !== 'done' && <p className="query-chart-status" role="status">Текущий замер рекламы ещё не загружен{adsTask.state === 'error' ? ' из-за ошибки' : ''}.</p>}
      {report?.ads ? <div className="query-ads-summary"><strong>{report.ads.share == null ? '—' : number(report.ads.share) + '%'}</strong><p>карточек с рекламной позицией<br/><span>{report.ads.advertised} из {report.ads.total} · замер {report.ads.date.split('-').reverse().join('.')}</span></p></div> : <p className="query-chart-empty">Текущий замер появится после анализа.</p>}
    </section>
    <section className="query-chart-card"><h3 className="flex items-center gap-1.5">Новинки на первой странице <HelpTip label="Новинки на первой странице">Для этого показателя нужны исторические составы первой страницы и даты появления товаров, брендов и продавцов. Подключённые методы MPStats не передают полный набор этих данных.</HelpTip></h3><p className="query-chart-empty">Пока недоступно по подключённым данным.</p></section>
    <Chart title="Средняя цена заказа" rows={rows} series={[{ key: 'averagePrice', name: 'Средняя цена', color: '#15803d' }]} unit="₽" coverage={marketCoverage} note="Объём заказов в рублях ÷ заказы в штуках. Изменение состава товаров тоже влияет на среднюю цену." />
    <Chart title="Деньги у лидеров" rows={rows} series={[{ key: 'top1', name: 'Топ-1', color: '#dc2626' }, { key: 'top5', name: 'Топ-5 (среднее)', color: '#d97706' }, { key: 'top10', name: 'Топ-10 (среднее)', color: '#2563eb' }]} unit="₽" coverage={leaderCoverage} note="Средний объём заказов на карточку среди лидеров месяца по заказам в рублях. Состав лидеров может меняться." />
    <Chart title="Заказы и выкупы · рубли" rows={rows} series={[{ key: 'revenue', name: 'Заказы', color: '#2563eb' }]} unit="₽" coverage={marketCoverage} note="Объём заказов всех товаров выборки. Выкупы и альтернативная расчётная выручка этим методом не передаются; вместо них не подставляем процент выкупа." />
    <Chart title="Заказы · штуки" rows={rows} series={[{ key: 'orders', name: 'Заказано', color: '#2563eb' }]} coverage={marketCoverage} note="Продажи карточек, попавших в выборку по запросу. Они могут приходить из других запросов и каналов." />
    <Chart title="Концентрация заказов" rows={rows} series={[{ key: 'share1', name: 'Топ-1', color: '#dc2626' }, { key: 'share5', name: 'Топ-5', color: '#d97706' }, { key: 'share10', name: 'Топ-10', color: '#2563eb' }]} unit="%" coverage={leaderCoverage} note="Доли карточек по объёму заказов в рублях. Несколько карточек могут принадлежать одному продавцу, поэтому это не доля продавцов." />
    <Chart title="Бренды и продавцы" rows={rows} series={[{ key: 'brands', name: 'Бренды', color: '#15803d' }, { key: 'sellers', name: 'Продавцы', color: '#7c3aed' }]} coverage={marketCoverage} note="Количество в выборке по поисковому запросу за каждый месяц." />
    <section className="query-verdict"><div className="query-verdict-heading"><span>Автоматическая сводка</span><h3 className="flex items-center gap-1.5">{verdict.title}<HelpTip label="Автоматическая сводка">Вывод построен только по сохранённым цифрам выбранного периода. AI к этой сводке пока не подключён. Итоговый балл в разделе «Итоги анализа» считается отдельно и учитывает заполненные проверки конкурентов.</HelpTip></h3></div>
      <div className="query-verdict-columns"><div><h4>Положительные сигналы</h4>{verdict.positive.length ? <ul>{verdict.positive.map(v => <li key={v}>{v}</li>)}</ul> : <p>Недостаточно подтверждённых данных.</p>}</div><div><h4>Риски и ограничения</h4>{verdict.risks.length ? <ul>{verdict.risks.map(v => <li key={v}>{v}</li>)}</ul> : <p>По имеющимся показателям отдельные риски не выделены. Это не подтверждает отсутствие рисков.</p>}</div></div>
      <h4>Что проверить перед решением</h4><ul>{verdict.checks.map(v => <li key={v}>{v}</li>)}</ul>
    </section>
  </div>;
}
