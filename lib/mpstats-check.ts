export type FrequencyPoint = { date: string; frequency: number };
export type MpstatsCheck = {
  checkedAt: string; query: string; status: "ok" | "empty" | "error" | "format";
  diagnosticVersion?: number; errorCode?: string; stage?: string; elapsedMs?: number;
  httpStatus: number | null; message: string; firstDate: string | null;
  lastDate: string | null; rows: number; points: FrequencyPoint[];
  request?: { method: "GET"; url: string; headers: Record<string, string>; body: null };
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  responseBodyNote?: string;
};

// Error excerpts must be scrubbed before returning or persisting them.
export function redactDiagnostic(raw: string, token: string): string {
  let text = raw;
  try { text = JSON.stringify(JSON.parse(raw), null, 2); } catch { /* plain text or HTML */ }
  text = text.replace(/\\u([0-9a-f]{4})/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, n) => String.fromCharCode(parseInt(n.replace(/^x/i, ""), /^x/i.test(n) ? 16 : 10)));
  for (const secret of [token, encodeURIComponent(token), btoa(token)]) text = text.split(secret).join("[СКРЫТО]");
  return text
    .replace(/((?:["']?(?:x-mpstats-token|auth-token|authorization|cookie|set-cookie|token|api[_-]?key)["']?)\s*[:=]\s*)[^\r\n,}]+/gi, "$1[СКРЫТО]")
    .replace(/[A-Za-z0-9_.%+\/-]{24,}={0,2}/g, "[СКРЫТО]");
}

// Successful responses expose only public numeric/date fields.
export function frequencyPoints(value: unknown): FrequencyPoint[] | null {
  if (!Array.isArray(value)) return null;
  const rows: FrequencyPoint[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object" || typeof row.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(row.date)) ||
      new Date(row.date).toISOString().slice(0, 10) !== row.date ||
      typeof row.frequency !== "number" || !Number.isFinite(row.frequency) || row.frequency < 0) return null;
    rows.push({ date: row.date, frequency: row.frequency });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export async function readLimited(body: ReadableStream<Uint8Array> | null, limit: number): Promise<string> {
  if (!body) throw new Error("empty");
  const reader = body.getReader(), decoder = new TextDecoder();
  let size = 0, result = "";
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new Error("size"); }
    result += decoder.decode(value, { stream: true });
  }
  return result + decoder.decode();
}

export async function checkFrequency(token: string, query: string): Promise<MpstatsCheck> {
  const started = Date.now();
  const report: MpstatsCheck = { diagnosticVersion: 4, stage: "connect", checkedAt: new Date().toISOString(), query, status: "error", httpStatus: null,
    message: "Не удалось связаться с MPStats. Повторите проверку позже.", firstDate: null, lastDate: null, rows: 0, points: [] };
  // Wildberries OpenAPI: GET /keywords/frequency, required query parameter keyword; no request body.
  const url = new URL("https://mpstats.io/api/analytics/v1/wb/keywords/frequency");
  url.searchParams.set("keyword", query);
  report.request = { method: "GET", url: url.href, headers: { "X-Mpstats-TOKEN": "[СКРЫТО]", Accept: "application/json" }, body: null };
  try {
    const response = await fetch(url, { headers: { "X-Mpstats-TOKEN": token, Accept: "application/json" },
      redirect: "manual", signal: AbortSignal.timeout(20000) });
    report.httpStatus = response.status;
    report.stage = "response";
    report.responseHeaders = {};
    for (const name of ["content-type", "server", "cf-ray", "x-request-id", "retry-after"]) {
      const value = response.headers.get(name);
      if (value) report.responseHeaders[name] = redactDiagnostic(value, token);
    }
    if (response.status !== 200) {
      report.errorCode = `HTTP_${response.status}`;
      report.message = response.status >= 300 && response.status < 400 ? "MPStats вернул перенаправление. Токен по другому адресу не отправлен; нужно проверить адрес метода." :
        response.status === 401 ? "MPStats не принял токен. Проверьте его в настройках аккаунта." :
        response.status === 403 ? "Получен отказ в доступе. Причиной могут быть права API, тариф или защита MPStats; по одному коду 403 это не определить." :
        response.status === 404 ? "Метод не найден. Это не означает, что история WB недоступна: нужно уточнить актуальный адрес у MPStats." :
        response.status === 429 ? "Достигнут лимит запросов MPStats. Повторите позже." :
        response.status === 202 ? "MPStats ещё готовит ответ. Повторите проверку позже." :
        "MPStats вернул ошибку. Код ответа указан ниже; токен в отчёт не включён.";
      try {
        const raw = response.body ? await readLimited(response.body, 65_536) : "";
        const isHtml = /text\/html/i.test(response.headers.get("content-type") ?? "") || /^\s*<(?:!doctype|html)/i.test(raw);
        const readable = isHtml ? raw.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
          .replace(/<[^>]*>/g, "\n").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
          .replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n").trim() : raw;
        const safe = redactDiagnostic(readable, token);
        report.responseBody = safe.slice(0, 12_000);
        report.responseBodyNote = `${isHtml ? "HTML-ответ преобразован в текст. " : ""}${safe.length > 12_000 ? "Первые 12 000 символов; " : ""}Секреты и длинные идентификаторы скрыты.`;
      } catch {
        report.responseBodyNote = "Тело ответа не сохранено: превышен лимит 64 КБ или чтение не завершилось. HTTP-код получен.";
      }
      return report;
    }
    report.stage = "read";
    const raw = await readLimited(response.body, 2_000_000);
    report.stage = "parse";
    const points = frequencyPoints(JSON.parse(raw));
    report.elapsedMs = Date.now() - started;
    if (!points) return { ...report, status: "format", errorCode: "UNEXPECTED_FORMAT", message: "Ответ получен, но его структура отличается от документации. Доступность истории пока не подтверждена." };
    return { ...report, status: points.length ? "ok" : "empty", stage: "complete", points, rows: points.length,
      firstDate: points[0]?.date ?? null, lastDate: points.at(-1)?.date ?? null,
      message: points.length ? "История частотности получена. Ниже — фактический диапазон ответа для этого запроса." : "Метод вернул пустой список для этого запроса. Попробуйте другую формулировку." };
  } catch (error) {
    // Classify locally; never expose raw exception text or response bodies.
    const name = error instanceof Error ? error.name : "";
    const message = error instanceof Error ? error.message : "";
    if (name === "TimeoutError" || name === "AbortError") {
      report.errorCode = "TIMEOUT";
      report.message = "MPStats не завершил ответ за 20 секунд. Повторите проверку позже.";
    } else if (report.stage === "parse") {
      report.status = "format"; report.errorCode = "INVALID_JSON";
      report.message = "Ответ получен, но это не корректный JSON. Возможно, API вернул страницу сайта или защиты; данные истории не подтверждены.";
    } else if (message === "size") {
      report.errorCode = "RESPONSE_TOO_LARGE";
      report.message = "Ответ превышает лимит проверки (2 МБ). Нужно изменить способ загрузки истории.";
    } else {
      report.errorCode = report.httpStatus === null ? "CONNECTION_FAILED" : "RESPONSE_READ_FAILED";
      report.message = report.httpStatus === null
        ? "Сервер сайта не получил HTTP-ответ MPStats. Возможны сетевой сбой или ограничение соединения. Это не подтверждает ошибку токена. Передайте этот отчёт для проверки подключения."
        : "Соединение установлено, но ответ не удалось прочитать полностью. Повторите проверку.";
    }
    return report;
  } finally { report.elapsedMs = Date.now() - started; }
}
