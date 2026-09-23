"use client";
import { Fragment, useEffect, useId, useState } from "react";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Choice, SafeAnchor, TextField } from "./candidate-workspace";
import { HeaderHelp } from "./query-table";
import { CompetitorThumbnail } from "./competitor-thumbnail";
import { competitorFieldErrors, competitorMissing, competitorPriceRange, competitorSlots, coreCompetitors, newCompetitor, parseSkus, wbCardUrl, type Competitor, type Research } from "@/lib/niche-research";
import { prettyDate } from "@/lib/market-types";

function NumericCell({ label, value, onChange, disabled, max, step = "any", error }: { label: string; value: number | null; onChange: (v: number | null) => void; disabled: boolean; max?: number; step?: string; error?: string }) {
  return <Input aria-label={label} data-check-error={error} type="number" inputMode="decimal" min={0} max={max} step={step} value={value ?? ""} placeholder="—" disabled={disabled} onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
}
function SkuCell({ sku, index, onCommit, onPasteList, onPending, autoFocus, required }: { sku: string; index: number; onCommit: (value: string) => string; onPasteList: (value: string) => string; onPending: (pending: boolean) => void; autoFocus: boolean; required: boolean }) {
  const [text, setText] = useState(sku), [error, setError] = useState(""), id = useId();
  useEffect(() => { setText(sku); setError(""); }, [sku]);
  function commit(value: string) {
    if (value.trim() === sku) { setError(""); onPending(false); return; }
    const issue = onCommit(value); setError(issue); onPending(Boolean(issue));
    if (!issue) setText(parseSkus(value).skus[0] ?? "");
  }
  return <div className="competitor-sku-input"><Input aria-label={"Артикул конкурента " + (index + 1)} data-check-error={error || (required && !sku ? "Строка " + (index + 1) + ": укажите артикул конкурента" : undefined)} title={error || undefined} aria-invalid={Boolean(error)} aria-describedby={error ? id : undefined} value={text} placeholder="Артикул / ссылка" autoComplete="off" spellCheck={false} autoFocus={autoFocus} onChange={e => { setText(e.target.value); setError(""); onPending(e.target.value.trim() !== sku); }} onBlur={() => commit(text)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(text); } if (e.key === "Escape") { setText(sku); setError(""); onPending(false); } }} onPaste={e => {
    const value = e.clipboardData.getData("text"), parsed = parseSkus(value);
    if (!parsed.skus.length || parsed.invalid.length) return;
    e.preventDefault();
    if (parsed.skus.length === 1) { setText(value); commit(value); }
    else { const issue = onPasteList(value); setError(issue); onPending(false); }
  }} />{error && <p id={id} role="alert" className="sr-only">{error}</p>}</div>;
}

