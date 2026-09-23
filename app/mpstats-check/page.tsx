"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MpstatsCheck } from "@/lib/mpstats-check";
type Reply = { report?: MpstatsCheck | null; error?: string; warning?: string };

export default function MpstatsCheckPage() {
  const token = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("кофемашина"), [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false), [message, setMessage] = useState("");
  const [supportMode, setSupportMode] = useState(false);
  const [report, setReport] = useState<MpstatsCheck | null>(null);
  useEffect(() => { void fetch("/api/mpstats-check", { cache: "no-store" }).then(async r => {
    const data = await r.json() as Reply; if (!r.ok) { setMessage(data.error || "Проверка недоступна."); return; }
    setReport(data.report ?? null); setReady(true);
  }).catch(() => setMessage("Не удалось открыть проверку. Обновите страницу.")); }, []);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!token.current || busy || !ready) return;
    setBusy(true); setMessage(""); setReport(null);
    const body = JSON.stringify({ token: token.current.value, query });
    token.current.value = "";
    try {
      const r = await fetch("/api/mpstats-check", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const data = await r.json() as Reply; if (!r.ok) { setMessage(data.error || "Проверка не выполнена."); return; }
      setReport(data.report ?? null); setMessage(data.warning || "Результат сохранён без токена. Нажмите «Скопировать результат без токена» ниже и отправьте его в чат.");
    } catch { setMessage("Не удалось получить ответ. Для повторной проверки вставьте токен заново."); }
    finally { setBusy(false); }
  }
  const supportText = report ? [
    "MPSTATS — отчёт для поддержки", `Время (UTC): ${report.checkedAt}`,
    `Запрос: ${report.query}`, `HTTP: ${report.httpStatus ?? "ответ не получен"} · ${report.elapsedMs ?? "—"} мс`,
    "", "ЗАПРОС К MPSTATS", report.request ? `${report.request.method} ${report.request.url}` : "В старом отчёте запрос не сохранён. Повторите проверку.",
    ...Object.entries(report.request?.headers ?? {}).map(([key, value]) => `${key}: ${value}`),
    ...(report.request ? ["Тело запроса: отсутствует (GET). Параметр keyword передан в URL."] : []),
    "", "ОТВЕТ MPSTATS", ...Object.entries(report.responseHeaders ?? {}).map(([key, value]) => `${key}: ${value}`),
    report.responseBody !== undefined ? (report.responseBody || "Тело ответа пустое.") : report.responseBodyNote || "Текст ответа не сохранён в этом отчёте.",
    report.responseBody !== undefined ? report.responseBodyNote ?? "" : "",
    "", "ПОЯСНЕНИЕ НАШЕЙ ПЛАТФОРМЫ (не текст ответа MPSTATS)", report.message,
  ].join("\n") : "";
  async function copySupport() {
    try { await navigator.clipboard.writeText(supportText); setMessage("Отчёт для поддержки скопирован."); }
    catch { setMessage("Не удалось скопировать. Нажмите «Скачать отчёт»."); }
  }
  function downloadSupport() {
    const url = URL.createObjectURL(new Blob([supportText], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "mpstats-support.txt"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <main className="mx-auto max-w-3xl px-4 py-6 sm:px-5 sm:py-10">
    {!supportMode && <a href="/" className="text-sm underline">← Вернуться в Market Radar</a>}
    {!supportMode && <section className="mt-6 rounded-2xl border bg-white p-6 sm:p-8">
      <h1 className="text-2xl font-semibold">Проверка API MPStats</h1>
      <p className="mt-1 text-sm text-muted-foreground">Диагностика · версия 4 · API Wildberries</p>
      <p className="mt-3 text-base text-muted-foreground">Первый тест — история частотности WB. Проверим доступ и фактические даты в ответе.</p>
      <div className="my-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm leading-relaxed">Токен отправляется по HTTPS на сервер этого сайта и далее только в MPStats. Мы не сохраняем его в базе, браузерном хранилище или отчёте. Поле очищается при отправке. Проверка доступна только владельцу.</div>
      <form onSubmit={submit} autoComplete="off" className="space-y-5">
        <div><label htmlFor="mp-query" className="mb-2 block text-sm font-medium">Поисковый запрос</label><Input id="mp-query" value={query} onChange={e => setQuery(e.target.value)} required minLength={2} maxLength={200} disabled={busy} /></div>
        <div><label htmlFor="mp-token" className="mb-2 block text-sm font-medium">API-токен MPStats</label><Input id="mp-token" ref={token} type="password" autoComplete="off" spellCheck={false} autoCapitalize="none" required minLength={20} maxLength={1000} disabled={busy || !ready} placeholder="Вставьте токен из настроек MPStats" /></div>
        <p className="text-sm text-muted-foreground">Одна проверка отправляет один запрос к API и может расходовать лимит вашего тарифа. Токен WB сюда не подходит.</p>
        <Button type="submit" disabled={busy || !ready}>{busy ? "Проверяем MPStats…" : "Проверить доступ и историю"}</Button>
      </form>
      <p role="status" aria-live="polite" className="mt-4 min-h-6 text-sm">{message}</p>
    </section>}
    {report && <section className="mt-5 rounded-2xl border bg-white p-4 sm:p-8">
      <div className="mb-5 flex flex-wrap gap-2 print:hidden">
        <Button variant="outline" onClick={() => setSupportMode(!supportMode)}>{supportMode ? "← Вернуться к проверке" : "Для скриншота"}</Button>
        <Button variant="outline" onClick={() => void copySupport()}>Скопировать для поддержки</Button>
        <Button variant="outline" onClick={downloadSupport}>Скачать отчёт</Button>
      </div>
      {(report.diagnosticVersion ?? 0) < 4 && <p className="mb-5 rounded-lg bg-amber-50 p-3 text-sm">Это результат прежней проверки через раздел Ozon. Адрес исправлен на метод Wildberries. Вставьте токен выше и запустите новую проверку.</p>}
      <h2 className="text-xl font-semibold">MPSTATS · отчёт для поддержки</h2>
      <p className="mt-2 text-sm text-muted-foreground">Время UTC: {report.checkedAt} · {report.elapsedMs ?? "—"} мс</p>
      <p className="my-4 text-2xl font-semibold">{report.httpStatus ? `HTTP ${report.httpStatus}` : "HTTP-ответ не получен"}</p>
      <h3 className="font-semibold">Запрос к MPSTATS</h3>
      <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 text-sm leading-6">{report.request ? `${report.request.method} ${report.request.url}\n${Object.entries(report.request.headers).map(([k, v]) => `${k}: ${v}`).join("\n")}` : "В старом отчёте запрос не сохранён."}</pre>
      {report.request && <p className="mt-3 text-sm"><strong>Тело запроса: отсутствует (GET).</strong> Параметр keyword передан в адресе запроса.</p>}
      <h3 className="mt-6 font-semibold">Ответ MPSTATS</h3>
      {!!Object.keys(report.responseHeaders ?? {}).length && <pre className="mt-2 whitespace-pre-wrap break-all text-sm leading-6">{Object.entries(report.responseHeaders ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n")}</pre>}
      <pre className="mt-3 whitespace-pre-wrap break-all rounded-lg border p-3 text-sm leading-6">{report.responseBody !== undefined ? report.responseBody || "Тело ответа пустое." : "Текст ответа не сохранён в этом отчёте."}</pre>
      {report.responseBodyNote && <p className="mt-2 text-sm text-muted-foreground">{report.responseBodyNote}</p>}
      <p className="mt-5 border-t pt-4 text-sm"><strong>Пояснение нашей платформы:</strong> {report.message}</p>
      {supportMode && <p role="status" className="mt-3 text-sm">{message === "Отчёт для поддержки скопирован." ? message : ""}</p>}
    </section>}
    {report && !supportMode && <section className="mt-5 rounded-2xl border bg-white p-6 sm:p-8">
      <h2 className="text-lg font-semibold">Результат: «{report.query}»</h2>
      <p className="mt-3">{report.message}</p>
      {report.errorCode && <p className="mt-2 text-sm text-muted-foreground">Код: {report.errorCode} · Этап: {report.stage} · {report.elapsedMs} мс</p>}
      {!report.diagnosticVersion && <p className="mt-2 text-sm">Это результат старой проверки. Введите токен заново и запустите обновлённую диагностику.</p>}
      <dl className="my-5 grid grid-cols-2 gap-4 text-sm">
        <div><dt className="text-muted-foreground">Дата проверки</dt><dd>{new Date(report.checkedAt).toLocaleString("ru-RU")}</dd></div>
        <div><dt className="text-muted-foreground">Ответ MPStats</dt><dd>{report.httpStatus ?? "Ответ не получен"}</dd></div>
        <div><dt className="text-muted-foreground">Доступные даты</dt><dd>{report.firstDate ? `${report.firstDate} — ${report.lastDate}` : "Не определены"}</dd></div>
        <div><dt className="text-muted-foreground">Точек истории</dt><dd>{report.rows}</dd></div>
      </dl>
      <div className="rounded-xl bg-muted p-4 text-sm leading-relaxed">Это проверка одного метода и одного запроса. Продажи, реклама, новинки и конкуренция пока не проверены. Период, за который считается каждая точка частотности, ещё нужно уточнить — значения не суммируем.</div>
      {report.points.length > 0 && <details className="mt-5"><summary className="cursor-pointer text-sm font-medium">Последние 12 точек истории</summary><table className="mt-3 w-full text-left text-sm"><thead><tr><th className="py-2">Дата</th><th className="py-2 text-right">Частотность</th></tr></thead><tbody>{report.points.slice(-12).map((p, i) => <tr key={`${p.date}-${i}`} className="border-t"><td className="py-2">{p.date}</td><td className="py-2 text-right">{p.frequency.toLocaleString("ru-RU")}</td></tr>)}</tbody></table></details>}
      <Button className="mt-5" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify(report, null, 2)); setMessage("Результат скопирован. Токена в нём нет."); } catch { setMessage("Не удалось скопировать. Сохранённый результат остаётся на странице."); } }}>Скопировать результат без токена</Button>
    </section>}
  </main>;
}
