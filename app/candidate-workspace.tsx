"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, ExternalLink, Factory, Flag, Info, LockKeyhole, Package, Plus, Save, ShieldCheck, Trash2, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { analysisFindings, arrivalDate, calculateImport, calculatePlan, calculateWb, checks, contentSchema, newContent, newModel, newOffer, readyIssues, selectedOffer, statusLabels, workbookExample, type Analysis, type Candidate, type CandidateAction, type CandidateContent, type ImportInputs, type Model, type Offer, type WbInputs, withSharedContainer } from "@/lib/candidate-workflow";
import { fmt, pct, prettyDate, prettyMonth, rub, type SubjectRow } from "@/lib/market-types";
import type { SubjectQueriesProps } from "./subject-queries";
import { WorkspaceSection } from "./workspace-section";
import { SelectedQuery } from "./selected-query";
import { ResearchPanel, ScoreBadge, useToday } from "./research-panel";
import { alignResearchSeason, researchFindings } from "@/lib/niche-research";

import { WbModelLookup } from "./wb-model-lookup";
import { UnitModelEditor } from "./unit-model-editor";
import { useCalculatorSettings } from "./calculator-settings";
import { modelWithDefaults, minimumTaxHint, switchWbScheme } from "@/lib/calculator-settings";
import { SharedContainer } from "./shared-container";
import { QueryDecision } from "./query-decision";
import { queryStatus, queryStatusLabels } from "@/lib/query-status";

const stages = ["Анализ ниши", "Юнит-экономика", "Белый ввоз", "Юнитка WB", "План продаж", "Решение"];

