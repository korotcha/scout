"use client";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Check, Layers3, ListChecks, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Panel, Choice, TextField, SafeAnchor } from "./candidate-workspace";
import { SearchDemand } from "./search-demand-panel";
import { QueryCompetitorBuilder } from "./query-competitor-builder";
import { ResearchImport } from "./research-import";
import { CompetitorTable } from "./competitor-table";
import { WorkspaceSection } from "./workspace-section";
import { SubjectQueries, type SubjectQueriesProps } from "./subject-queries";
import { alignResearchSeason, coreCompetitors, modelRepetition, modelSignals, preparation, priceScreening, scoreResearch, wbCardUrl, wbSearchUrl, type Competitor, type Research } from "@/lib/niche-research";
import type { Analysis, Candidate } from "@/lib/candidate-workflow";
import { fmt, prettyDate, prettyMonth } from "@/lib/market-types";

export function useToday() {
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));
  useEffect(() => { const timer = setInterval(() => setToday(new Date().toISOString().slice(0, 10)), 60000); return () => clearInterval(timer); }, []);
  return today;
}
export function ScoreBadge({ analysis, today, actualProduction }: { analysis: Analysis; today?: string; actualProduction?: number | null }) {
  if (analysis.research.version !== 2) return <span className="research-score neutral">—</span>;
  const s = scoreResearch(analysis, today, actualProduction);
  return <span className={"research-score " + s.tone} title={s.complete ? "Оценка; раскладка внутри разбора" : "Предварительно: проверка не завершена"}>{s.total}{!s.complete && <small>*</small>}</span>;
}
function Amount({ label, value, onChange, step = "any", max, error }: { label: string; value: number | null; onChange: (n: number | null) => void; step?: string; max?: number; error?: string }) {
  return <Input aria-label={label} data-check-error={error} type="number" min="0" max={max} step={step} value={value ?? ""} placeholder="—" onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))} className="research-number tabular-nums" />;
}
function ResearchBlock({ number, title, description, icon, tone, aside, defaultOpen = false, issues = [], validateAll = false, children }: { number: string; title: string; description: string; icon: ReactNode; tone: string; aside?: ReactNode; defaultOpen?: boolean; issues?: string[]; validateAll?: boolean; children: ReactNode }) {
  return <WorkspaceSection number={number} title={title} summary={description} icon={icon} tone={tone} aside={aside} defaultOpen={defaultOpen} issues={issues} validateAll={validateAll}>{children}</WorkspaceSection>;
}

