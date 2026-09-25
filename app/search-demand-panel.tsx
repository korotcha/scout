"use client";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Area, ComposedChart, Line, Legend, ReferenceDot, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartNoAxesCombined, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { normalizeDemandQuery, shiftMonth } from "@/lib/search-demand";
import { seasonalPeaks } from '@/lib/query-analysis';
import { queryDemandRows, type QueryDemandHistory } from '@/lib/query-demand';
import { HelpTip } from './help-tip';

type Reply = { connected?: boolean; canUpdate?: boolean; canConnect?: boolean; storageReady?: boolean; error?: string; warning?: string; cached?: boolean; saved?: boolean };
const number = (v: number) => Math.round(v).toLocaleString("ru-RU");
const date = (v: string | number) => new Date(v).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const month = (v: string) => new Date(v + "-01").toLocaleDateString("ru-RU", { month: "short", year: "numeric", timeZone: "UTC" });

export function SearchDemand({ initialQuery = "кофемашина" }: { initialQuery?: string; lockedQuery?: boolean }) {
  const id = useId(), token = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(initialQuery), [query, setQuery] = useState(normalizeDemandQuery(initialQuery));
  const [ready, setReady] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false), [canUpdate, setCanUpdate] = useState(false), [storageReady, setStorageReady] = useState(false);
  const [canConnect, setCanConnect] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false), [remember, setRemember] = useState(false), [message, setMessage] = useState("");
  const [history, setHistory] = useState<QueryDemandHistory | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const generation = useRef(0), autoAnalyze = useRef('');
  useEffect(() => { setDraft(initialQuery); setQuery(normalizeDemandQuery(initialQuery)); }, [initialQuery]);
  useEffect(() => {
    const abort = new AbortController();
    generation.current++;
    setLoading(true); setReady(false); setHistory(null); setPending(false); setMessage("");
    if (query.length < 2) { setLoading(false); return; }
    void fetch(`/api/search-demand?query=${encodeURIComponent(query)}`, { signal: abort.signal, cache: "no-store" }).then(async r => {
      const data = await r.json() as Reply;
      if (!r.ok) throw new Error(data.error || "Не удалось открыть историю.");
      if (abort.signal.aborted) return;
      setConnected(!!data.connected); setCanUpdate(!!data.canUpdate); setStorageReady(!!data.storageReady);
      setCanConnect(!!data.canConnect);
      const saved = await fetch(`/api/query-demand?query=${encodeURIComponent(query)}`, { signal: abort.signal, cache: 'no-store' });
      const analysis = await saved.json() as { history?: QueryDemandHistory | null; pending?: boolean; error?: string };
      if (!saved.ok) throw Error(analysis.error || 'Не удалось открыть историю товаров.');
      if (!abort.signal.aborted) { setHistory(analysis.history ?? null); setPending(!!analysis.pending); setMessage(analysis.history?.warning ?? ''); setReady(true); }
    }).catch(e => { if (!abort.signal.aborted) setMessage(e instanceof Error ? e.message : "Не удалось открыть историю."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => { abort.abort(); generation.current++; };
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
  async function loadApi(action: "load" | "refresh" | "resume") {
    if (inFlight.current || !ready) return;
    if (!connected && !token.current?.value && !(action === 'load' && history?.complete)) {
      if (canConnect) setKeyOpen(true); else setMessage('Владелец должен подключить MPStats.');
      return;
    }
    const run = generation.current;
    inFlight.current = true;
    setBusy(true); setMessage("");
    let oneTimeToken = token.current?.value ?? '';
    if (token.current) token.current.value = "";
    try {
      // Preserve the existing, revision-checked connection setup only when asked.
      // A normal analysis uses the direct SEO report exclusively.
      if (oneTimeToken && remember) {
        const connection = await fetch('/api/search-demand', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, action: 'load', token: oneTimeToken, remember: true }) });
        const result = await connection.json() as Reply;
        if (!connection.ok || !result.connected) throw Error(result.error || result.warning || 'Не удалось сохранить подключение.');
        if (run !== generation.current) return;
        setConnected(true);
      }
      setKeyOpen(false);
      let nextAction = action;
      // Six bounded batches, at most 36 monthly reports. No retry after an error.
      for (let batch = 0; batch < 6; batch++) {
        const response = await fetch('/api/query-demand', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, action: nextAction, ...(oneTimeToken ? { token: oneTimeToken } : {}) }) });
        const result = await response.json() as { history?: QueryDemandHistory; error?: string; cached?: boolean; pending?: boolean };
        if (run !== generation.current) return;
        if (result.history) setHistory(result.history);
        setPending(!!result.pending || result.history?.complete === false);
        if (!response.ok) throw Error(result.error || 'Не удалось получить историю запроса.');
        if (!result.history) throw Error('В ответе нет сохранённого графика.');
        if (result.history.complete) {
          setMessage(result.cached ? 'Открыт сохранённый график. Новых обращений к MPStats нет.' : 'График сохранён: 36 месячных отчётов по запросу, без артикула.');
          return;
        }
        setMessage('Сохранено месяцев: ' + result.history.points.length + ' из 36. Загружаем остальные…');
        nextAction = 'resume';
      }
    } catch (e) {
      if (run === generation.current) setMessage(e instanceof Error ? e.message : 'Не удалось завершить загрузку. Полученные месяцы сохранены.');
    } finally { oneTimeToken = ''; inFlight.current = false; setBusy(false); }
  }
  const buttonLabel = busy ? 'Загружаем график…' : 'Анализировать запрос';
  return <section className="demand-panel" aria-label="История спроса по запросу">
    <header className="demand-heading"><div><p className="demand-eyebrow">MPStats · Wildberries</p><h2>Анализ запроса</h2></div></header>
    <form onSubmit={chooseQuery} className="demand-search">
      <label className="sr-only" htmlFor={id + "-query"}>Поисковый запрос WB</label>
      <Input id={id + "-query"} value={draft} onChange={e => setDraft(e.target.value)} minLength={2} maxLength={200} required disabled={busy} placeholder="Например, вентилятор напольный" />
      {canUpdate ? <Button className="query-analyze-button" type="submit" disabled={!ready || busy || loading || normalizeDemandQuery(draft).length < 2}>{busy ? <LoaderCircle className="size-5 animate-spin" /> : <Sparkles className="size-5" />}{buttonLabel}</Button> : <Button variant="secondary" type="submit" disabled={busy || loading}>Открыть запрос</Button>}
    </form>
    {canUpdate && ready && <Dialog open={keyOpen} onOpenChange={open => { if (!busy) setKeyOpen(open); }}><DialogContent><DialogHeader><DialogTitle>Подключение MPStats</DialogTitle><DialogDescription>Для загрузки новой истории нужен API-токен.</DialogDescription></DialogHeader><div className="demand-key-form"><label htmlFor={id + "-token"}>API-токен MPStats</label><Input id={id + "-token"} ref={token} type="password" autoComplete="new-password" spellCheck={false} autoCapitalize="none" placeholder="Вставьте токен из настроек MPStats" maxLength={1000} disabled={busy} /><label className="demand-remember"><Checkbox checked={remember} onCheckedChange={v => setRemember(v === true)} disabled={!storageReady || busy} />Сохранить подключение для следующих запросов</label><p>Ключ хранится зашифрованным. Без галочки он используется только для этой загрузки.</p>{message && <p role="status">{message}</p>}<Button disabled={busy} onClick={() => void loadApi("refresh")}>{busy ? "Загружаем…" : "Загрузить историю"}</Button></div></DialogContent></Dialog>}
    {message && <p className="demand-message" role="status">{message}</p>}
    <p className="query-analysis-cost flex items-center gap-1.5">Только спрос и товары · остальные отчёты отключены<HelpTip label="Расход запросов">Сохранённые данные открываются без API. Первая загрузка — до 36 месячных отчётов «Подбор запросов». Каждый месяц сохраняется отдельно; после сбоя продолжаем с недостающего. Повторное открытие и смена периода не расходуют API. При сохранении нового подключения дополнительно проверяется история частотности. Лидеры, реклама и продажи не загружаются. Списание квоты зависит от тарифа.</HelpTip></p>
    {canUpdate && <details className="demand-table-details"><summary>Источник и обновление</summary><p>MPStats → Подбор запросов. Для каждого месяца выбираем 1-е число следующего месяца. Частотность WB и результаты по всем страницам берутся из одной строки точного запроса. Артикул не нужен.</p><Button variant="outline" disabled={!ready || busy || loading} onClick={() => void loadApi('refresh')}>Обновить данные · до 36 вызовов API</Button></details>}
    {loading && <p className="demand-empty" role="status">Открываем сохранённую историю…</p>}
    {canUpdate && (pending || history?.complete === false) && <Button variant="outline" disabled={!ready || busy} onClick={() => void loadApi('resume')}>Продолжить загрузку недостающих месяцев</Button>}
    {!loading && !history && <div className="demand-empty"><ChartNoAxesCombined className="size-8" /><h3>История ещё не загружена</h3><p>Здесь появятся частотность, количество результатов WB и частотность на товар за три года.</p>{!canUpdate && ready && <p>Загрузить историю может владелец.</p>}{!ready && <Button variant="outline" onClick={() => window.location.reload()}>Повторить</Button>}</div>}
    {history && <DemandHistory key={query} history={history} />}
  </section>;
}

