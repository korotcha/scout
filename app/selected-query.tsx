"use client";

import { useEffect, useRef } from "react";
import { Pin } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryKey } from "@/lib/niche-research";
import { formatQueryValue, type NumericKey } from "@/lib/screener";
import { prettyMonth } from "@/lib/market-types";
import { HeaderHelp } from "./query-table";
import type { SubjectQueriesProps } from "./subject-queries";

export function SelectedQuery({ query, subject, period, data }: { query: string; subject: string; period: string; data: SubjectQueriesProps }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current, workspace = element?.closest<HTMLElement>(".candidate-workspace");
    if (!element || !workspace) return;
    const measure = () => workspace.style.setProperty("--query-focus-height", `${element.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { observer.disconnect(); workspace.style.removeProperty("--query-focus-height"); };
  }, []);
  const row = data.available && !data.loading && !data.error && query
    ? data.rows.find(row => row.subject === subject && queryKey(row.query) === queryKey(query)) : undefined;
  const current = prettyMonth(data.periods.period), previous = prettyMonth(data.periods.comparisonPeriod);
  const columns: { key: NumericKey; label: string; hint: string }[] = [
    { key: "frequency", label: "Частотность", hint: `Число поисков именно этого запроса за ${current}. Поиски не равны продажам.` },
    { key: "yoyDemand", label: "Рост г/г", hint: `Изменение частотности именно этого запроса: ${current} к ${previous}. Прочерк — нет сравнения, а не нулевой рост.` },
    { key: "perArticle", label: "Частота / арт.", hint: `Частотность этого запроса на один артикул за ${current}, как в исходной таблице. Это не продажи товара.` },
    { key: "yoyPressure", label: "Рост частоты / арт.", hint: `Изменение частотности на артикул по этому запросу: ${current} к ${previous}. Прочерк — нет сравнения.` },
    { key: "articles", label: "Артикулов", hint: `Артикулы по этому запросу в выгрузке за ${current}, включая неактивные. Это не количество продавцов.` },
    { key: "mom", label: "Рост за 30 д.", hint: `Динамика за 30 дней по этому запросу из выгрузки за ${current}. Это не рост год к году.` },
  ];
  return <div ref={ref} className="candidate-query-focus" aria-label="Запрос в разборе">
    <div className="candidate-query-identity">
      <span className="candidate-query-label"><Pin aria-hidden="true" className="size-3.5" />{query ? "Разбираем запрос" : "Прежний разбор предмета"}</span>
      <h1>{query || subject}</h1>
      <p>{subject} · запуск {prettyMonth(period)}</p>
    </div>
    <div className="candidate-query-numbers">
      <TooltipProvider delayDuration={350}><dl>{columns.map(({ key, label, hint }) => {
        const value = row ? row[key] : null;
        const tone = ["yoyDemand", "yoyPressure", "mom"].includes(key) && value != null ? value > 0 ? "growing" : value < 0 ? "falling" : "" : "";
        return <div key={key} className={tone}><dt><HeaderHelp label={label}>{hint}</HeaderHelp></dt><dd>{formatQueryValue(value, key)}</dd></div>;
      })}</dl></TooltipProvider>
      {!row && <p role="status" className="candidate-query-unavailable">{!query ? "Укажите запрос для этого разбора ниже." : data.loading ? "Загружаем показатели…" : data.error ? "Не удалось загрузить показатели запроса." : "В своде выбранного периода нет показателей этого запроса."}</p>}
    </div>
  </div>;
}