export function CompetitorTable({ research: r, today, onChange, onPendingChange }: { research: Research; today: string; onChange: (r: Research) => void; onPendingChange: (v: boolean) => void }) {
  const slots = competitorSlots(r.competitors);
  const [rowCount, setRowCount] = useState(Math.max(1, slots.length)), [expanded, setExpanded] = useState(-1), [focusRow, setFocusRow] = useState(-1);
  const [pending, setPending] = useState<Record<number, boolean>>({});
  useEffect(() => { onPendingChange(Object.values(pending).some(Boolean)); }, [pending, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  const count = Math.max(rowCount, slots.length);
  const normalized = () => slots.flatMap((c, slot) => c ? [{ ...c, slot }] : []);
  function publish(rows: Competitor[], changedSelection = false) {
    onChange({ ...r, competitors: rows, ...(changedSelection ? { repeatedModels: "unknown" as const, repeatedModelsThreshold: 3 as const } : {}) });
  }
  function assign(slot: number, raw: string) {
    const parsed = parseSkus(raw);
    if (parsed.invalid.length || parsed.skus.length !== 1) return "Укажите артикул или ссылку WB";
    const sku = parsed.skus[0];
    if (r.competitors.some(c => c.sku === sku && slots[slot]?.sku !== sku)) return "Этот артикул уже в таблице";
    if (slots[slot]?.sku === sku) return "";
    publish([...normalized().filter(c => c.slot !== slot), { ...newCompetitor(sku), slot }], true);
    return "";
  }
  function pasteList(start: number, raw: string) {
    const parsed = parseSkus(raw), used = new Set(r.competitors.map(c => c.sku));
    const incoming = parsed.skus.filter(sku => !used.has(sku));
    if (!incoming.length) return "Все артикулы уже добавлены";
    const free = Array.from({ length: 1000 - start }, (_, i) => start + i).filter(slot => !slots[slot]);
    if (incoming.length > free.length) return "Не хватает свободных строк (максимум 1 000)";
    publish([...normalized(), ...incoming.map((sku, i) => ({ ...newCompetitor(sku), slot: free[i] }))], true);
    setRowCount(n => Math.max(n, free[incoming.length - 1] + 1));
    return "";
  }
  function change(slot: number, updated: Competitor) {
    publish(normalized().map(c => c.slot === slot ? { ...updated, slot, checkedAt: today } : c));
  }
  function remove(slot: number) {
    publish(normalized().filter(c => c.slot !== slot), true);
    setPending(p => ({ ...p, [slot]: false })); setExpanded(-1);
  }
  return <TooltipProvider delayDuration={350}>
    <div className="competitor-entry-caption"><span>Вставьте артикул или ссылку в строку. Можно вставить сразу список.</span><span>Добавлено {r.competitors.length} товаров</span></div>
    <div className="research-table research-top-table competitor-edit-table"><Table><colgroup>{[20,10,10,10,10,16,6,7,11].map((width, i) => <col key={i} style={{ width: width + "%" }} />)}</colgroup><TableHeader>
      <TableRow className="competitor-column-groups"><TableHead>Товар</TableHead><TableHead colSpan={4}>За выбранный сезон</TableHead><TableHead>Наличие</TableHead><TableHead colSpan={3}>Карточка на дату отчёта / проверки</TableHead></TableRow>
      <TableRow><TableHead>Артикул WB</TableHead><TableHead><HeaderHelp label="Заказы, ₽">Сумма заказов за период отчёта MPStats. Не равна выкупам или фактическим поступлениям продавцу.</HeaderHelp></TableHead><TableHead>Выкупы, ₽</TableHead><TableHead><HeaderHelp label="Цена от–до, ₽">Минимальная и максимальная цена за сезон. Это диапазон наблюдений, а не средняя цена. Прежняя одиночная цена показана в обеих границах — при необходимости уточните её.</HeaderHelp></TableHead><TableHead><HeaderHelp label="Динамика цены">Устойчивое изменение цены в активной части сезона. Разовый скачок и распродажа остатков не равны устойчивому тренду.</HeaderHelp></TableHead><TableHead><HeaderHelp label="В сезоне / к концу">Сначала укажите ауты и пополнения в течение сезона. Ниже — чем он завершился: без избытка, большой запас или аут.</HeaderHelp></TableHead><TableHead><HeaderHelp label="Рейтинг">Текущий рейтинг карточки на WB, на дату вашей проверки.</HeaderHelp></TableHead><TableHead>Отзывы</TableHead><TableHead><HeaderHelp label="Склейки">Рейтинг 5,0 и много отзывов — не доказательство. Сверьте товар с фотографиями и содержанием отзывов.</HeaderHelp></TableHead></TableRow>
    </TableHeader><TableBody>{Array.from({ length: count }, (_, slot) => {
      const c = slots[slot], empty = !c, draft = c ?? newCompetitor(""), range = competitorPriceRange(draft), missing = c ? competitorMissing(c) : [], errors = c ? competitorFieldErrors(c, today) : {};
      const set = <K extends keyof Competitor>(key: K, value: Competitor[K]) => { if (c) change(slot, { ...c, [key]: value }); };
      const choose = (key: "priceTrend" | "stock" | "endStockRisk" | "glue" | "content", label: string, options: readonly (readonly [string, string])[]) => empty ? <span className="competitor-unfilled">—</span> : <fieldset><Choice hideLabel label={label + " " + (c?.sku || "строка " + (slot + 1))} value={draft[key]} onChange={v => set(key, v as Competitor[typeof key])} options={options} /></fieldset>;
      return <Fragment key={slot}><TableRow data-check-summary={c && missing.length ? c.sku + ": " + missing.join(", ") : undefined} data-empty={empty} className={expanded === slot ? "research-row-open" : ""}>
        <TableCell><div className="competitor-identity" title={c?.name}><span className="competitor-position">{slot + 1}</span><CompetitorThumbnail key={c?.sku ?? "empty"} sku={c?.sku ?? ""} photo={c?.photo} /><div className="min-w-0 flex-1"><SkuCell sku={c?.sku ?? ""} index={slot} onCommit={raw => assign(slot, raw)} onPasteList={raw => pasteList(slot, raw)} onPending={value => setPending(p => p[slot] === value ? p : { ...p, [slot]: value })} autoFocus={focusRow === slot} required={false} />{c && <div className="competitor-identity-actions"><button type="button" aria-expanded={expanded === slot} onClick={() => setExpanded(expanded === slot ? -1 : slot)}>{missing.length ? "Заметка" : <><Check className="size-3" />Готово</>}<ChevronDown className="size-3" /></button>{c.revenue != null && c.revenue < 3e6 && <span>Ниже 3 млн</span>}<button type="button" aria-label={"Удалить " + c.sku} title="Очистить строку" onClick={() => remove(slot)}><Trash2 className="size-3" /></button></div>}</div></div></TableCell>
        <TableCell><NumericCell label={"Заказы конкурента " + (slot + 1)} error={errors.revenue} value={draft.revenue} disabled={empty} onChange={v => set("revenue", v)} /></TableCell>
        <TableCell><NumericCell label={"Выкупы конкурента " + (slot + 1)} value={draft.buyouts ?? null} disabled={empty} onChange={v => set("buyouts", v)} /></TableCell>
        <TableCell><div className="competitor-price-range"><label><span>от</span><NumericCell label={"Цена от, конкурент " + (slot + 1)} error={errors.priceFrom} value={range.from} disabled={empty} onChange={v => { if (c) change(slot, { ...c, price: null, priceFrom: v, priceTo: range.to }); }} /></label><label><span>до</span><NumericCell label={"Цена до, конкурент " + (slot + 1)} error={errors.priceTo} value={range.to} disabled={empty} onChange={v => { if (c) change(slot, { ...c, price: null, priceFrom: range.from, priceTo: v }); }} /></label></div></TableCell>
        <TableCell>{choose("priceTrend", "Динамика цены", [["unknown", "Не проверено"], ["rising", "Росла"], ["stable", "Стабильна"], ["falling", "Падала"], ["waves", "Волнами"]])}</TableCell>
        <TableCell><div className="competitor-stock-pair">{choose("stock", "Остатки в сезоне", [["unknown", "В сезоне: проверить"], ["available", "Всегда в наличии"], ["replenished", "Аут → подсорт"], ["sold_out", "Аут → не вернулся"], ["unavailable", "Недостаточно данных"]])}{choose("endStockRisk", "К концу сезона", [["unknown", "К концу: проверить"], ["normal", "К концу: без избытка"], ["large", "К концу: большой запас"], ["out", "К концу: аут"], ["unavailable", "Недостаточно данных"]])}</div></TableCell>
        <TableCell><NumericCell label={"Рейтинг конкурента " + (slot + 1)} error={errors.rating || (errors.checkedAt ? "Обновите рейтинг или отзывы: " + errors.checkedAt : undefined)} value={draft.rating} disabled={empty} max={5} step="0.1" onChange={v => set("rating", v)} /></TableCell>
        <TableCell><NumericCell label={"Отзывы конкурента " + (slot + 1)} error={errors.reviews || (errors.checkedAt ? "Обновите рейтинг или отзывы: " + errors.checkedAt : undefined)} value={draft.reviews} disabled={empty} step="1" onChange={v => set("reviews", v)} /></TableCell>
        <TableCell>{choose("glue", "Склейки", [["unknown", "Не проверено"], ["no", "Не найдены"], ["suspected", "Подозрение"], ["confirmed", "Есть"]])}</TableCell>
      </TableRow>
      {c && expanded === slot && <TableRow><TableCell colSpan={9} className="research-competitor-detail"><div className="mb-2 flex justify-between"><b>Наблюдение по артикулу {c.sku}</b><SafeAnchor href={wbCardUrl(c.sku)}>Открыть WB</SafeAnchor></div><Textarea aria-label={"Наблюдение по " + c.sku} value={c.note} onChange={e => set("note", e.target.value)} placeholder="Особенность модели, причины жалоб, детали остатков — если есть что добавить" className="min-h-16" /><p className="research-hint mt-2">{c.checkedAt && "Проверено " + prettyDate(c.checkedAt) + ". "}{missing.length ? "Осталось: " + missing.join(", ") : "Обязательные факты заполнены."}</p></TableCell></TableRow>}
      </Fragment>;
    })}</TableBody></Table></div>
    <div className="competitor-add-footer"><Button type="button" variant="outline" disabled={count >= 1000} onClick={() => { setRowCount(count + 1); setFocusRow(count); }}><Plus className="size-4" />Добавить конкурента</Button><span>В анализе участвуют все добавленные товары</span></div>
  </TooltipProvider>;
}