export function CandidateWorkspace({ subject, query: initialQuery, initial, contextKey, period, canDecide, onSaved, onBack, onDirtyChange, queryData, initialStage = "0", initialExcluded = false, initialShortlisted = false }: {
  initialExcluded?: boolean; initialShortlisted?: boolean;
  initialStage?: string; subject: SubjectRow; query: string; initial?: Candidate; contextKey: string; period: string; canDecide: boolean;
  onSaved: (c: Candidate) => void; onBack: () => void; onDirtyChange: (v: boolean) => void;
  queryData: SubjectQueriesProps;
}) {
  const defaults = useCalculatorSettings();
  const [record, setRecord] = useState(initial);
  const [query, setQuery] = useState(initial?.query || initialQuery);
  const today = useToday();
  const [content, setContent] = useState<CandidateContent>(() => {
    if (initial) return withSharedContainer(initial.content);
    const draft = newContent(subject.comment, period);
    return { ...draft, analysis: alignResearchSeason(draft.analysis, period) };
  });
  const [baseline, setBaseline] = useState(() => JSON.stringify(content));
  const [stage, setStage] = useState(initialStage);
  const [activeModelId, setActiveModelId] = useState(initial?.content.selectedModelId ?? initial?.content.models[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [researchInputPending, setResearchInputPending] = useState(false);
  const [error, setError] = useState("");
  const dirty = researchInputPending || JSON.stringify(content) !== baseline || query !== (record?.query || initialQuery);
  const passed = Boolean(record?.analysisPassed) && JSON.stringify(record?.content.analysis) === JSON.stringify(content.analysis);
  const model = content.models.find((m) => m.id === activeModelId) ?? content.models[0];
  const plannedModel = content.models.find(m => m.id === content.selectedModelId) ?? model;
  const actualProduction = plannedModel ? selectedOffer(plannedModel)?.productionDays : undefined;
  const findings = content.analysis.research.version === 2 ? researchFindings(content.analysis, today, actualProduction) : analysisFindings(content.analysis);
  const issues = readyIssues(content, period);
  const lockedStatus = record && ["rejected", "deferred"].includes(record.status);
  useEffect(() => { onDirtyChange(dirty || saving); return () => onDirtyChange(false); }, [dirty, saving, onDirtyChange]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty || saving) e.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);
  const updateModel = (updated: Model) => setContent((c) => withSharedContainer({ ...c, models: c.models.map((m) => m.id === updated.id ? updated : m) }));
  async function save(action: CandidateAction = "save", draft = content) {
    if (saving) return false;
    if (action === "save" && !record && initialExcluded) { action = "reject"; draft = { ...draft, decisionComment: draft.decisionComment || "Исключено при первичном отборе" }; }
    if (researchInputPending) { setError("Завершите ввод артикула или подтвердите / отмените загрузку отчёта."); return false; }
    const checked = contentSchema.safeParse(withSharedContainer(draft));
    if (!checked.success) { setError(checked.error.issues.slice(0, 3).map((i) => `${i.path.join(" → ")}: ${i.message}`).join("; ")); return false; }
    setSaving(true); setError("");
    try {
      const r = await fetch("/api/candidates", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: record?.id, contextKey, subject: subject.subject, query, revision: record?.revision ?? 0, action, content: checked.data }) });
      const body = await r.json() as { candidate?: Candidate; error?: string };
      if (!r.ok || !body.candidate) throw new Error(body.error ?? "Не удалось сохранить");
      setRecord(body.candidate); setContent(body.candidate.content); setBaseline(JSON.stringify(body.candidate.content));
      onSaved(body.candidate); toast.success(action === "submit_analysis" ? "Анализ сохранён" : ["pass_analysis","nominate"].includes(action) ? "Кандидат в закуп добавлен в «Кандидаты + юнит»" : "Изменения сохранены");
      if (action === "pass_analysis") setStage("1");
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить. Черновик остаётся на экране."); return false; }
    finally { setSaving(false); }
  }
  function addModel(example = false) {
    if (defaults.loading && !example) return;
    const added = example ? workbookExample() : modelWithDefaults(defaults.record?.settings);
    added.plan.startDate = content.analysis.launchDate;
    setContent((c) => ({ ...c, models: [...c.models, added], selectedModelId: c.selectedModelId || added.id }));
    setActiveModelId(added.id);
  }
  return <main className="candidate-workspace workspace-page">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <Button variant="ghost" className="-ml-3 text-muted-foreground" onClick={onBack}><ArrowLeft className="size-4" /> К списку</Button>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><span>{record ? prettyDate(record.updatedAt) : "Новая карточка"}</span>{stage === "0" ? <QueryDecision screenerOnly status={record ? (record.status === "rejected" ? "excluded" : record.status === "unreviewed" ? "unreviewed" : "shortlisted") : initialExcluded ? "excluded" : initialShortlisted ? "shortlisted" : "unreviewed"} canDecide={canDecide} saving={saving} blockers={[...findings.stops,...findings.missing]} error={error} onClearError={()=>setError("")} onApply={(action,reason)=>save(action,{...content,decisionComment:reason||content.decisionComment})}/> : <CandidateBadge status={record?.status ?? "analysis"} />}<ScoreBadge analysis={content.analysis} today={today} actualProduction={actualProduction} /><CountFlag tone="red" count={findings.risks.length + findings.stops.length} label="рисков" /></div>
    </div>
    <SelectedQuery query={query} subject={subject.subject} period={period} data={queryData} />
    {!initialQuery && !record?.query && <div className="mb-5 max-w-xl"><TextField label="Поисковый запрос для этого сохранённого разбора *" value={query} onChange={setQuery} placeholder="Укажите запрос; прежние расчёты сохранятся" /></div>}
    <Tabs value={stage} onValueChange={setStage} className="mb-6">
      <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl border bg-white p-2">
        {stages.map((name, k) => [2,3,4].includes(k) || (k === 5 && !passed && !content.manualBlock && !content.models.length) ? null : <TabsTrigger key={name} value={String(k)} disabled={k > 0 && k < 5 && (!passed || Boolean(lockedStatus))} className="h-11 shrink-0 gap-2 rounded-xl px-4 text-sm data-[state=active]:bg-[#19231c] data-[state=active]:text-white">
          <span className="text-xs opacity-60">{k > 0 && k < 5 && !passed ? <LockKeyhole className="size-3.5" /> : k === 5 ? "03" : `0${k + 1}`}</span>{name}
        </TabsTrigger>)}
      </TabsList>
    <TabsContent value={stage} className="mt-4">
    <fieldset disabled={saving} className="min-w-0">
    {lockedStatus && <Notice><b>{queryStatusLabels[queryStatus(record)]}.</b> Все материалы сохранены. {content.decisionComment && <span>{content.decisionComment} </span>}{stage === "0" ? "Для повторного разбора выберите «Не разобрано» в статусе запроса." : <Button size="sm" variant="outline" className="ml-2" disabled={saving} onClick={()=>void save("resume")}>Возобновить</Button>}</Notice>}
    {record?.analysisPassed && !passed && <Notice tone="warning">Анализ изменён. Перед продолжением нужно повторно подтвердить допуск; существующие расчёты не удалены.</Notice>}
    {stage === "0" && <ResearchPanel actualProduction={actualProduction} query={query} period={period} queryData={queryData} value={content.analysis} onChange={(analysis) => setContent((c) => ({ ...c, analysis }))} record={record} canDecide={canDecide} passed={passed} dirty={dirty} onSubmit={() => void save("submit_analysis")} onApprove={() => void save("pass_analysis")} onQuickReject={(reason) => save("reject", { ...content, decisionComment: "Низкий чек по визуальной проверке выдачи: " + reason })} onRejectPrice={() => void save("reject", { ...content, decisionComment: [content.decisionComment.trim(), "Верхняя граница среднего чека группы ниже 1 000 ₽. Отклонено на первичной проверке цены."].filter(Boolean).join("\n\n") })} saving={saving} onPendingChange={setResearchInputPending} />}
    {["1", "2", "3", "4"].includes(stage) && passed && !lockedStatus && <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">{content.models.map((m) => <Button key={m.id} variant={model?.id === m.id ? "secondary" : "ghost"} onClick={() => setActiveModelId(m.id)}><Package className="size-4" />{m.name || "Новая модель"}</Button>)}</div>
        {stage === "1" && <Button variant="outline" disabled={content.models.length >= 8 || defaults.loading} onClick={() => addModel()}><Plus className="size-4" /> Добавить модель</Button>}
      </div>
      {defaults.error && <Notice tone="warning">Настройки не загрузились. Проверьте курсы и ставки новой модели вручную.</Notice>}
      {stage === "1" && content.models.length > 1 && <div className="mb-4"><SharedContainer content={content} onChange={value=>setContent(withSharedContainer(value))}/></div>}
      {!model ? <EmptyBlock icon={<Package />} title="Какие модели рассматриваем?" copy="Добавьте 1–3 модели и предложения фабрик. Все цены, контакты и расчёты останутся в этой карточке.">
        <Button onClick={() => addModel()}><Plus className="size-4" /> Добавить модель</Button>
        <Button variant="ghost" onClick={() => addModel(true)}>Открыть пример BC0612 из вашего файла</Button>
      </EmptyBlock> : <>
        {stage === "1" && <UnitModelEditor key={model.id} model={model} onChange={updateModel} onDecision={() => setStage("5")} onRemove={() => {
          const next = content.models.filter((m) => m.id !== model.id);
          setContent((c) => withSharedContainer({ ...c, models: next, sharedContainer: c.sharedContainer ? {...c.sharedContainer, modelIds:c.sharedContainer.modelIds.filter(id=>id!==model.id)} : null, selectedModelId: c.selectedModelId === model.id ? next[0]?.id ?? "" : c.selectedModelId })); setActiveModelId(next[0]?.id ?? "");
        }} />}
        {stage === "2" && <ImportPanel model={model} onChange={updateModel} onNext={() => setStage("3")} />}
        {stage === "3" && <WbPanel model={model} onChange={updateModel} onNext={() => setStage("4")} />}
        {stage === "4" && <PlanPanel model={model} onChange={updateModel} onNext={() => setStage("5")} />}
      </>}
    </>}
    {stage === "5" && <DecisionPanel content={content} onChange={setContent} record={record} canDecide={canDecide} passed={passed} issues={issues} saving={saving} save={save} />}
    </fieldset>
    </TabsContent>
    </Tabs>
    <div className="candidate-savebar fixed inset-x-0 bottom-[4.75rem] z-20 border-t bg-white/95 backdrop-blur-sm lg:bottom-0">
      <div className="mx-auto flex max-w-[87rem] flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0 text-sm">{error ? <p role="alert" className="max-w-4xl text-red-700">{error}</p> : <span className="flex items-center gap-2 text-muted-foreground">{dirty ? <span className="size-2 rounded-full bg-amber-500" /> : <Check className="size-4" />}{dirty ? "Есть несохранённые изменения" : record ? "Сохранено" : "Карточка ещё не сохранена"}</span>}</div>
        <Button className="shrink-0" onClick={() => void save()} disabled={saving}><Save className="size-4" />{saving ? "Сохраняю…" : "Сохранить"}</Button>
      </div>
    </div>
  </main>;
}

