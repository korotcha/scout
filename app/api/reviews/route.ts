import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { subjectReviews } from "@/db/schema";

function actor(request: Request) {
  return request.headers.get("oai-authenticated-user-email") ?? "Неизвестный пользователь";
}

export async function GET() {
  try {
    const rows = await getDb().select().from(subjectReviews).orderBy(asc(subjectReviews.subject));
    return Response.json({ reviews: rows });
  } catch {
    return Response.json({ reviews: [], unavailable: true });
  }
}

export async function POST(request: Request) {
  const payload = (await request.json()) as { subject?: string; status?: string; comment?: string };
  const subject = payload.subject?.trim();
  if (!subject) return Response.json({ error: "Не указан предмет" }, { status: 400 });

  const [row] = await getDb().insert(subjectReviews).values({
    subject,
    status: payload.status?.trim() || "analysis",
    comment: payload.comment?.trim() ?? "",
    updatedBy: actor(request),
  }).onConflictDoUpdate({
    target: subjectReviews.subject,
    set: {
      status: payload.status?.trim() || "analysis",
      comment: payload.comment?.trim() ?? "",
      updatedBy: actor(request),
      updatedAt: new Date().toISOString(),
    },
  }).returning();
  return Response.json({ review: row });
}
