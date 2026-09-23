"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HeaderHelp, QueryPagination, QueryTable } from "./query-table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { fmt, prettyMonth, type SummaryRow } from "@/lib/market-types";
import { summarizeSubjectDemand } from "@/lib/subject-demand";
import type { SourcePeriods } from "@/lib/screener";

export type SubjectQueriesProps = { rows: SummaryRow[]; periods: SourcePeriods; loading: boolean; error: string; available: boolean; onRetry: () => void; selectedQuery?: string };
export function SubjectQueries({ rows, periods, loading, error, available, onRetry, selectedQuery }: SubjectQueriesProps) {
  const [mode, setMode] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => [...rows].sort((a, b) => (b.frequency ?? -Infinity) - (a.frequency ?? -Infinity)), [rows]);
  const demand = useMemo(() => summarizeSubjectDemand(rows), [rows]);
  const filtered = (mode === "top" ? sorted.slice(0, 10) : sorted).filter((row) => row.query.toLocaleLowerCase("ru").includes(search.trim().toLocaleLowerCase("ru")));
  const pageSize = 25;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
  if (!available) return <p className="text-sm text-muted-foreground">Для выбранного месяца ещё нет рассчитанного свода. Материалы кандидата доступны ниже.</p>;
  if (loading) return <p role="status" className="py-6 text-sm text-muted-foreground">Загружаем запросы предмета…</p>;
  if (error) return <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700">Не удалось загрузить запросы.<Button variant="outline" size="sm" onClick={onRetry}>Повторить</Button></div>;
  const metrics = [
    { label: "Запросов в выборке", value: demand.total, tone: "", hint: "Все загруженные запросы этого предмета за выбранный период. Поиск и переключатель «Топ-10» не меняют эти количества." },
    { label: "Растут год к году", value: demand.growing, tone: "growing", hint: "Частотность запроса выше, чем в сопоставимом периоде прошлого года. Считаем по исходному значению до округления." },
    { label: "Падают год к году", value: demand.falling, tone: "falling", hint: "Частотность запроса ниже, чем в сопоставимом периоде прошлого года." },
    ...(demand.stable ? [{ label: "Без изменений г/г", value: demand.stable, tone: "", hint: "Частотность не изменилась: исходная динамика ровно 0%." }] : []),
    { label: "Нет сравнения г/г", value: demand.unknown, tone: "", hint: "Динамика год к году отсутствует. Такой запрос не считаем ни растущим, ни падающим; прочерк не означает нулевой спрос." },
  ];
  return <div className="screener-surface subject-demand-surface">
    <TooltipProvider delayDuration={350}><div className="subject-demand-summary" style={{ "--demand-columns": metrics.length } as CSSProperties}>{metrics.map(metric => <div key={metric.label} className={"subject-demand-metric " + metric.tone}><HeaderHelp label={metric.label}>{metric.hint}</HeaderHelp><strong>{fmt(metric.value)}</strong></div>)}</div></TooltipProvider>
    <p className="subject-demand-period">Частотность: {prettyMonth(periods.period)} к {prettyMonth(periods.comparisonPeriod)} · весь загруженный пул предмета</p>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Tabs value={mode} onValueChange={(value) => { setMode(value); setSearch(""); setPage(0); }}><TabsList className="h-10 rounded-xl bg-[#f0f2f5]"><TabsTrigger value="all" className="rounded-lg px-3">Все запросы · {fmt(rows.length)}</TabsTrigger><TabsTrigger value="top" className="rounded-lg px-3">Топ-10</TabsTrigger></TabsList></Tabs>
      <div className="relative min-w-52 flex-1 sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-[#7a838d]" /><Input aria-label="Поиск среди запросов предмета" className="h-10 bg-white pl-9" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Найти запрос…" /></div>
    </div>
    {filtered.length ? <><QueryTable rows={filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize)} compact periods={periods} highlightedQuery={selectedQuery} /><div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#7a838d]"><span>Запросы {fmt(currentPage * pageSize + 1)}–{fmt(Math.min((currentPage + 1) * pageSize, filtered.length))} из {fmt(filtered.length)}</span>{filtered.length > pageSize && <QueryPagination page={currentPage} total={filtered.length} pageSize={pageSize} onChange={setPage} />}</div></> : <p className="rounded-xl border border-[#e2e6eb] p-6 text-center text-sm text-[#7a838d]">{search ? "По этому поиску ничего не найдено." : "В доступном своде нет запросов этого предмета."}</p>}
    <p className="mt-3 text-xs leading-5 text-[#7a838d]">Фильтры скринера здесь не действуют: видны также падающие запросы и прочерки. Топ-10 — по частотности среди загруженных запросов, а не всего рынка. Частотность отражает поисковый интерес, не продажи.</p>
  </div>;
}
