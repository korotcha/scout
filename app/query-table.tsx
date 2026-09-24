"use client";

import { useState, type ReactNode } from "react";
import { ExternalLink, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Armchair, Box, Coffee, Flame, Headphones, LampDesk, Monitor, Shirt, Snowflake, Sparkles, Sprout, Wind, Wrench } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { fmt, prettyMonth, type SummaryRow } from "@/lib/market-types";
import { queryKey, wbSearchUrl } from "@/lib/niche-research";
import { formatQueryValue, type NumericKey, type SourcePeriods } from "@/lib/screener";

const numericColumns: { key: NumericKey; label: string; percent?: boolean }[] = [
  { key: "frequency", label: "Спрос" },
  { key: "yoyDemand", label: "Рост г/г", percent: true },
  { key: "perArticle", label: "На товар" },
  { key: "yoyPressure", label: "Рост/товар", percent: true },
  { key: "articles", label: "Артикулов" },
  { key: "mom", label: "Рост 30д", percent: true },
];

function SubjectIcon({ subject }: { subject: string }) {
  const Icon = /кофе/i.test(subject) ? Coffee
    : /наушник|колонк|акустик/i.test(subject) ? Headphones
    : /телевизор|монитор|планшет|ноутбук|камер/i.test(subject) ? Monitor
    : /кондиционер|вентилятор|осушител|увлажнител|воздух/i.test(subject) ? Wind
    : /ледогенератор|холодильник|морозил/i.test(subject) ? Snowflake
    : /печ|грил|обогревател|котел|котёл/i.test(subject) ? Flame
    : /диван|кресл|стул|мебел/i.test(subject) ? Armchair
    : /свет|ламп|светильник/i.test(subject) ? LampDesk
    : /одежд|бель|костюм|куртк|плать|свитер|шапк/i.test(subject) ? Shirt
    : /сад|растен|рассад|газон/i.test(subject) ? Sprout
    : /инструмент|генератор|дрел|станок/i.test(subject) ? Wrench
    : /елоч|ёлоч|украшен/i.test(subject) ? Sparkles : Box;
  return <span className="query-subject-icon" aria-hidden="true"><Icon size={21} strokeWidth={1.6} /></span>;
}

