import { z } from "zod";
import { getRawDb } from "@/db";
import { encryptKey, decryptKey } from "@/lib/connection-crypto";
import { loadTariffs } from "@/lib/wb-tariffs";
type Row={encrypted_key:string;revision:number;updated_at:string;checked_at:string|null;last_error:string|null;tariffs_json:string|null;tariffs_at:string|null};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
const secret=()=>((process.env.INTEGRATION_ENCRYPTION_KEY??process.env.SCOUT_PASSWORD??""));
const read=()=>getRawDb().prepare("SELECT * FROM api_connections WHERE provider = 'wb'").first<Row>();
export async function GET(request:Request){
  const actor=request.headers.get("oai-authenticated-user-email");if(!actor)return json({error:"Войдите в аккаунт"},401);
  try{const row=await read();return json({connected:!!row?.encrypted_key,revision:row?.revision??0,canEdit:actor.toLowerCase()==="korotcha@yandex.ru",storageReady:!!secret(),checkedAt:row?.checked_at??null,updatedAt:row?.updated_at??null,tariffsAt:row?.tariffs_at??null,error:row?.last_error??""});}catch{return json({error:"Не удалось загрузить подключения"},503);}
}
export async function POST(request:Request){
  const actor=request.headers.get("oai-authenticated-user-email");if(!actor)return json({error:"Войдите в аккаунт"},401);
  if(actor.toLowerCase()!=="korotcha@yandex.ru")return json({error:"Подключениями управляет владелец"},403);
  if(request.headers.get("origin")!==new URL(request.url).origin)return json({error:"Недопустимый источник запроса"},403);
  try{
    const raw=await request.text();if(raw.length>12000)return json({error:"Слишком большой запрос"},413);
    const parsed=z.object({action:z.enum(["save","refresh","disconnect"]),revision:z.number().int().nonnegative(),token:z.string().trim().min(20).max(10000).regex(/^[A-Za-z0-9._-]+$/).optional()}).safeParse(JSON.parse(raw));
    if(!parsed.success)return json({error:"Проверьте API-ключ"},400);
    const {action,revision}=parsed.data,row=await read();if((row?.revision??0)!==revision)return json({error:"Подключение уже изменилось. Обновите страницу."},409);
    const db=getRawDb(),now=new Date().toISOString();
    if(action==="disconnect"){
      if(row)await db.prepare("UPDATE api_connections SET encrypted_key = '', tariffs_json = NULL, tariffs_at = NULL, checked_at = NULL, last_error = NULL, revision = revision + 1, updated_at = ? WHERE provider = 'wb' AND revision = ?").bind(now,revision).run();
      return json({ok:true});
    }
    if(!secret())return json({error:"Защищённое хранилище ещё не настроено"},503);
    if(action==="save"&&!parsed.data.token)return json({error:"Введите новый ключ"},400);
    if(action==="refresh"&&!row?.encrypted_key)return json({error:"Сначала подключите кабинет WB"},400);
    if(action==="refresh"&&row?.checked_at&&Date.now()-Date.parse(row.checked_at)<60000)return json({error:"Повторная проверка доступна через минуту"},429);
    const token=action==="save"?parsed.data.token!:await decryptKey(row!.encrypted_key,secret());
    let tariffs;
    try{tariffs=await loadTariffs(token);}catch(error){
      const message=error instanceof Error&&/^(WB|Лимит|Формат|Пустой|Слишком)/.test(error.message)?error.message:"Не удалось связаться с WB. Сохранённое подключение не изменено.";
      if(row&&action==="refresh")await db.prepare("UPDATE api_connections SET last_error = ?, checked_at = ? WHERE provider = 'wb' AND revision = ?").bind(message,now,revision).run();
      return json({error:message},502);
    }
    const encrypted=action==="save"?await encryptKey(token,secret()):row!.encrypted_key;
    const saved=row?await db.prepare("UPDATE api_connections SET encrypted_key = ?, revision = revision + 1, updated_at = ?, checked_at = ?, last_error = NULL, tariffs_json = ?, tariffs_at = ? WHERE provider = 'wb' AND revision = ? RETURNING revision").bind(encrypted,now,now,JSON.stringify(tariffs),now,revision).first():await db.prepare("INSERT INTO api_connections (provider, encrypted_key, revision, updated_at, checked_at, tariffs_json, tariffs_at) VALUES ('wb', ?, 1, ?, ?, ?, ?) ON CONFLICT(provider) DO NOTHING RETURNING revision").bind(encrypted,now,now,JSON.stringify(tariffs),now).first();
    if(!saved)return json({error:"Подключение уже изменилось. Повторите после обновления страницы."},409);
    return json({ok:true});
  }catch{return json({error:"Не удалось сохранить подключение. Ключ не изменён."},503);}
}
