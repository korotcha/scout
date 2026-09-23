"use client";
import { ApiConnections } from "./api-connections";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  Bell,
  Check,
  ChevronRight,
  Database,
  Download,
  FileSpreadsheet,
  FolderOpen,
  History,
  LayoutList,
  Map as MapIcon,
  MessageSquareText,
  Plus,
  Search,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { inspectXlsx, type WorkbookInspection } from "@/lib/inspect-xlsx";
import rawSeed from "./seed-data.json";
import { CandidateWorkspace, EmptyBlock } from "./candidate-workspace";
import { CandidatesList } from "./candidates-list";
import { ScreenerView } from "./screener-view";
import type { QueryList } from "@/lib/query-status";
import { arrangeBubbles } from "./radar-layout";
import { initialScreenerState, type SourcePeriods } from "@/lib/screener";
import { queryKey } from "@/lib/niche-research";
import type { Candidate } from "@/lib/candidate-workflow";
import { prettyMonth, type SubjectRow, type SummaryRow } from "@/lib/market-types";

type View = "screening" | "screener" | "candidates" | "uploads" | "exclusions";
type DisplayMode = "map" | "list";
type SeedData = {
  source: {
    file: string;
    database1Date: string;
    database2Date: string;
    db1Rows: number;
    db2Rows: number;
    summaryRows: number;
    selectedSubjects: number;
    commentedSubjects: number;
  };
  subjects: SubjectRow[];
  allSubjects: Array<{ subject: string; queryCount: number; excluded: boolean }>;
};
type UploadRecord = {
  id: number;
  projectId: number | null;
  role: "db1" | "db2";
  periodDate: string;
  fileName: string;
  sizeBytes: number;
  rowCount: number | null;
  status: string;
  issueCount: number;
  uploadedBy: string;
  createdAt: string;
};
type PendingUpload = {
  key: string;
  file: File;
  inspection: WorkbookInspection;
};
type AnalysisProject = {
  id: number;
  name: string;
  launchMonth?: string | null;
  currentPeriod: string;
  comparisonPeriod: string;
  createdBy: string;
  createdAt: string;
};
type Review = { subject: string; status: string; comment: string };

const seed = rawSeed as SeedData;
const nav: Array<{ id: View; label: string; icon: typeof Database }> = [
  { id: "screening", label: "Карта", icon: MapIcon },
  { id: "screener", label: "Скринер", icon: LayoutList },
  { id: "candidates", label: "Кандидаты + юнит", icon: FolderOpen },
  { id: "uploads", label: "Базы данных", icon: Database },
  { id: "exclusions", label: "Исключения", icon: Ban },
];

const bubbleColors = ["#c9f27b", "#ffd4c2", "#bbd7ff", "#e4d7ff", "#d8e3d5", "#ffe48c"];

function formatInteger(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value * 100)}%`;
}

function percentTone(value: number | null | undefined) {
  if (value == null) return "text-[#6f7b72]";
  if (value > 0) return "text-[#27714f]";
  if (value < 0) return "text-[#b55749]";
  return "text-[#5c685f]";
}

function dateLabel(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

const monthNames = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

function shiftMonth(monthKey: string, offset: number) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return "";
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(monthKey: string) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return "—";
  const [year, month] = monthKey.split("-").map(Number);
  return `${monthNames[month - 1]} ${year}`;
}

function shortMonthLabel(monthKey: string) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return "";
  const [year, month] = monthKey.split("-").map(Number);
  return `${monthNames[month - 1]} ${String(year).slice(-2)}`;
}

function exportDateForMonth(monthKey: string) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return "";
  return `${shiftMonth(monthKey, 1)}-01`;
}

function pendingUploadKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function fileCountLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} файлов`;
  if (last === 1) return `${count} файл`;
  if (last >= 2 && last <= 4) return `${count} файла`;
  return `${count} файлов`;
}

function analysisMonthForUpload(upload: Pick<UploadRecord, "role" | "periodDate">) {
  const [year, month] = upload.periodDate.slice(0, 7).split("-").map(Number);
  const snapshotMonth = `${upload.role === "db2" ? year + 1 : year}-${String(month).padStart(2, "0")}`;
  return shiftMonth(snapshotMonth, -1);
}

function uploadPurpose(role: UploadRecord["role"]) {
  return role === "db1" ? "Срез после месяца" : "Тот же срез год назад";
}

function statusLabel(status: string) {
  return (
    {
      analysis: "В разборе",
      approved: "Одобрено",
      rejected: "Отклонено",
      paused: "Отложено",
    } as Record<string, string>
  )[status] ?? "В разборе";
}

function StatusBadge({ status }: { status: string }) {
  const tones: Record<string, string> = {
    analysis: "border-[#cbdac8] bg-[#f1f7e9] text-[#365b3b]",
    approved: "border-[#bcd7ae] bg-[#e8f5d5] text-[#315a30]",
    rejected: "border-[#edc5bc] bg-[#fff0eb] text-[#98493d]",
    paused: "border-[#e7d7a9] bg-[#fff8df] text-[#755f24]",
  };
  return (
    <Badge variant="outline" className={tones[status] ?? tones.analysis}>
      {statusLabel(status)}
    </Badge>
  );
}

function growthColor(row: SubjectRow, index: number) {
  const top = row.topQueries[0];
  if ((top?.yoyDemand ?? 0) >= 0.5 && (top?.yoyPressure ?? 0) > 0) return bubbleColors[0];
  if ((top?.yoyDemand ?? 0) >= 0.5) return bubbleColors[1];
  if ((top?.yoyPressure ?? 0) > 0) return bubbleColors[2];
  if ((top?.yoyDemand ?? 0) >= 0) return bubbleColors[3];
  return bubbleColors[4 + (index % 2)];
}

function subjectLines(value: string) {
  const words = value.trim().split(/\s+/);
  if (words.length < 2) return words;
  let split = 1, balance = Infinity;
  for (let i = 1; i < words.length; i++) {
    const difference = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (difference < balance) { balance = difference; split = i; }
  }
  return [words.slice(0, split).join(" "), words.slice(split).join(" ")];
}

