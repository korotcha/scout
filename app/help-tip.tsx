"use client";

import { useState, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <TooltipProvider delayDuration={300}>
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button type="button" aria-label={`Подсказка: ${label}`} className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2" onClick={() => setOpen(value => !value)}>
          <CircleHelp className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8} className="query-tooltip max-w-80 bg-[#20252a] px-4 py-3 text-sm font-normal leading-6 text-white shadow-lg">
        {children}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>;
}
