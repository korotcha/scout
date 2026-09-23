"use client";
import {useEffect,useRef,useState} from "react";
import {queryKey} from "@/lib/niche-research";
import type {SummaryRow} from "@/lib/market-types";
export type ScreeningMark="shortlisted"|"excluded";
export function useScreenerMarks(period:string,onSynchronized?:()=>void){
 const synchronizedCallback=useRef(onSynchronized);synchronizedCallback.current=onSynchronized;
 const [marks,setMarks]=useState<Record<string,ScreeningMark>>({}),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[reload,setReload]=useState(0);
 useEffect(()=>{const abort=new AbortController();setLoading(true);setError("");setMarks({});
  void(async()=>{const collected:Record<string,ScreeningMark>={};let cursor:string|null="",synchronized=false;
   while(cursor!=null){const response=await fetch("/api/screener-marks",{method:"POST",headers:{"Content-Type":"application/json"},signal:abort.signal,body:JSON.stringify({contextKey:"month:"+period,action:"reconcile",after:cursor})});const data=await response.json() as {synchronized?:boolean;nextAfter:string|null;error?:string};if(!response.ok)throw new Error(data.error||"Не удалось загрузить решения");synchronized ||= !!data.synchronized;cursor=data.nextAfter;}
   if(synchronized&&!abort.signal.aborted)synchronizedCallback.current?.();
   let after:number|null=0;
   while(after!=null){const response=await fetch(`/api/screener-marks?context=${encodeURIComponent("month:"+period)}&after=${after}`,{signal:abort.signal});const data=await response.json() as {marks?:{queryKey:string;status:ScreeningMark}[];nextAfter:number|null;error?:string};if(!response.ok||!data.marks)throw new Error(data.error||"Не удалось загрузить отбор");for(const m of data.marks)collected[m.queryKey]=m.status;after=data.nextAfter;}
   if(!abort.signal.aborted)setMarks(collected);
  })().catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();
 },[period,reload]);
 async function save(rows:SummaryRow[],status:ScreeningMark|"unmarked"){
  if(busy||loading||!rows.length)return false;setBusy(true);setError("");
  try{const response=await fetch("/api/screener-marks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contextKey:"month:"+period,status,rows:rows.map(({query,subject})=>({query,subject}))})});const data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error||"Не удалось сохранить отбор");setMarks(old=>{const next={...old};for(const row of rows){const key=queryKey(row.query);if(status==="unmarked")delete next[key];else next[key]=status;}return next;});return true;
  }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить отбор");return false;}finally{setBusy(false);}
 }
 function reflect(query:string,status:ScreeningMark){setMarks(old=>({...old,[queryKey(query)]:status}));}
 return {marks,loading,busy,error,save,reflect,retry:()=>setReload(v=>v+1)};
}
