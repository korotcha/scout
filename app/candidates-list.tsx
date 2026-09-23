"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, ChevronDown, ChevronUp, GripVertical, ListFilter, Plus, RefreshCw, Save, Search, Ungroup } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CandidateBadge, Choice, EmptyBlock } from "./candidate-workspace";
import { newContent, calculateImport, calculatePlan, calculateWb, contentSchema, selectedOffer, withSharedContainer, type Candidate, type CandidateContent, type Model } from "@/lib/candidate-workflow";
import { modelWithDefaults, type CalculatorSettings } from "@/lib/calculator-settings";
import { CalculatorSettingsDialog, useCalculatorSettings } from "./calculator-settings";
import { UnitGrid } from "./unit-grid";
import { SharedContainer } from "./shared-container";
import { CompetitorThumbnail } from "./competitor-thumbnail";
import { parseSkus } from "@/lib/niche-research";
import { fmt,rub } from "@/lib/market-types";

type CandidateGroup = { name: string; rows: Candidate[] };

function candidateGroupName(candidate: Candidate) {
  return candidate.content.blockName.trim() || candidate.subject.trim() || "Без группы";
}

function CandidateGroupSection({ group, draggingId, busy, onRename, onDropCandidate, onDragStart, children }: {
  group: CandidateGroup; draggingId: string | null; busy: boolean; onRename: (group: CandidateGroup, name: string) => Promise<void>;
  onDropCandidate: (candidateId: string, groupName: string) => Promise<void>; onDragStart: (id: string | null) => void; children: ReactNode;
}) {
  const [draft,setDraft]=useState(group.name);
  useEffect(()=>setDraft(group.name),[group.name]);
  async function commit(){const name=draft.trim();if(!name||name===group.name){setDraft(group.name);return;}await onRename(group,name);}
  return <section className={`rounded-2xl border bg-white p-4 transition ${draggingId ? "border-dashed" : ""}`} onDragOver={e=>{if(draggingId)e.preventDefault();}} onDrop={e=>{e.preventDefault();if(draggingId)void onDropCandidate(draggingId,group.name);onDragStart(null);}}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1"><Input aria-label="Название группы кандидатов" className="h-9 max-w-md border-transparent bg-transparent px-1 text-base font-semibold hover:border-border focus:border-border" value={draft} disabled={busy} onChange={e=>setDraft(e.target.value)} onBlur={()=>void commit()} onKeyDown={e=>{if(e.key==="Enter"){e.currentTarget.blur();}if(e.key==="Escape")setDraft(group.name);}}/><p className="px-1 text-xs text-muted-foreground">{group.rows.length} {group.rows.length===1?"запрос":"запросов"} · перетащите запрос в другой блок, чтобы перегруппировать</p></div>
      <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">Блок кандидатов</span>
    </div>
    <div className="space-y-3">{children}</div>
  </section>;
}