export function ModelPanel({ model: m, onChange, onNext, onRemove }: { model: Model; onChange: (m: Model) => void; onNext: () => void; onRemove: () => void }) {
  const updateOffer = (offer: Offer) => onChange({ ...m, offers: m.offers.map((o) => o.id === offer.id ? offer : o) });
  return <div className="space-y-5"><Panel title="Модель для входа" defaultOpen aside={<RemoveButton label="Удалить модель" description="Модель, её предложения и расчёты будут удалены из этой карточки после сохранения. Остальные модели останутся." onRemove={onRemove} />}>
    <WbModelLookup key={m.id} model={m} onChange={onChange}/><div className="mt-5 grid gap-4 md:grid-cols-2"><TextField label="Название модели" value={m.name} onChange={(name) => onChange({ ...m, name })} placeholder="Модель или рабочее название" /><Choice label="Тип модели" value={m.kind} onChange={(kind) => onChange({ ...m, kind: kind as Model["kind"] })} options={[["proven", "С подтверждённым спросом"], ["new", "Новинка — повышенный риск"]]} /></div>
    <div className="mt-4"><LongField label="Характеристики и почему рассматриваем эту модель" value={m.note} onChange={(note) => onChange({ ...m, note })} placeholder="Какой потенциал конкуренты не реализовали? Чем будет отличаться наш товар?" /></div>
  </Panel>
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Предложения фабрик</h2><p className="mt-1 text-sm text-muted-foreground">Сравните 3–5 предложений на одинаковую комплектацию.</p></div><Button variant="outline" disabled={m.offers.length >= 20} onClick={() => onChange({ ...m, offers: [...m.offers, newOffer()] })}><Plus className="size-4" /> Добавить фабрику</Button></div>
    {!m.offers.length && <EmptyBlock icon={<Factory />} title="Сохраните первое предложение" copy="Ссылка, цена, контакт и условия будут доступны при возврате к закупке." />}
    <div className="grid items-start gap-4 xl:grid-cols-2">{m.offers.map((o, k) => <OfferCard key={o.id} value={o} index={k} selected={m.selectedOfferId === o.id} onChange={updateOffer} onSelect={() => onChange({ ...m, selectedOfferId: o.id })} onRemove={() => onChange({ ...m, offers: m.offers.filter((x) => x.id !== o.id), selectedOfferId: m.selectedOfferId === o.id ? "" : m.selectedOfferId })} />)}</div>
    {m.offers.length > 0 && <Panel title="Сравнение цен"><div className="flex flex-wrap gap-8">{(["CNY", "USD", "RUB"] as const).map((currency) => {
      const quotes = m.offers.filter((o) => o.currency === currency && o.price != null); if (!quotes.length) return null;
      const prices = quotes.map((o) => o.price!); return <div key={currency}><span className="text-sm text-muted-foreground">{currency} · {quotes.length} предложений</span><p className="mt-1 text-lg font-semibold tabular-nums">{fmt(Math.min(...prices), 2)} — {fmt(Math.max(...prices), 2)}</p><p className="text-xs text-muted-foreground">Средняя: {fmt(prices.reduce((a, b) => a + b, 0) / prices.length, 2)} {currency}</p></div>;
    })}</div><p className="mt-4 text-sm text-muted-foreground">Средняя — ориентир. В белый ввоз передаётся цена выбранной фабрики; разные валюты не смешиваются.</p></Panel>}
    <NextButton disabled={!selectedOffer(m)} onClick={onNext}>Рассчитать белый ввоз</NextButton>
  </div>;
}

function OfferCard({ value: o, index, selected, onChange, onSelect, onRemove }: { value: Offer; index: number; selected: boolean; onChange: (o: Offer) => void; onSelect: () => void; onRemove: () => void }) {
  const set = <K extends keyof Offer>(k: K, v: Offer[K]) => onChange({ ...o, [k]: v });
  return <div className={`rounded-2xl border bg-white p-5 ${selected ? "border-[#769b64] ring-1 ring-[#769b64]/30" : "border-border"}`}>
    <div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Factory className="size-4 text-muted-foreground" /><h3 className="font-medium">Фабрика {index + 1}</h3>{selected && <Badge variant="secondary">В расчёте</Badge>}</div><RemoveButton label="Удалить предложение" description="Цена, ссылка и условия этой фабрики будут удалены после сохранения карточки." onRemove={onRemove} /></div>
    <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><TextField label="Название фабрики" value={o.name} onChange={(v) => set("name", v)} /><TextField label="Ссылка 1688 / Alibaba" value={o.url} onChange={(v) => set("url", v)} placeholder="https://…" /></div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3"><NumberField label="Цена за штуку" value={o.price} onChange={(v) => set("price", v)} /><Choice label="Валюта" value={o.currency} onChange={(v) => set("currency", v as Offer["currency"])} options={[["CNY", "CNY · юань"], ["USD", "USD · доллар"], ["RUB", "RUB · рубль"]]} /><NumberField label="MOQ, шт." value={o.moq} onChange={(v) => set("moq", v)} integer /></div>
      <div className="grid gap-4 sm:grid-cols-2"><TextField label="Контакт / WeChat / email" value={o.contact} onChange={(v) => set("contact", v)} /><TextField type="date" label="Дата получения цены" value={o.quotedAt} onChange={(v) => set("quotedAt", v)} /></div>
      <NumberField label="Производство по ответу фабрики, дней" value={o.productionDays} onChange={(v) => set("productionDays", v)} integer placeholder="Не уточнено; в анализе заложено 45" />
      <details className="rounded-xl bg-muted/60 p-3" open={selected}><summary className="cursor-pointer text-sm font-medium">Упаковка для расчёта доставки</summary><div className="mt-4 grid grid-cols-3 gap-3"><NumberField label="Длина, мм" value={o.lengthMm} onChange={(v) => set("lengthMm", v)} /><NumberField label="Ширина, мм" value={o.widthMm} onChange={(v) => set("widthMm", v)} /><NumberField label="Высота, мм" value={o.heightMm} onChange={(v) => set("heightMm", v)} /></div><div className="mt-3 grid grid-cols-2 gap-3"><NumberField label="Брутто коробки, кг" value={o.weightKg} onChange={(v) => set("weightKg", v)} /><NumberField label="Штук в коробке" value={o.unitsPerCarton} onChange={(v) => set("unitsPerCarton", v)} integer /></div><p className="mt-3 text-xs text-muted-foreground">Мастер-картон, не упаковка одной штуки. Эти размеры не подставляются в логистику WB.</p></details>
      <LongField label="Комплектация и условия оплаты" value={o.terms} onChange={(v) => set("terms", v)} placeholder="Условия цены, предоплата, что входит, что оплачивается отдельно" />
    </div>
    <div className="mt-4 flex items-center justify-between"><SafeAnchor href={o.url}>Открыть предложение</SafeAnchor><Button variant={selected ? "secondary" : "outline"} onClick={onSelect}>{selected ? <Check className="size-4" /> : null}{selected ? "Выбрано" : "Выбрать для расчёта"}</Button></div>
  </div>;
}

