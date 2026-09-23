import { z } from "zod";
import { getRawDb } from "@/db";
import { analysisFindings, contentSchema, readyIssues, withSharedContainer, type Candidate, type CandidateStatus } from "@/lib/candidate-workflow";
import { alignResearchSeason, queryKey } from "@/lib/niche-research";

// Current private Site owner's email, resolved from the platform access policy.
// Invited collaborators can research, but cannot approve purchases by posting a status.
const OWNER_EMAIL = "korotcha@yandex.ru";
const contextSchema = z.string().regex(/^month:\d{4}-(0[1-9]|1[0-2])$/);
const payloadSchema = z.object({
  contextKey: contextSchema, subject: z.string().trim().min(1).max(250),
  id: z.string().min(1).max(100).optional(),
  query: z.string().trim().max(500).default(""),
  revision: z.number().int().min(0), content: contentSchema,
  action: z.enum(["create_block", "save", "organize", "submit_analysis", "pass_analysis", "nominate", "shortlist", "reopen_analysis", "ready", "purchase", "defer", "reject", "resume"]),
});
type StoredRow = { id: string; context_key: string; subject: string; query: string; query_key: string; period: string; status: CandidateStatus;
  analysis_passed: number; revision: number; content_json: string; history_json: string; updated_by: string; updated_at: string };
function decode(row: StoredRow) {
  return { id: row.id, contextKey: row.context_key, subject: row.subject, query: row.query, period: row.period, status: row.status,
    analysisPassed: Boolean(row.analysis_passed), revision: row.revision, content: withSharedContainer(contentSchema.parse(JSON.parse(row.content_json))),
    updatedBy: row.updated_by, updatedAt: row.updated_at, history: JSON.parse(row.history_json) } satisfies Candidate & { history: unknown[] };
}
function identity(request: Request) { return request.headers.get("oai-authenticated-user-email"); }
function fail(error: string, status = 400) { return Response.json({ error }, { status }); }

export async function GET(request: Request) {
  const actor = identity(request); if (!actor) return fail("Войдите в аккаунт, чтобы открыть кандидатов", 401);
  const params = new URL(request.url).searchParams;
  const context = contextSchema.safeParse(params.get("context"));
  const offset = z.coerce.number().int().min(0).max(1000000).safeParse(params.get("offset") ?? 0);
  if (!offset.success) return fail("Некорректная страница списка");
  if (!context.success) return fail("Выберите аналитический месяц");
  try {
    const result = await getRawDb().prepare("SELECT * FROM candidates WHERE context_key = ? ORDER BY created_at, id LIMIT 101 OFFSET ?").bind(context.data, offset.data).all<StoredRow>();
    return Response.json({ candidates: result.results.slice(0, 100).map(decode), nextOffset: result.results.length > 100 ? offset.data + 100 : null, canDecide: actor.toLowerCase() === OWNER_EMAIL });
  } catch (error) {
    console.error("Candidates load failed", error);
    return fail("Не удалось загрузить кандидатов. Обновите список; ваши данные не удалены.", 503);
  }
}

