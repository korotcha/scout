import { getRawDb } from "@/db";
export async function GET(request:Request){
  if(!request.headers.get("oai-authenticated-user-email"))return Response.json({error:"Войдите в аккаунт"},{status:401});
  try{const row=await getRawDb().prepare("SELECT tariffs_json, tariffs_at FROM api_connections WHERE provider = 'wb' AND encrypted_key <> ''").first<{tariffs_json:string|null;tariffs_at:string|null}>();
    if(!row?.tariffs_json)return Response.json({error:"Подключите WB в «Базы данных → API и подключения»"},{status:404});
    return Response.json({tariffs:JSON.parse(row.tariffs_json),updatedAt:row.tariffs_at},{headers:{"Cache-Control":"no-store"}});
  }catch{return Response.json({error:"Тарифы недоступны. Ручной ввод сохранён."},{status:503});}
}
