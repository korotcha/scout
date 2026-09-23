import { z } from "zod";
import { getRawDb } from "@/db";

const change = z.object({ subject: z.string().trim().min(1).max(250), active: z.boolean() });
const payload = z.union([
  z.object({ changes: z.array(change).min(1).max(5000), reason: z.string().trim().max(2000).default("") }),
  change.extend({ active: z.boolean().default(true), reason: z.string().trim().max(2000).default("") }),
]);
const fail = (error: string, status = 400) => Response.json({ error }, { status });

export async function GET(request: Request) {
  if (!request.headers.get("oai-authenticated-user-email")) return fail("Войдите в аккаунт", 401);
  try {
    const rows = await getRawDb().prepare(`SELECT id, subject, active, reason, updated_by AS "updatedBy", created_at AS "createdAt", updated_at AS "updatedAt" FROM exclusions ORDER BY active DESC, subject`).all<{ active: number }>();
    return Response.json({ exclusions: rows.results.map(row => ({ ...row, active: Boolean(row.active) })) });
  } catch { return fail("Не удалось загрузить исключения. Повторите загрузку.", 503); }
}

export async function POST(request: Request) {
  const actor = request.headers.get("oai-authenticated-user-email");
  if (!actor) return fail("Войдите в аккаунт", 401);
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return fail("Недопустимый источник запроса", 403);
  let raw: string;
  try { raw = await request.text(); } catch { return fail("Не удалось прочитать запрос"); }
  if (raw.length > 2000000) return fail("Выберите меньше предметов за один раз", 413);
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return fail("Некорректный запрос"); }
  const parsed = payload.safeParse(json);
  if (!parsed.success) return fail("Проверьте выбранные предметы и причину");
  const data = parsed.data;
  const changes = [...new Map(("changes" in data ? data.changes : [data]).map(row => [row.subject, { subject: row.subject, active: row.active }])).values()];
  try {
    const db = getRawDb(), at = new Date().toISOString(), statements = [];
    for (let i = 0; i < changes.length; i += 500) {
      statements.push(db.prepare(`INSERT INTO exclusions (subject, active, reason, updated_by, updated_at)
        SELECT x.subject, x.active, ?, ?, ? FROM jsonb_to_recordset(?::jsonb) AS x(subject text, active boolean)
        ON CONFLICT(subject) DO UPDATE SET active=excluded.active, reason=excluded.reason, updated_by=excluded.updated_by, updated_at=excluded.updated_at`)
        .bind(data.reason, actor, at, JSON.stringify(changes.slice(i, i + 500))));
    }
    await db.batch(statements);
    return Response.json({ exclusions: changes, ...(!("changes" in data) ? { exclusion: changes[0] } : {}) });
  } catch { return fail("Изменения не сохранены. Повторите действие.", 503); }
}