export function ResearchPanel({ value: a, query, period, queryData, onChange, record, canDecide, passed, dirty, saving, onSubmit, onApprove, onRejectPrice, onQuickReject, onPendingChange, actualProduction }: {
  value: Analysis; query: string; period: string; queryData: SubjectQueriesProps; onChange: (a: Analysis) => void;
  actualProduction?: number | null; record?: Candidate; canDecide: boolean; passed: boolean; dirty: boolean; saving: boolean; onSubmit: () => void; onApprove: () => void; onRejectPrice: () => void; onQuickReject: (reason: string) => Promise<boolean | void>; onPendingChange: (value: boolean) => void;
}) {
  const today = useToday(), r = a.research, score = scoreResearch(a, today, actualProduction), p = preparation(a, today, actualProduction);
  const core = coreCompetitors(r), findings = score.findings;
  const competitorIssue = (message: string) => /конкурент|карточ|^\d+:|модель три|Ссылка на группу|период отчёта/i.test(message);
  const groupIssues = findings.missing.filter(message => !competitorIssue(message) && message !== "Общий комментарий менеджера");
  const competitorIssues = findings.missing.filter(competitorIssue);
  const price = priceScreening(r), signals = modelSignals(r), inputId = useId();
  const locked = Boolean(record && ["rejected", "deferred", "purchased"].includes(record.status));
  const emit = (next: Analysis) => onChange(alignResearchSeason({ ...next, research: { ...next.research, version: 2, demandScope: "query" } }, period));
  const set = <K extends keyof Analysis>(key: K, value: Analysis[K]) => emit({ ...a, [key]: value });
  const update = <K extends keyof Research>(key: K, value: Research[K]) => emit({ ...a, research: { ...r, [key]: value } });
  const setSeason = (key: "launchDate" | "seasonEnd", value: string) => emit({ ...a, ...(key === "launchDate" ? { launchDate: value } : {}), research: { ...r, seasonFollowsHistory: false, ...(key === "seasonEnd" ? { seasonEnd: value } : {}) } });
  const [importPending, setImportPending] = useState(false), [tablePending, setTablePending] = useState(false), [apiPending, setApiPending] = useState(false);
  useEffect(() => onPendingChange(importPending || tablePending || apiPending), [importPending, tablePending, apiPending, onPendingChange]);
  const count = (fn: (c: Competitor) => boolean) => core.filter(fn).length;
  const observations = [
    ["Цена росла", count(c => c.priceTrend === "rising"), count(c => c.priceTrend !== "unknown"), "positive"],
    ["Заканчивались остатки", count(c => ["replenished", "sold_out"].includes(c.stock)), count(c => c.stock !== "unknown" && c.stock !== "unavailable"), "positive"],
    ["Рейтинг ниже 4,8", count(c => c.rating != null && c.rating < 4.8), count(c => c.rating != null), "positive"],
    ["Большие остатки к концу", count(c => c.endStockRisk === "large"), count(c => c.endStockRisk !== "unknown" && c.endStockRisk !== "unavailable"), "risk"],
    ["Подтверждённые склейки", count(c => c.glue === "confirmed"), count(c => c.glue !== "unknown"), "risk"],
  ] as const;

  return <div className="research-analysis space-y-6">
    <SearchDemand key={query} initialQuery={query} lockedQuery />
    <Panel title="Спрос в предмете" summary={queryData.rows.length + " запросов · общий контекст"} defaultOpen={false} aside={<span className="subject-demand-source">Данные выгрузки</span>}><SubjectQueries {...queryData} selectedQuery={query} /></Panel>
    {r.version === 1 && <div className="rounded-xl border bg-amber-50 p-4 text-sm leading-6">Прежние материалы и расчёты сохранены. Заполните разбор по запросу, чтобы получить новую оценку.</div>}

    <ResearchBlock number="01" title="Группа и конкуренты" description="Группа MPStats · отчёт за сезон · анализ всех конкурентов" icon={<ListChecks className="size-5" />} tone="research-competitors" issues={importPending ? [...competitorIssues, "Завершите или отмените загрузку отчёта"] : competitorIssues} aside={<span className="research-count">{score.checked} / {score.sample} заполнено</span>}>
      <QueryCompetitorBuilder query={query} research={r} onChange={research => emit({ ...a, research })} onPendingChange={setApiPending} />
      <details className="research-guide"><summary>Как собрать релевантную группу?</summary><p>Соберите все товары, которые отвечают запросу <strong>«{query}»</strong>. Проверяйте ключевые характеристики, не ограничивайтесь первыми 100 товарами. Базовый отбор — заказы от 3 млн ₽ за весь сезон. Число конкурентов не ограничивается десяткой. <SafeAnchor href={wbSearchUrl(query)}>Открыть выдачу WB</SafeAnchor></p></details>
      <div className="mt-4 flex items-end gap-3"><div className="min-w-0 flex-1"><TextField label="Ссылка на релевантную группу MPStats" error={!r.cohortUrl && !r.apiGroupId ? "Ссылка на группу или отчёт MPStats" : undefined} value={r.cohortUrl} onChange={v => update("cohortUrl", v)} placeholder="https://mpstats.io/…" /></div>{r.cohortUrl && <div className="pb-2"><SafeAnchor href={r.cohortUrl}>Открыть группу</SafeAnchor></div>}</div>
      <ResearchImport research={r} today={today} onChange={research => emit({ ...a, research })} onPendingChange={setImportPending} />
      <CompetitorTable research={r} today={today} onChange={research => emit({ ...a, research })} onPendingChange={setTablePending} />
      <div className={"research-price-summary " + (price.rejected ? "rejected" : price.uncertain ? "uncertain" : "")} role="status">
        <div><b>{price.complete ? "Границы среднего чека: " + fmt(price.minimum!, 2) + " — " + fmt(price.maximum!, 2) + " ₽" : "Проверка цены: " + price.checked + " / " + score.sample}</b><span>{price.rejected ? "Ниже 1 000 ₽ — можно завершить отбор." : price.uncertain ? "Диапазон пересекает 1 000 ₽ — уточните цены." : price.complete ? "Порог 1 000 ₽ пройден." : "Если цена в отчёте отсутствует, она не участвует в проверке."}</span></div>
        {price.rejected && <Button variant="outline" disabled={saving || locked || !query} onClick={onRejectPrice}>Отклонить по цене</Button>}
        <details className="research-guide"><summary>Как считается?</summary><p>Среднее нижних границ и среднее верхних границ карточек группы ограничивают возможный средний чек. Середину диапазона не принимаем за фактическую среднюю цену. Для раннего отсева даже верхняя граница должна быть ниже 1 000 ₽.</p></details>
      </div>
      <div className="research-repeat-check"><div><h3>Повторяющиеся модели</h3><p>Одна модель встречается в трёх и более карточках группы?</p><span>Сравнивайте конструкцию и характеристики, даже если бренды разные.</span></div><fieldset data-check-error={modelRepetition(r) === "unknown" ? "Повторяется ли одна модель три раза и более в группе" : undefined} aria-label="Повторение одной модели в группе"><legend className="sr-only">Три раза и более</legend>{([["unknown", "Не проверено"], ["yes", "Да"], ["no", "Нет"]] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={modelRepetition(r) === value} onClick={() => emit({ ...a, research: { ...r, repeatedModels: value, repeatedModelsThreshold: 3 } })}>{label}</button>)}</fieldset></div>
      <p className="research-hint mt-3"><b>{score.leaders} из {score.revenues}</b> проверенных по заказам товаров делают от 3 млн ₽ за сезон.</p>
    </ResearchBlock>

    <ResearchBlock number="02" title="Сезон и подготовка" description={a.launchDate && r.seasonEnd ? prettyDate(a.launchDate) + " — " + prettyDate(r.seasonEnd) : "Будущий сезон · пики спроса · время до запуска"} icon={<Layers3 className="size-5" />} tone="research-group" issues={groupIssues}>
      <p className="research-hint">Пики и границы сезона определяйте по истории частотности запроса «{query}». Итоговый отчёт по товарам не содержит истории спроса.</p>
      <div className="research-season-grid mt-5">
        <div className="research-season-fields"><div className="grid gap-3 sm:grid-cols-2"><TextField type="date" label="Начало сезона *" error={!a.launchDate ? "Начало и конец будущего сезона" : undefined} value={a.launchDate} onChange={v => setSeason("launchDate", v)} /><TextField type="date" label="Конец сезона *" error={!r.seasonEnd ? "Начало и конец будущего сезона" : a.launchDate && r.seasonEnd < a.launchDate ? "Конец сезона раньше начала" : undefined} value={r.seasonEnd} onChange={v => setSeason("seasonEnd", v)} /></div><p className="research-hint mt-2">Укажите будущий сезон с годом. Время на подготовку пересчитывается от сегодняшней даты.</p><div className="mt-4"><Choice label="Характер сезона *" value={r.seasonPattern} onChange={v => emit({ ...a, research: { ...r, seasonPattern: v as Research["seasonPattern"], peakMonths: v === "single" ? (r.peakMonths ?? []).slice(0, 1) : v === "waves" ? (r.peakMonths ?? []) : [] } })} options={[["unknown", "Не проверено"], ["single", "Один основной пик"], ["waves", "Несколько пиков / волны"], ["steady", "Планомерный рост"]]} /></div>{["single", "waves"].includes(r.seasonPattern) && <div className="mt-3 grid gap-3 sm:grid-cols-2">{Array.from({ length: r.seasonPattern === "single" ? 1 : 2 }, (_, index) => <Choice key={index} error={groupIssues.find(message => message.includes("Месяц пика") || message.includes("Месяцы пиков"))} label={r.seasonPattern === "single" ? "Месяц основного пика *" : "Месяц пика " + (index + 1) + " *"} value={r.peakMonths?.[index]?.slice(-2) || "unknown"} options={[["unknown", "Выберите месяц"], ...["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"].map((month, i) => [String(i + 1).padStart(2, "0"), month] as const)]} onChange={v => update("peakMonths", Array.from({ length: r.seasonPattern === "single" ? 1 : 2 }, (_, i) => i === index ? (v === "unknown" ? "" : v) : r.peakMonths?.[i]?.slice(-2) ?? ""))} />)}</div>}</div>
        <div className={"research-time " + (p.reserve == null ? "" : p.reserve < 0 ? "late" : p.reserve < 14 ? "tight" : "enough")}>
          <span className="research-eyebrow">Подготовка · {prettyMonth(period)}</span><b className="mt-2 block text-base">{p.reserve == null ? "Укажите границы сезона" : p.reserve < 0 ? "Опаздываем на " + Math.abs(p.reserve) + " дн." : "На подготовку к заказу — " + p.reserve + " дн."}</b>
          {a.launchDate && <p className="mt-2">Начало сезона для запуска: <b>{prettyDate(a.launchDate)}</b>. Длительность: {p.seasonDays && p.seasonDays > 0 ? p.seasonDays + " дн." : "—"}.</p>}
          {p.orderBy && <p className="mt-2">Заказ до <b>{prettyDate(p.orderBy)}</b>. Производство, документы и доставка: {p.requiredDays} дн.</p>}
          <p className="research-hint mt-2">Запас на {prettyDate(today)} — для анализа, поиска фабрик и переговоров.{p.certificationUnknown ? " Срок предварительный: документы ещё не проверены." : ""}{actualProduction != null ? " Производство по фабрике: " + actualProduction + " дн." : ""}</p>
        </div>
      </div>
      <details className="research-context mt-4"><summary>Сроки и документы <span className="ml-2 text-muted-foreground">{a.productionDays} + {a.deliveryDays} дней{a.certification === "unknown" ? " · документы проверит владелец" : ""}</span></summary><div className="mt-4 grid gap-4 md:grid-cols-3"><label className="research-field">Производство, дней<Amount label="Производство, дней" step="1" value={a.productionDays} onChange={v => set("productionDays", v ?? 0)} /></label><label className="research-field">Доставка, дней<Amount label="Доставка, дней" step="1" value={a.deliveryDays} onChange={v => set("deliveryDays", v ?? 0)} /></label><Choice required={false} label="Сертификация / декларация" value={a.certification} onChange={v => set("certification", v as Analysis["certification"])} options={[["unknown", "Нужно уточнить"], ["needed", "Требуется"], ["not_needed", "Не требуется — проверено"]]} /></div>
        {a.certification === "needed" && <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="research-field">Образцы и документы, дней<Amount label="Образцы и документы, дней" value={a.certificationDays} step="1" onChange={v => set("certificationDays", v ?? 0)} /></label><Choice label="Когда готовим документы" value={r.certificationMode} onChange={v => update("certificationMode", v as Research["certificationMode"])} options={[["parallel", "Параллельно производству"], ["before_production", "До производства"], ["after_production", "После производства, до доставки"]]} /></div>}
      </details>
      <details className="research-context mt-3"><summary>Многолетний спрос</summary>
        <p className="research-hint my-4">Сравните этот запрос за несколько лет по сопоставимым периодам.</p>
        <div className="rounded-lg border bg-white p-4"><span className="research-hint">Анализируемый запрос</span><strong className="mt-1 block">{query}</strong></div>
        <div className="mt-4"><Choice label="Вердикт по спросу *" error={!r.queryTrend || r.queryTrend === "unknown" ? "Многолетний спрос: выберите вердикт по текущему запросу" : undefined} value={r.queryTrend ?? "unknown"} onChange={v => update("queryTrend", v as Research["queryTrend"])} options={[["unknown", "Не проверено"], ["growing", "Растёт"], ["falling", "Падает"], ["stable", "Стабилен"]]} /></div>
        <div className="mt-4"><TextField label="Источник и годы сравнения *" error={!r.trendSource.trim() ? "Источник многолетней динамики" : undefined} value={r.trendSource} onChange={v => update("trendSource", v)} placeholder="Wildbox, 2023–2025; ссылка на график при наличии" /></div>
      </details>
    </ResearchBlock>


    <ResearchBlock number="03" title="Итоги анализа" description={score.checked + "/" + score.sample + " заполнено · " + (findings.risks.length + findings.stops.length) + " рисков · " + (score.complete ? "готово к решению" : "анализ не завершён")} icon={<Sparkles className="size-5" />} tone="research-outcome" issues={findings.missing} validateAll defaultOpen={false} aside={<ScoreBadge analysis={a} today={today} actualProduction={actualProduction} />}>
      <div className="research-observations">{observations.map(([label, count, checked, tone]) => <div className={"research-observation " + (checked && count ? tone : "")} key={label}><span>{label}</span><b>{checked ? count : "—"}</b><small>{checked ? "из " + checked + " проверенных" : "Ещё не проверено"}</small></div>)}</div>
      <p className="research-hint mt-2">Рейтинг ниже 4,8 — пока рабочий ориентир. Низкая оценка требует проверки причин; она не гарантирует лёгкий вход.</p>
      {signals.length > 0 && <div className="research-model-signals mt-5"><h3>Модели на заметку</h3><p className="research-hint mt-1">У этих артикулов были продажи и сигналы для дальнейшей проверки потенциала.</p><div className="mt-3 space-y-2">{signals.map(row => <div key={row.sku} className="research-model-signal"><SafeAnchor href={wbCardUrl(row.sku)}>{row.sku}</SafeAnchor>{row.signals.map(signal => <span key={signal}>{signal}</span>)}</div>)}</div></div>}
      <div className="research-results-grid mt-5"><div className="research-score-breakdown"><h3>Оценка запроса <span>{score.complete ? "из 100" : "предварительная"}</span></h3><div className="mt-3 space-y-2"><div><span>Потенциал рынка</span><b>{fmt(score.market, 1)} / {score.marketMax}</b></div><div><span>Возможности входа</span><b>{fmt(score.entry, 1)} / {score.entryMax}</b></div><div><span>Штрафы за риски</span><b>{fmt(score.penalties, 1)}</b></div></div><details className="research-context mt-4"><summary>Из чего сложился балл</summary><div className="mt-3 space-y-3">{score.lines.map(line => <div key={line.label} className="border-b pb-2"><div className="flex justify-between gap-2"><b>{line.label}</b><span className="shrink-0 tabular-nums">{fmt(line.points, 1)}</span></div><p className="research-hint mt-1">{line.detail} Вес: {line.max}.</p></div>)}<p className="research-hint">Рабочая шкала: (рынок + возможности × рынок / {score.marketMax} + штрафы) / {score.marketMax + score.entryMax} × 100, в пределах 0–100. Зелёный от 70, жёлтый 40–69, красный ниже 40 или при стоп-факторе. Незаполненные проверки дают предварительный балл; это не прогноз прибыли.</p></div></details></div>
        <div><h3 className="mb-3 font-semibold">{passed ? "Поиск себестоимости разрешён" : "Что учесть перед продолжением"}</h3>{findings.stops.length > 0 && <div className="research-alert"><b>Стоп-факторы</b><ul>{findings.stops.map(s => <li key={s}>{s}</li>)}</ul></div>}{findings.risks.length > 0 && <details className="research-context mb-3" open><summary>Риски · {findings.risks.length}</summary><ul className="mt-2 list-disc space-y-2 pl-4 text-sm">{findings.risks.map(s => <li key={s}>{s}</li>)}</ul></details>}{findings.missing.length > 0 && <details className="research-context"><summary>Осталось заполнить · {findings.missing.length}</summary><ul className="mt-2 list-disc space-y-2 pl-4 text-xs leading-5">{findings.missing.map(s => <li key={s}>{s}</li>)}</ul></details>}{!findings.missing.length && !findings.stops.length && !findings.risks.length && <p className="research-hint">Все проверки заполнены. По введённым фактам риски не отмечены.</p>}</div>
      </div>
      <div className="mt-5 border-t pt-5"><label htmlFor={inputId + "-comment"} className="mb-2 block text-sm font-medium">Вывод менеджера *</label><Textarea id={inputId + "-comment"} data-check-error={!a.comment.trim() ? "Общий комментарий менеджера" : undefined} value={a.comment} onChange={e => set("comment", e.target.value)} className="min-h-24" placeholder="Какие наблюдения есть по нише? Что привлекает или настораживает? Есть ли интересные модели ниже топ-10 с заметной выручкой? Укажите их артикулы и объясните, чем они интересны." /></div>
      <div className="research-finish"><p className="research-hint" role="status">{findings.complete ? "Поля анализа заполнены. Сохраните работу; решение выбирается в статусе запроса вверху карточки." : "Сохраните заполненные данные. К этому разбору можно вернуться из чистовика."} Статус «Кандидат в закуп» подтверждает владелец.</p>{passed && <span className="research-count"><Check className="size-4" />Можно переходить к фабрикам</span>}</div>
    </ResearchBlock>
  </div>;
}
