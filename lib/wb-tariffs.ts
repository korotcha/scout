import { z } from "zod";
// WB API: https://dev.wildberries.ru/docs/openapi/rates
const rate=z.number().finite().min(0).max(100).nullable().optional();
export const commissionResponse=z.object({report:z.array(z.object({subjectID:z.number().int(),subjectName:z.string(),paidStorageKgvp:rate,kgvpMarketplace:rate})).max(50000)});
const amount=z.union([z.string(),z.number()]).nullable().optional();
export const boxResponse=z.object({response:z.object({data:z.object({warehouseList:z.array(z.object({warehouseName:z.string(),boxDeliveryBase:amount,boxDeliveryLiter:amount,boxDeliveryMarketplaceBase:amount,boxDeliveryMarketplaceLiter:amount})).max(5000)})})});
export type Tariffs={commissions:z.infer<typeof commissionResponse>["report"];warehouses:z.infer<typeof boxResponse>["response"]["data"]["warehouseList"];date:string};
export async function loadTariffs(token:string):Promise<Tariffs> {
  const date=new Date().toISOString().slice(0,10);
  async function read(path:string) {
    const response=await fetch("https://common-api.wildberries.ru/api/v1/tariffs/"+path,{headers:{Authorization:token,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error(response.status===401||response.status===403?"WB отклонил ключ. Проверьте срок действия и доступ к тарифам.":response.status===429?"Лимит WB. Повторите обновление позже.":"WB временно не вернул тарифы.");
    const reader=response.body?.getReader();if(!reader)throw new Error("Пустой ответ WB");let count=0,body="";const decoder=new TextDecoder();
    try{while(true){const chunk=await reader.read();if(chunk.done)break;count+=chunk.value.length;if(count>8000000){await reader.cancel();throw new Error("Слишком большой ответ WB");}body+=decoder.decode(chunk.value,{stream:true});}body+=decoder.decode();}finally{reader.releaseLock();}
    return JSON.parse(body);
  }
  const [commission,boxes]=await Promise.all([read("commission"),read("box?date="+date)]);
  const c=commissionResponse.safeParse(commission),b=boxResponse.safeParse(boxes);
  if(!c.success||!b.success)throw new Error("Формат тарифов WB изменился. Автоподстановка остановлена.");
  return {commissions:c.data.report,warehouses:b.data.response.data.warehouseList,date};
}
export function tariffNumber(value:unknown):number|null {
  if(typeof value!=="string"&&typeof value!=="number")return null;
  if(typeof value==="string"&&!/^\d+(?:[.,]\d+)?$/.test(value.trim()))return null;
  const n=Number(String(value).trim().replace(",","."));return Number.isFinite(n)&&n>=0?n:null;
}
export function tariffSuggestion(t:Tariffs,subject:string,warehouse:string,scheme:"FBW"|"FBS",liters:number|null) {
  const matches=t.commissions.filter(c=>c.subjectName.trim().toLocaleLowerCase("ru")===subject.trim().toLocaleLowerCase("ru"));
  const c=matches.length===1?matches[0]:null,w=t.warehouses.find(w=>w.warehouseName===warehouse);
  const commission=c?(scheme==="FBW"?c.paidStorageKgvp:c.kgvpMarketplace):null;
  const base=tariffNumber(scheme==="FBW"?w?.boxDeliveryBase:w?.boxDeliveryMarketplaceBase),extra=tariffNumber(scheme==="FBW"?w?.boxDeliveryLiter:w?.boxDeliveryMarketplaceLiter);
  // Only standard boxes >= 1 l. Small-volume bands / oversized goods require review.
  const logistics=liters!=null&&liters>=1&&base!=null&&extra!=null?base+(liters-1)*extra:null;
  return {commission:commission??null,logistics};
}
