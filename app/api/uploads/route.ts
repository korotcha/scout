import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { analysisProjects, uploads } from "@/db/schema";
import { getObjectStore } from "@/lib/object-store";

function actor(request: Request) {
  return request.headers.get("oai-authenticated-user-email") ?? "Неизвестный пользователь";
}

export async function GET(request: Request) {
  try {
    const downloadId = new URL(request.url).searchParams.get("id");
    if (downloadId) {
      if (!request.headers.get("oai-authenticated-user-email")) return Response.json({ error: "Требуется вход" }, { status: 401 });
      const id = Number(downloadId);
      if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Некорректный файл" }, { status: 400 });
      const [file] = await getDb().select().from(uploads).where(eq(uploads.id, id)).limit(1);
      if (!file) return Response.json({ error: "Файл не найден" }, { status: 404 });
      const object = await bucket.get(file.objectKey);
      if (!object) return Response.json({ error: "Исходный файл недоступен" }, { status: 404 });
      return new Response(new Uint8Array(object.body), { headers: { "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    const rows = await getDb().select().from(uploads).orderBy(desc(uploads.createdAt), desc(uploads.id)).limit(100);
    return Response.json({ uploads: rows });
  } catch {
    return Response.json({ uploads: [], unavailable: true });
  }
}

const bucket = getObjectStore();
export async function POST(request: Request) {
  const url = new URL(request.url);
  const role = url.searchParams.get("role");
  const periodDate = url.searchParams.get("period");
  const fileName = url.searchParams.get("name")?.trim();
  const projectIdValue = Number(url.searchParams.get("project"));
  const projectId = Number.isInteger(projectIdValue) && projectIdValue > 0 ? projectIdValue : null;

  if ((role !== "db1" && role !== "db2") || !periodDate || !fileName) {
    return Response.json({ error: "Не заполнены роль, дата или имя файла" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodDate)) {
    return Response.json({ error: "Некорректная дата периода" }, { status: 400 });
  }
  if (!request.body) return Response.json({ error: "Файл пуст" }, { status: 400 });

  if (projectId) {
    const [project] = await getDb()
      .select({ id: analysisProjects.id })
      .from(analysisProjects)
      .where(eq(analysisProjects.id, projectId))
      .limit(1);
    if (!project) return Response.json({ error: "Проект не найден" }, { status: 404 });
  }

  const objectKey = `wildbox/${projectId ?? "archive"}/${periodDate}/${role}/${crypto.randomUUID()}-${fileName}`;
  const sizeBytes = Number(request.headers.get("content-length") ?? 0);
  const rowCount = Number(url.searchParams.get("rows") ?? 0) || null;
  const uniqueQueries = Number(url.searchParams.get("queries") ?? 0) || null;
  const uniqueSubjects = Number(url.searchParams.get("subjects") ?? 0) || null;
  const issues = url.searchParams.getAll("issue").slice(0, 20);

  try {
    await bucket.put(objectKey, request.body, {
      httpMetadata: { contentType: request.headers.get("content-type") ?? "application/octet-stream" },
      customMetadata: { originalName: fileName, role, periodDate },
    });
    const [row] = await getDb().insert(uploads).values({
      projectId,
      role,
      periodDate,
      fileName,
      objectKey,
      sizeBytes,
      rowCount,
      uniqueQueries,
      uniqueSubjects,
      status: issues.length ? "needs_review" : "uploaded",
      issueCount: issues.length,
      issuesJson: JSON.stringify(issues),
      uploadedBy: actor(request),
    }).returning();
    return Response.json({ upload: row }, { status: 201 });
  } catch (error) {
    await bucket.delete(objectKey).catch(() => undefined);
    const message = error instanceof Error ? error.message : "Не удалось сохранить файл";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Некорректный идентификатор загрузки" }, { status: 400 });
  }

  try {
    const [record] = await getDb()
      .select({ id: uploads.id, objectKey: uploads.objectKey, fileName: uploads.fileName })
      .from(uploads)
      .where(eq(uploads.id, id))
      .limit(1);

    if (!record) {
      return Response.json({ error: "Загрузка не найдена" }, { status: 404 });
    }

    await getDb().delete(uploads).where(eq(uploads.id, id));
    await bucket.delete(record.objectKey).catch(() => undefined);
    return Response.json({ deleted: { id: record.id, fileName: record.fileName } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось удалить загрузку";
    return Response.json({ error: message }, { status: 500 });
  }
}