export async function POST(request: Request) {
  const actor = identity(request); if (!actor) return fail("Войдите в аккаунт, чтобы сохранить работу", 401);
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return fail("Недопустимый источник запроса", 403);
  let raw: string;
  try { raw = await request.text(); } catch { return fail("Не удалось прочитать данные"); }
  if (raw.length > 1800000) return fail("Карточка слишком большая", 413);
  let json: unknown; try { json = JSON.parse(raw); } catch { return fail("Некорректный формат данных"); }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return fail(`Проверьте поля: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(" → ")}: ${i.message}`).join("; ")}`);
  const { contextKey, subject, query, id: requestedId, revision, action } = parsed.data;
  const content = withSharedContainer(parsed.data.content);
  if (["pass_analysis", "nominate"].includes(action) && actor.toLowerCase() !== OWNER_EMAIL) return fail("Поиск себестоимости разрешает владелец после анализа", 403);
  if (action === "purchase" && actor.toLowerCase() !== OWNER_EMAIL) return fail("Решение о закупке принимает владелец", 403);
  if (new Set(content.analysis.research.competitors.map(c => c.sku)).size !== content.analysis.research.competitors.length) return fail("В разборе повторяются артикулы конкурентов");
  const occupiedSlots = content.analysis.research.competitors.flatMap(c => c.slot == null ? [] : [c.slot]);
  if (new Set(occupiedSlots).size !== occupiedSlots.length) return fail("Два конкурента занимают одну строку. Обновите разбор.");
  const modelIds = content.models.map((m) => m.id);
  if (new Set(modelIds).size !== modelIds.length || content.models.some((m) => new Set(m.offers.map((o) => o.id)).size !== m.offers.length)) return fail("Повторяющиеся модели или предложения");
  if (content.models.some((m) => m.selectedOfferId && !m.offers.some((o) => o.id === m.selectedOfferId))) return fail("Выбранное предложение фабрики не найдено");
  if (content.selectedModelId && !modelIds.includes(content.selectedModelId)) return fail("Выбранная модель не найдена");
  try {
    const db = getRawDb();
    const period = contextKey.slice(6);
    content.analysis = alignResearchSeason(content.analysis, period);
    const project = await db.prepare("SELECT id FROM analysis_projects WHERE COALESCE(launch_month, current_period) = ? ORDER BY id DESC LIMIT 1").bind(period).first<{ id: number }>();
    const projectId = project?.id ?? null;
    if (!project && period !== "2026-10") return fail("Сначала создайте проект этого месяца в базе данных", 404);
    const previous = requestedId
      ? await db.prepare("SELECT * FROM candidates WHERE id = ? AND context_key = ? AND subject = ?").bind(requestedId, contextKey, subject).first<StoredRow>()
      : await db.prepare("SELECT * FROM candidates WHERE context_key = ? AND subject = ? AND query_key = ?").bind(contextKey, subject, queryKey(query)).first<StoredRow>();
    if (requestedId && !previous) return fail("Карточка не найдена в этом месяце", 404);
    if (!previous && !query) return fail("Откройте конкретный поисковый запрос в скринере");
    if (previous?.query_key && previous.query_key !== queryKey(query)) return fail("Для другого запроса создайте отдельный разбор");
    if ((previous?.revision ?? 0) !== revision) return fail("Карточка уже изменена в другом окне. Ваш черновик сохранён на экране. Откройте актуальную версию в отдельной вкладке и перенесите изменения.", 409);
    const oldContent = previous ? withSharedContainer(contentSchema.parse(JSON.parse(previous.content_json))) : null;
    if (action === "create_block" && (previous || requestedId || !content.manualBlock || !content.blockName.trim())) return fail("Укажите название нового блока");
    if (content.manualBlock !== (oldContent?.manualBlock ?? action === "create_block")) return fail("Нельзя изменить тип существующего разбора", 403);
    const analysisChanged = oldContent && JSON.stringify(oldContent.analysis) !== JSON.stringify(content.analysis);
    const contentChanged = oldContent && JSON.stringify(oldContent) !== JSON.stringify(content);
    const organizing = action === "organize";
    if (organizing) {
      if (!previous || !oldContent) return fail("Сначала сохраните карточку, затем перемещайте её между группами");
      const oldRest = { ...oldContent, blockName: "", analysis: alignResearchSeason(oldContent.analysis, period) }, nextRest = { ...content, blockName: "" };
      if (JSON.stringify(oldRest) !== JSON.stringify(nextRest)) return fail("При перемещении можно изменить только группу кандидата");
    }
    let passed = Boolean(previous?.analysis_passed) && !analysisChanged;
    let status: CandidateStatus = previous?.status ?? "analysis";
    if (!organizing) {
      if (contentChanged && ["ready", "purchased"].includes(status)) status = passed ? "sourcing" : "analysis";
      if (analysisChanged && ["sourcing", "analysis_ready"].includes(status)) status = "analysis";
      if (!passed && !content.manualBlock && content.models.length && (!oldContent || JSON.stringify(content.models) !== JSON.stringify(oldContent.models))) return fail("Сначала получите решение владельца по анализу. Существующие расчёты сохранены.");
    }
    if (action === "create_block") status = "sourcing";
    if (action === "submit_analysis") {
      if (!query) return fail("Укажите поисковый запрос для этого разбора");
      if (content.analysis.research.version !== 2) return fail("Заполните новый разбор конкурентов");
      const f = analysisFindings(content.analysis);
      if (!f.complete) return fail(f.missing.join(" · "));
      if (["rejected", "deferred", "purchased"].includes(status)) return fail("Сначала возобновите работу с кандидатом");
      passed = false; status = "analysis_ready";
    }
    if (action === "pass_analysis") {
      if (previous?.status !== "analysis_ready" || contentChanged) return fail("Сначала сохраните и завершите анализ, затем подтвердите его без изменения данных");
      const f = analysisFindings(content.analysis);
      if (!f.complete || f.stops.length) return fail([...f.stops, ...f.missing].join(" · "));
      passed = true; status = "sourcing";
    }
    if (action === "ready" || action === "purchase") {
      if (!passed) return fail("Сначала завершите анализ ниши");
      const issues = readyIssues(content, period); if (issues.length) return fail(issues.join(" · "));
      if (action === "purchase" && (previous?.status !== "ready" || contentChanged)) return fail("Сначала сохраните актуальный расчёт и передайте его на решение");
      status = action === "purchase" ? "purchased" : "ready";
    }
    if (action === "reject" || action === "defer") {
      if (!content.decisionComment.trim()) return fail("Напишите причину решения");
      status = action === "reject" ? "rejected" : "deferred";
    }
    if (action === "resume") status = passed ? "sourcing" : "analysis";
    if (action === "shortlist") { passed = false; status = "analysis"; }
    if (action === "reopen_analysis") { passed = false; status = "unreviewed"; }
    if (action === "nominate") {
      if (!query || content.manualBlock || content.analysis.research.version !== 2) return fail("Заполните разбор поискового запроса");
      const f = analysisFindings(content.analysis);
      if (!f.complete || f.stops.length) return fail([...f.stops, ...f.missing].join(" · "));
      passed = true; status = "sourcing";
    }
    const id = previous?.id ?? crypto.randomUUID(); const now = new Date().toISOString();
    const history = previous ? JSON.parse(previous.history_json) : [];
    history.push({ at: now, actor, action, status, revision: revision + 1,
      note: action === "organize" ? `Группа: ${content.blockName || subject}` : ["defer", "reject", "purchase", "ready"].includes(action) ? content.decisionComment : analysisChanged ? "Анализ изменён; требуется повторный допуск" : "" });
    const data = [status, passed ? 1 : 0, revision + 1, JSON.stringify(content), JSON.stringify(history.slice(-80)), actor, now];
    let saved: StoredRow | null;
    if (previous) {
      saved = await db.prepare("UPDATE candidates SET status = ?, analysis_passed = ?, revision = ?, content_json = ?, history_json = ?, updated_by = ?, updated_at = ?, query = ?, query_key = ? WHERE id = ? AND revision = ? RETURNING *").bind(...data, query, queryKey(query), id, revision).first<StoredRow>();
    } else {
      saved = await db.prepare("INSERT INTO candidates (id, context_key, project_id, subject, query, query_key, period, status, analysis_passed, revision, content_json, history_json, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(context_key, subject, query_key) DO NOTHING RETURNING *").bind(id, contextKey, projectId, subject, query, queryKey(query), period, ...data).first<StoredRow>();
    }
    if (!saved) return fail("Кандидат уже изменён. Обновите список перед повторным сохранением.", 409);
    const savedKey = queryKey(query);
    if (!content.manualBlock && savedKey) {
      if (action === "reopen_analysis") {
        // «Не разобрано» is represented by the absence of a screener mark.
        await db.prepare("DELETE FROM screener_marks WHERE context_key = ? AND query_key = ?").bind(contextKey, savedKey).run();
      } else {
        const markStatus = status === "rejected" ? "excluded" : "shortlisted";
        await db.prepare(`INSERT INTO screener_marks (context_key, query_key, query, subject, status, updated_by, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(context_key, query_key) DO UPDATE SET
            query = excluded.query, subject = excluded.subject, status = excluded.status,
            updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
          .bind(contextKey, savedKey, query, subject, markStatus, actor, now).run();
      }
    }
    return Response.json({ candidate: decode(saved) }, { status: previous ? 200 : 201 });
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) return fail("Этот запрос уже имеет разбор в выбранном месяце. Откройте существующего кандидата.", 409);
    console.error("Candidate save failed", error);
    return fail("Не удалось сохранить карточку. Не закрывайте её и повторите попытку.", 503);
  }
}
