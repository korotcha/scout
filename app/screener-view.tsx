"use client";
import { QueryDecision } from "./query-decision";
import { type QueryList } from "@/lib/query-status";
import { SubjectSettings, type SubjectOption, type SubjectChange } from "./subject-settings";
import { queryKey } from "@/lib/niche-research";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";
import { useScreenerMarks, type ScreeningMark } from "./use-screener-marks";
import { analysisKey, selectWorkflowRows } from "@/lib/workflow-screener";
import { useToday } from "./research-panel";

import { useEffect, useId, useMemo, useState } from "react";
import { ChevronDown, RotateCcw, Search, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyBlock } from "./candidate-workspace";
import { QueryPagination, QueryTable } from "./query-table";
import { analysisFindings, newContent, type Candidate, type CandidateAction } from "@/lib/candidate-workflow";
import { fmt, prettyMonth, type SummaryRow } from "@/lib/market-types";
import { clearNumericFilters, defaultFilters, filterDefinitions, operators, selectScreenerRows, sourceNumber, type FilterOperator, type NumericFilter, type ScreenerState, type SourcePeriods } from "@/lib/screener";

function FilterControl({ definition, value, onChange, compact = false }: {
  compact?: boolean; definition: typeof filterDefinitions[number]; value: NumericFilter; onChange: (filter: NumericFilter) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [input, setInput] = useState(String(value.threshold));
  const number = input.trim() === "" ? NaN : Number(input.replace(",", "."));
  return <Popover open={open} onOpenChange={(next) => { if (next) { setDraft(value); setInput(String(value.threshold)); } setOpen(next); }}>
    <PopoverTrigger asChild><Button type="button" variant="outline" aria-label={`Фильтр: ${definition.label}`} data-filter-enabled={value.enabled} title={value.enabled ? `${definition.label}: ${operators[value.operator]} ${sourceNumber(value.threshold)}${definition.percent ? "%" : ""}` : `${definition.label}: без ограничения`} className={`${compact ? "column-filter-control" : "screener-control"} gap-2 border-border px-3.5 text-sm font-normal shadow-none ${value.enabled ? "bg-[#f9faf8] text-foreground" : "border-dashed bg-card text-muted-foreground"}`}>
      {!compact && definition.label}<span className="tabular-nums">{value.enabled ? `${operators[value.operator]} ${sourceNumber(value.threshold)}${definition.percent ? "%" : ""}` : "Все"}</span><ChevronDown className="size-3.5 text-[#939ba5]" />
    </Button></PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} className="screener-popover screener-filter-editor w-80 max-w-[calc(100vw-2rem)] rounded-2xl border-border bg-card p-4 text-foreground shadow-lg">
      <form onSubmit={(event) => { event.preventDefault(); if (!draft.enabled || Number.isFinite(number)) { onChange({ ...draft, threshold: Number.isFinite(number) ? number : value.threshold }); setOpen(false); } }}>
        <div className="mb-4 flex items-center justify-between gap-3"><label htmlFor={`${id}-enabled`} className="text-sm font-semibold">{definition.label}</label><Switch id={`${id}-enabled`} checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} className="data-[state=checked]:bg-[#20252a]" /></div>
        <div className="grid grid-cols-[7rem_1fr] gap-2"><span className="text-xs text-muted-foreground">Условие</span><label htmlFor={`${id}-threshold`} className="text-xs text-muted-foreground">Значение</label>
          <Select value={draft.operator} onValueChange={(operator) => setDraft({ ...draft, operator: operator as FilterOperator })}><SelectTrigger className="screener-control w-full" aria-label={`Условие: ${definition.label}`}><SelectValue /></SelectTrigger><SelectContent className="screener-select-menu" position="popper">{Object.entries(operators).map(([key, symbol]) => <SelectItem key={key} value={key}>{symbol}</SelectItem>)}</SelectContent></Select>
          <div className="relative min-w-0 flex-1"><Input id={`${id}-threshold`} aria-label={`Порог: ${definition.label}${definition.percent ? ", %" : ""}`} inputMode="decimal" value={input} onChange={(event) => setInput(event.target.value)} className="screener-control bg-white pr-8 tabular-nums" />{definition.percent && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[#9299a2]">%</span>}</div>
        </div>
        <p className="mt-3 text-xs leading-5 text-[#78828d]">{draft.enabled ? "Условия применяются вместе. Запросы с прочерком по этому показателю не проходят фильтр." : "Фильтр отключён. Значения любого знака и прочерки будут доступны."}</p>
        {draft.enabled && !Number.isFinite(number) && <p role="status" className="mt-2 text-xs text-red-700">Введите числовой порог.</p>}
        <Button type="submit" disabled={draft.enabled && !Number.isFinite(number)} className="screener-control screener-primary mt-4 w-full">Применить</Button>
      </form>
    </PopoverContent>
  </Popover>;
}

export function ScreenerView({ rows, loading, candidates, onOpen, onRetry, error, periods, state, onChange, launchPeriod, onChanged, subjects, onSubjectsChanged, list, onListChange, canDecide, onSaved }: {
  canDecide: boolean; onSaved: (candidate: Candidate) => void;
  list: QueryList; onListChange: (list: QueryList) => void;
  launchPeriod: string; onChanged: () => void; subjects: SubjectOption[]; onSubjectsChanged: (changes: SubjectChange[]) => void;
  rows: SummaryRow[]; loading: boolean; candidates: Candidate[]; onOpen: (subject: string, query: string, excluded: boolean, shortlisted: boolean) => void; onRetry: () => void;
  error: string; periods: SourcePeriods; state: ScreenerState; onChange: (state: ScreenerState) => void;
}) {
  const today = useToday();
  const selection = useMemo(() => selectWorkflowRows(rows, candidates, {...state,status:"all"}, today, new Set(subjects.filter(s=>s.excluded).map(s=>s.subject))), [rows, candidates, state, today, subjects]);
  const screening=useScreenerMarks(launchPeriod,onChanged);
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [subjectDialog,setSubjectDialog]=useState<{exclude?:string[]}|null>(null);
  const [statusSaving,setStatusSaving]=useState<string|null>(null),[statusError,setStatusError]=useState("");
  const [bulkSaving,setBulkSaving]=useState(false);
  const busy=screening.busy||statusSaving!==null||bulkSaving;
  const filterScope=JSON.stringify([state.search,state.filters,state.minScore]);
  useEffect(()=>setSelected(new Set()),[filterScope,list]);
  const filtered=selection.rows.filter(row=>list==="all" || screening.marks[queryKey(row.query)]===list);
  const counts={all:selection.rows.length,shortlisted:selection.rows.filter(r=>screening.marks[queryKey(r.query)]==="shortlisted").length,excluded:selection.rows.filter(r=>screening.marks[queryKey(r.query)]==="excluded").length};
  const selectedRows=[...new Map(selection.rows.filter(r=>selected.has(queryKey(r.query))).map(r=>[queryKey(r.query),r])).values()];
  async function mark(status:ScreeningMark|"unmarked"){
    const count=selectedRows.length;
    const selectionSnapshot=new Set(selected);
    if(!count)return;
    setSelected(new Set());
    if(await screening.save(selectedRows,status)){
      onChanged();
      toast.success(status==="shortlisted"?`В чистовике: ${count}`:status==="excluded"?`Исключено: ${count}`:`Не разобрано: ${count}`);
    }else{
      setSelected(selectionSnapshot);
    }
  }
  async function changeStatus(subject:string,query:string,action:CandidateAction,reason:string,quiet=false){
    const key=queryKey(query),record=selection.records.get(analysisKey(subject,query));
    const content=record?.content??newContent("",launchPeriod);
    setStatusSaving(key);setStatusError("");
    try{
      const response=await fetch("/api/candidates",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:record?.id,contextKey:"month:"+launchPeriod,subject,query,revision:record?.revision??0,action,content:{...content,decisionComment:reason||content.decisionComment}})});
      const data=await response.json() as {candidate?:Candidate;error?:string};
      if(!response.ok||!data.candidate)throw new Error(data.error||"Не удалось сохранить статус");
      onSaved(data.candidate);screening.reflect(query,data.candidate.status==="rejected"?"excluded":"shortlisted");
      setSelected(old=>{const next=new Set(old);next.delete(key);return next;});
      if(!quiet)toast.success(action==="nominate"?"Добавлено в «Кандидаты + юнит»":"Статус сохранён");return true;
    }catch(e){setStatusError(e instanceof Error?e.message:"Не удалось сохранить статус");return false;}
    finally{setStatusSaving(null);}
  }
  const bulkBlockers=selectedRows.flatMap(row=>{const record=selection.records.get(analysisKey(row.subject,row.query));const f=record?analysisFindings(record.content.analysis):null;return f?[...f.stops,...f.missing].map(issue=>`${row.query}: ${issue}`):[`${row.query}: заполните анализ`];});
  async function applyBulk(action:CandidateAction,reason:string){
    if(busy)return false;setBulkSaving(true);
    try{for(const row of selectedRows){if(!await changeStatus(row.subject,row.query,action,reason,true))return false;}return true;}
    finally{setBulkSaving(false);}
  }
  const pageSize = 50;
  const page = Math.min(state.page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
  const activeCount = filterDefinitions.filter(({ key }) => state.filters[key].enabled).length;
  const patch = (update: Partial<ScreenerState>) => onChange({ ...state, page: 0, ...update });
  const resetFilters = () => {
    onListChange("all");
    patch({
      search: "",
      filters: clearNumericFilters(state.filters),
      status: "all",
      minScore: null,
      sortByScore: false,
      sort: "frequency",
      direction: "desc",
    });
  };
  const renderFilter = (key: typeof filterDefinitions[number]["key"]) => <FilterControl compact definition={filterDefinitions.find(d => d.key === key)!} value={state.filters[key]} onChange={value => patch({ filters: { ...state.filters, [key]: value } })} />;
  return <main className="screener-surface">
    <div className="screener-heading">
      <div><h1 className="screener-title">Поиск ниш</h1><p className="screener-subtitle">WB · {prettyMonth(periods.period)} к {prettyMonth(periods.comparisonPeriod)} · свод запросов</p></div>
      <div className="screener-heading-actions">
        <Button type="button" className="screener-control screener-primary screener-action-button shadow-none" onClick={() => patch({ filters: defaultFilters(), status: "active", minScore: null, sortByScore: false, sort: "frequency", direction: "desc" })}>Стандартный фильтр</Button>
        <Button type="button" variant="outline" className="screener-control screener-action-button" onClick={resetFilters} disabled={loading || busy}><RotateCcw className="size-3.5" />Сбросить фильтры</Button>
      </div>
    </div>
    <div className="screener-panel">
      <div className="screener-toolbar">
        <div className="screener-search"><Search className="pointer-events-none absolute left-0 top-1/2 size-[1.125rem] -translate-y-1/2 text-muted-foreground" /><Input aria-label="Поиск в скринере" placeholder="Запрос или предмет…" value={state.search} onChange={(event) => patch({ search: event.target.value })} className="screener-control" />{state.search && <button type="button" className="absolute right-0 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted" onClick={() => patch({ search: "" })} aria-label="Очистить поиск"><X className="size-4" /></button>}</div>
        <Button type="button" variant="outline" className="screener-control screener-subject-button shrink-0" disabled={loading||busy} onClick={()=>setSubjectDialog({})}>Предметы <span className="text-muted-foreground">{subjects.filter(s=>s.excluded).length} скрыто</span></Button>
      </div>
    </div>
    <div className="screening-list-bar"><ToggleGroup type="single" value={list} onValueChange={v=>{if(v){onListChange(v as QueryList);patch({page:0,...(v!=="all"?{filters:clearNumericFilters(state.filters),minScore:null}:{})});}}} disabled={busy} className="screening-tabs" aria-label="Списки первичного отбора">
      <ToggleGroupItem value="all" data-list="all">Все <span>{fmt(counts.all)}</span></ToggleGroupItem>
      <ToggleGroupItem value="shortlisted" data-list="shortlisted">Чистовик <span>{fmt(counts.shortlisted)}</span></ToggleGroupItem>
      <ToggleGroupItem value="excluded" data-list="excluded">Исключённые <span>{fmt(counts.excluded)}</span></ToggleGroupItem>
    </ToggleGroup><span className="text-xs text-muted-foreground">В выбранном месяце · с текущими фильтрами</span></div>
    <div className="screening-bulk-bar" aria-busy={busy}>
      <div className="flex flex-wrap items-center gap-2">
        {list!=="shortlisted"&&<Button size="sm" className="screening-shortlist-button" disabled={!selectedRows.length||busy||screening.loading||!!screening.error} onClick={()=>void mark("shortlisted")}>{list==="excluded"?"В чистовик":"В чистовик"}</Button>}
        {list==="shortlisted"&&<><QueryDecision actionTrigger={{value:"candidate",label:"Кандидат в закуп"}} status="shortlisted" query={`Выбрано запросов: ${selectedRows.length}`} canDecide={canDecide} saving={bulkSaving} disabled={!selectedRows.length||busy||!canDecide||screening.loading||!!screening.error} blockers={bulkBlockers} error={statusError} onClearError={()=>setStatusError("")} onApply={applyBulk}/><QueryDecision actionTrigger={{value:"deferred",label:"Отложить"}} status="shortlisted" query={`Выбрано запросов: ${selectedRows.length}`} canDecide={canDecide} saving={bulkSaving} disabled={!selectedRows.length||busy||screening.loading||!!screening.error} blockers={[]} error={statusError} onClearError={()=>setStatusError("")} onApply={applyBulk}/></>}
        <Button size="sm" variant="outline" disabled={!selectedRows.length||busy||screening.loading||!!screening.error} onClick={()=>void mark("unmarked")}>Не разобрано</Button>
        {list!=="excluded"&&<Button size="sm" variant="outline" className="screening-exclude-button" disabled={!selectedRows.length||busy||screening.loading||!!screening.error} onClick={()=>void mark("excluded")}>Исключить запрос</Button>}
        {list!=="shortlisted"&&<Button size="sm" variant="outline" disabled={!selectedRows.length||busy||screening.loading||!!screening.error} onClick={()=>setSubjectDialog({exclude:[...new Set(selectedRows.map(r=>r.subject))]})}>Скрыть предмет</Button>}
      </div>
    </div>
    {screening.error&&<div role="alert" className="screening-error">{screening.error}<Button size="sm" variant="outline" onClick={screening.retry} disabled={screening.busy}>Повторить загрузку</Button></div>}
    {error ? <EmptyBlock title="Свод недоступен" copy={error}><Button onClick={onRetry}>Повторить загрузку</Button></EmptyBlock> : loading || screening.loading ? <div role="status" className="rounded-2xl border bg-white p-12 text-center text-muted-foreground">Загружаем свод и сохранённые разборы…</div> : <>
      <QueryTable selection={{selected,scopeRows:filtered,disabled:busy||screening.loading||!!screening.error,onToggle:(row,checked)=>setSelected(old=>{const next=new Set(old);if(checked)next.add(queryKey(row.query));else next.delete(queryKey(row.query));return next;}),onPage:checked=>setSelected(old=>{const next=new Set(old);for(const row of filtered){if(checked)next.add(queryKey(row.query));else next.delete(queryKey(row.query));}return next;})}} rowMark={row=>screening.marks[queryKey(row.query)]} renderFilter={renderFilter} rows={filtered.slice(page * pageSize, (page + 1) * pageSize)} periods={periods} onOpen={(subject,query)=>onOpen(subject,query,screening.marks[queryKey(query)]==="excluded",screening.marks[queryKey(query)]==="shortlisted")}
        sort={state.sortByScore ? undefined : { key: state.sort, direction: state.direction }} onSort={(key) => patch({ sort: key, sortByScore: false, direction: state.sort === key && state.direction === "desc" ? "asc" : "desc" })}
        scoreSort={state.sortByScore ? state.direction : undefined} onScoreSort={() => patch({sortByScore:true, direction: state.sortByScore && state.direction === "desc" ? "asc" : "desc"})}
        renderScore={(subject, query) => { const score = selection.scores.get(analysisKey(subject, query)); return score ? <span className={"research-score " + score.tone} title={score.complete ? "Оценка разбора; подробности внутри" : "Предварительно: анализ не завершён"}>{score.total}{!score.complete && <small>*</small>}</span> : <span className="research-score neutral" title="Запрос ещё не разобран">—</span>; }}
        scoreFilter={<Select value={state.minScore == null ? "off" : String(state.minScore)} onValueChange={value => patch({minScore:value === "off" ? null : Number(value)})}><SelectTrigger className="column-filter-control" data-filter-enabled={state.minScore != null} aria-label="Минимальный общий балл"><SelectValue /></SelectTrigger><SelectContent className="screener-select-menu" position="popper" align="start"><SelectItem value="off">Все баллы</SelectItem><SelectItem value="0">Завершённые</SelectItem><SelectItem value="40">От 40</SelectItem><SelectItem value="70">От 70</SelectItem><SelectItem value="80">От 80</SelectItem></SelectContent></Select>}
        />
      {!filtered.length && <div className="rounded-b-2xl border border-t-0 bg-white p-8 text-center"><p className="text-sm text-muted-foreground">Нет запросов с такими условиями.</p><Button variant="ghost" className="mt-2" onClick={() => patch({filters:clearNumericFilters(state.filters), minScore:null, status:"all", search:""})}>Сбросить все фильтры</Button></div>}
      <div className="screener-footer flex flex-wrap items-center justify-between gap-4 text-[#7a838d]"><div className="flex flex-wrap items-center gap-x-5 gap-y-2"><span aria-live="polite">{filtered.length ? `Показано ${fmt(page * pageSize + 1)}–${fmt(Math.min((page + 1) * pageSize, filtered.length))} из ${fmt(filtered.length)} запросов` : "0 запросов"}</span><Button type="button" variant="ghost" size="sm" className="h-[1.875rem] text-xs" onClick={() => patch({ filters: clearNumericFilters(state.filters), minScore: null })} disabled={!activeCount && state.minScore == null}>Показать всё</Button></div><QueryPagination page={page} total={filtered.length} pageSize={pageSize} onChange={(next) => patch({ page: next })} /></div>
    </>}
    <p className="screener-note">Скринер только распределяет запросы по спискам: «Все», «Чистовик» и «Исключённые». Рабочий статус и ход анализа назначаются уже внутри карточки запроса в «Чистовике».</p>
    {subjectDialog&&<SubjectSettings subjects={subjects} exclude={subjectDialog.exclude} onClose={()=>setSubjectDialog(null)} onApplied={changes=>{onSubjectsChanged(changes);setSelected(new Set());}}/>}
  </main>;
}
