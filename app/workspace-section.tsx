"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const controls = "input, textarea, [role=combobox], fieldset[data-check-error], [data-invalid-field]";
function inspect(node: HTMLElement) {
  const marked = [...node.querySelectorAll<HTMLElement>("[data-check-error]")].filter(el => el.dataset.checkError);
  const invalid = [...node.querySelectorAll<HTMLInputElement>("input, textarea")].filter(el => !el.disabled && !el.validity.valid);
  const message = (el: HTMLElement) => el.closest<HTMLElement>("[data-check-summary]")?.dataset.checkSummary || el.dataset.checkError!;
  return [...new Set([...marked.map(message), ...invalid.map(el => el.dataset.checkError ? message(el) : (el.getAttribute("aria-label") || el.labels?.[0]?.textContent || "Поле") + ": " + el.validationMessage)])];
}

function highlight(node: HTMLElement) {
  for (const el of node.querySelectorAll<HTMLElement>(controls)) {
    const input = el as HTMLInputElement;
    const error = !input.disabled && (el.dataset.checkError || (input.validity && !input.validity.valid ? input.validationMessage : ""));
    if (error) {
      if (!el.hasAttribute("data-invalid-field")) {
        el.dataset.previousTitle = el.getAttribute("title") ?? "";
        el.dataset.previousDescription = el.getAttribute("aria-description") ?? "";
      }
      el.dataset.invalidField = "true";
      el.setAttribute("aria-invalid", "true");
      el.setAttribute("aria-description", error);
      el.title = error;
    } else if (el.hasAttribute("data-invalid-field")) {
      el.removeAttribute("data-invalid-field");
      el.removeAttribute("aria-invalid");
      for (const [attribute, previous] of [["title", "previousTitle"], ["aria-description", "previousDescription"]]) {
        if (el.dataset[previous]) el.setAttribute(attribute, el.dataset[previous]!); else el.removeAttribute(attribute);
        delete el.dataset[previous];
      }
    }
  }
}

export function WorkspaceSection({ title, summary, aside, icon, number, tone = "", defaultOpen = false, issues = [], validateAll = false, children }: {
  title: string; summary?: string; aside?: ReactNode; icon?: ReactNode; number?: string; tone?: string; defaultOpen?: boolean; issues?: string[]; validateAll?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen), id = useId();
  const root = useRef<HTMLElement>(null);
  const [errors, setErrors] = useState<string[]>([]), [done, setDone] = useState(false);
  const [attempted, setAttempted] = useState(false), [inputRevision, setInputRevision] = useState(0);
  const latestIssues = useRef(issues); latestIssues.current = issues;
  useEffect(() => {
    const node = root.current; if (!node) return;
    const validate = () => { setAttempted(true); setErrors([...new Set([...latestIssues.current, ...inspect(node)])]); highlight(node); };
    node.addEventListener("section-validate", validate);
    return () => node.removeEventListener("section-validate", validate);
  }, []);
  useEffect(() => {
    const node = root.current; if (!node || !attempted) return;
    highlight(node);
    const scope = validateAll ? node.closest<HTMLElement>(".research-analysis") ?? node : node;
    const messages = [...new Set([...issues, ...inspect(scope)])];
    setErrors(previous => JSON.stringify(previous) === JSON.stringify(messages) ? previous : messages);
    if (messages.length) setDone(false);
  }, [attempted, children, issues, inputRevision, validateAll]);
  useEffect(() => { const node = root.current; const reveal = () => { setOpen(true); requestAnimationFrame(() => { node?.scrollIntoView({ block: "start", behavior: "instant" }); node?.querySelector<HTMLButtonElement>(".workspace-section-toggle")?.focus({ preventScroll: true }); }); }; node?.addEventListener("section-next", reveal); return () => node?.removeEventListener("section-next", reveal); }, []);
  const next = () => {
    const node = root.current; if (!node) return;
    const scope = validateAll ? node.closest<HTMLElement>(".research-analysis") ?? node : node;
    if (validateAll) scope.querySelectorAll<HTMLElement>(".workspace-section").forEach(section => section.dispatchEvent(new Event("section-validate")));
    const messages = [...new Set([...issues, ...inspect(scope)])];
    setAttempted(true); highlight(node);
    setErrors(messages); setDone(false);
    if (messages.length) return;
    const sections = [...(node.closest(".candidate-workspace") ?? document).querySelectorAll<HTMLElement>(".workspace-section")];
    const following = sections[sections.indexOf(node) + 1];
    if (following) { setOpen(false); following.dispatchEvent(new Event("section-next")); } else setDone(true);
  };
  return <section ref={root} className={"workspace-section " + tone} data-open={open} data-validation-attempted={attempted} data-has-errors={attempted && errors.length > 0} onInputCapture={() => { if (attempted) setInputRevision(v => v + 1); }}>
    <div className="workspace-section-head">
      <button type="button" className="workspace-section-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {icon && <span className="workspace-section-icon" aria-hidden="true">{icon}</span>}
        {number && <span className="workspace-section-number">{number}</span>}
        <span className="workspace-section-heading"><span className="workspace-section-title" role="heading" aria-level={2}>{title}</span>{summary && <span className="workspace-section-summary">{summary}</span>}</span>
        <ChevronDown aria-hidden="true" className="workspace-section-chevron size-4" />
      </button>
      {aside && <div className="workspace-section-aside">{aside}</div>}
    </div>
    <div id={id} hidden={!open} className="workspace-section-content">{children}<div className="section-next-footer"><div className="section-next-hint" role="status" aria-live="polite">{errors.length > 0 ? <Popover><PopoverTrigger asChild><button type="button" className="section-issues-trigger">Проверьте поля · {errors.length}</button></PopoverTrigger><PopoverContent align="end" side="top" className="section-issues-popover" onOpenAutoFocus={event => event.preventDefault()}><b>Что нужно заполнить или исправить</b><ul>{errors.map(message => <li key={message}>{message}</li>)}</ul></PopoverContent></Popover> : done ? "Обязательные поля блока заполнены" : "\u00a0"}</div><button type="button" className="section-next-button" onClick={next}>Далее →</button></div></div>
  </section>;
}
