import { z } from "zod";
import { getRawDb } from "@/db";
import { queryKey } from "@/lib/niche-research";

const context = z.string().regex(/^month:\d{4}-(0[1-9]|1[0-2])$/);
const payload = z.union([z.object({contextKey:context,action:z.literal("reconcile"),after:z.string().max(100).default("")}),z.object({contextKey:context,status:z.enum(["shortlisted","excluded","unmarked"]),rows:z.array(z.object({query:z.string().trim().min(1).max(500),subject:z.string().trim().min(1).max(250)})).min(1).max(50000)})]);
const fail=(error:string,status=400)=>Response.json({error},{status});
export async function GET(request:Request){
 if(!request.headers.get("oai-authenticated-user-email"))return fail("Войдите в аккаунт",401);
 const params=new URL(request.url).searchParams,c=context.safeParse(params.get("context"));
 const after=z.coerce.number().int().min(0).safeParse(params.get("after")??0);
 if(!c.success||!after.success)return fail("Некорректный месяц или страница");
 try{
  const r=await getRawDb().prepare(`SELECT id, query_key AS "queryKey", query, subject, status FROM screener_marks WHERE context_key = ? AND id > ? ORDER BY id LIMIT 1001`).bind(c.data,after.data).all<{id:number;queryKey:string;query:string;subject:string;status:"shortlisted"|"excluded"}>();
  return Response.json({marks:r.results.slice(0,1000),nextAfter:r.results.length>1000?r.results[999].id:null});
 }catch{return fail("Не удалось загрузить первичный отбор. Повторите загрузку.",503);}
}
export async function POST(request:Request){
 const actor=request.headers.get("oai-authenticated-user-email");if(!actor)return fail("Войдите в аккаунт",401);
 if(request.headers.get("origin")&&request.headers.get("origin")!==new URL(request.url).origin)return fail("Недопустимый источник запроса",403);
 let raw:string;try{raw=await request.text();}catch{return fail("Не удалось прочитать запрос");}
 if(raw.length>10000000)return fail("Выберите меньше запросов за один раз",413);
 let data:unknown;try{data=JSON.parse(raw);}catch{return fail("Некорректный запрос");}
 const parsed=payload.safeParse(data);if(!parsed.success)return fail("Проверьте месяц и выбранные запросы");
 if("action" in parsed.data){
  try{
   const db=getRawDb(),{contextKey,after}=parsed.data;
   const result=await db.prepare(`SELECT id,context_key AS "contextKey",query_key AS key,query,subject,status,updated_by AS actor,updated_at AS at FROM candidates WHERE context_key=? AND id>? AND query_key<>'' AND status<>'unreviewed' AND COALESCE((content_json::jsonb->>'manualBlock')::boolean,false)=false ORDER BY id LIMIT 501`).bind(contextKey,after).all<{id:string;contextKey:string;key:string;query:string;subject:string;status:string;actor:string;at:string}>();
   const rows=result.results.slice(0,500),chunk=JSON.stringify(rows);
   // Bounded, idempotent reconciliation of pre-existing analyses. The latest explicit decision wins.
   if(rows.length)await db.batch([
    db.prepare(`INSERT INTO screener_marks(context_key,query_key,query,subject,status,updated_by,updated_at)
      SELECT x."contextKey",x.key,x.query,x.subject,
      CASE WHEN x.status='rejected' THEN 'excluded' ELSE 'shortlisted' END,x.actor,x.at
      FROM jsonb_to_recordset(?::jsonb) AS x("contextKey" text,key text,query text,subject text,status text,actor text,at text)
      ON CONFLICT(context_key,query_key) DO UPDATE SET status=excluded.status,updated_by=excluded.updated_by,updated_at=excluded.updated_at
      WHERE excluded.updated_at>screener_marks.updated_at AND excluded.status<>screener_marks.status`).bind(chunk),
    db.prepare("UPDATE screener_marks SET status=status WHERE context_key=? AND query_key IN (SELECT x.key FROM jsonb_to_recordset(?::jsonb) AS x(key text))").bind(contextKey,chunk)
   ]);
   return Response.json({synchronized:rows.length>0,nextAfter:result.results.length>500?rows[rows.length-1].id:null});
  }catch{return fail("Не удалось согласовать сохранённые решения. Повторите загрузку.",503);}
 }
 const {contextKey,status}=parsed.data;
 const rows=[...new Map(parsed.data.rows.map(row=>[queryKey(row.query),{...row,key:queryKey(row.query)}])).values()];
 try{
  const db=getRawDb();
  // Bound individual parameters; D1 batch commits every chunk atomically.
  const statements=[];const at=new Date().toISOString();
  for(let i=0;i<rows.length;i+=1000){const chunk=JSON.stringify(rows.slice(i,i+1000));
   if(status==="unmarked"){
    // Candidate trigger mirrors status changes back into screener_marks. Update the
    // candidate first, then delete the mark so «Не разобрано» is the final state.
    statements.push(db.prepare(`UPDATE candidates SET status='unreviewed',analysis_passed=0,revision=revision+1,updated_by=?,updated_at=?,
     history_json=(history_json::jsonb || jsonb_build_array(jsonb_build_object('at',?,'actor',?,'action','reopen_analysis','status','unreviewed','revision',revision+1,'note','Возвращено в неразобранные')))::text
     WHERE context_key=? AND status<>'unreviewed' AND COALESCE((content_json::jsonb->>'manualBlock')::boolean,false)=false
     AND query_key IN (SELECT x.key FROM jsonb_to_recordset(?::jsonb) AS x(key text))`).bind(actor,at,at,actor,contextKey,chunk));
    statements.push(db.prepare("DELETE FROM screener_marks WHERE context_key = ? AND query_key IN (SELECT x.key FROM jsonb_to_recordset(?::jsonb) AS x(key text))").bind(contextKey,chunk));
   }else{
    statements.push(db.prepare(`INSERT INTO screener_marks (context_key,query_key,query,subject,status,updated_by,updated_at)
     SELECT ?,x.key,x.query,x.subject,?,?,? FROM jsonb_to_recordset(?::jsonb) AS x(key text,query text,subject text)
     ON CONFLICT(context_key,query_key) DO UPDATE SET query=excluded.query,subject=excluded.subject,status=excluded.status,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(contextKey,status,actor,at,chunk));
   }
   if(status==="shortlisted")statements.push(db.prepare(`UPDATE candidates SET status='analysis',revision=revision+1,updated_by=?,updated_at=?,
     history_json=(history_json::jsonb || jsonb_build_array(jsonb_build_object('at',?,'actor',?,'action','shortlist','status','analysis','revision',revision+1,'note','В чистовик')))::text
     WHERE context_key=? AND status='unreviewed' AND COALESCE((content_json::jsonb->>'manualBlock')::boolean,false)=false
     AND query_key IN (SELECT x.key FROM jsonb_to_recordset(?::jsonb) AS x(key text))`).bind(actor,at,at,actor,contextKey,chunk));
  }
  await db.batch(statements);
  return Response.json({saved:rows.length,status});
 }catch{return fail("Отбор не сохранён. Выделение оставлено — повторите действие.",503);}
}