export function DemandHistory({ history }: { history: QueryDemandHistory }) {
  const id = useId();
  const months = useMemo(() => queryDemandRows(history), [history]);
  const firstMonth = months[0]?.month ?? "";
  const lastMonth = months.at(-1)?.month ?? "";
  const defaultFrom = lastMonth ? [firstMonth, shiftMonth(lastMonth, -35)].sort().at(-1)! : "";
  const [range, setRange] = useState("3");
  const [custom, setCustom] = useState({ from: defaultFrom, to: lastMonth });
  const period = range === "3" ? { from: defaultFrom, to: lastMonth } : custom;
  const validPeriod = /^\d{4}-(0[1-9]|1[0-2])$/.test(period.from) && /^\d{4}-(0[1-9]|1[0-2])$/.test(period.to) && period.from <= period.to && period.from >= firstMonth && period.to <= lastMonth;
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
  const showItems = true;
  const series = visibleMonths;

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
      <div className="demand-chart-heading"><h3 className="flex items-center gap-1.5">Спрос и товары по запросу <HelpTip label="Методика графика">Источник — «Подбор запросов» MPStats, точное совпадение текста запроса. Для месяца используем отчёт на 1-е число следующего месяца: частотность WB за предыдущие 30 дней и количество результатов по всем страницам (не товары первой страницы). На товар = частотность / результаты WB. Это не сумма за календарный месяц. Даты не сдвигаем и пробелы не заполняем соседними значениями.</HelpTip></h3><span>{month(visibleMonths[0].month)} — {month(visibleMonths.at(-1)!.month)}</span></div>
      <p className="demand-updated">Данные по запросу: {series.filter(m => m.paired).length} из {series.length} месяцев. Прочерк — отчёт ещё не загружен или запрос не найден на эту дату.</p>
      <div className="demand-chart" role="img" aria-label={`Частотность запроса «${history.query}» по месяцам. Значения в таблице ниже.`}>
        <ResponsiveContainer width="100%" height="100%"><ComposedChart data={series} margin={{ top: 20, right: 16, bottom: 8, left: 0 }} accessibilityLayer>
          <defs><linearGradient id={id + "-fill"} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity={.16}/><stop offset="100%" stopColor="#2563eb" stopOpacity={.01}/></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e4e9e4" />
          <XAxis dataKey="month" interval="preserveStartEnd" minTickGap={35} tickFormatter={month} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#69756d" }} />
          <YAxis yAxisId="count" width={72} tickFormatter={v => Intl.NumberFormat("ru-RU", { notation: "compact" }).format(v)} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#69756d" }} />
          {showItems && <YAxis yAxisId="ratio" orientation="right" width={36} axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />}
          <Tooltip labelFormatter={(label, payload) => { const point = payload?.[0]?.payload; return month(String(label)) + (point?.sourceDate ? ` · отчёт ${date(point.sourceDate)}` : ''); }} formatter={(value, name) => [typeof value === 'number' ? value.toLocaleString('ru-RU', { maximumFractionDigits: name === 'Частотность на товар' ? 2 : 0 }) : '—', name]} />
          <Area yAxisId="count" name="Частотность" type="linear" dataKey="frequency" stroke="#2563eb" strokeWidth={2.5} fill={`url(#${id}-fill)`} connectNulls={false} isAnimationActive={false} dot={visibleMonths.length === 1 ? { r: 5 } : false} activeDot={{ r: 5 }} />
          {peaks.map(p => <ReferenceDot key={p.month} yAxisId="count" x={p.month} y={p.frequency} r={5} fill="#d97706" stroke="white" strokeWidth={2} />)}
          {showItems && <><Line yAxisId="count" type="linear" dataKey="items" name="Товаров" stroke="#15803d" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} /><Line yAxisId="ratio" type="linear" dataKey="perItem" name="Частотность на товар" stroke="#d97706" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} /><Legend /></>}
        </ComposedChart></ResponsiveContainer>
      </div>
      {peaks.length > 0 && <div className="query-peak-grid">{peaks.map(p => <div key={p.month}><span>Сезонный пик</span><strong>{number(p.frequency)}</strong><small>{month(p.month)} · рост с {month(p.from)}</small></div>)}</div>}
      {peakGrowth && <p className="query-peak-growth">Пик {month(peakGrowth.current.month)} к {month(peakGrowth.previous.month)}: <b>×{peakGrowth.ratio.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</b>.</p>}
      <details className="demand-table-details"><summary>Данные по месяцам</summary>
        <div className="demand-table-scroll"><table><thead><tr><th scope="col">Месяц</th><th scope="col">Дата отчёта</th><th scope="col">Частотность</th><th scope="col">Товаров</th><th scope="col">На товар</th></tr></thead>
          <tbody>{series.map(m => <tr key={m.month}><td>{month(m.month)}{!m.paired && <small>{m.loaded ? 'Нет строки запроса в отчёте' : 'Ещё не загружено'}</small>}</td><td>{m.sourceDate ? date(m.sourceDate) : '—'}</td><td>{m.frequency == null ? "—" : number(m.frequency)}</td><td>{m.items == null ? '—' : number(m.items)}</td><td>{m.perItem == null ? '—' : m.perItem.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}</td></tr>)}</tbody>
        </table></div>
      </details>
    </>}
    <p className="demand-updated">MPStats · Подбор запросов · Загружено: {date(history.fetchedAt)}</p>
  </>;
}
