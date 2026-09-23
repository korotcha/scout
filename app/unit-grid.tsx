"use client";
import { useState, type ReactNode } from "react";
import { ChevronRight, ChevronDown, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter } from "@/components/ui/table";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Choice } from "./candidate-workspace";
import { CompetitorThumbnail } from "./competitor-thumbnail";
import { WbModelLookup } from "./wb-model-lookup";
import { FactoryOffers } from "./factory-offers";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { unitLiters, quoteReceived } from "@/lib/unit-inputs";
import { WbTariffPicker } from "./wb-tariff-picker";
import { calculateImport, calculateWb, calculatePlan, selectedOffer, newOffer, type Model, type Offer, type Analysis } from "@/lib/candidate-workflow";
import { switchWbScheme, type CalculatorSettings } from "@/lib/calculator-settings";
import { parseSkus } from "@/lib/niche-research";
import { fmt, rub } from "@/lib/market-types";

type Group = "import" | "customs" | "wb" | "plan";
type Column = { key:string; label:string; cell:(m:Model)=>ReactNode; tone?:string; width?:number };
export function UnitGrid({models,analysis,subject,defaults,disabled,onChange,onRemove}:{models:Model[];analysis:Analysis;subject:string;defaults?:CalculatorSettings;disabled:boolean;onChange:(m:Model)=>void;onRemove:(id:string)=>void}) {
  const [expanded,setExpanded]=useState<Set<Group>>(new Set());
  const toggle=(g:Group)=>setExpanded(old=>{const next=new Set(old);next.has(g)?next.delete(g):next.add(g);return next;});
  const text=(label:string,value:string,change:(v:string)=>void,type="text")=><Input aria-label={label} title={label} type={type} placeholder={label} value={value} disabled={disabled} onChange={e=>change(e.target.value)} className="unit-cell-input"/>;
  const num=(label:string,value:number|null,change:(v:number|null)=>void,integer=false)=><Input aria-label={label} title={label} type="number" min="0" step={integer?"1":"any"} value={value??""} disabled={disabled} placeholder="—" onChange={e=>change(e.target.value===""?null:Number(e.target.value))} className="unit-cell-input tabular-nums text-right"/>;
  const choose=(label:string,value:string,options:string[][],change:(v:string)=>void)=>disabled?<span>{options.find(o=>o[0]===value)?.[1]??value}</span>:<Choice hideLabel label={label} value={value} options={options as [string,string][]} onChange={change}/>;
  const imp=(key:keyof Model["import"],label:string):Column=>({key:"i-"+key,label,tone:"entry",cell:m=>num(label,m.import[key] as number|null,v=>onChange({...m,import:{...m.import,[key]:v,...(key==="cnyPurchase"?{cnyCustoms:v}:key==="usdPurchase"?{usdCustoms:v}:{})}}),["quantity","containers"].includes(key))});
  const wb=(key:keyof Model["wb"],label:string):Column=>({key:"w-"+key,label,tone:"entry",cell:m=>num(label,m.wb[key] as number|null,v=>onChange({...m,wb:{...m.wb,[key]:v}}))});
  const updateOffer=(m:Model,key:keyof Offer,value:unknown)=>{const o=selectedOffer(m)??m.offers[0]??newOffer();const updated={...o,[key]:value,...(key==="price"?{quoteStatus:(Number(value)>0?"received":"waiting") as Offer["quoteStatus"]}:{})};onChange({...m,offers:m.offers.some(x=>x.id===o.id)?m.offers.map(x=>x.id===o.id?updated:x):[...m.offers,updated],selectedOfferId:o.id});};
  const offer=(key:keyof Offer,label:string,numeric=false):Column=>({key:"o-"+key,label,tone:"entry",cell:m=>numeric?num(label,selectedOffer(m)?.[key] as number|null??null,v=>updateOffer(m,key,v),["moq","unitsPerCarton"].includes(key)):text(label,String(selectedOffer(m)?.[key]??""),v=>updateOffer(m,key,v),key==="quotedAt"?"date":"text")});
  const result=(key:string,label:string,read:(m:Model)=>string):Column=>({key,label,tone:"result",cell:m=><span className="tabular-nums">{read(m)}</span>});
  const money=(kind:"import"|"wb"|"plan",key:string,m:Model)=>{const r=kind==="import"?calculateImport(m):kind==="wb"?calculateWb(m):calculatePlan(m);return r.ok?rub((r as unknown as Record<string,number>)[key]):"—";};
  const groups:Array<{id?:Group;label:string;columns:Column[]}>=[];
  groups.push({label:"Кандидат",columns:[
    {key:"month",label:"Месяц старта",tone:"entry",cell:m=>text("Месяц старта",m.plan.startDate.slice(0,7),v=>{if(!v){onChange({...m,plan:{...m.plan,startDate:""}});return;}const day=Number(m.plan.startDate.slice(8)||1),[year,month]=v.split("-").map(Number),last=new Date(year,month,0).getDate();onChange({...m,plan:{...m.plan,startDate:`${v}-${String(Math.min(day,last)).padStart(2,"0")}`}});},"month")},
    {key:"stage",label:"Этап",tone:"entry",cell:m=>choose("Этап модели",m.stage,[["factory","Поиск фабрики"],["quote","Ждём предложение"],["economics","Считаем экономику"],["decision","На решении"]],v=>onChange({...m,stage:v as Model["stage"]}))},
    {key:"production",label:"Изготовление, дней",tone:"entry",cell:m=>num("Срок изготовления",selectedOffer(m)?.productionDays??m.productionDays,v=>{if(v==null)return;const o=selectedOffer(m);onChange({...m,productionDays:v,offers:o?m.offers.map(x=>x.id===o.id?{...x,productionDays:v}:x):m.offers});},true)},
    result("reserve","Запас до старта",m=>{if(!m.plan.startDate)return "Укажите старт";const days=Math.floor((Date.parse(m.plan.startDate+"T00:00:00Z")-Date.parse(new Date().toISOString().slice(0,10)+"T00:00:00Z"))/86400000);const preparation=Math.max(selectedOffer(m)?.productionDays??m.productionDays,analysis.certification==="needed"?analysis.certificationDays:0)+analysis.deliveryDays;return days-preparation>=0?`${days-preparation} дн. на подготовку`:`Опоздание ${preparation-days} дн.`;}),
  ]});
  groups.push({id:"import",label:"Себестоимость",columns:[
    result("cost","Себестоимость, ₽",m=>money("import","unit",m)),
    ...(!expanded.has("import")?[{key:"quotes-count",label:"Предложения",cell:(m:Model)=><span>{m.offers.filter(quoteReceived).length} из {Math.max(1,m.offers.length)} цен</span>}]:[
      {...offer("url","Фабрика · ссылка"),width:180},
      offer("price","Цена фабрики",true),
      {key:"currency",label:"Валюта",width:75,cell:(m:Model)=>choose("Валюта",selectedOffer(m)?.currency??"CNY",[["CNY","¥"],["USD","$"],["RUB","₽"]],v=>updateOffer(m,"currency",v))},
      {key:"offers",label:"Предложения",width:140,cell:(m:Model)=><Dialog><DialogTrigger asChild><Button variant="outline" size="sm">Фабрики · {Math.max(1,m.offers.length)}</Button></DialogTrigger><DialogContent className="factory-dialog sm:max-w-[1100px] max-h-[85vh] overflow-auto bg-white"><DialogTitle>Фабрики — {m.name||"модель"}</DialogTitle><DialogDescription>Одна основная фабрика задаёт цену для расчёта. Другие предложения сохраняются для сравнения.</DialogDescription><FactoryOffers model={m} disabled={disabled} onChange={onChange}/></DialogContent></Dialog>},
      {key:"unit-package",label:"Упаковка одной единицы",width:215,cell:(m:Model)=>{
        const o=selectedOffer(m);
        if(!o)return <span className="text-xs">Введите ссылку или цену фабрики</span>;
        if(o.unitsPerCarton!==1&&(o.lengthMm||o.widthMm||o.heightMm))return <div className="whitespace-normal text-sm"><p>Сохранена транспортная коробка: {o.unitsPerCarton??"?"} шт.</p><Button size="sm" variant="outline" className="mt-2" onClick={()=>onChange({...m,offers:m.offers.map(x=>x.id===o.id?{...x,unitsPerCarton:1,lengthMm:null,widthMm:null,heightMm:null,weightKg:null}:x)})}>Указать упаковку единицы</Button></div>;
        return <div><div className="grid grid-cols-3 gap-1">{(["lengthMm","widthMm","heightMm"] as const).map((key,index)=><label className="text-xs" key={key}>{["Д, см","Ш, см","В, см"][index]}{num(["Длина, см","Ширина, см","Высота, см"][index],o[key]==null?null:o[key]!/10,v=>onChange({...m,offers:m.offers.map(x=>x.id===o.id?{...x,[key]:v==null?null:v*10,unitsPerCarton:1}:x)}))}</label>)}</div></div>;
      }},
      {key:"mode",label:"Доставка",tone:"entry",cell:(m:Model)=>choose("Доставка из Китая",m.import.mode,[["groupage","Авто · сборный"],["container","Контейнер"]],v=>onChange({...m,import:{...m.import,mode:v as "groupage"|"container"}}))},
      offer("weightKg","Вес, кг",true),
      imp("dutyPct","Пошлина, %"),
      {key:"customs-toggle",label:"Белый ввоз",width:155,cell:(m:Model)=><Button size="sm" variant="outline" aria-expanded={expanded.has("customs")} onClick={()=>toggle("customs")}>{expanded.has("customs")?"Свернуть":"Расходы и курсы"}</Button>},
      ...(expanded.has("customs")?[
        imp("cnyPurchase","Курс юаня"),imp("usdPurchase","Курс USD"),
        imp("rateUsdM3","Авто, $ / м³"),imp("densityKgM3","Плотность, кг/м³"),imp("operationUsd","Опер. сбор, $"),
        imp("containerUsd","Контейнер, $"),imp("containerM3","Контейнер, м³"),imp("containers","Контейнеров"),
        imp("borderPct","До границы, %"),imp("vatPct","Импортный НДС, %"),imp("agentPct","Агент, %"),imp("currencyControlPct","Валют. контроль, %"),
        imp("customsFeeOverride","Тамож. сбор, ₽"),imp("broker","Оформление, ₽"),imp("terminal","Терминал, ₽"),imp("inland","Вывоз, ₽"),imp("unloading","Разгрузка, ₽"),imp("inspection","Инспекция, ₽"),imp("certification","Сертификация, ₽"),imp("other","Прочее ввоза, ₽")
      ]:[]),
      {key:"model-note",label:"Почему эта модель",tone:"entry",cell:(m:Model)=>text("Обоснование модели",m.note,v=>onChange({...m,note:v}))},
    ]),
    wb("packaging","Упаковка, ₽"),
  ]});
  groups.push({label:"Цена",columns:[wb("price","Цена продавца, ₽"),wb("sppPct","СПП, %"),result("buyer","Цена покупателя, ₽",m=>m.wb.price==null?"—":rub(m.wb.price*(1-m.wb.sppPct/100)))]});
  groups.push({id:"wb",label:"Расходы WB",columns:[{key:"api",label:"По предмету и складу",cell:m=><WbTariffPicker model={m} subject={subject} onChange={onChange} disabled={disabled}/>},{key:"scheme",label:"Схема",tone:"entry",cell:m=>choose("Схема WB",m.wb.scheme,[["FBW","FBW / FBO"],["FBS","FBS"]],v=>onChange(switchWbScheme(m,v as "FBW"|"FBS",defaults)))},wb("commissionPct","Комиссия, %"),wb("extraCommissionPct","Допы, %"),wb("forwardLogistics","Логистика, ₽"),...(expanded.has("wb")?[wb("returnLogistics","Обратная, ₽"),wb("acquiringPct","Эквайринг, %"),wb("storage","Хранение, ₽"),wb("other","Прочие WB, ₽"),{key:"tariffDate",label:"Дата тарифов",tone:"entry",cell:m=>text("Дата тарифов",m.wb.tariffDate,v=>onChange({...m,wb:{...m.wb,tariffDate:v}}),"date")},{key:"tariffSource",label:"Источник тарифов",tone:"entry",cell:m=>text("Источник тарифов",m.wb.tariffSource,v=>onChange({...m,wb:{...m.wb,tariffSource:v}}))}] as Column[]:[]),wb("drrPct","ДРР, %")]});
  groups.push({label:"Налоги",columns:[
    {key:"taxMode",label:"Объект УСН",width:180,tone:"entry",cell:m=>choose("Объект УСН",m.wb.taxMode,[["profit","Доходы − расходы"],["income","Доходы"]],v=>onChange({...m,wb:{...m.wb,taxMode:v as "profit"|"income"}}))},
    wb("taxPct","УСН, %"),wb("vatPct","НДС, %"),
  ]});
  groups.push({label:"Итог",columns:[
    result("profitNoAds","Прибыль без рекламы, ₽",m=>{const w=calculateWb(m,{drrPct:0});return w.ok?rub(w.profit):"—";}),
    result("marginNoAds","Маржа без рекламы, %",m=>{const w=calculateWb(m,{drrPct:0});return w.ok?fmt(w.margin,1):"—";}),
    result("roiNoAds","ROI без рекламы, %",m=>{const w=calculateWb(m,{drrPct:0});return w.ok&&w.roi!=null?fmt(w.roi,1):"—";}),result("profit","Прибыль с рекламой, ₽",m=>money("wb","profit",m)),result("margin","Маржа с рекламой, %",m=>{const w=calculateWb(m);return w.ok?fmt(w.margin,1):"—";}),result("roi","ROI с рекламой, %",m=>{const w=calculateWb(m);return w.ok&&w.roi!=null?fmt(w.roi,1):"—";})]});
  groups.push({id:"plan",label:"Партия за сезон",columns:[imp("quantity","Партия, шт."),{key:"sell",label:"Продажи, шт.",tone:"entry",cell:m=>num("План выкупов за сезон",m.plan.sellUnits,v=>onChange({...m,plan:{...m.plan,sellUnits:v}}),true)},result("seasonRevenue","Выручка сезона, ₽",m=>money("plan","revenue",m)),result("cash","Вложения¹, ₽",m=>{const i=calculateImport(m);return i.ok?rub(i.cash+i.qty*(m.wb.packaging??0)):"—";}),result("seasonProfit","Прибыль сезона, ₽",m=>money("plan","profit",m)),...(expanded.has("plan")?[
    {key:"startDate",label:"Дата старта",tone:"entry",cell:m=>text("Точная дата старта",m.plan.startDate,v=>onChange({...m,plan:{...m.plan,startDate:v}}),"date")},
    {key:"lag",label:"Лаг выплат, дней",tone:"entry",cell:m=>num("Лаг выплат",m.plan.payoutLag,v=>onChange({...m,plan:{...m.plan,payoutLag:v??0}}),true)},
    ...[0,1,2].flatMap(index=>([["days","Дни"],["share","Продажи, %"],["pricePct","Цена, %"],["drrPct","ДРР, %"],["commissionPct","Комиссия, %"]] as const).map(([key,label])=>({key:`phase-${index}-${key}`,label:["Разгон","Сезон","Выход"][index]+": "+label,tone:"entry",cell:(m:Model)=>num(label,m.plan.phases[index][key],v=>onChange({...m,plan:{...m.plan,phases:m.plan.phases.map((p,n)=>n===index?{...p,[key]:v}:p)}}),key==="days")}))),
    {key:"rationale",label:"Обоснование плана",tone:"entry",cell:m=>text("Обоснование плана",m.plan.rationale,v=>onChange({...m,plan:{...m.plan,rationale:v}}))},
  ] as Column[]:[])]});
  // Keep the competitor's group order, with our full white-import inputs inside cost.
  groups.splice(groups.findIndex(g=>g.label==="Цена")+1,0,{label:"Габариты и выкуп",columns:[result("unit-liters","Объём, л",m=>unitLiters(m)==null?"—":fmt(unitLiters(m)!,2)),wb("buyoutPct","Выкуп, %")]});
  groups.unshift({label:"Категория WB",columns:[{key:"subject",label:"Предмет",cell:m=><span className="block whitespace-normal">{m.wbCard?.subject||subject}</span>}]});
  const palette=["identity","candidate","cost","price","dimensions","expenses","tax","total","batch"];
  const groupColor=new Map(groups.flatMap((g,n)=>g.columns.map(c=>[c.key,palette[n]] as const)));
  const columns=groups.flatMap(g=>g.columns);
  const total=(read:(m:Model)=>number|null)=>{const values=models.map(read);return values.some(v=>v==null)?"—":rub((values as number[]).reduce((sum,v)=>sum+v,0));};
  const totals:Record<string,string>={
    "i-quantity":models.some(m=>m.import.quantity==null)?"—":fmt(models.reduce((s,m)=>s+m.import.quantity!,0)),
    sell:models.some(m=>m.plan.sellUnits==null)?"—":fmt(models.reduce((s,m)=>s+m.plan.sellUnits!,0)),
    seasonRevenue:total(m=>{const p=calculatePlan(m);return p.ok?p.revenue:null;}),
    cash:total(m=>{const i=calculateImport(m);return i.ok?i.cash+i.qty*(m.wb.packaging??0):null;}),
    seasonProfit:total(m=>{const p=calculatePlan(m);return p.ok?p.profit:null;}),
  };
  const columnWidth=(c:Column)=>c.width??(c.key==="month"?150:c.key==="stage"?180:c.key==="subject"?155:c.key==="reserve"?165:c.key==="api"?135:c.key.startsWith("w-")?100:125);
  const groupStarts=new Set(groups.slice(1).map(g=>g.columns[0].key));
  return <fieldset disabled={disabled} className="min-w-0"><div className="unit-grid-scroll" tabIndex={0} role="region" aria-label="Юнит-экономика: прокрутка вправо"><Table className="unit-horizontal-table"><TableHeader><TableRow><TableHead rowSpan={2} className="unit-frozen">Модель</TableHead>{groups.map((g,n)=><TableHead className={`unit-group-band unit-band-${palette[n]}`} key={g.label} colSpan={g.columns.length}>{g.id?<button type="button" aria-expanded={expanded.has(g.id)} onClick={()=>toggle(g.id!)} className="inline-flex items-center gap-2">{expanded.has(g.id)?<ChevronDown className="size-4"/>:<ChevronRight className="size-4"/>}{g.label}</button>:g.label}</TableHead>)}</TableRow><TableRow>{columns.map(c=><TableHead key={c.key} style={{width:columnWidth(c),minWidth:columnWidth(c),maxWidth:columnWidth(c)}} data-unit-group={groupColor.get(c.key)} className={groupStarts.has(c.key)?"unit-group-start":""} title={c.label}>{c.label}</TableHead>)}</TableRow></TableHeader><TableBody>{models.map(m=>{const sku=m.wbCard?.sku??parseSkus(m.wbUrl).skus[0]??"";const imported=calculateImport(m),w=calculateWb(m),plan=calculatePlan(m);const issues=[...(!imported.ok?imported.issues:[]),...(!w.ok?w.issues:[]),...(!plan.ok?plan.issues:[])];return <TableRow key={m.id}><TableCell className="unit-frozen"><div className="flex items-center gap-2"><CompetitorThumbnail sku={sku}/><div className="min-w-0 flex-1">{text("Название модели",m.name,v=>onChange({...m,name:v}))}<div className="mt-1 flex items-center gap-2"><Popover><PopoverTrigger asChild><button className="text-xs underline underline-offset-2" type="button">Артикул WB</button></PopoverTrigger><PopoverContent className="w-[min(36rem,90vw)] max-h-[75dvh] overflow-y-auto"><WbModelLookup model={m} onChange={onChange}/></PopoverContent></Popover><button type="button" title="Удалить модель" aria-label={`Удалить ${m.name||"модель"}`} onClick={()=>{if(window.confirm("Удалить модель и её расчёт? Изменение вступит в силу после сохранения."))onRemove(m.id);}}><Trash2 className="size-3 text-muted-foreground"/></button></div></div></div>{issues.length>0&&<Popover><PopoverTrigger asChild><button type="button" className="unit-missing-hint text-xs font-medium text-amber-800 underline underline-offset-2">Проверить · {[...new Set(issues)].length}</button></PopoverTrigger><PopoverContent className="max-h-80 w-80 overflow-y-auto bg-white text-slate-900"><p className="mb-2 font-semibold">Для завершения расчёта</p><ul className="list-disc space-y-1 pl-4 text-sm">{[...new Set(issues)].map(issue=><li key={issue}>{issue}</li>)}</ul></PopoverContent></Popover>}</TableCell>{columns.map(c=><TableCell key={c.key} style={{width:columnWidth(c),minWidth:columnWidth(c),maxWidth:columnWidth(c)}} data-unit-group={groupColor.get(c.key)} className={[c.tone==="entry"?"unit-entry":c.tone==="result"?"unit-result":"",groupStarts.has(c.key)?"unit-group-start":""].join(" ")}>{c.cell(m)}</TableCell>)}</TableRow>;})}</TableBody><TableFooter><TableRow><TableCell className="unit-frozen font-semibold">Итого по блоку</TableCell>{columns.map(c=><TableCell key={c.key} data-unit-group={groupColor.get(c.key)} className="text-right font-semibold tabular-nums">{totals[c.key]??""}</TableCell>)}</TableRow></TableFooter></Table></div></fieldset>;
}