export function ImportPanel({ model: m, onChange, onNext }: { model: Model; onChange: (m: Model) => void; onNext: () => void }) {
  const i = m.import; const r = calculateImport(m); const o = selectedOffer(m);
  const set = <K extends keyof ImportInputs>(k: K, v: ImportInputs[K]) => onChange({ ...m, import: { ...i, [k]: v, ...(k === "cnyPurchase" ? { cnyCustoms: v as number | null } : k === "usdPurchase" ? { usdCustoms: v as number | null } : {}) } });
  const num = (key: keyof ImportInputs, label: string, hint?: string) => <NumberField key={key} label={label} hint={hint} value={i[key] as number | null} onChange={(v) => set(key, v as never)} />;
  return <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_21.25rem]"><div className="space-y-5">
    <Panel title="Белый ввоз" aside={<Truck className="size-5 text-muted-foreground" />}><QuoteBanner model={m} />
      <div className="mt-5 grid gap-4 sm:grid-cols-3">{num("quantity", "Партия, шт.", o?.moq ? `MOQ фабрики: ${fmt(o.moq)}` : "MOQ ещё не подтверждён")}{num("dutyPct", "Пошлина, %", "По вашему коду ТН ВЭД")}{num("vatPct", "Импортный НДС, %")}</div>
      <Notice>Импортный НДС всегда включён в себестоимость. Ставки и курсы — ваши вводные, не автоматическая проверка таможенных тарифов.</Notice>
    </Panel>
    <Panel title="Курсы и комиссии" summary="Юань · USD · агент · валютный контроль" defaultOpen={false}><div className="grid grid-cols-2 gap-4">{num("cnyPurchase", "Юань, ₽", "Один курс для покупки и таможни")}{num("usdPurchase", "USD, ₽", "Один курс для покупки и таможни")}{num("agentPct", "Комиссия агента, %")}{num("currencyControlPct", "Валютный контроль, %")}</div>{(i.cnyPurchase !== i.cnyCustoms || i.usdPurchase !== i.usdCustoms) && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><p>В сохранённом расчёте остались прежние таможенные курсы: юань {i.cnyCustoms ?? "—"} ₽, USD {i.usdCustoms ?? "—"} ₽. Примените курсы выше, чтобы пересчитать его по единому курсу.</p><Button variant="outline" className="mt-2" onClick={() => onChange({ ...m, import: { ...i, cnyCustoms: i.cnyPurchase, usdCustoms: i.usdPurchase } })}>Применить единые курсы</Button></div>}</Panel>
    <Panel title="Международная доставка">{i.allocation ? <div className="rounded-xl bg-[#eef5e6] p-4 text-sm"><b>Общий контейнер · доля по объёму {i.allocation.share == null ? "—" : fmt(i.allocation.share * 100, 1) + "%"}</b><p className="mt-2">Фрахт этой модели: {i.allocation.freightUsd == null ? "—" : fmt(i.allocation.freightUsd, 2) + " $"}. Общие расходы: {rub(i.allocation.expensesRub)}.</p><p className="mt-2 text-muted-foreground">Состав и стоимость редактируются в «Общем контейнере» над таблицей моделей.</p>{i.allocation.issue && <p className="mt-2 text-amber-900">{i.allocation.issue}</p>}<div className="mt-3">{num("borderPct", "Фрахт до границы, %")}</div></div> : <><div className="grid gap-4 sm:grid-cols-2"><Choice label="Способ доставки" value={i.mode} onChange={(v) => set("mode", v as ImportInputs["mode"])} options={[["groupage", "Авто · сборный груз"], ["container", "Контейнер"]]} />{num("borderPct", "Фрахт до границы, %")}</div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">{i.mode === "groupage" ? <>{num("rateUsdM3", "Ставка, $ / м³")}{num("operationUsd", "Операционный сбор, $")}{num("densityKgM3", "Тарифная плотность, кг / м³")}</> : <>{num("containerUsd", "Контейнер, $")}{num("containerM3", "Полезный объём, м³")}{num("containers", "Контейнеров")}</>}</div>{i.mode === "container" && <p className="mt-3 text-xs text-muted-foreground">В этом режиме весь фрахт относится к одной модели. Для нескольких моделей используйте «Общий контейнер».</p>}</>}
      {r.ok && <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Коробок" value={fmt(r.cartons)} /><Metric label="Объём партии" value={`${fmt(r.volume, 3)} м³`} /><Metric label="Вес партии" value={`${fmt(r.weight, 1)} кг`} /><Metric label="Фрахт" value={`${fmt(r.freightUsd, 2)} $`} /></div>}
    </Panel>
    <Panel title="Прочие расходы на всю партию" summary="Брокер · терминал · сертификация · прочее" defaultOpen={false}><div className="grid gap-4 sm:grid-cols-2">{num("broker", "Таможенное оформление, ₽")}{num("terminal", "Терминальные расходы, ₽")}{num("inland", "Вывоз груза, ₽")}{num("unloading", "Разгрузка, ₽")}{num("inspection", "Инспекция, ₽")}{num("certification", "Сертификация, ₽")}{num("other", "Прочее, ₽")}{num("customsFeeOverride", "Таможенный сбор вручную, ₽", "Пусто — шкала из вашего файла")}</div><div className="mt-4"><LongField label="Источник ставок и дополнительные условия" value={i.note} onChange={(v) => set("note", v)} /></div></Panel>

    </div><aside className="xl:sticky xl:top-5"><Panel title="Себестоимость в России">
      <div className="my-5"><div className="text-4xl font-semibold tracking-tight tabular-nums">{r.ok ? rub(r.unit) : "—"}</div><p className="mt-2 text-sm text-muted-foreground">за единицу · с импортным НДС</p></div>
      {r.ok ? <><div className="mb-5 rounded-xl bg-[#edf5df] p-4"><span className="text-sm text-[#526740]">Денег на всю поставку</span><div className="mt-1 text-2xl font-semibold tabular-nums">{rub(r.cash)}</div></div><div className="space-y-3">{r.lines.map((l) => <MoneyLine key={l.label} label={l.label} value={l.total / r.qty} />)}</div>{r.warnings.length > 0 && <IssueList title="Проверьте" items={r.warnings} />}</> : <IssueList title="Для расчёта не хватает" items={r.issues} neutral />}
      <NextButton disabled={!r.ok} onClick={onNext}>Перейти к юнитке WB</NextButton>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">Себестоимость передаётся автоматически. При изменении цены фабрики или партии все следующие расчёты обновятся.</p>
    </Panel></aside></div>;
}

export function WbPanel({ model: m, onChange, onNext }: { model: Model; onChange: (m: Model) => void; onNext: () => void }) {
  const w = m.wb; const r = calculateWb(m); const imported = calculateImport(m);
  const stress = calculateWb(m, { price: (w.price ?? 0) * (1 + w.stressPricePct / 100), drrPct: Math.min(100, w.drrPct + w.stressDrrPoints) });
  const set = <K extends keyof WbInputs>(k: K, v: WbInputs[K]) => onChange({ ...m, wb: { ...w, [k]: v } });
  const num = (k: keyof WbInputs, label: string, hint?: string) => <NumberField key={k} label={label} hint={hint} value={w[k] as number | null} onChange={(v) => set(k, v as never)} />;
  return <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_21.25rem]"><div className="space-y-5">
    <Panel title="Цена и модель продаж" aside={<Badge variant="outline">Тарифы вводятся вручную</Badge>}>
      <div className="mb-5 flex flex-wrap justify-between gap-3 rounded-xl bg-[#edf5df] p-4"><span className="text-sm">Себестоимость из белого ввоза · {m.name}</span><b className="tabular-nums">{imported.ok ? rub(imported.unit) : "Не рассчитана"}</b></div>
      <div className="grid gap-4 sm:grid-cols-3"><Choice label="Схема" value={w.scheme} onChange={(v) => {
        onChange(switchWbScheme(m, v as WbInputs["scheme"]));
      }} options={[["FBW", "FBW / FBO · склад WB"], ["FBS", "FBS · свой склад"]]} />{num("price", "Цена продавца с НДС, ₽", "После скидки продавца, до СПП")}{num("sppPct", "СПП за счёт WB, %")}</div>
      <p className="mt-4 text-sm text-muted-foreground">Цена покупателя: <b className="text-foreground">{w.price ? rub(w.price * (1 - w.sppPct / 100)) : "—"}</b>. СПП показана справочно и повторно не вычитается из выручки продавца.</p>
    </Panel>
    <Panel title="Расходы WB"><div className="grid gap-4 sm:grid-cols-3">{num("commissionPct", "Комиссия WB, %")}{num("extraCommissionPct", "Допы к комиссии, %")}{num("acquiringPct", "Эквайринг, %")}{num("buyoutPct", "Выкуп, %")}{num("forwardLogistics", "Прямая логистика / заказ, ₽")}{num("returnLogistics", "Обратная / невыкуп, ₽")}{num("storage", "Хранение / выкуп, ₽")}{num("packaging", "Упаковка / штука, ₽")}{num("other", "Прочие / выкуп, ₽")}{num("drrPct", "ДРР от выручки, %")}</div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2"><TextField type="date" label="Тарифы проверены на дату" value={w.tariffDate} onChange={(v) => set("tariffDate", v)} /><TextField label="Источник / склад / условия" value={w.tariffSource} onChange={(v) => set("tariffSource", v)} placeholder="Кабинет WB, склад, тариф и коэффициент" /></div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">API не подключён. При смене схемы зависящие от неё тарифы очищаются. Все процентные расходы считаются от цены продавца. Логистика на выкуп = прямая / доля выкупа + обратная × доля невыкупа / доля выкупа. Это оценка повторных отправок, без имитации движения остатков.</p>
    </Panel>
    <Panel title="Налоги в плановом расчёте"><div className="grid gap-4 sm:grid-cols-3"><Choice label="Объект УСН" value={w.taxMode} onChange={(v) => set("taxMode", v as WbInputs["taxMode"])} options={[["profit", "Доходы минус расходы"], ["income", "Доходы"]]} />{num("taxPct", "Ставка УСН, %")}{num("vatPct", "НДС при продаже, %")}</div>
      {w.taxMode === "profit" && <label className="mt-4 flex items-center gap-3 text-sm"><Switch checked={w.minimumTaxReserve} onCheckedChange={(v) => set("minimumTaxReserve", v)} />Учитывать минимум УСН — 1% дохода</label>}
      {w.taxMode === "profit" && <p className="mt-2 text-sm text-muted-foreground">{minimumTaxHint}</p>}
      <p className="mt-4 text-xs leading-5 text-muted-foreground">По умолчанию — ваш сценарий 15% «доходы минус расходы» + 5% НДС. НДС выделяется из цены: ставка / (100 + ставка). Входной НДС остаётся в себестоимости, вычеты не моделируются. Минимальный налог распределён условно: фактически он определяется по итогам года по бизнесу в целом. Признание расходов, страховые взносы и индивидуальные льготы уточняются с бухгалтером. ОСНО здесь не рассчитывается.</p>
      <div className="mt-3 flex gap-4 text-xs"><SafeAnchor href="https://www.nalog.gov.ru/rn77/taxation/taxes/nds_usn/">НДС · ФНС</SafeAnchor><SafeAnchor href="https://www.nalog.gov.ru/rn77/taxation/taxes/usn/">УСН · ФНС</SafeAnchor><SafeAnchor href="https://dev.wildberries.ru/docs/openapi/rates">Тарифы · WB</SafeAnchor></div>
    </Panel>
    <Panel title="Если условия ухудшатся" summary="Проверка снижения цены и роста рекламных расходов" defaultOpen={false}><div className="grid gap-4 sm:grid-cols-2">{num("stressPricePct", "Изменение цены, %")}{num("stressDrrPoints", "Рост ДРР, процентных пунктов")}</div><div className="mt-4 grid grid-cols-2 gap-4"><Metric label="Базовая прибыль / шт." value={r.ok ? rub(r.profit) : "—"} /><Metric label="Прибыль при ухудшении / шт." value={stress.ok ? rub(stress.profit) : "—"} danger={stress.ok && stress.profit < 0} /></div><p className="mt-3 text-xs text-muted-foreground">Это проверка заданных допущений, не вероятность и не прогноз рынка.</p></Panel>
    </div><aside className="xl:sticky xl:top-5"><Panel title="Экономика одной продажи"><div className="my-5"><div className={`text-4xl font-semibold tracking-tight tabular-nums ${r.ok && r.profit < 0 ? "text-red-700" : ""}`}>{r.ok ? rub(r.profit) : "—"}</div><p className="mt-2 text-sm text-muted-foreground">прибыль с рекламой и налогами</p></div>
      {r.ok ? <><div className="mb-5 grid grid-cols-2 gap-3"><Metric label="Маржа от цены" value={`${fmt(r.margin, 1)}%`} /><Metric label="ROI на ввезённый товар¹" value={`${fmt(r.roi, 1)}%`} /></div><div className="space-y-3"><MoneyLine label="Цена продавца" value={r.price} /><MoneyLine label="Себестоимость" value={imported.ok ? imported.unit : 0} /><MoneyLine label="Комиссия WB" value={r.commission} /><MoneyLine label="Эквайринг" value={r.acquiring} /><MoneyLine label="Логистика с невыкупами" value={r.logistics} /><MoneyLine label="Реклама" value={r.ads} /><MoneyLine label="НДС с продажи" value={r.outputVat} /><MoneyLine label="УСН / резерв" value={r.tax} /><MoneyLine label="Без рекламы · прибыль" value={r.profitNoAds} /></div></> : <IssueList title="Осталось заполнить" items={r.issues} neutral />}
      <NextButton disabled={!r.ok} onClick={onNext}>Составить план продаж</NextButton><p className="mt-3 text-xs leading-5 text-muted-foreground">¹ Прибыль / (ввезённая себестоимость + упаковка). Не годовая доходность и не ROI на весь оборотный капитал.</p>
    </Panel></aside></div>;
}

