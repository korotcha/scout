import { MAX_REPORT_BYTES } from "@/lib/mpstats-import";
import { getObjectStore } from "@/lib/object-store";
const bucket = getObjectStore();
export async function POST(request: Request) {
  if (!request.headers.get('oai-authenticated-user-email')) return Response.json({ error: 'Войдите в аккаунт' }, { status: 401 });
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return new Response(null, { status: 403 });
  try {
    const reader = request.body?.getReader(); if (!reader) return new Response(null, { status: 400 });
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > MAX_REPORT_BYTES) { await reader.cancel(); return Response.json({ error: 'Файл больше 10 МБ' }, { status: 413 }); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
    const objectKey = 'research-reports/' + crypto.randomUUID();
    await bucket.put(objectKey, bytes, { httpMetadata: { contentType: 'application/octet-stream' } });
    return Response.json({ objectKey });
  } catch { return Response.json({ error: 'Не удалось сохранить отчёт. Повторите загрузку.' }, { status: 503 }); }
}
export async function GET(request: Request) {
  if (!request.headers.get('oai-authenticated-user-email')) return new Response(null, { status: 401 });
  const key = new URL(request.url).searchParams.get('key') ?? '';
  if (!/^research-reports\/[a-f0-9-]{36}$/.test(key)) return new Response(null, { status: 400 });
  try { const object = await bucket.get(key); if (!object) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(object.body), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response(null, { status: 503 }); }
}