export function CandidatesList({contextKey,rows,loading,error,onRetry,onOpen,onScreener,onSaved,onDirtyChange,canDecide}:{contextKey:string;rows:Candidate[];loading:boolean;error:string;onRetry:()=>void;onOpen:(id:string)=>void;onScreener:()=>void;onSaved:(c:Candidate)=>void;onDirtyChange:(v:boolean)=>void;canDecide:boolean}) {
  const [status,setStatus]=useState("all"),[search,setSearch]=useState(""); const defaults=useCalculatorSettings();
  const [organizing,setOrganizing]=useState<string|null>(null),[draggingId,setDraggingId]=useState<string|null>(null);
  const [creating,setCreating]=useState(false),[blockOpen,setBlockOpen]=useState(false),[blockName,setBlockName]=useState("");
  async function createBlock(){if(!blockName.trim())return;setCreating(true);try{const content=newContent();content.manualBlock=true;content.blockName=blockName.trim();const response=await fetch("/api/candidates",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contextKey,subject:"Самостоятельный блок",query:"block:"+crypto.randomUUID(),revision:0,action:"create_block",content})});const data=await response.json() as {candidate:Candidate;error?:string};if(!response.ok)throw new Error(data.error||"Не удалось создать блок");onSaved(data.candidate);setSearch("");setStatus("all");setBlockOpen(false);setBlockName("");toast.success("Блок создан — добавьте модели");}catch(e){toast.error(e instanceof Error?e.message:"Не удалось создать блок");}finally{setCreating(false);}}
  const dirtyRows=useRef(new Map<string,boolean>());
  const markDirty=useCallback((id:string,dirty:boolean)=>{dirtyRows.current.set(id,dirty);onDirtyChange([...dirtyRows.current.values()].some(Boolean));},[onDirtyChange]);
  const hasDirty=()=>[...dirtyRows.current.values()].some(Boolean);
  const changeFilter=(action:()=>void)=>{if(hasDirty()){toast.info("Сохраните расчёты перед сменой фильтра");return;}action();};
  const eligible=rows.filter(c=>c.content.manualBlock||["sourcing","ready","purchased"].includes(c.status));
  const filtered=eligible.filter(c=>(status==="all"||status===c.status)&&(c.content.blockName+" "+c.query+" "+c.subject+" "+c.content.models.map(m=>m.name).join(" ")).toLocaleLowerCase("ru").includes(search.trim().toLocaleLowerCase("ru")));
  const groups=[...filtered.reduce((map,c)=>{const name=candidateGroupName(c),group=map.get(name)??{name,rows:[] as Candidate[]};group.rows.push(c);map.set(name,group);return map;},new Map<string,CandidateGroup>()).values()];
  async function organizeCandidate(candidate:Candidate,name:string){
    if(hasDirty()){toast.info("Сохраните расчёты перед перегруппировкой");return false;}
    const blockName=name.trim();if(!blockName)return false;setOrganizing(candidate.id);
    try{const response=await fetch("/api/candidates",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:candidate.id,contextKey:candidate.contextKey,subject:candidate.subject,query:candidate.query,revision:candidate.revision,action:"organize",content:{...candidate.content,blockName}})});const data=await response.json() as {candidate?:Candidate;error?:string};if(!response.ok||!data.candidate)throw new Error(data.error||"Не удалось переместить запрос");onSaved(data.candidate);return true;}catch(e){toast.error(e instanceof Error?e.message:"Не удалось переместить запрос");return false;}finally{setOrganizing(null);}
  }
  async function renameGroup(group:CandidateGroup,name:string){for(const candidate of group.rows){if(!await organizeCandidate(candidate,name))return;}toast.success("Группа переименована");}
  async function dropCandidate(id:string,name:string){const candidate=filtered.find(c=>c.id===id);if(!candidate||candidateGroupName(candidate)===name)return;if(await organizeCandidate(candidate,name))toast.success(`Перемещено в «${name}»`);}
  return <main className="workspace-page unit-economics-page"><div className="unit-page-heading screener-heading"><div><h1 className="screener-title">Кандидаты + юнит</h1><p className="screener-subtitle">Кандидаты в закуп, модели, фабрики и unit economics в одном рабочем списке.</p></div><div className="flex flex-wrap gap-2"><Dialog open={blockOpen} onOpenChange={setBlockOpen}><DialogTrigger asChild><Button className="screener-primary"><Plus className="size-4"/>Добавить блок</Button></DialogTrigger><DialogContent><DialogTitle>Новый блок</DialogTitle><DialogDescription>Произвольный блок для модели, которой пока нет среди кандидатов из скринера.</DialogDescription><Input autoFocus aria-label="Название нового блока" placeholder="Например, запуск ноябрь" maxLength={200} value={blockName} onChange={e=>setBlockName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void createBlock();}}/><Button disabled={creating||!blockName.trim()||hasDirty()} onClick={()=>void createBlock()}>{creating?"Создаю…":"Создать блок"}</Button>{hasDirty()&&<p className="text-sm">Сначала сохраните изменения в текущих блоках.</p>}</DialogContent></Dialog><CalculatorSettingsDialog section="import" record={defaults.record} onSaved={defaults.setRecord} canEdit={canDecide}/><CalculatorSettingsDialog section="wb" record={defaults.record} onSaved={defaults.setRecord} canEdit={canDecide}/><Button variant="outline" onClick={onScreener}><ListFilter className="size-4"/>Скринер</Button></div></div>
    <div className="mb-3 rounded-xl bg-[#f5f7f2] px-4 py-3 text-xs leading-5 text-muted-foreground">По умолчанию запросы одного предмета собраны в один блок. Название блока можно изменить. Чтобы собрать блок по месяцу запуска, модели или другой логике — переименуйте один блок и перетащите в него нужные запросы. Кнопка «Отдельно» разъединяет запрос.</div>
    <div className="unit-list-toolbar"><div className="relative min-w-52 flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground"/><Input aria-label="Поиск моделей и запросов" value={search} onChange={e=>changeFilter(()=>setSearch(e.target.value))} placeholder="Модель, запрос, предмет или блок…" className="h-10 bg-white pl-9"/></div><div className="w-52"><Choice hideLabel label="Этап кандидата" value={status} onChange={value=>changeFilter(()=>setStatus(value))} options={[["all","Все этапы"],["sourcing","Кандидат в закуп"],["ready","Юнитка на решении"],["purchased","К закупке"]]}/></div><Button variant="ghost" aria-label="Обновить расчёты" onClick={()=>changeFilter(onRetry)}><RefreshCw className="size-4"/></Button></div>
    {defaults.error&&<p className="mb-4 text-sm text-amber-800">{defaults.error}. У новой модели проверьте курсы и ставки вручную.</p>}
    {error?<EmptyBlock title="Не удалось загрузить расчёты" copy={error}><Button onClick={onRetry}>Повторить</Button></EmptyBlock>:loading?<div role="status" className="rounded-2xl border bg-white p-8 text-center">Загружаем расчёты…</div>:!filtered.length?<EmptyBlock title={eligible.length?"Нет кандидатов с такими условиями":"Пока нет кандидатов в закуп"} copy={eligible.length?"Измените поиск или этап.":"Завершите анализ в чистовике. После решения владельца «Кандидат в закуп» запрос появится здесь — можно будет добавить модели и предложения фабрик."}><Button onClick={onScreener}>Открыть скринер</Button></EmptyBlock>:<div className="space-y-5">{groups.map(group=><CandidateGroupSection key={group.name} group={group} draggingId={draggingId} busy={!!organizing||hasDirty()} onRename={renameGroup} onDropCandidate={dropCandidate} onDragStart={setDraggingId}>{group.rows.map(c=><div key={c.id} draggable={!hasDirty()&&!organizing} onDragStart={e=>{e.dataTransfer.effectAllowed="move";setDraggingId(c.id);}} onDragEnd={()=>setDraggingId(null)} className={draggingId===c.id?"opacity-50":""}><UnitCandidateGroup candidate={c} defaults={defaults.record?.settings} defaultsLoading={defaults.loading} onOpen={()=>changeFilter(()=>onOpen(c.id))} onSaved={onSaved} onDirty={markDirty} organizing={organizing===c.id} onSeparate={()=>void organizeCandidate(c,c.query.trim()||c.subject)} onBySubject={()=>void organizeCandidate(c,c.subject)}/></div>)}</CandidateGroupSection>)}</div>}
  </main>;
}