export function PlanPanel({ model: m, onChange, onNext }: { model: Model; onChange: (m: Model) => void; onNext: () => void }) {
  const p = m.plan; const r = calculatePlan(m); const [detail, setDetail] = useState(false);
  const set = <K extends keyof typeof p>(k: K, v: typeof p[K]) => onChange({ ...m, plan: { ...p, [k]: v } });
  return <div className="space-y-5"><Panel title="План сезона" aside={<Badge variant="outline">План по вашим допущениям</Badge>}>
    <div className="grid gap-4 sm:grid-cols-3"><TextField label="Начало продаж" type="date" value={p.startDate} onChange={(v) => set("startDate", v)} /><NumberField label="Выкупить за сезон, шт." hint={`Партия: ${fmt(m.import.quantity)} шт.`} value={p.sellUnits} onChange={(v) => set("sellUnits", v)} integer /><NumberField label="Лаг выплат, дней" value={p.payoutLag} onChange={(v) => set("payoutLag", v ?? 0)} integer /></div>
    <div className="mt-5"><LongField label="Почему такая партия и такой план *" value={p.rationale} onChange={(v) => set("rationale", v)} placeholder="Сколько продали сопоставимые конкуренты за какой период, были ли обнуления остатков, почему берём этот объём?" /></div>
    <Notice>Количество выбираете вы по конкурентам. План распределяет заданный объём; не предсказывает, что рынок его выкупит. Первая версия предполагает поступление всей партии до начала продаж.</Notice>
  </Panel>
    <div className="grid gap-4 lg:grid-cols-3">{p.phases.map((phase, k) => <Panel key={k} title={phase.name} aside={<span className="text-xs text-muted-foreground">0{k + 1}</span>}><div className="grid grid-cols-2 gap-4">{([["days", "Дней"], ["share", "Доля выкупов, %"], ["pricePct", "Цена от базовой, %"], ["drrPct", "ДРР, %"], ["commissionPct", "Комиссия WB, %"]] as const).map(([key, label]) => <NumberField key={key} label={label} value={phase[key]} hint={key === "drrPct" || key === "commissionPct" ? "Пусто — из юнитки" : undefined} onChange={(v) => set("phases", p.phases.map((x, n) => n === k ? { ...x, [key]: v } : x))} />)}</div></Panel>)}</div>
    {r.ok ? <><div className="grid grid-cols-2 gap-3 xl:grid-cols-5"><Metric large label="Выручка" value={rub(r.revenue)} /><Metric large label="Плановая прибыль" value={rub(r.profit)} danger={r.profit < 0} /><Metric large label="Ввезённая партия + упаковка" value={rub(r.upfront)} /><Metric large label="Остаток после сезона" value={`${fmt(r.stock)} шт.`} /><Metric large label="Выход из сезона" value={prettyDate(r.seasonEnd)} /></div>
      <Panel title="Распределение выкупов"><div className="flex h-32 items-end gap-[0.125rem]" aria-label="План выкупов по дням">{r.days.filter((d) => d.phase !== "Ожидание выплат").map((d) => <div key={d.date} className="min-w-0 flex-1 rounded-t-sm bg-[#91b96e]" style={{ height: `${Math.max(2, d.sold / Math.max(1, ...r.days.map((x) => x.sold)) * 100)}%` }} title={`${prettyDate(d.date)} · ${d.sold} шт.`} />)}</div><div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{prettyDate(p.startDate)}</span><span>{prettyDate(r.seasonEnd)}</span></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3"><Metric label="Последняя плановая выплата" value={prettyDate(r.lastReceiptDate)} /><Metric label="Возврат денег на партию¹" value={r.breakEvenDate ? prettyDate(r.breakEvenDate) : "Не возвращаются в плане"} /><Metric label="Деньги после выплат¹" value={rub(r.cash)} /></div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">¹ Условный денежный план: партия и упаковка оплачены до старта, выплаты с заданным лагом, налоги зарезервированы сразу. Не календарь платежей по договору и не полный ДДС. Складское движение возвратов и поставки частями пока не моделируются.</p>
      </Panel>
      <Panel title="Расчёт по дням" aside={<Button variant="ghost" size="sm" onClick={() => setDetail(!detail)}>{detail ? "Свернуть" : "Показать"}<ChevronDown className="size-4" /></Button>}>
        {!detail ? <p className="text-sm text-muted-foreground">{r.days.length} дней рассчитаны автоматически. Комиссии и ДРР наследуются из юнитки или задаются на фазу.</p> : <div className="max-h-96 overflow-auto"><Table><TableHeader><TableRow><TableHead>Дата</TableHead><TableHead>Фаза</TableHead><TableHead>Выкуп, шт.</TableHead><TableHead>Цена, ₽</TableHead><TableHead>ДРР</TableHead><TableHead>Комиссия</TableHead><TableHead>Остаток</TableHead><TableHead>Выручка, ₽</TableHead><TableHead>Прибыль, ₽</TableHead><TableHead>Выплата¹, ₽</TableHead></TableRow></TableHeader><TableBody>{r.days.map((d) => <TableRow key={d.date}><TableCell>{prettyDate(d.date)}</TableCell><TableCell>{d.phase}</TableCell><TableCell>{fmt(d.sold)}</TableCell><TableCell>{fmt(d.price)}</TableCell><TableCell>{fmt(d.drr, 1)}%</TableCell><TableCell>{fmt(d.commission, 1)}%</TableCell><TableCell>{fmt(d.stock)}</TableCell><TableCell>{fmt(d.revenue)}</TableCell><TableCell>{fmt(d.profit)}</TableCell><TableCell>{fmt(d.receipt)}</TableCell></TableRow>)}</TableBody></Table></div>}
      </Panel>
    </> : <Panel title="План ещё не рассчитан"><IssueList title="Проверьте вводные" items={r.issues} neutral /></Panel>}
    <NextButton disabled={!r.ok} onClick={onNext}>Собрать итог для решения</NextButton>
  </div>;
}