export function HeaderHelp({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <Tooltip open={open} onOpenChange={setOpen}>
    <TooltipTrigger asChild><button type="button" aria-label={`Подсказка: ${label}`} className="query-header-help inline-flex items-center rounded text-left focus-visible:outline-2 focus-visible:outline-offset-4" onClick={() => setOpen(!open)}>{label === "Рост г/г" ? <span>Рост <span className="whitespace-nowrap">г/г</span></span> : label}</button></TooltipTrigger>
    <TooltipContent side="top" sideOffset={10} className="query-tooltip max-w-80 bg-[#20252a] px-4 py-3 text-sm font-normal leading-6 text-white shadow-lg">{children}</TooltipContent>
  </Tooltip>;
}

export function QueryTable({ rows, periods, onOpen, renderWork, sort, onSort, compact = false, renderFilter, highlightedQuery, renderScore, scoreFilter, scoreSort, onScoreSort, statusFilter, statusSort, onStatusSort, selection, rowMark }: {
  selection?: {scopeRows?:SummaryRow[];selected:Set<string>;disabled:boolean;onToggle:(row:SummaryRow,checked:boolean)=>void;onPage:(checked:boolean)=>void};
  rowMark?: (row:SummaryRow)=>"shortlisted"|"excluded"|undefined;
  renderScore?: (subject: string, query: string) => ReactNode; scoreFilter?: ReactNode; scoreSort?: "asc" | "desc"; onScoreSort?: () => void; statusFilter?: ReactNode; statusSort?: "asc" | "desc"; onStatusSort?: () => void;
  rows: SummaryRow[]; periods: SourcePeriods; onOpen?: (subject: string, query: string) => void;
  renderWork?: (subject: string, query: string) => ReactNode; compact?: boolean; highlightedQuery?: string;
  renderFilter?: (key: NumericKey) => ReactNode;
  sort?: { key: NumericKey; direction: "asc" | "desc" }; onSort?: (key: NumericKey) => void;
}) {
  const selectionRows = selection?.scopeRows ?? rows;
  const current = prettyMonth(periods.period), previous = prettyMonth(periods.comparisonPeriod);
  const hints: Record<NumericKey, string> = {
    frequency: `Число поисков запроса за ${current}, как в исходной таблице. Поиски не равны заказам или продажам. Прочерк — значение отсутствует.`,
    yoyDemand: `Изменение частотности: ${current} относительно ${previous}. «Рост г/г» соответствует «Динамика Ч (год)» в таблице. Прочерк — нет рассчитанного сравнения; это не нулевой рост и не доказательство новизны запроса.`,
    perArticle: `Частотность на один артикул за ${current}. Это исходный показатель таблицы, а не продажи одного товара. Прочерк — показатель отсутствует или не рассчитан.`,
    yoyPressure: `Изменение частотности на один артикул: ${current} относительно ${previous}. В таблице — «Динамика З (год)». Рост означает увеличение поискового интереса в расчёте на артикул. Прочерк — нет рассчитанного сравнения.`,
    articles: `Число артикулов по запросу в выгрузке за ${current}. Включает слабые и неактивные карточки; не равно числу продавцов с продажами. Прочерк — число не указано.`,
    mom: `Динамика за 30 дней из исходной выгрузки за ${current}; в таблице — «Динамика 30д (месяц)». Это не сравнение год к году. Прочерк — значение отсутствует.`,
  };
  return <TooltipProvider delayDuration={350} skipDelayDuration={500}><div className={`query-table-shell ${compact ? "query-table-compact" : "query-table-screener"} ${renderScore ? "query-table-scored" : ""} ${selection ? "query-table-selectable" : ""}`}>
    <Table>
      <colgroup>
        {selection && <col className="query-column-checkbox"/>}
        {renderScore && <col className="query-column-score" />}
        <col className="query-column-name" />
        {!compact && <col className="query-column-subject" />}
        {numericColumns.map(({ key }) => <col key={key} className={`query-column-${key}`} />)}
        {renderWork && <col className="query-column-work" />}
      </colgroup>
      <TableHeader><TableRow>
        {selection&&<TableHead className="query-checkbox-cell"><Checkbox aria-label="Выбрать все запросы по текущим фильтрам" disabled={selection.disabled||!selectionRows.length} checked={selectionRows.length>0&&selectionRows.every(r=>selection.selected.has(queryKey(r.query)))?true:selectionRows.some(r=>selection.selected.has(queryKey(r.query)))?"indeterminate":false} onCheckedChange={v=>selection.onPage(v===true)}/></TableHead>}
        {renderScore && <TableHead scope="col" className="query-column-score" aria-sort={scoreSort === "desc" ? "descending" : scoreSort === "asc" ? "ascending" : "none"}><div className="flex items-center gap-1"><HeaderHelp label="Общий балл">Оценка по фактам разбора: спрос, продажи, конкуренты и риски. Звёздочка — анализ не завершён. 0–39 — красный, 40–69 — жёлтый, от 70 — зелёный. Стоп-факторы проверяются отдельно; высокий балл не разрешает закупку.</HeaderHelp><button type="button" className="query-sort-button size-6 shrink-0" aria-label="Сортировать по общему баллу" data-active={Boolean(scoreSort)} onClick={onScoreSort}>{scoreSort === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}</button></div>{scoreFilter && <div className="query-column-filter">{scoreFilter}</div>}</TableHead>}
        <TableHead scope="col" className="query-name-head query-column-name"><HeaderHelp label="Запрос">Фраза покупателя из исходного свода за {current}.{onOpen ? " Нажмите на запрос, чтобы открыть отдельный разбор этого запроса. Внутри доступен весь пул предмета." : " Здесь доступен загруженный пул предмета, включая запросы, не прошедшие фильтр скринера."} Прочерк вместо показателя не означает отсутствие спроса.</HeaderHelp></TableHead>
        {!compact && <TableHead scope="col" className="query-column-subject"><HeaderHelp label="Предмет WB">Приоритетный предмет, к которому Wildbox отнёс запрос в выгрузке за {current}. Классификация может быть неточной: принадлежность проверяем при разборе. Прочерк — предмет не указан.</HeaderHelp></TableHead>}
        {numericColumns.map(({ key, label }) => <TableHead scope="col" className={`query-column-${key} text-right`} key={key} aria-sort={sort?.key === key ? sort.direction === "desc" ? "descending" : "ascending" : "none"}>
          <div className="query-header-sortable flex items-center justify-end gap-1"><HeaderHelp label={label}>{hints[key]}</HeaderHelp>{onSort && <button type="button" data-active={sort?.key === key} className="query-sort-button grid size-6 shrink-0 place-items-center rounded hover:bg-slate-200/60 focus-visible:outline-2" onClick={() => onSort(key)} aria-label={`Сортировать: ${label}, ${sort?.key === key && sort.direction === "desc" ? "по возрастанию" : "по убыванию"}`}>{sort?.key === key && sort.direction === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}</button>}</div>{renderFilter && <div className="query-column-filter">{renderFilter(key)}</div>}
        </TableHead>)}
        {renderWork && <TableHead scope="col" className="query-column-work" aria-sort={statusSort === "asc" ? "ascending" : statusSort === "desc" ? "descending" : "none"}><div className="flex items-center gap-1"><HeaderHelp label="Статус">В скринере три статуса: «Не разобрано», «Чистовик» и «Исключено». Они применяются сразу, без подтверждения. Для запросов в чистовике ниже показывается отдельная шкала прогресса: отбор → анализ менеджера → решение владельца.</HeaderHelp>{onStatusSort && <button type="button" className="query-sort-button size-6 shrink-0" data-active={!!statusSort} aria-label="Сортировать по названию статуса" onClick={onStatusSort}>{statusSort === "desc" ? <ArrowDown className="size-3.5"/> : <ArrowUp className="size-3.5"/>}</button>}</div>{statusFilter && <div className="query-column-filter">{statusFilter}</div>}</TableHead>}
      </TableRow></TableHeader>
      <TableBody>{rows.map((row, index) => <TableRow key={`${row.subject}-${row.query}-${index}`} data-screening-mark={rowMark?.(row)} data-current-query={Boolean(highlightedQuery && queryKey(row.query) === queryKey(highlightedQuery))}>
        {selection&&<TableCell className="query-checkbox-cell"><Checkbox aria-label={`Выбрать запрос: ${row.query}`} disabled={selection.disabled} checked={selection.selected.has(queryKey(row.query))} onCheckedChange={v=>selection.onToggle(row,v===true)}/></TableCell>}
        {renderScore && <TableCell className="query-column-score query-score-cell">{renderScore(row.subject, row.query)}</TableCell>}
        <TableCell className="query-column-name query-name-cell"><div className="flex items-center gap-2">{onOpen ? <button type="button" className="query-name-button flex w-full items-center gap-3.5 text-left leading-6 underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-4" title={row.query} onClick={() => onOpen(row.subject, row.query)}>{!compact && !renderScore && <SubjectIcon subject={row.subject} />}<span>{row.query}</span></button> : <span className="font-medium leading-6">{row.query}{highlightedQuery && queryKey(row.query) === queryKey(highlightedQuery) && <span className="query-current-label">В разборе</span>}</span>}<a href={wbSearchUrl(row.query)} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground" aria-label={`Найти на WB: ${row.query}`} title="Открыть поиск WB"><ExternalLink className="size-3.5" /></a></div></TableCell>
        {!compact && <TableCell className="query-column-subject max-w-56 whitespace-normal text-[#535b63]">{row.subject}</TableCell>}
        {numericColumns.map(({ key, percent }) => <TableCell key={key} className={`query-column-${key} text-right tabular-nums ${percent && row[key] != null ? `${compact ? "" : "font-semibold"} ${row[key]! < 0 ? "text-[#bf4a40]" : row[key]! > 0 ? "text-[#19834d]" : ""}` : row[key] == null ? "text-[#969da5]" : ""}`}>{formatQueryValue(row[key], key)}</TableCell>)}
        {renderWork && <TableCell className="query-column-work">{renderWork(row.subject, row.query)}</TableCell>}
      </TableRow>)}</TableBody>
    </Table>
  </div></TooltipProvider>;
}

export function QueryPagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (page: number) => void }) {
  const count = Math.max(1, Math.ceil(total / pageSize));
  const start = Math.max(0, Math.min(page - 1, count - 3));
  const pages = Array.from({ length: Math.min(3, count) }, (_, i) => start + i);
  return <Pagination className="query-pagination mx-0 w-auto" aria-label="Страницы запросов"><PaginationContent>
    <PaginationItem><Button type="button" size="icon" variant="outline" className="size-10 rounded-xl bg-white shadow-none" disabled={page === 0} onClick={() => onChange(page - 1)} aria-label="Предыдущая страница"><ArrowLeft className="size-4" /></Button></PaginationItem>
    {pages.map((p) => <PaginationItem key={p}><Button type="button" size="icon" variant="outline" className={`size-10 rounded-xl shadow-none ${p === page ? "border-[#171b20] bg-[#171b20] text-white hover:bg-[#30363d] hover:text-white" : "bg-white"}`} aria-current={p === page ? "page" : undefined} aria-label={`Страница ${p + 1}`} onClick={() => onChange(p)}>{fmt(p + 1)}</Button></PaginationItem>)}
    <PaginationItem><Button type="button" size="icon" variant="outline" className="size-10 rounded-xl bg-white shadow-none" disabled={page + 1 >= count} onClick={() => onChange(page + 1)} aria-label="Следующая страница"><ArrowRight className="size-4" /></Button></PaginationItem>
  </PaginationContent></Pagination>;
}
