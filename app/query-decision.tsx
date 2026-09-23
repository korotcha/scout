"use client";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { queryStatusLabels, type QueryStatus } from "@/lib/query-status";
import type { CandidateAction } from "@/lib/candidate-workflow";

export function QueryStatusBadge({ status }: { status: QueryStatus }) {
  return <Badge variant="outline" className={"query-status " + status}>{queryStatusLabels[status]}</Badge>;
}

export function QueryDecision({ status, canDecide, saving, disabled = false, compact = false, screenerOnly = false, query = "", actionTrigger, blockers, error, onClearError, onApply }: {
  status: QueryStatus; canDecide: boolean; saving: boolean; disabled?: boolean; compact?: boolean; screenerOnly?: boolean; query?: string; actionTrigger?: {value: QueryStatus; label: string}; blockers: string[]; error: string;
  onClearError: () => void; onApply: (action: CandidateAction, reason: string) => Promise<boolean>;
}) {
  const reasonId = useId();
  const [next, setNext] = useState<QueryStatus | null>(null), [reason, setReason] = useState("");
  const [localError, setLocalError] = useState("");
  const needsReason = next === "deferred" || next === "excluded";
  async function apply() {
    if (!next || saving) return;
    if (needsReason && !reason.trim()) { setLocalError("Укажите причину"); return; }
    const action = { unreviewed: "reopen_analysis", shortlisted: "shortlist", deferred: "defer", excluded: "reject", candidate: "nominate" } as const;
    if (await onApply(action[next], reason.trim())) setNext(null);
  }
  async function choose(value: QueryStatus) {
    setReason(""); setLocalError(""); onClearError();
    // Первичный отбор — это одношаговое действие. Не показываем подтверждение ни для
    // одного, ни для нескольких запросов; подтверждение оставляем только для
    // содержательных решений владельца (кандидат / отложить).
    if (["unreviewed", "shortlisted", "excluded"].includes(value)) {
      const action = { unreviewed: "reopen_analysis", shortlisted: "shortlist", excluded: "reject" } as const;
      await onApply(action[value as keyof typeof action], value === "excluded" ? "Исключено в скринере" : "");
      return;
    }
    setNext(value);
  }
  return <>{actionTrigger ? <Button size="sm" variant={actionTrigger.value==="candidate"?"default":"outline"} disabled={disabled||saving} onClick={()=>{setNext(actionTrigger.value);setReason("");setLocalError("");onClearError();}}>{actionTrigger.label}</Button> : <Select value={status} disabled={saving || disabled} onValueChange={v => void choose(v as QueryStatus)}><SelectTrigger className={"query-decision-trigger query-status " + status + (compact ? " query-decision-inline" : "")} aria-label={query ? `Статус: ${query}` : "Статус запроса"}><SelectValue /></SelectTrigger><SelectContent>{Object.entries(queryStatusLabels).filter(([key]) => !screenerOnly || ["unreviewed", "shortlisted", "excluded"].includes(key)).map(([key, label]) => <SelectItem key={key} value={key} disabled={key === "candidate" && !canDecide}>{label}</SelectItem>)}</SelectContent></Select>}
    <Dialog open={next !== null} onOpenChange={open => { if (!open && !saving) setNext(null); }}><DialogContent showCloseButton={!saving}><DialogHeader><DialogTitle>{next ? queryStatusLabels[next] : "Статус запроса"}</DialogTitle><DialogDescription>{next === "excluded" ? "Запрос перейдёт в «Исключённые». Весь анализ сохранится." : next === "deferred" ? "Запрос останется в чистовике с жёлтым статусом. Напишите, почему откладываем и когда стоит вернуться." : next === "candidate" ? "В «Кандидаты + юнит» появится связанный блок для моделей и расчётов. Запрос останется в чистовике. Это ещё не решение о закупке." : next === "shortlisted" ? "Запрос останется в чистовике для анализа. Сохранённые материалы и расчёты не удаляются." : "Запрос останется в чистовике с пометкой «Не разобрано». Прежний анализ и расчёты сохранятся; допуск к дальнейшей проработке нужно будет подтвердить заново."}</DialogDescription></DialogHeader>{query && <p className="text-sm font-medium">{query}</p>}
      {next === "candidate" && blockers.length > 0 ? <div className="max-h-56 overflow-auto rounded-lg bg-amber-50 p-3 text-sm"><b>Перед подтверждением:</b><ul className="mt-2 list-disc space-y-1 pl-4">{blockers.map(item => <li key={item}>{item}</li>)}</ul></div> : needsReason ? <div><label className="mb-2 block text-sm font-medium" htmlFor={reasonId}>Причина *</label><Textarea id={reasonId} value={reason} onChange={e => setReason(e.target.value)} disabled={saving} placeholder="Коротко объясните решение" /></div> : null}
      <div role="status" className="min-h-5 text-sm text-red-700">{localError || error}</div><DialogFooter><Button variant="outline" disabled={saving} onClick={() => setNext(null)}>Отмена</Button><Button disabled={saving || (next === "candidate" && (!canDecide || blockers.length > 0))} onClick={() => void apply()}>{saving ? "Сохраняем…" : "Сохранить статус"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}
