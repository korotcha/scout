import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { analysisProjects } from "@/db/schema";

function actor(request: Request) {
  return request.headers.get("oai-authenticated-user-email") ?? "Неизвестный пользователь";
}

export async function GET() {
  try {
    const rows = await getDb()
      .select()
      .from(analysisProjects)
      .orderBy(desc(analysisProjects.createdAt), desc(analysisProjects.id))
      .limit(100);
    return Response.json({ projects: rows });
  } catch {
    return Response.json({ projects: [], unavailable: true });
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { name?: string; currentPeriod?: string; comparisonPeriod?: string; launchMonth?: string }
    | null;
  const name = body?.name?.trim();
  const currentPeriod = body?.currentPeriod;
  const comparisonPeriod = body?.comparisonPeriod;
  const launchMonth = body?.launchMonth || currentPeriod;
  if (!launchMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(launchMonth)) return Response.json({ error: "Выберите месяц запуска" }, { status: 400 });

  if (!name || name.length > 80) {
    return Response.json({ error: "Укажите название проекта" }, { status: 400 });
  }
  if (!currentPeriod || !comparisonPeriod || !/^\d{4}-(0[1-9]|1[0-2])$/.test(currentPeriod) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(comparisonPeriod)) {
    return Response.json({ error: "Выберите текущий период и период сравнения" }, { status: 400 });
  }
  if (currentPeriod === comparisonPeriod) {
    return Response.json({ error: "Периоды должны отличаться" }, { status: 400 });
  }

  try {
    const [project] = await getDb()
      .insert(analysisProjects)
      .values({ name, currentPeriod, comparisonPeriod, launchMonth, createdBy: actor(request) })
      .returning();
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось создать проект";
    return Response.json({ error: message }, { status: 500 });
  }
}