export function Workbench() {
  const [view, setView] = useState<View>("screening");
  const [search, setSearch] = useState("");
  const [growth, setGrowth] = useState("0");
  const [momentum, setMomentum] = useState("all");
  const [minFrequency, setMinFrequency] = useState("1000");
  const [positivePressureOnly, setPositivePressureOnly] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("map");
  const [visible, setVisible] = useState(35);
  const [selected, setSelected] = useState<SubjectRow | null>(null);
  const [sheetSubject, setSheetSubject] = useState<SubjectRow | null>(null);
  const [sheetQuery, setSheetQuery] = useState("");
  const [sheetExcluded, setSheetExcluded] = useState(false);
  const [sheetShortlisted, setSheetShortlisted] = useState(false);
  const [sheetCandidateId, setSheetCandidateId] = useState<string | null>(null);
  const [queryPicker, setQueryPicker] = useState("");
  const [pickerSearch, setPickerSearch] = useState("");
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [exclusionOverrides, setExclusionOverrides] = useState<Record<string, boolean>>({});
  const [exclusionsLoading, setExclusionsLoading] = useState(true);
  const [exclusionsError, setExclusionsError] = useState("");
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [projects, setProjects] = useState<AnalysisProject[]>([]);
  const [launchMonth, setLaunchMonth] = useState("2026-10");
  const contextKey = `month:${launchMonth}`;
  const [candidateState, setCandidateState] = useState<{ context: string; rows: Candidate[]; loading: boolean; error: string; canDecide: boolean }>({ context: contextKey, rows: [], loading: true, error: "", canDecide: false });
  const [candidateReload, setCandidateReload] = useState(0);
  const [editorDirty, setEditorDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const [summaryRows, setSummaryRows] = useState<SummaryRow[]>([]);
  const [summaryPeriods, setSummaryPeriods] = useState<SourcePeriods>({ period: "2025-10", comparisonPeriod: "2024-10" });
  const [screenerState, setScreenerState] = useState(initialScreenerState);
  const [screenerList, setScreenerList] = useState<QueryList>("all");
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [summaryReload, setSummaryReload] = useState(0);
  const currentProject = projects.find((p) => (p.launchMonth || p.currentPeriod) === launchMonth);
  const sourceAvailable = currentProject ? currentProject.currentPeriod === "2025-10" && currentProject.comparisonPeriod === "2024-10" : launchMonth === "2026-10";
  const months = [...new Set(["2026-10", launchMonth, ...projects.map((p) => p.launchMonth || p.currentPeriod)])].sort();
  const activeCandidates = candidateState.context === contextKey ? candidateState.rows : [];
  const candidatesLoading = candidateState.loading || candidateState.context !== contextKey;
  const changeView = (next: View) => navigate(() => { setSheetSubject(null); setEditorDirty(false); setView(next); });
  function navigate(action: () => void) { if (editorDirty) setPendingNavigation(() => action); else action(); }
  const dirtyChanged = useCallback((dirty: boolean) => setEditorDirty(dirty), []);
  useEffect(() => {
    try { const saved = localStorage.getItem("mr-launch-month"); if (saved && /^\d{4}-(0[1-9]|1[0-2])$/.test(saved)) setLaunchMonth(saved); } catch { /* preference storage is optional */ }
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    setCandidateState({ context: contextKey, rows: [], loading: true, error: "", canDecide: false });
    (async () => {
      const loaded: Candidate[] = []; let offset: number | null = 0; let canDecide = false;
      while (offset != null) {
        const r = await fetch(`/api/candidates?context=${encodeURIComponent(contextKey)}&offset=${offset}`, { signal: abort.signal });
        const body = await r.json() as { candidates?: Candidate[]; canDecide?: boolean; error?: string; nextOffset?: number | null };
        if (!r.ok || !Array.isArray(body.candidates)) throw new Error(body.error || "Не удалось загрузить кандидатов");
        loaded.push(...body.candidates); canDecide = Boolean(body.canDecide);
        const next = body.nextOffset ?? null;
        if (next != null && next <= offset) throw new Error("Не удалось прочитать следующую страницу кандидатов");
        offset = next;
      }
      if (!abort.signal.aborted) setCandidateState({ context: contextKey, rows: [...new Map(loaded.map(c => [c.id, c])).values()], loading: false, error: "", canDecide });
    })().catch((e) => { if (!abort.signal.aborted) setCandidateState({ context: contextKey, rows: [], loading: false, error: e.message, canDecide: false }); });
    return () => abort.abort();
  }, [contextKey, candidateReload]);
  useEffect(() => {
    const abort = new AbortController(); setSummaryLoading(true); setSummaryError("");
    fetch("/source-summary.json", { signal: abort.signal }).then(async (r) => {
      if (!r.ok) throw new Error("Не удалось загрузить исходный свод"); const body = await r.json() as SourcePeriods & { rows: SummaryRow[] };
      if (!Array.isArray(body.rows) || !body.period || !body.comparisonPeriod) throw new Error("Не удалось прочитать свод и периоды сравнения");
      if (!abort.signal.aborted) { setSummaryRows(body.rows); setSummaryPeriods({ period: body.period, comparisonPeriod: body.comparisonPeriod }); setSummaryLoading(false); }
    }).catch((e) => { if (!abort.signal.aborted) { setSummaryError(e.message); setSummaryLoading(false); } });
    return () => abort.abort();
  }, [summaryReload]);
  function openSubject(name: string, query = "", candidateId: string | null = null, excluded = false, shortlisted = false) {
    if (candidatesLoading || candidateState.error) { toast.error("Сначала дождитесь загрузки кандидатов или повторите её — это защитит сохранённую работу от дублирования."); return; }
    if (!query && !candidateId) { setQueryPicker(name); setPickerSearch(""); return; }
    const existing = query ? activeCandidates.find(c => queryKey(c.query) === queryKey(query)) : undefined;
    if (existing && existing.subject !== name) { openSubject(existing.subject, existing.query, existing.id); return; }
    setQueryPicker(""); setSheetQuery(query); setSheetCandidateId(candidateId); setSheetExcluded(excluded); setSheetShortlisted(shortlisted);
    const known = sourceAvailable ? seed.subjects.find((s) => s.subject === name) : null;
    const queries = sourceAvailable ? summaryRows.filter((r) => r.subject === name).sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0)) : [];
    const median = (values: Array<number | null>) => { const a = values.filter((v): v is number => v != null).sort((a, b) => a - b); return !a.length ? null : (a[Math.floor(a.length / 2)] + a[Math.floor((a.length - 1) / 2)]) / 2; };
    setSheetSubject(known ? { ...known, comment: reviews[name]?.comment ?? known.comment } : { subject: name, comment: "", interestingQueries: "", topRevenueSeason: null, salesVolume: null,
      interestingArticles: "", modelCharacteristics: "", queryCount: queries.length,
      positiveYoyCount: queries.filter((r) => (r.yoyDemand ?? 0) > 0).length,
      positivePressureCount: queries.filter((r) => (r.yoyPressure ?? 0) > 0).length,
      medianYoyDemand: median(queries.map((r) => r.yoyDemand)), medianYoyPressure: median(queries.map((r) => r.yoyPressure)), topQueries: queries.slice(0, 10) });
  }

  async function refreshServerState() {
    setExclusionsLoading(true);
    const [reviewResponse, exclusionResponse, uploadResponse, projectResponse] = await Promise.all([
      fetch("/api/reviews").then((response) => response.json() as Promise<{ reviews?: Review[] }>).catch(() => ({ reviews: [] })),
      fetch("/api/exclusions").then(async response => { const body = await response.json() as { exclusions?: Array<{ subject: string; active: boolean }>; error?: string }; if (!response.ok || !Array.isArray(body.exclusions)) throw new Error(body.error || "Не удалось загрузить исключения"); return { exclusions: body.exclusions, error: "" }; }).catch(() => ({ exclusions: null, error: "Не удалось загрузить исключения. Повторите загрузку." })),
      fetch("/api/uploads").then((response) => response.json() as Promise<{ uploads?: UploadRecord[] }>).catch(() => ({ uploads: [] })),
      fetch("/api/projects").then((response) => response.json() as Promise<{ projects?: AnalysisProject[] }>).catch(() => ({ projects: [] })),
    ]);
    setReviews(Object.fromEntries((reviewResponse.reviews ?? []).map((row: Review) => [row.subject, row])));
    if (exclusionResponse.exclusions) setExclusionOverrides(
      Object.fromEntries(
        (exclusionResponse.exclusions ?? []).map((row: { subject: string; active: boolean }) => [row.subject, row.active]),
      ),
    );
    setExclusionsError(exclusionResponse.error);
    setExclusionsLoading(false);
    setUploads(uploadResponse.uploads ?? []);
    setProjects(projectResponse.projects ?? []);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => void refreshServerState(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const seedExcluded = useMemo(
    () => Object.fromEntries(seed.allSubjects.map((row) => [row.subject, row.excluded])),
    [],
  );
  const isExcluded = (subject: string) => exclusionOverrides[subject] ?? seedExcluded[subject] ?? false;
  const subjectOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of sourceAvailable ? summaryRows : []) counts.set(row.subject, (counts.get(row.subject) ?? 0) + 1);
    const names = new Set([...seed.allSubjects.map(row => row.subject), ...counts.keys(), ...Object.keys(exclusionOverrides), ...activeCandidates.map(row => row.subject)]);
    return [...names].map(subject => ({ subject, count: counts.get(subject) ?? 0, excluded: exclusionOverrides[subject] ?? seedExcluded[subject] ?? false }));
  }, [sourceAvailable, summaryRows, exclusionOverrides, seedExcluded, activeCandidates]);

  const filteredSubjects = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const growthFloor = growth === "all" ? null : Number(growth);
    const momentumFloor = momentum === "all" ? null : Number(momentum);
    const frequencyFloor = Math.max(0, Number(minFrequency.replace(/\s/g, "")) || 0);

    return (sourceAvailable ? seed.subjects : []).filter((row) => {
      const top = row.topQueries[0];
      const matchesText =
        !needle ||
        row.subject.toLowerCase().includes(needle) ||
        row.topQueries.some((item) => item.query.toLowerCase().includes(needle));
      const matchesGrowth = growthFloor == null || (top?.yoyDemand ?? -Infinity) >= growthFloor;
      const matchesMomentum = momentumFloor == null || (top?.mom ?? -Infinity) >= momentumFloor;
      const matchesFrequency = (top?.frequency ?? 0) >= frequencyFloor;
      const matchesPressure = !positivePressureOnly || (top?.yoyPressure ?? -Infinity) > 0;
      const excluded = exclusionOverrides[row.subject] ?? seedExcluded[row.subject] ?? false;
      return matchesText && matchesGrowth && matchesMomentum && matchesFrequency && matchesPressure && !excluded;
    });
  }, [search, growth, momentum, minFrequency, positivePressureOnly, exclusionOverrides, seedExcluded, sourceAvailable]);

  const activeSelected =
    selected && filteredSubjects.some((row) => row.subject === selected.subject)
      ? selected
      : filteredSubjects[0] ?? null;

  return (
    <div className={`market-app min-h-screen text-[#19231c] ${view === "screener" && !sheetSubject ? "screener-page" : "bg-[#f4f6f2]"} ${view === "screening" && !sheetSubject && sourceAvailable ? "radar-page" : ""}`}>
      <AppHeader view={view} setView={changeView} />
      <div className="context-bar">
        <div className="context-selection"><label htmlFor="launch-month-global" className="text-sm font-medium">Месяц запуска</label><Select value={launchMonth} onValueChange={(month) => navigate(() => {
          setSheetSubject(null); setSelected(null); setEditorDirty(false); setLaunchMonth(month);
          setScreenerState((state) => ({ ...state, page: 0 }));
          try { localStorage.setItem("mr-launch-month", month); } catch { /* optional UI preference */ }
        })}><SelectTrigger id="launch-month-global" className="context-month"><SelectValue /></SelectTrigger><SelectContent>{months.map((month) => <SelectItem key={month} value={month}>{prettyMonth(month)}</SelectItem>)}</SelectContent></Select><span className="context-hint">Карта, скринер и юнит-экономика</span></div>
        <p className="context-source">{view === "uploads" ? "Общий архив · просмотр баз не меняет месяц запуска" : sourceAvailable ? "Источник: октябрь 2025 / октябрь 2024 · ваш исходный свод" : "Для месяца ещё не собран свод"}</p>
      </div>

      {!sheetSubject && view === "screening" && sourceAvailable && (
        <RadarView
          rows={filteredSubjects}
          search={search}
          setSearch={setSearch}
          growth={growth}
          setGrowth={setGrowth}
          momentum={momentum}
          setMomentum={setMomentum}
          minFrequency={minFrequency}
          setMinFrequency={setMinFrequency}
          positivePressureOnly={positivePressureOnly}
          setPositivePressureOnly={setPositivePressureOnly}
          displayMode={displayMode}
          setDisplayMode={setDisplayMode}
          visible={visible}
          setVisible={setVisible}
          selected={activeSelected}
          setSelected={setSelected}
          setSheetSubject={(s) => openSubject(s.subject)}
          reviews={Object.fromEntries(activeCandidates.map((c) => [c.subject, { subject: c.subject, status: c.status === "purchased" ? "approved" : c.status === "deferred" ? "paused" : c.status, comment: c.content.analysis.comment }]))}
        />
      )}
      {!sheetSubject && view === "screening" && !sourceAvailable && <div className="mx-auto max-w-4xl px-4 pb-28"><EmptyBlock title={`Для ${prettyMonth(launchMonth)} ещё нет рассчитанного свода`} copy="Загруженные файлы хранятся в общем архиве. Автоматическая сборка новых БД1 и БД2 в свод пока не подключена; данные другого периода здесь не подменяются."><Button variant="outline" onClick={() => changeView("uploads")}>Открыть базы данных</Button></EmptyBlock></div>}
      {!sheetSubject && view === "screener" && <ScreenerView canDecide={candidateState.canDecide} onSaved={candidate=>setCandidateState(s=>s.context===contextKey?{...s,rows:[candidate,...s.rows.filter(c=>c.id!==candidate.id)]}:s)} key={contextKey} list={screenerList} onListChange={setScreenerList} launchPeriod={launchMonth} onChanged={() => setCandidateReload(x => x + 1)} subjects={subjectOptions} onSubjectsChanged={changes => { setExclusionOverrides(prev => ({ ...prev, ...Object.fromEntries(changes.map(s => [s.subject, s.active])) })); setExclusionsError(""); }} rows={sourceAvailable ? summaryRows : []} candidates={activeCandidates} loading={summaryLoading || candidatesLoading || exclusionsLoading} error={candidateState.error || summaryError || exclusionsError} onRetry={() => { setSummaryReload(x => x + 1); setCandidateReload(x => x + 1); void refreshServerState(); }} onOpen={(subject,query,excluded,shortlisted)=>openSubject(subject,query,null,excluded,shortlisted)} periods={summaryPeriods} state={screenerState} onChange={setScreenerState} />}
      {!sheetSubject && view === "candidates" && <CandidatesList contextKey={contextKey} canDecide={candidateState.canDecide} onDirtyChange={dirtyChanged} onSaved={(candidate) => setCandidateState((s) => s.context === contextKey ? ({ ...s, rows: [candidate, ...s.rows.filter((c) => c.id !== candidate.id)] }) : s)} rows={activeCandidates} loading={candidatesLoading} error={candidateState.error} onRetry={() => setCandidateReload((x) => x + 1)} onOpen={(id) => { const c = activeCandidates.find(row => row.id === id); if (c) openSubject(c.subject, c.query, c.id); }} onScreener={() => changeView("screener")} />}
      {view === "uploads" && <UploadsView projects={projects} uploads={uploads} onChanged={refreshServerState} />}
      {view === "exclusions" && (
        exclusionsLoading ? <div role="status" className="p-8">Загружаем исключения…</div> : exclusionsError ? <EmptyBlock title="Исключения недоступны" copy={exclusionsError}><Button onClick={()=>void refreshServerState()}>Повторить загрузку</Button></EmptyBlock> : <ExclusionsView
          subjects={subjectOptions}
          isExcluded={isExcluded}
          onChange={(subject, active) =>
            setExclusionOverrides((current) => ({ ...current, [subject]: active }))
          }
        />
      )}

      {sheetSubject && <CandidateWorkspace initialStage={view === "candidates" ? "5" : "0"}
        initialExcluded={sheetExcluded} initialShortlisted={sheetShortlisted}
        key={`${contextKey}-${sheetSubject.subject}-${sheetCandidateId || sheetQuery}`} subject={sheetSubject} query={sheetQuery}
        initial={activeCandidates.find((c) => sheetCandidateId ? c.id === sheetCandidateId : c.subject === sheetSubject.subject && queryKey(c.query) === queryKey(sheetQuery))}
        contextKey={contextKey} period={launchMonth} canDecide={candidateState.canDecide}
        queryData={{ rows: sourceAvailable ? summaryRows.filter((row) => row.subject === sheetSubject.subject) : [], periods: summaryPeriods, loading: summaryLoading, error: summaryError, available: sourceAvailable, onRetry: () => setSummaryReload((x) => x + 1) }}
        onDirtyChange={dirtyChanged}
        onBack={() => navigate(() => { setSheetSubject(null); setEditorDirty(false); })}
        onSaved={(candidate) => setCandidateState((s) => s.context === contextKey ? ({ ...s, rows: [candidate, ...s.rows.filter((c) => c.id !== candidate.id)] }) : s)}
      />}
      <Dialog open={Boolean(queryPicker)} onOpenChange={(open) => { if (!open) setQueryPicker(""); }}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{queryPicker}</DialogTitle><DialogDescription>Выберите поисковый запрос. У каждого — отдельный разбор; весь предмет будет доступен внутри.</DialogDescription></DialogHeader><Input aria-label="Найти запрос для разбора" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder="Найти запрос…" /><div className="max-h-80 space-y-1 overflow-auto">{summaryRows.filter(row => row.subject === queryPicker && row.query.toLocaleLowerCase("ru").includes(pickerSearch.trim().toLocaleLowerCase("ru"))).sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0)).slice(0, 100).map(row => <button key={row.query} className="flex w-full items-center justify-between gap-3 rounded-lg p-3 text-left text-sm hover:bg-muted" onClick={() => openSubject(row.subject, row.query)}><span>{row.query}</span><span className="shrink-0 text-xs text-muted-foreground">{formatInteger(row.frequency)}</span></button>)}{!summaryRows.some(row => row.subject === queryPicker && row.query.toLocaleLowerCase("ru").includes(pickerSearch.trim().toLocaleLowerCase("ru"))) && <p className="p-4 text-sm text-muted-foreground">Подходящих запросов в загруженном своде нет.</p>}{activeCandidates.filter(c => c.subject === queryPicker && !c.query).map(c => <Button key={c.id} variant="outline" className="mt-2 w-full" onClick={() => openSubject(c.subject, "", c.id)}>Открыть прежний разбор предмета</Button>)}</div><p className="text-xs text-muted-foreground">До 100 запросов по частотности; используйте поиск, чтобы найти остальные.</p></DialogContent></Dialog>
      <AlertDialog open={Boolean(pendingNavigation)} onOpenChange={(open) => { if (!open) setPendingNavigation(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Есть несохранённые изменения</AlertDialogTitle><AlertDialogDescription>Сохраните карточку перед переходом, чтобы не потерять вводные и комментарии.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Вернуться и сохранить</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { pendingNavigation?.(); setPendingNavigation(null); }}>Уйти без сохранения</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <Toaster richColors position="bottom-right" />
    </div>
  );
}