function DecisionPanel({ content, onChange, record, canDecide, passed, issues, saving, save }: { content: CandidateContent; onChange: (c: CandidateContent) => void; record?: Candidate; canDecide: boolean; passed: boolean; issues: string[]; saving: boolean; save: (a: CandidateAction) => Promise<boolean> }) {
  const selected = content.models.find((m) => m.id === content.selectedModelId);
  const finding = analysisFindings(content.analysis);
  return <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20.625rem]"><div className="space-y-5"><Panel title="Сравнение моделей">
    {!content.models.length ? <p className="text-sm text-muted-foreground">Модели появятся после допуска ниши к дальнейшей проработке.</p> : <div className="overflow-auto"><Table><TableHeader><TableRow><TableHead>Модель / фабрика</TableHead><TableHead>Себестоимость</TableHead><TableHead>Прибыль / шт.</TableHead><TableHead>Маржа</TableHead><TableHead>Плановая прибыль</TableHead><TableHead /></TableRow></TableHeader><TableBody>{content.models.map((m) => {
      const i = calculateImport(m); const w = calculateWb(m); const p = calculatePlan(m); const o = selectedOffer(m);
      return <TableRow key={m.id} className={m.id === selected?.id ? "bg-[#eff6e5]" : ""}><TableCell><div className="font-medium">{m.name || "Без названия"}</div><div className="mt-1 text-xs text-muted-foreground">{o?.name || "Фабрика не выбрана"}</div></TableCell><TableCell>{i.ok ? rub(i.unit) : "—"}</TableCell><TableCell>{w.ok ? rub(w.profit) : "—"}</TableCell><TableCell>{w.ok ? `${fmt(w.margin, 1)}%` : "—"}</TableCell><TableCell>{p.ok ? rub(p.profit) : "—"}</TableCell><TableCell><Button size="sm" variant="outline" onClick={() => onChange({ ...content, selectedModelId: m.id })}>{m.id === selected?.id ? <Check className="size-4" /> : "Выбрать"}</Button></TableCell></TableRow>;
    })}</TableBody></Table></div>}
    <p className="mt-3 text-xs leading-5 text-muted-foreground">Для первого решения выбирается одна модель. Остальные расчёты сохраняются для сравнения.</p>
  </Panel><Panel title="Аргументы и риски"><p className="whitespace-pre-wrap text-sm leading-6">{content.analysis.comment || "Комментарий анализа пока не заполнен"}</p>{finding.risks.length > 0 && <IssueList title="Выявленные риски" items={finding.risks} />}{content.analysis.riskReason && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">Почему продолжаем: {content.analysis.riskReason}</p>}<div className="mt-5"><LongField label="Итоговый комментарий / причина решения *" value={content.decisionComment} onChange={(decisionComment) => onChange({ ...content, decisionComment })} placeholder="Что предлагаем, какие ограничения принимаем — или почему откладываем / отклоняем" /></div></Panel>
      {record && "history" in record && <details className="rounded-2xl border bg-white p-5"><summary className="cursor-pointer text-sm font-medium">История работы</summary><div className="mt-3 space-y-3">{(record as Candidate & { history: Array<{ at: string; actor: string; status: Candidate["status"]; note: string; revision: number }> }).history.slice().reverse().map((h) => <div key={h.revision} className="border-b pb-3 text-sm"><b>{prettyDate(h.at)} · {statusLabels[h.status]}</b><div className="mt-1 text-xs text-muted-foreground">{h.actor}</div>{h.note && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{h.note}</p>}</div>)}</div></details>}
    </div><aside className="xl:sticky xl:top-5"><Panel title="Следующее действие">
      {!passed && <Notice>Ниша ещё не прошла анализ. Отложить или отклонить её можно с комментарием.</Notice>}
      {passed && issues.length > 0 && <IssueList title="До передачи владельцу" items={issues} neutral />}
      {passed && issues.length === 0 && <Notice><CheckCircle2 className="mr-2 inline size-4" />Карточка собрана. Передавайте актуальную версию на решение.</Notice>}
      <div className="mt-4 space-y-2"><Button className="w-full" disabled={!passed || issues.length > 0 || saving || record?.status === "purchased"} onClick={() => void save("ready")}><ArrowRight className="size-4" />Передать на решение</Button>
        {canDecide && <AlertDialog><AlertDialogTrigger asChild><Button className="w-full bg-[#cee999] text-[#203819] hover:bg-[#bfdc88]" disabled={record?.status !== "ready" || saving || issues.length > 0}><Check className="size-4" />Одобрить к закупке</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Одобрить выбранную модель?</AlertDialogTitle><AlertDialogDescription>{selected?.name}. Решение сохранится в истории. Заказ фабрике и оплата автоматически не отправляются.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={() => void save("purchase")}>Подтвердить решение</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
        <Button variant="outline" className="w-full" disabled={saving || !content.decisionComment.trim()} onClick={() => void save("defer")}>Отложить с причиной</Button><Button variant="ghost" className="w-full text-red-700" disabled={saving || !content.decisionComment.trim()} onClick={() => void save("reject")}>Отклонить с причиной</Button>
      </div><p className="mt-4 text-xs leading-5 text-muted-foreground">Отложенные запросы остаются в чистовике. Отказы видны во вкладке «Исключённые». Сохранённые расчёты не удаляются и снова появятся в «Кандидаты + юнит» после возобновления работы.</p>
    </Panel></aside></div>;
}

export function CandidateBadge({ status }: { status: Candidate["status"] }) { return <Badge variant="outline" className={status === "rejected" ? "border-red-200 bg-red-50 text-red-700" : status === "deferred" ? "border-amber-200 bg-amber-50 text-amber-800" : ["analysis_ready", "ready", "purchased"].includes(status) ? "border-[#b5d08d] bg-[#eefaD9] text-[#35562c]" : "border-border bg-white text-muted-foreground"}>{statusLabels[status]}</Badge>; }
export function Panel({ title, aside, summary, defaultOpen = false, children }: { title: string; aside?: ReactNode; summary?: string; defaultOpen?: boolean; children: ReactNode }) { return <WorkspaceSection title={title} aside={aside} summary={summary} defaultOpen={defaultOpen}>{children}</WorkspaceSection>; }
export function Notice({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warning" }) { return <div className={`my-4 rounded-xl px-4 py-3 text-sm leading-6 ${tone === "warning" ? "bg-amber-50 text-amber-900" : "bg-[#f2f5ee] text-[#586450]"}`}>{children}</div>; }
export function EmptyBlock({ title, copy, children, icon }: { title: string; copy: string; children?: ReactNode; icon?: ReactNode }) { return <section className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed bg-white p-8 text-center"><div className="mb-4 text-muted-foreground">{icon}</div><h2 className="text-xl font-semibold tracking-tight">{title}</h2><p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">{copy}</p>{children && <div className="mt-5 flex flex-wrap justify-center gap-3">{children}</div>}</section>; }
function CountFlag({ tone, count, label }: { tone: "green" | "red"; count: number; label: string }) { return <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${tone === "green" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}><Flag className="size-3.5" /><b>{count}</b>{label}</div>; }
function Metric({ label, value, danger, large }: { label: string; value: string; danger?: boolean; large?: boolean }) { return <div className={`rounded-xl bg-[#f5f7f2] ${large ? "border p-5" : "p-3"}`}><p className="text-xs leading-5 text-muted-foreground">{label}</p><p className={`mt-1 font-semibold tabular-nums ${large ? "text-2xl tracking-tight" : "text-lg"} ${danger ? "text-red-700" : ""}`}>{value}</p></div>; }
function MoneyLine({ label, value }: { label: string; value: number }) { return <div className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground">{label}</span><span className="shrink-0 font-medium tabular-nums">{rub(value)}</span></div>; }
function IssueList({ title, items, neutral }: { title: string; items: string[]; neutral?: boolean }) { return <div className={`mt-4 rounded-xl p-3 text-sm ${neutral ? "bg-muted/60 text-muted-foreground" : "bg-red-50 text-red-800"}`}><b className="text-xs">{title}</b><ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5">{items.map((s, k) => <li key={`${s}-${k}`}>{s}</li>)}</ul></div>; }
function NextButton({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) { return <Button className="mt-5 h-auto min-h-10 whitespace-normal py-3" disabled={disabled} onClick={onClick}>{children}<ArrowRight className="size-4 shrink-0" /></Button>; }
function QuoteBanner({ model }: { model: Model }) { const o = selectedOffer(model); return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/60 p-4"><div><p className="text-sm font-medium">{model.name || "Модель без названия"} / {o?.name || "Фабрика не выбрана"}</p><p className="mt-1 text-xs text-muted-foreground">Цена, вес и габариты берутся из выбранного предложения</p></div><b className="text-lg tabular-nums">{o?.price != null ? `${fmt(o.price, 2)} ${o.currency}` : "—"}</b></div>; }
export function SafeAnchor({ href, children }: { href: string; children: ReactNode }) { let safe = false; try { safe = ["https:", "http:"].includes(new URL(href).protocol); } catch { /* incomplete draft */ } return safe ? <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-[#326347] underline-offset-4 hover:underline">{children}<ExternalLink className="size-3" /></a> : <span className="text-xs text-muted-foreground">Ссылка не заполнена</span>; }
function RemoveButton({ label, description, onRemove }: { label: string; description: string; onRemove: () => void }) { return <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" aria-label={label} className="text-muted-foreground hover:text-red-700"><Trash2 className="size-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{label}?</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Оставить</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={onRemove}>Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>; }
export function TextField({ label, value, onChange, placeholder, type = "text", error }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; error?: string }) { const id = useId(); return <div className="min-w-0"><label htmlFor={id} className="mb-2 block text-sm font-medium leading-5">{label}</label><Input id={id} required={label.includes("*")} data-check-error={error || (label.includes("*") && !value.trim() ? label.replace("*", "").trim() : undefined)} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-11 bg-white text-base" /></div>; }
export function NumberField({ label, value, onChange, hint, placeholder, integer }: { label: string; value: number | null; onChange: (v: number | null) => void; hint?: string; placeholder?: string; integer?: boolean }) { const id = useId(); return <div className="min-w-0"><label htmlFor={id} className="mb-2 block text-sm font-medium leading-5">{label}</label><Input id={id} type="number" step={integer ? "1" : "any"} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} placeholder={placeholder ?? "Не задано"} aria-describedby={hint ? `${id}-hint` : undefined} className="h-11 bg-[#fffdf5] text-base tabular-nums" />{hint && <p id={`${id}-hint`} className="mt-1.5 text-xs leading-5 text-muted-foreground">{hint}</p>}</div>; }
function LongField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) { const id = useId(); return <div><label htmlFor={id} className="mb-2 block text-sm font-medium">{label}</label><Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-h-24 bg-white text-base leading-6" /></div>; }
export function Choice({ label, value, onChange, options, hideLabel, required = true, error }: { label: string; value: string; onChange: (v: string) => void; options: readonly (readonly [string, string])[]; hideLabel?: boolean; required?: boolean; error?: string }) { const id = useId(); return <div className="min-w-0">{!hideLabel && <label htmlFor={id} className="mb-2 block text-sm font-medium leading-5">{label}</label>}<Select value={value} onValueChange={onChange}><SelectTrigger id={id} data-check-error={error || (required && value === "unknown" ? label.replace("*", "").trim() : undefined)} aria-label={label} className="h-11 w-full bg-white text-sm"><SelectValue /></SelectTrigger><SelectContent>{options.map(([v, name]) => <SelectItem value={v} key={v}>{name}</SelectItem>)}</SelectContent></Select></div>; }
