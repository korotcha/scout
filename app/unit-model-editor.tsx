"use client";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ModelPanel, ImportPanel, WbPanel, PlanPanel } from "./candidate-workspace";
import { calculateImport, calculateWb, type Model } from "@/lib/candidate-workflow";
import { rub,fmt } from "@/lib/market-types";

export type UnitTab="model"|"import"|"wb"|"plan";
export function UnitModelEditor({model,onChange,onRemove,initialTab="model",onDecision}:{model:Model;onChange:(m:Model)=>void;onRemove:()=>void;initialTab?:UnitTab;onDecision?:()=>void}) {
  const [tab,setTab]=useState<UnitTab>(initialTab),i=calculateImport(model),w=calculateWb(model);
  return <div className="unit-model-editor"><div className="unit-editor-summary"><span>Себестоимость <b>{i.ok?rub(i.unit):"—"}</b></span><span>Прибыль / шт. <b>{w.ok?rub(w.profit):"—"}</b></span><span>Маржа <b>{w.ok?fmt(w.margin,1)+"%":"—"}</b></span><span>ROI <b>{w.ok&&w.roi!=null?fmt(w.roi,1)+"%":"—"}</b></span></div><Tabs value={tab} onValueChange={v=>setTab(v as UnitTab)}><TabsList className="unit-editor-tabs"><TabsTrigger value="model">Модель и фабрики</TabsTrigger><TabsTrigger value="import">Себестоимость</TabsTrigger><TabsTrigger value="wb">Юнитка WB</TabsTrigger><TabsTrigger value="plan">План сезона</TabsTrigger></TabsList><TabsContent value="model"><ModelPanel model={model} onChange={onChange} onNext={()=>setTab("import")} onRemove={onRemove}/></TabsContent><TabsContent value="import"><ImportPanel model={model} onChange={onChange} onNext={()=>setTab("wb")}/></TabsContent><TabsContent value="wb"><WbPanel model={model} onChange={onChange} onNext={()=>setTab("plan")}/></TabsContent><TabsContent value="plan"><PlanPanel model={model} onChange={onChange} onNext={onDecision??(()=>setTab("wb"))}/></TabsContent></Tabs></div>;
}
