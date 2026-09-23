"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { tariffSuggestion, type Tariffs } from "@/lib/wb-tariffs";
import type { Model } from "@/lib/candidate-workflow";
import { unitLiters } from "@/lib/unit-inputs";
import { Choice } from "./candidate-workspace";
import { fmt, rub } from "@/lib/market-types";
export function WbTariffPicker({model:m,subject,onChange,disabled}:{model:Model;subject:string;onChange:(m:Model)=>void;disabled:boolean}) {
  const [open,setOpen]=useState(false),[data,setData]=useState<Tariffs|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [selectedSubject,setSubject]=useState(m.wb.tariffSubject||m.wbCard?.subject||subject),[warehouse,setWarehouse]=useState(m.wb.warehouse);
  const liters=unitLiters(m);
  async function load(){setBusy(true);setError("");try{const r=await fetch("/api/wb-tariffs");const body=await r.json() as {tariffs?:Tariffs;error?:string};if(!r.ok||!body.tariffs)throw new Error(body.error||"Нет тарифов");setData(body.tariffs);}catch(e){setError(e instanceof Error?e.message:"Не удалось получить тарифы");}finally{setBusy(false);}}
  const suggestion=data?tariffSuggestion(data,selectedSubject,warehouse,m.wb.scheme,liters):null;
  function apply(){if(!data||!suggestion)return;const changes={...m.wb,tariffSubject:selectedSubject,warehouse,liters};
    const commissionEmpty=m.wb.commissionPct==null&&suggestion.commission!=null,logisticsEmpty=m.wb.forwardLogistics==null&&suggestion.logistics!=null;
    if(commissionEmpty)changes.commissionPct=suggestion.commission;
    if(logisticsEmpty)changes.forwardLogistics=suggestion.logistics;
    if(commissionEmpty||logisticsEmpty){changes.tariffDate=data.date;changes.tariffSource=`WB API · ${selectedSubject} · ${m.wb.scheme}${logisticsEmpty?" · "+warehouse+" · "+liters+" л":""}`;}
    onChange({...m,wb:changes});setOpen(false);
  }
  return <Popover open={open} onOpenChange={value=>{setOpen(value);if(value){setSubject(m.wb.tariffSubject||m.wbCard?.subject||subject);setWarehouse(m.wb.warehouse);void load();}}}><PopoverTrigger asChild><Button variant="outline" size="sm" disabled={disabled}>Тарифы WB</Button></PopoverTrigger><PopoverContent className="w-[min(25rem,90vw)] space-y-3"><h3 className="font-semibold">Тарифы {m.wb.scheme==="FBW"?"FBW / FBO":"FBS"}</h3>{busy?<p role="status">Загружаем тарифы…</p>:error?<p role="alert" className="text-sm text-amber-800">{error}</p>:data&&<>
    <label className="block text-sm">Предмет<Input list={`subjects-${m.id}`} value={selectedSubject} onChange={e=>setSubject(e.target.value)}/><datalist id={`subjects-${m.id}`}>{data.commissions.map(c=><option key={c.subjectID} value={c.subjectName}/>)}</datalist></label>
    <Choice label="Склад" value={warehouse||"none"} options={[["none","Выберите склад"],...data.warehouses.map(w=>[w.warehouseName,w.warehouseName] as const)]} onChange={v=>setWarehouse(v==="none"?"":v)}/>
    <p className="text-sm">Объём упаковки: <b>{liters==null?"Укажите размеры в себестоимости":fmt(liters,2)+" л"}</b></p>
    <div className="rounded-lg bg-muted p-3 text-sm"><p>Комиссия: {suggestion?.commission!=null?fmt(suggestion.commission,1)+"%":"Нет точного соответствия предмету"}</p><p>Базовая логистика: {suggestion?.logistics!=null?rub(suggestion.logistics):"Укажите склад и объём от 1 л"}</p><p className="mt-1 text-xs text-muted-foreground">Тарифы на {data.date}. Обновление — в API-подключениях.</p></div>
    <p className="text-xs leading-5 text-muted-foreground">Для обычных коробов. КГТ, объём меньше 1 л, индивидуальные условия и дополнительные коэффициенты проверьте вручную. Обратная логистика и хранение здесь не подставляются.</p>
    <Button className="w-full" disabled={disabled||(!suggestion?.commission&&!suggestion?.logistics&&suggestion?.commission!==0)} onClick={apply}>Заполнить пустые значения</Button><p className="text-xs text-muted-foreground">Заполненные ячейки не изменятся. Для новой ставки сначала очистите нужную ячейку.</p>
  </>}</PopoverContent></Popover>;
}
