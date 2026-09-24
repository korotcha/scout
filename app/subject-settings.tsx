"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";

export type SubjectOption = { subject: string; count: number; excluded: boolean };
export type SubjectChange = { subject: string; active: boolean };

// Mounted for each opening: Cancel discards the draft and saved state is read afresh.
export function SubjectSettings({ subjects, exclude, onClose, onApplied }: {
  subjects: SubjectOption[]; exclude?: string[]; onClose: () => void; onApplied: (changes: SubjectChange[]) => void;
}) {
  const [catalog, setCatalog] = useState(subjects);
  const [base, setBase] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState(""), [tab, setTab] = useState("all"), [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [reload, setReload] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError("");
    void (async () => {
      try {
        const response = await fetch("/api/exclusions", { signal: abort.signal });
        const body = await response.json() as { error?: string; exclusions?: SubjectChange[] };
        if (!response.ok || !Array.isArray(body.exclusions)) throw new Error(body.error || "Не удалось загрузить предметы");
        const saved = body.exclusions as SubjectChange[];
        const options = new Map(subjects.map(s => [s.subject, s]));
        for (const row of saved) if (!options.has(row.subject)) options.set(row.subject, { subject: row.subject, count: 0, excluded: row.active });
        setCatalog([...options.values()].sort((a, b) => b.count - a.count || a.subject.localeCompare(b.subject, "ru")));
        const initial = Object.fromEntries([...subjects.map(s => [s.subject, s.excluded]), ...saved.map(s => [s.subject, s.active])]);
        setBase(initial); setDraft({ ...initial, ...Object.fromEntries((exclude ?? []).map(subject => [subject, true])) });
      } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Не удалось загрузить предметы"); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    })();
    return () => abort.abort();
    // This dialog takes a snapshot when opened; external changes are loaded from the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);
  const changes = Object.entries(draft).filter(([subject, active]) => active !== (base[subject] ?? false)).map(([subject, active]) => ({ subject, active }));
  const scope = exclude ? catalog.filter(s => exclude.includes(s.subject)) : catalog;
  const shown = scope.filter(s => (tab !== "excluded" || draft[s.subject]) && s.subject.toLocaleLowerCase("ru").includes(search.trim().toLocaleLowerCase("ru")));
  async function save() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/exclusions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes, reason }) });
      const body = await response.json() as { error?: string };
      if (!response.ok || body.error) throw new Error(body.error || "Не удалось сохранить");
      onApplied(Object.entries(draft).map(([subject, active]) => ({ subject, active })));
      toast.success(`Предметы обновлены: ${changes.length}`); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить"); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="subject-settings-dialog sm:max-w-2xl" showCloseButton={!busy}>
    <DialogHeader><DialogTitle>{exclude ? "Скрыть предметы целиком" : "Настройка предметов"}</DialogTitle><DialogDescription>Скрытые предметы не участвуют в скринере во всех месяцах. Данные и разборы сохраняются; предмет можно вернуть здесь.</DialogDescription></DialogHeader>
    <Input aria-label="Поиск предмета" placeholder="Найти предмет…" value={search} onChange={e => setSearch(e.target.value)} disabled={loading || busy} />
    {!exclude && <ToggleGroup type="single" value={tab} onValueChange={v => { if (v) setTab(v); }} className="justify-start" aria-label="Показать предметы"><ToggleGroupItem value="all">Все · {catalog.length}</ToggleGroupItem><ToggleGroupItem value="excluded">Скрытые · {catalog.filter(s => draft[s.subject]).length}</ToggleGroupItem></ToggleGroup>}
    <div className="subject-settings-list" aria-busy={loading || busy}>{loading ? <p role="status">Загружаем предметы…</p> : !Object.keys(base).length && error ? <Button variant="outline" onClick={() => setReload(x => x + 1)}>Повторить загрузку</Button> : shown.length ? shown.map(s => <div className="subject-settings-row" data-excluded={!!draft[s.subject]} key={s.subject}>
      <div className="subject-settings-name"><span>{s.subject}</span><Button size="sm" variant="outline" disabled={busy} aria-label={`${draft[s.subject] ? "Вернуть" : "Скрыть"} предмет ${s.subject}`} onClick={() => setDraft(old => ({ ...old, [s.subject]: !old[s.subject] }))}>{draft[s.subject] ? "Вернуть" : "Скрыть"}</Button></div>
      <span className="subject-settings-count" title="Запросов в загруженном своде выбранного месяца">{s.count} запр.</span>
    </div>) : <p className="text-muted-foreground">Предметы не найдены.</p>}</div>
    <Input aria-label="Причина изменения предметов" placeholder="Причина — необязательно" value={reason} onChange={e => setReason(e.target.value)} maxLength={2000} disabled={loading || busy} />
    <div className="min-h-5 text-sm" role="status">{error ? <span className="text-red-700">{error}</span> : changes.length ? `Скрыть: ${changes.filter(s => s.active).length} · Вернуть: ${changes.filter(s => !s.active).length}` : "Нет изменений"}</div>
    <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>Отмена</Button><Button disabled={busy || loading || !changes.length} onClick={() => void save()}>{busy ? "Сохраняем…" : "Применить"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