function UnitCandidateGroup({candidate,defaults,defaultsLoading,onOpen,onSaved,onDirty,organizing,onSeparate,onBySubject}:{candidate:Candidate;defaults?:CalculatorSettings;defaultsLoading:boolean;onOpen:()=>void;onSaved:(c:Candidate)=>void;onDirty:(id:string,v:boolean)=>void;organizing:boolean;onSeparate:()=>void;onBySubject:()=>void}) {
  const [saved,setSaved]=useState(candidate),[content,setContent]=useState(()=>withSharedContainer(candidate.content)),[baseline,setBaseline]=useState(()=>JSON.stringify(withSharedContainer(candidate.content)));
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const dirty=JSON.stringify(content)!==baseline, locked=(!saved.analysisPassed&&!saved.content.manualBlock)||["rejected","deferred"].includes(saved.status);
  useEffect(()=>{onDirty(candidate.id,dirty||busy);return()=>onDirty(candidate.id,false);},[candidate.id,dirty,busy,onDirty]);
  useEffect(()=>{if(candidate.revision!==saved.revision&&!dirty&&!busy){setSaved(candidate);const next=withSharedContainer(candidate.content);setContent(next);setBaseline(JSON.stringify(next));}},[candidate,saved.revision,dirty,busy]);
  useEffect(()=>{const guard=(e:BeforeUnloadEvent)=>{if(dirty||busy)e.preventDefault();};window.addEventListener("beforeunload",guard);return()=>window.removeEventListener("beforeunload",guard);},[dirty,busy]);
  const change=(next:CandidateContent)=>setContent(withSharedContainer(next));
  const modelChange=(m:Model)=>setContent(c=>withSharedContainer({...c,models:c.models.map(x=>x.id===m.id?m:x)}));
  async function save(){
    const checked=contentSchema.safeParse(withSharedContainer(content));if(!checked.success){setError("Проверьте числа, даты и ссылки в раскрытом расчёте: "+checked.error.issues[0].message);return false;}
    setBusy(true);setError("");try{const response=await fetch("/api/candidates",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:saved.id,contextKey:saved.contextKey,subject:saved.subject,query:saved.query,revision:saved.revision,action:"save",content:checked.data})});const data=await response.json() as {candidate?:Candidate;error?:string};if(!response.ok||!data.candidate)throw new Error(data.error||"Не удалось сохранить");const next=data.candidate as Candidate;setSaved(next);setContent(next.content);setBaseline(JSON.stringify(next.content));onDirty(candidate.id,false);onSaved(next);toast.success("Расчёты сохранены");return true;}catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить. Ввод остаётся на экране.");return false;}finally{setBusy(false);}
  }
  function add(){const m=modelWithDefaults(defaults);m.plan.startDate=content.analysis.launchDate;change({...content,models:[...content.models,m],selectedModelId:content.selectedModelId||m.id});}
  async function decision(){if((!dirty||await save()))onOpen();}
  return <section className="unit-candidate-group"><div className="unit-group-header"><div className="flex min-w-0 items-start gap-2"><span className="mt-1.5 cursor-grab text-muted-foreground" title="Перетащить в другой блок"><GripVertical className="size-4"/></span><div className="min-w-0"><p className="truncate font-semibold">{candidate.content.manualBlock?(candidate.content.blockName||"Свой блок"):(candidate.query||candidate.subject)}</p><p className="mt-1 text-xs text-muted-foreground">{candidate.content.manualBlock?"Самостоятельный блок":candidate.subject} · {content.models.length} моделей</p></div></div><div className="flex flex-wrap items-center gap-2">{!content.manualBlock&&<CandidateBadge status={saved.status}/>}<SharedContainer content={content} onChange={change} disabled={locked||busy}/>{!content.manualBlock&&<><Button variant="ghost" size="sm" disabled={busy||organizing} onClick={onSeparate}><Ungroup className="size-4"/>Отдельно</Button>{candidate.content.blockName&&candidate.content.blockName!==candidate.subject&&<Button variant="ghost" size="sm" disabled={busy||organizing} onClick={onBySubject}>По предмету</Button>}</>}<Button variant="outline" size="sm" disabled={locked||busy||defaultsLoading||content.models.length>=100} onClick={add}><Plus className="size-4"/>Модель</Button>{!content.manualBlock&&<Button variant="ghost" size="sm" disabled={busy} onClick={()=>void decision()}>Разбор и решение<ArrowUpRight className="size-4"/></Button>}</div></div>
    {locked&&<p className="unit-group-notice">{saved.analysisPassed?"Расчёт сохранён. Возобновите работу в разборе, чтобы редактировать.":"Для продолжения владелец должен подтвердить актуальный анализ. Прежние расчёты сохранены."}</p>}
    {saved.status==="purchased"&&<p className="unit-group-notice">Изменение расчёта потребует повторного решения о закупке.</p>}
    {!content.models.length?<div className="unit-empty-model"><span>Добавьте модель по артикулу WB или заполните её вручную.</span><Button disabled={locked||busy||defaultsLoading} onClick={add}><Plus className="size-4"/>Добавить модель</Button></div>:<UnitGrid subject={candidate.subject} models={content.models} analysis={content.analysis} defaults={defaults} disabled={locked||busy} onChange={modelChange} onRemove={id=>{const models=content.models.filter(m=>m.id!==id);change({...content,models,selectedModelId:content.selectedModelId===id?models[0]?.id??"":content.selectedModelId,sharedContainer:content.sharedContainer?{...content.sharedContainer,modelIds:content.sharedContainer.modelIds.filter(x=>x!==id)}:null});}}/>}
    <div className="unit-group-footer"><div><p className="text-xs text-muted-foreground">¹ Ввезённая партия с импортным НДС и упаковкой. ROI — прибыль на единицу к её себестоимости с упаковкой.</p><p role="status" className={error?"mt-2 text-sm text-red-700":"mt-2 text-sm text-muted-foreground"}>{error|| (dirty?"Есть несохранённые изменения":"Все изменения сохранены")}</p></div><Button size="sm" disabled={locked||busy||!dirty} onClick={()=>void save()}><Save className="size-4"/>{busy?"Сохраняю…":"Сохранить расчёты"}</Button></div>
  </section>;
}
