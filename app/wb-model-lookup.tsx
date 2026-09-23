"use client";
import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CompetitorThumbnail } from "./competitor-thumbnail";
import { parseSkus, wbCardUrl } from "@/lib/niche-research";
import { prettyDate } from "@/lib/market-types";
import type { Model } from "@/lib/candidate-workflow";

export function WbModelLookup({model:m,onChange}:{model:Model;onChange:(m:Model)=>void}) {
  const [input,setInput] = useState(m.wbUrl), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const abort = useRef<AbortController|null>(null), current = useRef(m); current.current=m;
  useEffect(() => () => abort.current?.abort(), []);
  async function load() {
    const parsed = parseSkus(input); if (parsed.skus.length !== 1 || parsed.invalid.length) {setError("Вставьте один артикул или ссылку WB");return;}
    const sku = parsed.skus[0]; setBusy(true);setError("");abort.current?.abort(); const controller=new AbortController();abort.current=controller;
    const base = current.current;
    onChange({...base,wbUrl:wbCardUrl(sku),wbCard:base.wbCard?.sku===sku?base.wbCard:null});
    try {
      const response=await fetch(`/api/wb-card?sku=${sku}`,{signal:controller.signal});const data=await response.json() as {card?:NonNullable<Model["wbCard"]>;error?:string};
      if(!response.ok || !data.card) throw new Error(data.error || "Не удалось получить карточку");
      if(controller.signal.aborted) return;
      const latest=current.current, card=data.card as NonNullable<Model["wbCard"]>;
      onChange({...latest,wbUrl:wbCardUrl(sku),wbCard:card,name:latest.name.trim()?latest.name:card.name.slice(0,200)});
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Не удалось получить карточку");}
    finally{if(!controller.signal.aborted)setBusy(false);}
  }
  const card=m.wbCard, sku=parseSkus(m.wbUrl).skus[0];
  return <div className="wb-model-lookup">
    <label className="mb-2 block text-sm font-medium" htmlFor={`lookup-${m.id}`}>Артикул или ссылка WB</label>
    <div className="flex flex-wrap gap-2"><Input id={`lookup-${m.id}`} className="min-w-52 flex-1 bg-white" value={input} disabled={busy} placeholder="Например, ссылка на аналог на WB" onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void load();}}}/><Button variant="outline" disabled={busy||!input.trim()} onClick={()=>void load()}>{busy?<Loader2 className="size-4 animate-spin"/>:<Download className="size-4"/>}{busy?"Загружаю…":"Подставить карточку"}</Button></div>
    {error && <p role="status" className="mt-2 text-sm text-amber-800">{error}</p>}
    {sku && <div className="mt-4 flex items-start gap-3"><CompetitorThumbnail key={sku} sku={sku}/><div className="min-w-0 flex-1"><a className="inline-flex items-center gap-1 text-sm font-medium hover:underline" href={wbCardUrl(sku)} target="_blank" rel="noopener noreferrer">{card?.name || `Артикул ${sku}`}<ExternalLink className="size-3"/></a>{card && <><p className="mt-1 text-sm text-muted-foreground">{[card.subject,card.brand].filter(Boolean).join(" · ")}</p><p className="mt-1 text-xs text-muted-foreground">Данные WB · {prettyDate(card.loadedAt)}. Название модели ниже можно изменить.</p></>}</div></div>}
    {card && <><details className="mt-3 rounded-xl border bg-white p-3"><summary className="cursor-pointer text-sm">Характеристики карточки · {card.attributes.length}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{card.attributes.map((a,k)=><label className="text-sm" key={`${a.name}-${k}`}>{a.name}<Input className="mt-1 bg-white" value={a.value} onChange={e=>onChange({...m,wbCard:{...card,checked:false,attributes:card.attributes.map((item,n)=>n===k?{...item,value:e.target.value}:item)}})}/></label>)}</div></details><label className="mt-3 flex items-center gap-2 text-sm"><Switch checked={card.checked} onCheckedChange={checked=>onChange({...m,wbCard:{...card,checked}})}/>Данные карточки проверены</label></>}
    <p className="mt-3 text-xs leading-5 text-muted-foreground">Из карточки берём название, предмет и доступные характеристики. Цена фабрики, мастер-картон, цена продавца и тарифы WB заполняются отдельно.</p>
  </div>;
}