function AppHeader({ view, setView }: { view: View; setView: (view: View) => void }) {
  return (
    <header className="app-header flex items-center justify-between">
      <div className="flex items-center gap-7">
        <button className="flex items-center gap-2.5 rounded-md text-left" onClick={() => setView("screening")}>
          <span className="grid size-[1.875rem] place-items-center rounded-md bg-[#374151] text-[0.875rem] font-bold text-white">
            MR
          </span>
          <span className="app-logo hidden sm:inline">Market Radar</span>
        </button>
        <nav className="hidden items-center gap-1 rounded-md border border-[#d1d5db] bg-white p-1 lg:flex" aria-label="Основные разделы">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                aria-current={active ? "page" : undefined}
                className={`flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold ${active ? "bg-[#374151] text-white" : "text-[#616975] hover:bg-[#f3f4f6]"}`}
              >
                <Icon className="size-3.5" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="grid size-[2.125rem] place-items-center rounded-md bg-[#e5e7eb] text-xs font-bold">AK</div>
      </div>
      <nav aria-label="Разделы на небольшом экране" className="fixed inset-x-3 bottom-3 z-30 flex justify-center rounded-md border border-white/10 bg-[#374151]/95 p-1 shadow-none backdrop-blur lg:hidden">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? "page" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-[0.75rem] font-medium ${view === item.id ? "bg-white/14 text-white" : "text-white/70"}`}
            >
              <Icon className="size-3.5" />
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}

function RadarView({
  rows,
  search,
  setSearch,
  growth,
  setGrowth,
  momentum,
  setMomentum,
  minFrequency,
  setMinFrequency,
  positivePressureOnly,
  setPositivePressureOnly,
  displayMode,
  setDisplayMode,
  visible,
  setVisible,
  selected,
  setSelected,
  setSheetSubject,
  reviews,
}: {
  rows: SubjectRow[];
  search: string;
  setSearch: (value: string) => void;
  growth: string;
  setGrowth: (value: string) => void;
  momentum: string;
  setMomentum: (value: string) => void;
  minFrequency: string;
  setMinFrequency: (value: string) => void;
  positivePressureOnly: boolean;
  setPositivePressureOnly: (value: boolean) => void;
  displayMode: DisplayMode;
  setDisplayMode: (value: DisplayMode) => void;
  visible: number;
  setVisible: (value: number) => void;
  selected: SubjectRow | null;
  setSelected: (row: SubjectRow) => void;
  setSheetSubject: (row: SubjectRow) => void;
  reviews: Record<string, Review>;
}) {
  return (
    <main className="radar-workspace">
      <FilterPanel
        search={search}
        setSearch={setSearch}
        growth={growth}
        setGrowth={setGrowth}
        momentum={momentum}
        setMomentum={setMomentum}
        minFrequency={minFrequency}
        setMinFrequency={setMinFrequency}
        positivePressureOnly={positivePressureOnly}
        setPositivePressureOnly={setPositivePressureOnly}
      />

      <section className="radar-canvas-panel">
        <div className="radar-heading flex items-start justify-between gap-3">
          <div>
            <h1 className="radar-title">Карта возможностей</h1>
            <p className="radar-subtitle">
              {formatInteger(rows.length)} предметов в выборке · выберите круг для разбора
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-3 text-[0.6875rem] text-[#68736b] 2xl:flex">
              <span className="flex items-center gap-1.5">
                <i className="size-2 rounded-full bg-[#c9f27b]" /> спрос и давление растут
              </span>
              <span className="flex items-center gap-1.5">
                <i className="size-2 rounded-full bg-[#ffd4c2]" /> быстрый рост
              </span>
            </div>
            <div className="flex rounded-lg bg-[#f1f4ef] p-0.5">
              <button
                onClick={() => setDisplayMode("map")}
                className={`grid size-8 place-items-center rounded-md ${displayMode === "map" ? "bg-white text-[#19231c] shadow-sm" : "text-[#78837b]"}`}
                aria-label="Показать карту"
              >
                <MapIcon className="size-4" />
              </button>
              <button
                onClick={() => setDisplayMode("list")}
                className={`grid size-8 place-items-center rounded-md ${displayMode === "list" ? "bg-white text-[#19231c] shadow-sm" : "text-[#78837b]"}`}
                aria-label="Показать список"
              >
                <LayoutList className="size-4" />
              </button>
            </div>
          </div>
        </div>

        {displayMode === "map" ? (
          <OpportunityMap rows={rows.slice(0, 14)} selected={selected} setSelected={setSelected} />
        ) : (
          <OpportunityList
            rows={rows}
            visible={visible}
            setVisible={setVisible}
            setSelected={setSelected}
            setSheetSubject={setSheetSubject}
            reviews={reviews}
          />
        )}
      </section>

      <DetailPanel
        subject={selected}
        review={selected ? reviews[selected.subject] : undefined}
        onOpen={() => selected && setSheetSubject(selected)}
      />
    </main>
  );
}

function FilterPanel({
  search,
  setSearch,
  growth,
  setGrowth,
  momentum,
  setMomentum,
  minFrequency,
  setMinFrequency,
  positivePressureOnly,
  setPositivePressureOnly,
}: {
  search: string;
  setSearch: (value: string) => void;
  growth: string;
  setGrowth: (value: string) => void;
  momentum: string;
  setMomentum: (value: string) => void;
  minFrequency: string;
  setMinFrequency: (value: string) => void;
  positivePressureOnly: boolean;
  setPositivePressureOnly: (value: boolean) => void;
}) {
  return (
    <aside className="radar-filter-panel">
      <div className="mb-4 text-xs font-normal uppercase tracking-[0.08em] text-[#7b877e]">Область поиска</div>

      <div className="mb-[1.125rem]">
        <div className="mb-2 text-[0.8125rem] font-semibold">Источник</div>
        <div className="grid grid-cols-2 gap-2">
          <button className="rounded-[0.6875rem] border border-[#809b86] bg-[#eff7ef] px-2 py-2.5 text-xs font-bold">
            <span className="mr-1.5 inline-block size-2 rounded-full bg-[#a63bff]" />
            WB
          </button>
          <button disabled className="rounded-[0.6875rem] border border-[#e2e6e1] bg-[#fafbfa] px-2 py-2.5 text-xs font-semibold text-[#a0aaa2]">
            Ozon позже
          </button>
        </div>
      </div>

      <div className="mb-[1.125rem]">
        <label className="mb-2 block text-[0.8125rem] font-semibold" htmlFor="subject-search">
          Предмет или запрос
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#89948c]" />
          <Input
            id="subject-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Например, кофемашина"
            className="radar-input pl-9"
          />
        </div>
      </div>

      <div className="mb-[1.125rem]">
        <label className="mb-2 block text-[0.8125rem] font-semibold" htmlFor="frequency-floor">
          Частотность топ-запроса от
        </label>
        <Input
          id="frequency-floor"
          inputMode="numeric"
          value={minFrequency}
          onChange={(event) => setMinFrequency(event.target.value)}
          className="radar-input"
        />
      </div>

      <div className="mb-[1.125rem]">
        <div className="mb-2 text-[0.8125rem] font-semibold">Рост год к году</div>
        <Select value={growth} onValueChange={setGrowth}>
          <SelectTrigger className="radar-input w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="radar-select-menu" position="popper">
            <SelectItem value="all">Любой</SelectItem>
            <SelectItem value="0">Положительный</SelectItem>
            <SelectItem value="0.1">От +10%</SelectItem>
            <SelectItem value="0.25">От +25%</SelectItem>
            <SelectItem value="0.5">От +50%</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mb-[1.125rem]">
        <div className="mb-2 text-[0.8125rem] font-semibold">Рост за 30 дней</div>
        <Select value={momentum} onValueChange={setMomentum}>
          <SelectTrigger className="radar-input w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="radar-select-menu" position="popper">
            <SelectItem value="all">Любой</SelectItem>
            <SelectItem value="0">Положительный</SelectItem>
            <SelectItem value="0.1">От +10%</SelectItem>
            <SelectItem value="0.25">От +25%</SelectItem>
            <SelectItem value="0.5">От +50%</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <label className="mb-3 flex cursor-pointer items-center justify-between gap-3 text-[0.8125rem] leading-5">
        <span>Спрос / артикул растёт</span>
        <Switch checked={positivePressureOnly} onCheckedChange={setPositivePressureOnly} />
      </label>

      <div className="mt-5 rounded-xl bg-[#f3f6f1] p-3 text-[0.6875rem] leading-5 text-[#667169]">
        БД1 {dateLabel(seed.source.database1Date)} сравнивается с БД2 {dateLabel(seed.source.database2Date)}.
      </div>
    </aside>
  );
}

function OpportunityMap({
  rows,
  selected,
  setSelected,
}: {
  rows: SubjectRow[];
  selected: SubjectRow | null;
  setSelected: (row: SubjectRow) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = mapRef.current;
    if (!node) return;
    const measure = () => setBounds((old) => {
      const width = node.clientWidth, height = node.clientHeight;
      return old.width === width && old.height === height ? old : { width, height };
    });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const points = useMemo(() => {
    if (!rows.length) return [];
    const articleLogs = rows.map((row) => Math.log10(Math.max(10, row.topQueries[0]?.articles ?? 10)));
    const minArticles = Math.min(...articleLogs), maxArticles = Math.max(...articleLogs);
    const frequencies = rows.map((row) => Math.sqrt(Math.max(1, row.topQueries[0]?.frequency ?? 1)));
    const minFrequency = Math.min(...frequencies), maxFrequency = Math.max(...frequencies);
    return arrangeBubbles(rows.map((row, index) => {
      const articleRatio = maxArticles === minArticles ? .5 : (articleLogs[index] - minArticles) / (maxArticles - minArticles);
      const growth = Math.max(-.35, Math.min(1.6, row.topQueries[0]?.yoyDemand ?? -.35));
      const frequencyRatio = maxFrequency === minFrequency ? .5 : (frequencies[index] - minFrequency) / (maxFrequency - minFrequency);
      return { row, xRatio: articleRatio, yRatio: 1 - (growth + .35) / 1.95, size: Math.round(84 + frequencyRatio * 36), color: growthColor(row, index) };
    }), bounds.width, bounds.height);
  }, [rows, bounds]);
  return (
    <div ref={mapRef} className="radar-grid" aria-label="Карта предметов по росту спроса и числу артикулов">
      {!rows.length ? <div className="grid h-full place-items-center p-8 text-center"><div><Search className="mx-auto size-7 text-[#94a097]" /><p className="mt-3 text-sm font-semibold">По этим условиям ничего не найдено</p><p className="mt-2 text-xs text-muted-foreground">Измените фильтры, чтобы расширить выборку.</p></div></div> : <>
        <div className="radar-axis radar-axis-y">Рост спроса →</div>
        <div className="radar-axis radar-axis-x">Артикулов по запросу →</div>
        <div className="radar-map-note">Размер круга — частотность · {rows.length} предметов на карте</div>
        <svg className="radar-links" aria-hidden="true">
          {points.map((point) => Math.hypot(point.x - point.anchorX, point.y - point.anchorY) > point.size / 2 + 8 && <g key={point.row.subject}><line x1={point.anchorX} y1={point.anchorY} x2={point.x} y2={point.y} /><circle cx={point.anchorX} cy={point.anchorY} r="2" /></g>)}
        </svg>
        {points.map((point) => {
          const top = point.row.topQueries[0];
          return <button key={point.row.subject} type="button" className="radar-bubble" data-selected={selected?.subject === point.row.subject} aria-pressed={selected?.subject === point.row.subject} onClick={() => setSelected(point.row)} style={{ left: point.x, top: point.y, width: point.size, height: point.size, backgroundColor: point.color }} title={`${point.row.subject}: ${formatPercent(top?.yoyDemand)} г/г, ${formatInteger(top?.articles)} артикулов`}>
            <span className="min-w-0"><strong>{subjectLines(point.row.subject).map((line, index) => <span key={index}>{line}</span>)}</strong><small>{formatPercent(top?.yoyDemand)} г/г</small></span>
          </button>;
        })}
      </>}
    </div>
  );
}

function OpportunityList({
  rows,
  visible,
  setVisible,
  setSelected,
  setSheetSubject,
  reviews,
}: {
  rows: SubjectRow[];
  visible: number;
  setVisible: (value: number) => void;
  setSelected: (row: SubjectRow) => void;
  setSheetSubject: (row: SubjectRow) => void;
  reviews: Record<string, Review>;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#e0e6e0]">
      <div className="radar-list-scroll max-h-[36.25rem] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#f8faf7] hover:bg-[#f8faf7]">
              <TableHead className="pl-4">Предмет</TableHead>
              <TableHead>Главный запрос</TableHead>
              <TableHead className="text-right">Частота</TableHead>
              <TableHead className="text-right">Год к году</TableHead>
              <TableHead className="text-right">Артикулов</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, visible).map((row) => {
              const top = row.topQueries[0];
              const review = reviews[row.subject];
              return (
                <TableRow
                  key={row.subject}
                  className="cursor-pointer hover:bg-[#f5f8f2]"
                  onClick={() => {
                    setSelected(row);
                    setSheetSubject(row);
                  }}
                >
                  <TableCell className="max-w-56 pl-4 font-semibold">
                    <div className="truncate">{row.subject}</div>
                    <div className="mt-1 text-[0.6875rem] font-normal text-[#7a857d]">{formatInteger(row.queryCount)} запросов</div>
                  </TableCell>
                  <TableCell className="max-w-64">
                    <div className="truncate text-[#566159]">{top?.query ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatInteger(top?.frequency)}</TableCell>
                  <TableCell className={`text-right font-semibold tabular-nums ${percentTone(top?.yoyDemand)}`}>
                    {formatPercent(top?.yoyDemand)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatInteger(top?.articles)}</TableCell>
                  <TableCell>
                    <StatusBadge status={review?.status ?? "analysis"} />
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="size-4 text-[#929c94]" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {visible < rows.length && (
        <div className="border-t border-[#e4e9e3] p-3 text-center">
          <Button variant="outline" onClick={() => setVisible(Math.min(rows.length, visible + 35))}>
            Показать ещё {Math.min(35, rows.length - visible)}
          </Button>
        </div>
      )}
    </div>
  );
}

function DetailPanel({
  subject,
  review,
  onOpen,
}: {
  subject: SubjectRow | null;
  review?: Review;
  onOpen: () => void;
}) {
  if (!subject) {
    return (
      <aside className="radar-detail-panel grid place-items-center">
        <p className="text-center text-sm text-[#78837b]">Выберите предмет на карте.</p>
      </aside>
    );
  }

  const top = subject.topQueries[0];
  const growthShare = subject.queryCount ? Math.round((subject.positiveYoyCount / subject.queryCount) * 100) : 0;
  const pressureShare = subject.queryCount ? Math.round((subject.positivePressureCount / subject.queryCount) * 100) : 0;
  const ring = Math.max(0, Math.min(100, growthShare));

  return (
    <aside className="radar-detail-panel">
      <div className="radar-detail-content">
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex rounded-lg bg-[#eaf5d8] px-2.5 py-1.5 text-xs font-bold text-[#31552e]">Предмет WB</span>
        {review && <StatusBadge status={review.status} />}
      </div>
      <h2 className="radar-detail-title">{subject.subject}</h2>
      <p className="mt-1 line-clamp-2 text-xs text-[#778279]">{top?.query ?? "Нет ведущего запроса"}</p>

      <div className="radar-score flex items-center gap-3 border-y border-[#edf0ed]">
        <div
          className="radar-score-ring relative grid shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(#65a33d 0 ${ring}%, #e9eee8 ${ring}%)` }}
        >
          <span className="absolute inset-[0.3125rem] rounded-full bg-white" />
          <b className="relative z-[1] text-base">{growthShare}%</b>
        </div>
        <div>
          <b className="radar-score-label">Запросов растут г/г</b>
          <p className="mt-0.5 text-xs leading-normal text-[#758078]">
            {formatInteger(subject.positiveYoyCount)} из {formatInteger(subject.queryCount)} запросов предмета
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FactMetric label="частота топ-запроса" value={formatInteger(top?.frequency)} />
        <FactMetric label="рост топ-запроса" value={formatPercent(top?.yoyDemand)} tone={percentTone(top?.yoyDemand)} />
        <FactMetric label="артикулов в запросе" value={formatInteger(top?.articles)} />
        <FactMetric label="динамика 30 дней" value={formatPercent(top?.mom)} tone={percentTone(top?.mom)} />
      </div>

      <div className="radar-signals-title text-xs font-normal uppercase tracking-[0.08em] text-[#7b877e]">Что видно сейчас</div>
      <Signal
        icon={(top?.yoyDemand ?? 0) >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
        text={`Главный запрос: ${formatPercent(top?.yoyDemand)} год к году`}
        positive={(top?.yoyDemand ?? 0) >= 0}
      />
      <Signal
        icon={<Sparkles className="size-4" />}
        text={`${pressureShare}% запросов: спрос на артикул растёт`}
        positive={pressureShare >= 50}
      />
      <Signal
        icon={<ArrowUpRight className="size-4" />}
        text={`Медиана по предмету: ${formatPercent(subject.medianYoyDemand)} г/г`}
        positive={(subject.medianYoyDemand ?? 0) >= 0}
      />

      {subject.comment && (
        <div className="radar-comment rounded-xl bg-[#f5f7f4]">
          <div className="flex items-center gap-2 text-[0.6875rem] font-semibold text-[#657067]">
            <MessageSquareText className="size-3.5" />
            Ваш старый комментарий
          </div>
          <p className="mt-1 text-xs leading-4 text-[#4f5a52]">{subject.comment}</p>
        </div>
      )}
      </div>
      <div className="radar-detail-footer">
      <button
        onClick={onOpen}
        className="radar-main-action w-full rounded-xl bg-[#19231c] text-white hover:bg-[#26342a]"
      >
        Выбрать запрос для разбора
      </button>
      </div>
    </aside>
  );
}

