"use client";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Area, ComposedChart, Line, Legend, ReferenceDot, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartNoAxesCombined, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { demandMonthSnapshots, normalizeDemandQuery, shiftMonth, type DemandSnapshot } from "@/lib/search-demand";
import { analysisPlan, seasonalPeaks, type QueryAnalysis } from '@/lib/query-analysis';
import { QueryAnalysisCharts } from './query-analysis-charts';
import { HelpTip } from './help-tip';

type Reply = { snapshot?: DemandSnapshot | null; connected?: boolean; canUpdate?: boolean; canConnect?: boolean; storageReady?: boolean; error?: string; warning?: string; cached?: boolean; saved?: boolean };
const number = (v: number) => Math.round(v).toLocaleString("ru-RU");
const date = (v: string | number) => new Date(v).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const month = (v: string) => new Date(v + "-01").toLocaleDateString("ru-RU", { month: "short", year: "numeric", timeZone: "UTC" });

export function SearchDemand({ initialQuery = "кофемашина" }: { initialQuery?: string; lockedQuery?: boolean }) {
  const id = useId(), token = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(initialQuery), [query, setQuery] = useState(normalizeDemandQuery(initialQuery));
  const [snapshot, setSnapshot] = useState<DemandSnapshot | null>(null);
  const [ready, setReady] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false), [canUpdate, setCanUpdate] = useState(false), [storageReady, setStorageReady] = useState(false);
  const [canConnect, setCanConnect] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false), [remember, setRemember] = useState(false), [message, setMessage] = useState("");
  const [report, setReport] = useState<QueryAnalysis | null>(null);
  const [chartPeriod, setChartPeriod] = useState({ from: '', to: '' });
  const stop = useRef(false), autoAnalyze = useRef('');
  useEffect(() => { setDraft(initialQuery); setQuery(normalizeDemandQuery(initialQuery)); }, [initialQuery]);
  useEffect(() => {
    const abort = new AbortController();
    stop.current = false;
    setLoading(true); setReady(false); setSnapshot(null); setReport(null); setMessage("");
    if (query.length < 2) { setLoading(false); return; }
    void fetch(`/api/search-demand?query=${encodeURIComponent(query)}`, { signal: abort.signal, cache: "no-store" }).then(async r => {
      const data = await r.json() as Reply;
      if (!r.ok) throw new Error(data.error || "Не удалось открыть историю.");
      if (abort.signal.aborted) return;
      setSnapshot(data.snapshot ?? null); setConnected(!!data.connected); setCanUpdate(!!data.canUpdate); setStorageReady(!!data.storageReady); setReady(true);
      setCanConnect(!!data.canConnect);
      const saved = await fetch(`/api/query-analysis?query=${encodeURIComponent(query)}`, { signal: abort.signal, cache: 'no-store' });
      const analysis = await saved.json() as { report?: QueryAnalysis | null };
      if (!abort.signal.aborted && saved.ok) setReport(analysis.report ?? null);
    }).catch(e => { if (!abort.signal.aborted) setMessage(e instanceof Error ? e.message : "Не удалось открыть историю."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => { abort.abort(); stop.current = true; };
  }, [query]);

  function chooseQuery(e: FormEvent) {
    e.preventDefault(); if (busy || loading) return;
    const normalized = normalizeDemandQuery(draft);
    if (normalized.length < 2) return;
    if (normalized !== query) { autoAnalyze.current = normalized; setQuery(normalized); return; }
    void loadApi('load');
  }
  useEffect(() => {
    if (!ready || busy || autoAnalyze.current !== query) return;
    autoAnalyze.current = '';
    void loadApi('load');
    // loadApi intentionally runs only after the newly selected query has opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, query]);
  async function loadApi(action: "load" | "refresh") {
    if (busy || !ready) return;
    if (!connected && !token.current?.value) { if (canConnect) setKeyOpen(true); else setMessage('Владелец должен подключить MPStats, после этого вы сможете запускать анализ.'); return; }
    setBusy(true); setMessage(""); stop.current = false;
    let oneTimeToken = token.current?.value ?? '';
    const body = JSON.stringify({ query, action, ...(oneTimeToken ? { token: oneTimeToken, remember } : {}) });
    if (token.current) token.current.value = "";
    try {
      const r = await fetch("/api/search-demand", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const data = await r.json() as Reply;
      if (!r.ok) throw new Error(data.error || "Не удалось получить данные MPStats.");
      if (data.snapshot) { setSnapshot(data.snapshot); }
      setConnected(!!data.connected); setKeyOpen(false);
      if (data.saved === false) throw Error(data.warning || 'История не сохранена. Повторите загрузку.');
      let finished = false;
      for (let step = 0; step < 180 && !stop.current; step++) {
        const response = await fetch('/api/query-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, action: step === 0 && report && !report.tasks.some(t => t.state === 'pending') ? 'retry' : 'step', ...(oneTimeToken ? { token: oneTimeToken } : {}) }) });
        const result = await response.json() as { report: QueryAnalysis; error?: string; halt?: boolean; finished?: boolean };
        if (!response.ok) throw Error(result.error || 'Не удалось продолжить анализ.');
        setReport(result.report);
        if (result.halt) { setMessage('Один из отчётов недоступен. Полученные данные сохранены. Нажмите «Продолжить анализ», чтобы перейти к остальным отчётам.'); break; }
        if (result.finished) { finished = true; break; }
      }
      if (finished) setMessage('Анализ сохранён. Графики и выбор периода работают без повторных обращений к MPStats.');
      else if (!stop.current) setMessage(previous => previous || 'Полученные отчёты сохранены. Нажмите «Продолжить анализ», чтобы загрузить остальные.');
      else if (stop.current) setMessage('Загрузка приостановлена. Полученные отчёты сохранены; можно продолжить позже.');
    } catch (e) { setMessage(e instanceof Error ? e.message : "Не удалось получить ответ. Сохранённая история остаётся на странице."); }
    finally { oneTimeToken = ''; setBusy(false); }
  }
  const planned = snapshot ? analysisPlan(snapshot, new Date().toISOString()).tasks.length : null;
  const completed = report?.tasks.filter(t => t.state === 'done').length ?? 0;
  const pending = report?.tasks.filter(t => t.state === 'pending').length ?? 0;
  const failed = report?.tasks.filter(t => t.state === 'error').length ?? 0;
  const buttonLabel = busy ? 'Анализируем…' : draft.trim() && normalizeDemandQuery(draft) !== query ? 'Анализировать запрос' : report ? pending ? `Продолжить анализ · ${pending}` : failed ? `Повторить недоступные · ${failed}` : 'Дополнить анализ' : 'Анализировать запрос';
  return <section className="demand-panel" aria-label="История спроса по запросу">
    <header className="demand-heading"><div><p className="demand-eyebrow">MPStats · Wildberries</p><h2>Анализ запроса</h2></div></header>
    <form onSubmit={chooseQuery} className="demand-search">
      <label className="sr-only" htmlFor={id + "-query"}>Поисковый запрос WB</label>
      <Input id={id + "-query"} value={draft} onChange={e => setDraft(e.target.value)} minLength={2} maxLength={200} required disabled={busy} placeholder="Например, вентилятор напольный" />
      {canUpdate ? <Button className="query-analyze-button" type="submit" disabled={!ready || busy || loading || normalizeDemandQuery(draft).length < 2}>{busy ? <LoaderCircle className="size-5 animate-spin" /> : <Sparkles className="size-5" />}{buttonLabel}</Button> : <Button variant="secondary" type="submit" disabled={busy || loading}>Открыть запрос</Button>}
    </form>
    {canUpdate && ready && <Dialog open={keyOpen} onOpenChange={open => { if (!busy) setKeyOpen(open); }}><DialogContent><DialogHeader><DialogTitle>Подключение MPStats</DialogTitle><DialogDescription>Для загрузки новой истории нужен API-токен.</DialogDescription></DialogHeader><div className="demand-key-form"><label htmlFor={id + "-token"}>API-токен MPStats</label><Input id={id + "-token"} ref={token} type="password" autoComplete="new-password" spellCheck={false} autoCapitalize="none" placeholder="Вставьте токен из настроек MPStats" maxLength={1000} disabled={busy} /><label className="demand-remember"><Checkbox checked={remember} onCheckedChange={v => setRemember(v === true)} disabled={!storageReady || busy} />Сохранить подключение для следующих запросов</label><p>Ключ хранится зашифрованным. Без галочки он используется только для этой загрузки.</p>{message && <p role="status">{message}</p>}<Button disabled={busy} onClick={() => void loadApi("refresh")}>{busy ? "Загружаем…" : "Загрузить историю"}</Button></div></DialogContent></Dialog>}
    {message && <p className="demand-message" role="status">{message}</p>}
    <p className="query-analysis-cost flex items-center gap-1.5">{planned ? `План: до ${planned} частей анализа · сохранённые шаги не повторяются.` : 'Глубина анализа зависит от доступной истории.'}<HelpTip label="Как загружается анализ">Получаем всю доступную историю частотности и отчёты от её начала до последнего завершённого месяца. После каждого ответа состояние сохраняется, поэтому при продолжении уже готовые шаги повторно не запрашиваются. Списание лимитов определяется тарифом MPStats.</HelpTip></p>
    {report && <div className="query-analysis-progress"><span>Готово: {completed} / {report.tasks.length}{pending ? ` · осталось ${pending}` : ''}{failed ? ` · ошибок ${failed}` : ''}</span>{busy && <Button size="sm" variant="outline" onClick={() => { stop.current = true; }}>Приостановить</Button>}{report.tasks.some(t => t.state === 'error') && <details><summary>Не удалось загрузить</summary>{report.tasks.filter(t => t.state === 'error').map(t => <p key={t.id}>{t.from} — {t.to}: {t.error}</p>)}</details>}</div>}
    {loading && <p className="demand-empty" role="status">Открываем сохранённую историю…</p>}
    {!loading && !snapshot && <div className="demand-empty"><ChartNoAxesCombined className="size-8" /><h3>История ещё не загружена</h3><p>Здесь появятся месячный график и таблица частотности.</p>{!canUpdate && ready && <p>Загрузить историю может владелец.</p>}{!ready && <Button variant="outline" onClick={() => window.location.reload()}>Повторить</Button>}</div>}
    {snapshot && <><DemandHistory key={snapshot.fetchedAt + query} snapshot={snapshot} report={report} onPeriodChange={setChartPeriod} />{chartPeriod.from && chartPeriod.to && chartPeriod.from <= chartPeriod.to && <QueryAnalysisCharts snapshot={snapshot} report={report} period={chartPeriod} />}</>}
  </section>;
}

export function DemandHistory({ snapshot, report = null, onPeriodChange }: { snapshot: DemandSnapshot; report?: QueryAnalysis | null; onPeriodChange?: (period: { from: string; to: string }) => void }) {
  const id = useId();
  const months = useMemo(() => demandMonthSnapshots(snapshot.points, snapshot.fetchedAt), [snapshot]);
  const firstMonth = months[0]?.month ?? "";
  const lastMonth = months.at(-1)?.month ?? "";
  const defaultFrom = lastMonth ? [firstMonth, shiftMonth(lastMonth, -35)].sort().at(-1)! : "";
  const [range, setRange] = useState("3");
  const [custom, setCustom] = useState({ from: defaultFrom, to: lastMonth });
  const period = range === "3" ? { from: defaultFrom, to: lastMonth } : custom;
  const validPeriod = /^\d{4}-(0[1-9]|1[0-2])$/.test(period.from) && /^\d{4}-(0[1-9]|1[0-2])$/.test(period.to) && period.from <= period.to && period.from >= firstMonth && period.to <= lastMonth;
  useEffect(() => { onPeriodChange?.(validPeriod ? { from: period.from, to: period.to } : { from: "", to: "" }); }, [period.from, period.to, validPeriod, onPeriodChange]);
  const visibleMonths = validPeriod ? months.filter(m => m.month >= period.from && m.month <= period.to) : [];
  const peaks = seasonalPeaks(months).filter(p => p.month >= period.from && p.month <= period.to);
  const peakGrowth = (() => {
    if (peaks.length < 2) return null;
    const previous = peaks.at(-2)!, current = peaks.at(-1)!;
    const pm = Number(previous.month.slice(5, 7)), cm = Number(current.month.slice(5, 7));
    const elapsed = (Number(current.month.slice(0, 4)) - Number(previous.month.slice(0, 4))) * 12 + cm - pm;
    const distance = Math.min(Math.abs(cm - pm), 12 - Math.abs(cm - pm));
    return elapsed >= 8 && elapsed <= 16 && distance <= 2 ? { previous, current, ratio: current.frequency / previous.frequency } : null;
  })();
  const hasValues = visibleMonths.some(m => m.frequency != null);
  const showItems = !!report?.months.some(m => m.items != null);
  const series = visibleMonths.map(m => {
    const items = report?.months.find(row => row.month === m.month)?.items ?? null;
    return { ...m, items, perItem: m.frequency != null && items ? m.frequency / items : null };
  });

  return <>
    <div className="demand-toolbar">
      <div className="demand-period-picker">
        <label htmlFor={id + "-period"}>Период</label>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger id={id + "-period"} aria-label="Период графика"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="3">Последние 3 года</SelectItem><SelectItem value="custom">Свой период</SelectItem></SelectContent>
        </Select>
      </div>
      {range === "custom" && <div className="demand-month-inputs">
        <label htmlFor={id + "-from"}><span>С</span><Input id={id + "-from"} aria-label="Первый месяц периода" type="month" value={custom.from} min={firstMonth} max={custom.to || lastMonth} onInput={e => { const from = e.currentTarget.value; setCustom(previous => ({ ...previous, from })); }} /></label>
        <label htmlFor={id + "-to"}><span>По</span><Input id={id + "-to"} aria-label="Последний месяц периода" type="month" value={custom.to} min={custom.from || firstMonth} max={lastMonth} onInput={e => { const to = e.currentTarget.value; setCustom(previous => ({ ...previous, to })); }} /></label>
      </div>}
    </div>
    {!months.length ? <p className="demand-empty" role="status">Пока нет замеров на границах завершённых месяцев.</p> : !validPeriod ? <p className="demand-message" role="alert">Выберите период внутри доступной истории. Первый месяц должен быть не позже последнего.</p> : !hasValues ? <p className="demand-empty" role="status">За выбранный период данных нет.</p> : <>
      <div className="demand-chart-heading"><h3 className="flex items-center gap-1.5">Частотность по месяцам <HelpTip label="Частотность по месяцам">Значение берётся на границе завершённого месяца: 1-е число следующего месяца, либо ближайший предыдущий замер не старше 6 дней. Это скользящий показатель MPStats, не точная сумма запросов за календарный месяц. Сезонный пик отмечается только после широкого устойчивого роста и подтверждённого снижения; короткие всплески и незавершённый рост пиками не считаются. Если показаны товары, «частотность на товар» — ориентировочное отношение двух показателей, не продажи на карточку.</HelpTip></h3><span>{month(visibleMonths[0].month)} — {month(visibleMonths.at(-1)!.month)}</span></div>
      <div className="demand-chart" role="img" aria-label={`Частотность запроса «${snapshot.query}» по месяцам. Значения в таблице ниже.`}>
        <ResponsiveContainer width="100%" height="100%"><ComposedChart data={series} margin={{ top: 20, right: 16, bottom: 8, left: 0 }} accessibilityLayer>
          <defs><linearGradient id={id + "-fill"} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity={.16}/><stop offset="100%" stopColor="#2563eb" stopOpacity={.01}/></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e4e9e4" />
          <XAxis dataKey="month" interval="preserveStartEnd" minTickGap={35} tickFormatter={month} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#69756d" }} />
          <YAxis yAxisId="count" width={54} tickFormatter={v => Intl.NumberFormat("ru-RU", { notation: "compact" }).format(v)} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#69756d" }} />
          {showItems && <YAxis yAxisId="ratio" orientation="right" width={36} axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />}
          <Tooltip labelFormatter={label => month(String(label))} formatter={(value, name, item) => [typeof value === 'number' ? (name === 'Частотность' && item.payload.approximate ? '≈ ' : '') + value.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) : '—', name]} />
          <Area yAxisId="count" name="Частотность" type="linear" dataKey="frequency" stroke="#2563eb" strokeWidth={2.5} fill={`url(#${id}-fill)`} connectNulls={false} isAnimationActive={false} dot={visibleMonths.length === 1 ? { r: 5 } : false} activeDot={{ r: 5 }} />
          {peaks.map(p => <ReferenceDot key={p.month} yAxisId="count" x={p.month} y={p.frequency} r={5} fill="#d97706" stroke="white" strokeWidth={2} />)}
          {showItems && <><Line yAxisId="count" type="linear" dataKey="items" name="Товаров" stroke="#15803d" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} /><Line yAxisId="ratio" type="linear" dataKey="perItem" name="Частотность на товар" stroke="#d97706" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} /><Legend /></>}
        </ComposedChart></ResponsiveContainer>
      </div>
      {peaks.length > 0 && <div className="query-peak-grid">{peaks.map(p => <div key={p.month}><span>Сезонный пик</span><strong>{number(p.frequency)}</strong><small>{month(p.month)} · рост с {month(p.from)}</small></div>)}</div>}
      {peakGrowth && <p className="query-peak-growth">Пик {month(peakGrowth.current.month)} к {month(peakGrowth.previous.month)}: <b>×{peakGrowth.ratio.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</b>.</p>}
      <details className="demand-table-details" open><summary>Данные по месяцам</summary>
        <div className="demand-table-scroll"><table><thead><tr><th scope="col">Месяц</th><th scope="col">Частотность</th>{showItems && <><th>Товаров</th><th>На товар</th></>}</tr></thead>
          <tbody>{series.map(m => <tr key={m.month}><td>{month(m.month)}{m.frequency == null && <small>Нет замера на границе месяца</small>}</td><td>{m.frequency == null ? "—" : <span title={`Замер на ${date(m.sourceDate!)}`}>{m.approximate ? "≈ " : ""}{number(m.frequency)}</span>}</td>{showItems && <><td>{m.items == null ? '—' : number(m.items)}</td><td>{m.perItem == null ? '—' : m.perItem.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}</td></>}</tr>)}</tbody>
        </table></div>
      </details>
    </>}
    <p className="demand-updated">MPStats · Обновлено {date(snapshot.fetchedAt)}</p>
  </>;
}
