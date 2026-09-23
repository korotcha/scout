"use client";
import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Choice } from "./candidate-workspace";
import { newOffer, type Model, type Offer } from "@/lib/candidate-workflow";
import { quoteReceived } from "@/lib/unit-inputs";

export function FactoryOffers({model:m,onChange,disabled}:{model:Model;onChange:(m:Model)=>void;disabled:boolean}) {
  const empty=useMemo(()=>[newOffer()],[m.id]);
  const rows=[...m.offers,...empty.slice(0,Math.max(0,1-m.offers.length))];
  function edit(index:number,patch:Partial<Offer>){
    onChange({...m,selectedOfferId:m.selectedOfferId||rows[index].id,offers:rows.map((o,n)=>n===index?{...o,...patch}:o)});
  }
  const received=rows.filter(quoteReceived).length;
  return <div className="factory-offers"><div className="mb-2 flex items-center justify-between gap-2"><b className="text-sm">Получено {received} из {rows.length} цен</b><Button variant="ghost" size="sm" disabled={disabled||rows.length>=20} onClick={()=>onChange({...m,offers:[...rows,newOffer()]})}>+ Фабрика</Button></div>
    <table><thead><tr><th>Основная</th><th>Фабрика · 1688 / Alibaba</th><th>Статус</th><th>Цена</th><th>WeChat / контакт</th><th>Дата цены</th><th title="Минимальная партия фабрики. Справочно, не ограничивает расчёт.">MOQ</th><th>Условия поставки</th></tr></thead><tbody>{rows.map((o,index)=><tr key={o.id} data-selected={m.selectedOfferId===o.id}>
      <td><Button size="sm" variant={m.selectedOfferId===o.id?"default":"outline"} disabled={disabled} onClick={()=>onChange({...m,offers:rows,selectedOfferId:o.id})}>{m.selectedOfferId===o.id?"Основная":"Выбрать"}</Button></td>
      <td><Input aria-label={`Ссылка фабрики ${index+1}`} placeholder="Ссылка 1688 / Alibaba" value={o.url} disabled={disabled} onChange={e=>edit(index,{url:e.target.value})}/></td>
      <td>{disabled?<span>{quoteReceived(o)?"Цена получена":"Ждём цену"}</span>:<Choice hideLabel label={`Статус фабрики ${index+1}`} value={o.quoteStatus??(quoteReceived(o)?"received":"waiting")} options={[["waiting","Ждём цену"],["received","Цена получена"]]} onChange={v=>edit(index,{quoteStatus:v as "waiting"|"received",...(v==="waiting"?{price:null}:{})})}/>}</td>
      <td><div className="flex gap-1"><Input aria-label={`Цена фабрики ${index+1}`} className="factory-price" type="number" min="0" step="any" value={o.price??""} placeholder="Цена" disabled={disabled} onChange={e=>{const price=e.target.value===""?null:Number(e.target.value);edit(index,{price,quoteStatus:price!=null&&price>0?"received":"waiting"});}}/>{disabled?<span>{o.currency}</span>:<Choice hideLabel label={`Валюта фабрики ${index+1}`} value={o.currency} options={[["CNY","¥"],["USD","$"],["RUB","₽"]]} onChange={v=>edit(index,{currency:v as Offer["currency"]})}/>}</div></td>
      <td><Input aria-label={`Контакт фабрики ${index+1}`} value={o.contact} placeholder="WeChat" disabled={disabled} onChange={e=>edit(index,{contact:e.target.value})}/></td>
      <td><Input aria-label={`Дата цены фабрики ${index+1}`} type="date" value={o.quotedAt} disabled={disabled} onChange={e=>edit(index,{quotedAt:e.target.value})}/></td>
      <td><Input aria-label={`MOQ фабрики ${index+1}`} type="number" min="1" step="1" placeholder="—" value={o.moq??""} disabled={disabled} onChange={e=>edit(index,{moq:e.target.value===""?null:Number(e.target.value)})}/></td>
      <td><Input aria-label={`Условия фабрики ${index+1}`} placeholder="EXW, FOB…" value={o.terms} disabled={disabled} onChange={e=>edit(index,{terms:e.target.value})}/></td>
    </tr>)}</tbody></table>
    {m.offers.some(o=>o.id===m.selectedOfferId&&o.moq!=null&&m.import.quantity!=null&&m.import.quantity<o.moq)&&<p className="mt-2 text-xs text-amber-800">Партия ниже MOQ: нужно согласовать объём с фабрикой. Расчёт не заблокирован.</p>}
  </div>;
}
