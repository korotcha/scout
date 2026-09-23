import { parseWbCard, wbCardDataUrls } from "@/lib/wb-card";

export async function GET(request: Request) {
  if (!request.headers.get("oai-authenticated-user-email")) return Response.json({error:"Войдите в аккаунт"},{status:401});
  const sku = new URL(request.url).searchParams.get("sku") ?? "";
  if (!/^[1-9]\d{4,14}$/.test(sku)) return Response.json({error:"Укажите корректный артикул WB"},{status:400});
  // Only fixed public WB CDN hosts. Never fetch an arbitrary URL supplied by a user.
  for (const source of wbCardDataUrls(sku)) {
    try {
      const response = await fetch(source, {headers:{Accept:"application/json"}, redirect:"error", signal:AbortSignal.timeout(4000)});
      if (!response.ok || Number(response.headers.get("content-length") ?? 0) > 1_000_000) continue;
      const reader = response.body?.getReader(); if (!reader) continue;
      let size = 0, body = ""; const decoder = new TextDecoder();
      try { while (true) { const {done,value} = await reader.read(); if (done) break; size += value.length; if (size > 1_000_000) { await reader.cancel(); throw new Error("Oversized"); } body += decoder.decode(value,{stream:true}); } body += decoder.decode(); } finally { reader.releaseLock(); }
      const card = parseWbCard(JSON.parse(body), sku, source);
      if (card) return Response.json({card}, {headers:{"Cache-Control":"private, max-age=300"}});
    } catch { /* Public card may be absent, restricted or the CDN routing may have changed. */ }
  }
  return Response.json({error:"WB не вернул данные карточки. Артикул можно сохранить и заполнить модель вручную."},{status:502});
}
