"use client";

import { useState, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import './query-report-help.css';

export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  return <Dialog open={detailsOpen} onOpenChange={value => { setDetailsOpen(value); setOpen(false); }}><TooltipProvider delayDuration={300}>
    <Tooltip open={open && !detailsOpen} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <DialogTrigger asChild><button type="button" aria-label={`Подсказка: ${label}`} className="query-help-trigger inline-flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2">
          <CircleHelp className="size-4" aria-hidden="true" />
        </button></DialogTrigger>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8} collisionPadding={16} className="query-tooltip query-help-content bg-[#20252a] px-4 py-3 text-sm font-normal leading-6 text-white shadow-lg">
        {children}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider><DialogContent className="query-help-dialog">
    <DialogHeader><DialogTitle>{label}</DialogTitle><DialogDescription>Методика расчёта и пояснения к показателю.</DialogDescription></DialogHeader>
    <div className="query-help-dialog-body">{children}</div>
  </DialogContent></Dialog>;
}
