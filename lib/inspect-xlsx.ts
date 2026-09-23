import { Unzip, UnzipInflate } from "fflate";

export type WorkbookInspection = {
  sheetNames: string[];
  selectedSheet: string | null;
  rowCount: number | null;
  issues: string[];
};

function decodeXml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

export async function inspectXlsx(file: File, role: "db1" | "db2"): Promise<WorkbookInspection> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { sheetNames: [], selectedSheet: null, rowCount: null, issues: ["Нужен файл .xlsx"] };
  }

  const smallXml = new Map<string, Uint8Array[]>();
  const worksheetRows = new Map<string, number>();
  const tails = new Map<string, string>();
  const decoder = new TextDecoder();

  const unzip = new Unzip((entry) => {
    const isBook = entry.name === "xl/workbook.xml";
    const isRels = entry.name === "xl/_rels/workbook.xml.rels";
    const isSheet = /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name);
    if (!isBook && !isRels && !isSheet) return;

    if (isBook || isRels) smallXml.set(entry.name, []);
    if (isSheet) worksheetRows.set(entry.name, 0);

    entry.ondata = (error, data, final) => {
      if (error) throw error;
      if (isBook || isRels) smallXml.get(entry.name)?.push(data);
      if (isSheet) {
        const text = (tails.get(entry.name) ?? "") + decoder.decode(data, { stream: !final });
        const matches = text.match(/<row(?:\s|>)/g);
        worksheetRows.set(entry.name, (worksheetRows.get(entry.name) ?? 0) + (matches?.length ?? 0));
        tails.set(entry.name, text.slice(-8));
      }
    };
    entry.start();
  });
  unzip.register(UnzipInflate);

  const reader = file.stream().getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    unzip.push(value, false);
  }
  unzip.push(new Uint8Array(), true);

  const combine = (name: string) => {
    const chunks = smallXml.get(name) ?? [];
    const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder().decode(bytes);
  };

  const workbookXml = combine("xl/workbook.xml");
  const relsXml = combine("xl/_rels/workbook.xml.rels");
  const relTargets = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    const target = match[2].replace(/^\//, "").replace(/^xl\//, "");
    relTargets.set(match[1], `xl/${target}`.replace("xl/xl/", "xl/"));
  }

  const sheets: Array<{ name: string; path: string }> = [];
  for (const match of workbookXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const path = relTargets.get(match[2]);
    if (path) sheets.push({ name: decodeXml(match[1]), path });
  }

  const wanted = role === "db1" ? "бд 1" : "бд 2";
  const selected = sheets.find((sheet) => sheet.name.trim().toLowerCase() === wanted) ??
    (sheets.length === 1 ? sheets[0] : null);
  const rowCount = selected ? Math.max(0, (worksheetRows.get(selected.path) ?? 0) - 1) : null;
  const issues: string[] = [];
  if (!selected) issues.push(`Не найдена вкладка «${role === "db1" ? "БД 1" : "БД 2"}»`);
  if (selected && rowCount === 0) issues.push("В выбранной вкладке нет строк с данными");

  return {
    sheetNames: sheets.map((sheet) => sheet.name),
    selectedSheet: selected?.name ?? null,
    rowCount,
    issues,
  };
}
