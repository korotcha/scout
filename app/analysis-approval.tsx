"use client";

import { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function AnalysisApproval({ blockers, saving, onApprove }: {
  blockers: string[]; saving: boolean; onApprove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const navigating = useRef(false);
  const sections = [...new Set(blockers.map(reason => /комментарий/i.test(reason) ? "research-outcome" : /сезон|опаздываем|срок|пик|групп|спрос|динамик|источник/i.test(reason) ? "research-group" : "research-competitors"))];
  const labels: Record<string, string> = { "research-group": "Группа товаров и сезон", "research-competitors": "Топ-10 конкурентов", "research-outcome": "Вывод менеджера" };
  const inspect = (sectionName: string) => {
    const section = root.current?.closest(".research-analysis")?.querySelector<HTMLElement>(".workspace-section." + sectionName);
    if (!section) return;
    navigating.current = true;
    setOpen(false);
    section.dispatchEvent(new Event("section-validate"));
    section.dispatchEvent(new Event("section-next"));
  };
  return <div ref={root} className="shrink-0">
    <Popover open={open && blockers.length > 0} onOpenChange={next => { navigating.current = false; setOpen(next); }}>
      <PopoverTrigger asChild>
        <Button disabled={saving} onClick={() => { if (!blockers.length) onApprove(); }}><ArrowRight className="size-4" />Кандидат в закуп</Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="section-issues-popover" onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => { if (navigating.current) event.preventDefault(); }}>
        <b>Что мешает перейти к юнитке</b>
        <ul>{blockers.map(reason => <li key={reason}>{reason}</li>)}</ul>
        <p className="mt-3 text-sm text-muted-foreground">Проверьте указанные данные. После исправления сохраните и снова завершите анализ.</p>
        <div className="mt-3 flex flex-col items-start gap-2">{sections.map(section => <Button key={section} variant="outline" size="sm" className="h-auto min-h-9 max-w-full whitespace-normal text-left" onClick={() => inspect(section)}>Открыть: {labels[section]}</Button>)}</div>
      </PopoverContent>
    </Popover>
  </div>;
}