function FactMetric({ label, value, tone = "text-[#19231c]" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="radar-metric rounded-xl bg-[#f5f7f4]">
      <b className={`block tabular-nums ${tone}`}>{value}</b>
      <span className="block text-[#768178]">{label}</span>
    </div>
  );
}

function Signal({ icon, text, positive }: { icon: React.ReactNode; text: string; positive: boolean }) {
  return (
    <div className="radar-signal flex gap-2.5 border-b border-[#edf0ed]">
      <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${positive ? "bg-[#eef5e7] text-[#3a7044]" : "bg-[#fff0eb] text-[#a65749]"}`}>
        {icon}
      </span>
      <span>{text}</span>
    </div>
  );
}

function SubjectSheet({
  subject,
  review,
  onOpenChange,
  onSaved,
}: {
  subject: SubjectRow | null;
  review?: Review;
  onOpenChange: (open: boolean) => void;
  onSaved: (review: Review) => void;
}) {
  const [status, setStatus] = useState(review?.status ?? "analysis");
  const [comment, setComment] = useState(review?.comment ?? subject?.comment ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!subject) return;
    setSaving(true);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: subject.subject, status, comment }),
      });
      if (!response.ok) throw new Error("Не удалось сохранить решение");
      const payload = await response.json() as { review: Review };
      toast.success("Решение сохранено");
      onSaved(payload.review);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить решение");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={Boolean(subject)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto border-[#dfe5df] bg-[#fbfcfa] p-0 sm:max-w-3xl">
        {subject && (
          <>
            <SheetHeader className="border-b border-[#dfe5df] bg-white px-6 py-5">
              <div className="pr-10">
                <SheetTitle className="text-xl tracking-[-0.03em]">{subject.subject}</SheetTitle>
                <SheetDescription className="mt-1">
                  Комплексный разбор предмета и его поисковых запросов
                </SheetDescription>
              </div>
            </SheetHeader>
            <div className="space-y-6 p-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SmallMetric label="Запросов" value={formatInteger(subject.queryCount)} />
                <SmallMetric label="Растут г/г" value={formatInteger(subject.positiveYoyCount)} />
                <SmallMetric label="Медиана спроса" value={formatPercent(subject.medianYoyDemand)} tone={percentTone(subject.medianYoyDemand)} />
                <SmallMetric label="Медиана спрос/арт." value={formatPercent(subject.medianYoyPressure)} tone={percentTone(subject.medianYoyPressure)} />
              </div>

              <section>
                <div className="mb-3">
                  <h3 className="font-semibold">Ведущие запросы</h3>
                  <p className="mt-1 text-sm text-[#707b73]">Топ-10 по текущей частотности</p>
                </div>
                <div className="overflow-hidden rounded-xl border border-[#dfe5df] bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-[#f7f9f6] hover:bg-[#f7f9f6]">
                        <TableHead>Запрос</TableHead>
                        <TableHead className="text-right">Частота</TableHead>
                        <TableHead className="text-right">Г/г</TableHead>
                        <TableHead className="text-right">Спрос/арт.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subject.topQueries.map((row) => (
                        <TableRow key={row.query}>
                          <TableCell className="max-w-80">
                            <div className="truncate">{row.query}</div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatInteger(row.frequency)}</TableCell>
                          <TableCell className={`text-right tabular-nums ${percentTone(row.yoyDemand)}`}>
                            {formatPercent(row.yoyDemand)}
                          </TableCell>
                          <TableCell className={`text-right tabular-nums ${percentTone(row.yoyPressure)}`}>
                            {formatPercent(row.yoyPressure)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-3 flex gap-2 rounded-xl border border-[#d8e5d3] bg-[#f0f7ea] p-3 text-sm leading-6 text-[#36513d]">
                  <AlertTriangle className="mt-1 size-4 shrink-0" />
                  <span>
                    «Спрос / артикул» — быстрый прокси по всем карточкам запроса. Он не равен росту активных продавцов и требует подтверждения на следующем этапе.
                  </span>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="font-semibold">Решение по предмету</h3>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-full bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="analysis">В разборе</SelectItem>
                    <SelectItem value="approved">Одобрено для углубления</SelectItem>
                    <SelectItem value="paused">Отложено</SelectItem>
                    <SelectItem value="rejected">Отклонено</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={6}
                  placeholder="Обоснование решения, риски и что нужно проверить дальше"
                  className="bg-white"
                />
                <div className="flex justify-end">
                  <Button onClick={save} disabled={saving} className="bg-[#19231c] hover:bg-[#26342a]">
                    {saving ? "Сохраняю…" : "Сохранить решение"}
                  </Button>
                </div>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SmallMetric({ label, value, tone = "text-[#19231c]" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-[#dfe5df] bg-white px-3 py-3">
      <div className="text-xs text-[#707b73]">{label}</div>
      <div className={`mt-1 font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function PageIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="mb-5">
      <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[#7b877e]">{eyebrow}</div>
      <h1 className="mt-2 text-[1.625rem] font-bold tracking-[-0.04em]">{title}</h1>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6e7971]">{copy}</p>
    </div>
  );
}

