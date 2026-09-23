import { z } from "zod";
import { getRawDb } from "@/db";
import { calculatorSettingsSchema, initialCalculatorSettings } from "@/lib/calculator-settings";

export async function GET(request: Request) {
  if (!request.headers.get("oai-authenticated-user-email")) return Response.json({ error: "Войдите в аккаунт" }, { status: 401 });
  try {
    const row = await getRawDb().prepare("SELECT value_json, revision, updated_at FROM calculator_settings WHERE id = 1").first<{value_json: string; revision: number; updated_at: string}>();
    return Response.json({ settings: row ? calculatorSettingsSchema.parse(JSON.parse(row.value_json)) : initialCalculatorSettings(), revision: row?.revision ?? 0, updatedAt: row?.updated_at ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Не удалось загрузить настройки калькулятора" }, { status: 503 }); }
}
export async function POST(request: Request) {
  const actor = request.headers.get("oai-authenticated-user-email");
  if (!actor) return Response.json({error: "Войдите в аккаунт"}, {status:401});
  if (actor.toLowerCase() !== "korotcha@yandex.ru") return Response.json({error: "Общие настройки меняет владелец"}, {status:403});
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return Response.json({error: "Недопустимый источник запроса"}, {status:403});
  try {
    const raw = await request.text();
    if (raw.length > 20000) return Response.json({error: "Слишком большой запрос"}, {status:413});
    const parsed = z.object({revision: z.number().int().min(0), settings: calculatorSettingsSchema}).safeParse(JSON.parse(raw));
    if (!parsed.success) return Response.json({error: "Проверьте значения настроек"}, {status:400});
    const {settings, revision} = parsed.data, now = new Date().toISOString(), db = getRawDb();
    const row = revision === 0 ? await db.prepare("INSERT INTO calculator_settings (id, value_json, revision, updated_at, updated_by) VALUES (1, ?, 1, ?, ?) ON CONFLICT(id) DO NOTHING RETURNING revision").bind(JSON.stringify(settings), now, actor).first() : await db.prepare("UPDATE calculator_settings SET value_json = ?, revision = revision + 1, updated_at = ?, updated_by = ? WHERE id = 1 AND revision = ? RETURNING revision").bind(JSON.stringify(settings), now, actor, revision).first();
    if (!row) return Response.json({error: "Настройки уже изменены. Обновите страницу перед сохранением."}, {status:409});
    return Response.json({settings, revision: revision + 1, updatedAt: now});
  } catch { return Response.json({error: "Не удалось сохранить настройки. Ввод остаётся на экране."}, {status:503}); }
}