function UploadsView({
  projects,
  uploads,
  onChanged,
}: {
  projects: AnalysisProject[];
  uploads: UploadRecord[];
  onChanged: () => Promise<void>;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [settingsTab, setSettingsTab] = useState("uploads");
  const activeProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;
  const projectUploads = activeProject ? uploads.filter((upload) => upload.projectId === activeProject.id) : [];
  const seedMonth = analysisMonthForUpload({ role: "db1", periodDate: seed.source.database1Date });

  function projectStatus(projectId: number) {
    const files = uploads.filter((upload) => upload.projectId === projectId);
    if (files.some((upload) => upload.role === "db1") && files.some((upload) => upload.role === "db2")) return "ready";
    if (files.length) return "partial";
    return "empty";
  }

  return (
    <main className="workspace-page database-page">
      <div className="mb-5 flex gap-2"><Button variant={settingsTab==="uploads"?"default":"outline"} onClick={()=>setSettingsTab("uploads")}>Загрузки по месяцам</Button><Button variant={settingsTab==="api"?"default":"outline"} onClick={()=>setSettingsTab("api")}>API и подключения</Button></div>
      {settingsTab==="api"?<ApiConnections/>:<>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageIntro
          eyebrow="Накопительная история"
          title="Базы данных"
          copy="Общий архив по месяцам. Здесь можно открыть любой проект и исправить загрузки — месяц запуска в аналитике не изменится."
        />
        <CreateProjectDialog
          onCreated={(projectId) => setSelectedProjectId(projectId)}
          onChanged={onChanged}
        />
      </div>

      {projects.length > 0 && (
        <section className="overflow-hidden rounded-[1.25rem] border border-[#dfe5df] bg-white">
          <div className="scrollbar-thin flex gap-2 overflow-x-auto p-3">
            {projects.map((project) => {
              const status = projectStatus(project.id);
              const active = project.id === activeProject?.id;
              return (
                <button
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id)}
                  className={`flex min-w-[8.75rem] items-center gap-2 rounded-xl border px-3 py-2.5 text-left ${active ? "border-[#315e45] bg-[#eff7ef] text-[#203d2b]" : "border-[#e0e5df] bg-white text-[#59645c] hover:bg-[#f8faf7]"}`}
                >
                  <span className={`size-2 shrink-0 rounded-full ${status === "ready" ? "bg-[#6da047]" : status === "partial" ? "bg-[#d7a940]" : "bg-[#d7ddd7]"}`} />
                  <span className="min-w-0 truncate text-[0.8125rem] font-semibold">{project.name}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {activeProject ? (
        <section className="mt-5">
          <div className="mb-4">
            <h2 className="text-xl font-bold tracking-[-0.03em]">{activeProject.name}</h2>
            <p className="mt-1 text-sm text-[#707b73]">
              Нужны выгрузки на {dateLabel(exportDateForMonth(activeProject.currentPeriod))} и {dateLabel(exportDateForMonth(activeProject.comparisonPeriod))}.
            </p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <UploadSlot
              projectId={activeProject.id}
              role="db1"
              period={exportDateForMonth(activeProject.currentPeriod)}
              title="Текущий период"
              technicalLabel="База 1"
              description={monthLabel(activeProject.currentPeriod)}
              uploads={projectUploads.filter((upload) => upload.role === "db1")}
              onChanged={onChanged}
            />
            <UploadSlot
              projectId={activeProject.id}
              role="db2"
              period={exportDateForMonth(activeProject.comparisonPeriod)}
              title="Период для сравнения"
              technicalLabel="База 2"
              description={monthLabel(activeProject.comparisonPeriod)}
              uploads={projectUploads.filter((upload) => upload.role === "db2")}
              onChanged={onChanged}
            />
          </div>
          <p className="mt-3 text-xs leading-5 text-[#707b73]">
            Если обе базы находятся в одном Excel-файле на вкладках «БД 1» и «БД 2», выберите этот файл в обоих блоках.
          </p>
        </section>
      ) : (
        <section className="mt-5 grid min-h-72 place-items-center rounded-[1.25rem] border border-dashed border-[#cad3cb] bg-white p-8 text-center">
          <div>
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#eef5e7] text-[#356248]">
              <FolderOpen className="size-6" />
            </div>
            <h2 className="mt-4 font-semibold">Проектов пока нет</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[#707b73]">
              Нажмите «Создать проект», назовите его и выберите два периода для сравнения.
            </p>
          </div>
        </section>
      )}

      <UploadHistory projects={projects} uploads={uploads} seedMonth={seedMonth} onChanged={onChanged} />
      </>}
    </main>
  );
}

function CreateProjectDialog({
  onCreated,
  onChanged,
}: {
  onCreated: (projectId: number) => void;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Сентябрь 26");
  const [nameEdited, setNameEdited] = useState(false);
  const [launchMonth, setLaunchMonth] = useState("2026-09");
  const [currentPeriod, setCurrentPeriod] = useState("2025-09");
  const [comparisonPeriod, setComparisonPeriod] = useState("2024-09");
  const [saving, setSaving] = useState(false);

  async function createProject() {
    setSaving(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, launchMonth, currentPeriod, comparisonPeriod }),
      });
      const payload = await response.json() as { project?: AnalysisProject; error?: string };
      if (!response.ok || !payload.project) throw new Error(payload.error || "Не удалось создать проект");
      await onChanged();
      onCreated(payload.project.id);
      setOpen(false);
      toast.success(`Проект «${payload.project.name}» создан`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось создать проект");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-11 shrink-0 bg-[#1f5e43] px-4 text-white hover:bg-[#194e37]">
          <Plus className="size-4" />
          Создать проект
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl border-[#dfe5df] bg-white sm:max-w-[30rem]">
        <DialogHeader>
          <DialogTitle className="text-xl tracking-[-0.03em]">Новый проект анализа</DialogTitle>
          <DialogDescription>Месяц запуска и два исторических периода, на которые опирается анализ.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label htmlFor="project-launch-month" className="mb-2 block text-sm font-semibold">Месяц запуска</label>
            <Input id="project-launch-month" type="month" value={launchMonth} className="h-11" onChange={(e) => {
              const next = e.target.value; setLaunchMonth(next);
              if (!nameEdited && next) setName(shortMonthLabel(next));
              if (next) { setCurrentPeriod(shiftMonth(next, -12)); setComparisonPeriod(shiftMonth(next, -24)); }
            }} />
          </div>
          <div>
            <label htmlFor="project-name" className="mb-2 block text-sm font-semibold">Название проекта</label>
            <Input
              id="project-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setNameEdited(true);
              }}
              placeholder="Например, Сентябрь 26"
              className="h-11 border-[#dce2dc]"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="current-period" className="mb-2 block text-sm font-semibold">Период данных</label>
              <Input
                id="current-period"
                type="month"
                value={currentPeriod}
                onChange={(event) => {
                  const nextPeriod = event.target.value;
                  setCurrentPeriod(nextPeriod);
                }}
                className="h-11 border-[#dce2dc]"
              />
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Выгрузка на {currentPeriod ? dateLabel(exportDateForMonth(currentPeriod)) : "—"}</p>
            </div>
            <div>
              <label htmlFor="comparison-period" className="mb-2 block text-sm font-semibold">Период сравнения</label>
              <Input
                id="comparison-period"
                type="month"
                value={comparisonPeriod}
                onChange={(event) => setComparisonPeriod(event.target.value)}
                className="h-11 border-[#dce2dc]"
              />
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Выгрузка на {comparisonPeriod ? dateLabel(exportDateForMonth(comparisonPeriod)) : "—"}</p>
            </div>
          </div>
          <p className="text-xs leading-5 text-[#667169]">Сначала предлагаются тот же месяц год и два года назад. Периоды данных можно изменить. Создание проекта не переключает текущий анализ.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <Button
            className="bg-[#1f5e43] text-white hover:bg-[#194e37]"
            disabled={saving || !name.trim() || !launchMonth || !currentPeriod || !comparisonPeriod}
            onClick={() => void createProject()}
          >
            {saving ? "Создаю…" : "Создать проект"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadSlot({
  projectId,
  role,
  period,
  title,
  technicalLabel,
  description,
  uploads,
  onChanged,
}: {
  projectId: number;
  role: "db1" | "db2";
  period: string;
  title: string;
  technicalLabel: string;
  description: string;
  uploads: UploadRecord[];
  onChanged: () => Promise<void>;
}) {
  return (
    <article className="rounded-[1.25rem] border border-[#dfe5df] bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.07em] text-[#7b877e]">{technicalLabel}</div>
          <h3 className="mt-2 text-base font-semibold">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-[#707b73]">{description}</p>
        </div>
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef5e7] text-[#356248]">
          <FileSpreadsheet className="size-5" />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {uploads.map((upload) => (
          <UploadedFileCard key={upload.id} upload={upload} onChanged={onChanged} />
        ))}
      </div>

      <UploadCard
        key={`${projectId}-${role}`}
        projectId={projectId}
        role={role}
        period={period}
        hasExisting={Boolean(uploads.length)}
        onUploaded={onChanged}
      />
    </article>
  );
}

function UploadedFileCard({ upload, onChanged }: { upload: UploadRecord; onChanged: () => Promise<void> }) {
  const [deleting, setDeleting] = useState(false);

  async function deleteUpload() {
    setDeleting(true);
    try {
      const response = await fetch(`/api/uploads?id=${upload.id}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Не удалось удалить файл");
      toast.success("Ошибочная загрузка удалена");
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить файл");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#dfe5df] bg-[#f9faf8] px-3 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{upload.fileName}</div>
        <div className="mt-1 text-xs text-[#6d786f]">
          {formatInteger(upload.rowCount)} строк · {upload.issueCount ? "нужна проверка" : "проверка пройдена"}
        </div>
      </div>
      <a href={`/api/uploads?id=${upload.id}`} download className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-white" aria-label={`Скачать ${upload.fileName}`}><Download className="size-4" /></a>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[#e1e5e0] bg-white px-3 text-xs font-semibold text-[#765850] hover:border-[#e4b9b0] hover:bg-[#fff2ee] hover:text-[#a44e41]"
            aria-label={`Удалить ${upload.fileName}`}
            disabled={deleting}
          >
            <Trash2 className="size-4" />
            {deleting ? "Удаляю…" : "Удалить файл"}
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent className="rounded-2xl border-[#dfe5df] bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить ошибочную загрузку?</AlertDialogTitle>
            <AlertDialogDescription>
              Файл «{upload.fileName}» исчезнет из этого проекта. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Оставить файл</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void deleteUpload()}>
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UploadCard({
  projectId,
  role,
  period,
  hasExisting,
  onUploaded,
}: {
  projectId: number;
  role: "db1" | "db2";
  period: string;
  hasExisting: boolean;
  onUploaded: () => Promise<void>;
}) {
  const [files, setFiles] = useState<PendingUpload[]>([]);
  const [checking, setChecking] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function choose(nextFiles: FileList | null) {
    if (!nextFiles?.length) return;
    const selectedFiles = Array.from(nextFiles).filter((file) => file.name.toLowerCase().endsWith(".xlsx"));
    if (!selectedFiles.length) {
      toast.error("Выберите файлы в формате .xlsx");
      return;
    }
    setChecking(true);
    try {
      const inspected = await Promise.all(
        selectedFiles.map(async (file): Promise<PendingUpload> => {
          try {
            return { key: pendingUploadKey(file), file, inspection: await inspectXlsx(file, role) };
          } catch {
            return {
              key: pendingUploadKey(file),
              file,
              inspection: {
                sheetNames: [],
                selectedSheet: null,
                rowCount: null,
                issues: ["Не удалось прочитать структуру файла"],
              },
            };
          }
        }),
      );
      setFiles((current) => {
        const existingKeys = new Set(current.map((item) => item.key));
        return [...current, ...inspected.filter((item) => !existingKeys.has(item.key))];
      });
    } finally {
      setChecking(false);
    }
  }

  async function uploadAll() {
    if (!files.length || !period) return;
    setUploading(true);
    const failed: PendingUpload[] = [];
    let uploadedCount = 0;
    for (const item of files) {
      try {
        const params = new URLSearchParams({ role, period, name: item.file.name, project: String(projectId) });
        if (item.inspection.rowCount != null) params.set("rows", String(item.inspection.rowCount));
        item.inspection.issues.forEach((issue) => params.append("issue", issue));
        const response = await fetch(`/api/uploads?${params}`, {
          method: "POST",
          headers: { "content-type": item.file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
          body: item.file,
        });
        if (!response.ok) throw new Error();
        uploadedCount += 1;
      } catch {
        failed.push(item);
      }
    }
    setFiles(failed);
    if (uploadedCount) {
      toast.success(`${fileCountLabel(uploadedCount)} ${uploadedCount === 1 ? "сохранён" : "сохранены"}`);
      await onUploaded();
    }
    if (failed.length) toast.error(`Не удалось загрузить: ${fileCountLabel(failed.length)}`);
    setUploading(false);
  }

  return (
    <div className="mt-4 border-t border-[#edf0ed] pt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{hasExisting ? "Добавить исправленную версию" : "Загрузить файл"}</span>
        <span className="text-xs text-[#7b867e]">{dateLabel(period)}</span>
      </div>
      <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#cad3cb] bg-[#f9faf8] px-4 text-center hover:border-[#809b86] hover:bg-[#f1f7ef]">
        <Upload className="mb-2 size-5 text-[#657168]" />
        <span className="text-sm font-medium">Выбрать выгрузки .xlsx</span>
        <span className="mt-1 text-xs text-[#778279]">Можно выбрать сразу несколько файлов</span>
        <input
          type="file"
          accept=".xlsx"
          multiple
          className="sr-only"
          onChange={(event) => {
            const input = event.currentTarget;
            void choose(input.files).finally(() => {
              input.value = "";
            });
          }}
        />
      </label>
      {checking && <div className="mt-3 text-sm text-[#707b73]">Проверяю вкладки и количество строк…</div>}
      {files.length > 0 && (
        <div className="mt-3 space-y-2">
          {files.map((item) => (
            <div
              key={item.key}
              className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-3 ${item.inspection.issues.length ? "border-[#e7d7a9] bg-[#fff8df]" : "border-[#cbdac8] bg-[#f3f8ed]"}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {item.inspection.issues.length ? <AlertTriangle className="size-4 shrink-0 text-[#9a7426]" /> : <Check className="size-4 shrink-0 text-[#4e7b3d]" />}
                  <span className="truncate">{item.file.name}</span>
                </div>
                <div className="mt-1 text-xs leading-5 text-[#667169]">
                  {item.inspection.selectedSheet ? `Вкладка «${item.inspection.selectedSheet}»` : "Структура требует проверки"}
                  {item.inspection.rowCount != null ? ` · ${formatInteger(item.inspection.rowCount)} строк` : ""}
                </div>
                {item.inspection.issues.map((issue) => (
                  <div className="mt-1 text-xs text-[#755f24]" key={issue}>• {issue}</div>
                ))}
              </div>
              <button
                type="button"
                className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[#765850] hover:bg-[#fff2ee] hover:text-[#a44e41]"
                onClick={() => setFiles((current) => current.filter((file) => file.key !== item.key))}
                disabled={uploading}
                aria-label={`Убрать ${item.file.name} из загрузки`}
              >
                <Trash2 className="size-3.5" />
                Убрать
              </button>
            </div>
          ))}
        </div>
      )}
      <Button
        className="mt-4 w-full bg-[#1f5e43] text-white hover:bg-[#194e37]"
        disabled={!files.length || uploading || checking}
        onClick={() => void uploadAll()}
      >
        {uploading
          ? "Загружаю…"
          : hasExisting
            ? `Сохранить ${fileCountLabel(files.length)} как новые версии`
            : files.length
              ? `Загрузить ${fileCountLabel(files.length)}`
              : "Загрузить файлы"}
      </Button>
    </div>
  );
}

function UploadHistory({
  projects,
  uploads,
  seedMonth,
  onChanged,
}: {
  projects: AnalysisProject[];
  uploads: UploadRecord[];
  seedMonth: string;
  onChanged: () => Promise<void>;
}) {
  const projectNames = Object.fromEntries(projects.map((project) => [project.id, project.name]));
  return (
    <section className="mt-5 overflow-hidden rounded-[1.25rem] border border-[#dfe5df] bg-white">
      <div className="border-b border-[#e5e9e4] p-5">
        <div className="flex items-center gap-2">
          <History className="size-4 text-[#6e7971]" />
          <h2 className="font-semibold">Все загруженные файлы</h2>
        </div>
        <p className="mt-1 text-sm text-[#707b73]">Полная история по месяцам. Ошибочную пользовательскую загрузку можно удалить справа.</p>
      </div>
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#f8faf7] hover:bg-[#f8faf7]">
              <TableHead className="pl-5">Проект</TableHead>
              <TableHead>Назначение</TableHead>
              <TableHead>Дата среза</TableHead>
              <TableHead>Файл</TableHead>
              <TableHead className="text-right">Строк</TableHead>
              <TableHead>Проверка</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {uploads.map((upload) => (
              <UploadHistoryRow
                key={upload.id}
                upload={upload}
                projectName={upload.projectId ? projectNames[upload.projectId] ?? "Удалённый проект" : "Архив без проекта"}
                onChanged={onChanged}
              />
            ))}
            <SeedUploadRow role="db1" monthKey={seedMonth} period={seed.source.database1Date} rows={seed.source.db1Rows} />
            <SeedUploadRow role="db2" monthKey={seedMonth} period={seed.source.database2Date} rows={seed.source.db2Rows} />
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function UploadHistoryRow({
  upload,
  projectName,
  onChanged,
}: {
  upload: UploadRecord;
  projectName: string;
  onChanged: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  async function deleteUpload() {
    setDeleting(true);
    try {
      const response = await fetch(`/api/uploads?id=${upload.id}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Не удалось удалить файл");
      toast.success("Загрузка удалена");
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить файл");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <TableRow>
      <TableCell className="pl-5 font-medium">{projectName}</TableCell>
      <TableCell>{uploadPurpose(upload.role)}</TableCell>
      <TableCell>{dateLabel(upload.periodDate)}</TableCell>
      <TableCell className="max-w-72"><div className="truncate">{upload.fileName}</div></TableCell>
      <TableCell className="text-right tabular-nums">{formatInteger(upload.rowCount)}</TableCell>
      <TableCell>
        {upload.issueCount ? (
          <Badge variant="outline" className="border-[#e7d7a9] bg-[#fff8df] text-[#755f24]">Нужна проверка</Badge>
        ) : (
          <Badge variant="outline" className="border-[#bcd7ae] bg-[#e8f5d5] text-[#315a30]"><Check /> Принято</Badge>
        )}
      </TableCell>
      <TableCell>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[#765850] hover:bg-[#fff2ee] hover:text-[#a44e41]"
              aria-label={`Удалить ${upload.fileName}`}
              disabled={deleting}
            >
              <Trash2 className="size-4" />
              {deleting ? "Удаляю…" : "Удалить"}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-2xl border-[#dfe5df] bg-white">
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить ошибочную загрузку?</AlertDialogTitle>
              <AlertDialogDescription>
                Файл «{upload.fileName}» будет удалён из истории. Это действие нельзя отменить.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Оставить файл</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => void deleteUpload()}>Удалить</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}

function SeedUploadRow({
  role,
  monthKey,
  period,
  rows,
}: {
  role: "db1" | "db2";
  monthKey: string;
  period: string;
  rows: number;
}) {
  return (
    <TableRow>
      <TableCell className="pl-5 font-medium">{monthLabel(monthKey)}</TableCell>
      <TableCell>{uploadPurpose(role)}</TableCell>
      <TableCell>{dateLabel(period)}</TableCell>
      <TableCell className="max-w-72"><div className="truncate">{seed.source.file}</div></TableCell>
      <TableCell className="text-right tabular-nums">{formatInteger(rows)}</TableCell>
      <TableCell>
        <Badge variant="outline" className="border-[#c8d9c5] bg-[#f0f7ea] text-[#365b3b]">Исходные данные</Badge>
      </TableCell>
      <TableCell />
    </TableRow>
  );
}

function ExclusionsView({
  subjects,
  isExcluded,
  onChange,
}: {
  subjects: Array<{ subject: string; count: number; excluded: boolean }>;
  isExcluded: (subject: string) => boolean;
  onChange: (subject: string, active: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [onlyExcluded, setOnlyExcluded] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const needle = search.trim().toLowerCase();
  const rows = subjects
    .filter((row) => (!needle || row.subject.toLowerCase().includes(needle)) && (!onlyExcluded || isExcluded(row.subject)))
    .slice(0, 100);
  const count = subjects.filter((row) => isExcluded(row.subject)).length;

  async function toggle(subject: string, active: boolean) {
    onChange(subject, active);
    setSaving(subject);
    try {
      const response = await fetch("/api/exclusions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, active }),
      });
      if (!response.ok) throw new Error();
      toast.success(active ? "Предмет исключён" : "Предмет возвращён в скрининг");
    } catch {
      onChange(subject, !active);
      toast.error("Не удалось сохранить изменение");
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="workspace-page exclusions-page">
      <PageIntro
        eyebrow="Управляемый список"
        title="Исключения"
        copy="Исключённые предметы не участвуют в скрининге. Решение можно пересмотреть в любой момент — данные при этом не удаляются."
      />
      <section className="overflow-hidden rounded-[1.25rem] border border-[#dfe5df] bg-white">
        <div className="flex flex-col gap-4 border-b border-[#e5e9e4] p-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-semibold">Предметы</h2>
            <p className="mt-1 text-sm text-[#707b73]">{formatInteger(count)} исключено из автоматического скрининга</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative sm:w-72">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#89948c]" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Найти предмет"
                className="h-10 border-[#dce2dc] bg-[#f9faf8] pl-9"
              />
            </div>
            <Button variant="outline" className="h-10 border-[#dce2dc]" onClick={() => setOnlyExcluded((value) => !value)}>
              {onlyExcluded ? "Показать все" : "Только исключённые"}
            </Button>
          </div>
        </div>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#f8faf7] hover:bg-[#f8faf7]">
                <TableHead className="pl-5">Предмет</TableHead>
                <TableHead className="w-28 pr-5 text-right">Запросов</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.subject}>
                  <TableCell className="pl-5 font-medium">
                    <div className="flex items-center gap-3">
                      <span>{row.subject}</span>
                      <Switch
                        checked={isExcluded(row.subject)}
                        disabled={saving === row.subject}
                        onCheckedChange={(checked) => void toggle(row.subject, checked)}
                        aria-label={`Исключить ${row.subject}`}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="pr-5 text-right tabular-nums text-[#707b73]">{formatInteger(row.count)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="border-t border-[#e5e9e4] px-5 py-3 text-xs text-[#707b73]">
          Показаны первые {rows.length} совпадений. Используйте поиск для конкретного предмета.
        </div>
      </section>
    </main>
  );
}
