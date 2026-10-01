"use client";

import { QUERY_REPORT_HELP, QUERY_REPORT_SCOPE, type QueryReportKind } from '@/lib/query-report-help';
import { HelpTip } from './help-tip';

export function ReportExplanation({ kind }: { kind: QueryReportKind }) {
  const help = QUERY_REPORT_HELP[kind];
  const sections = [
    ['Что считаем', help.calculation],
    ['Зачем смотреть', help.purpose],
    ['Как оценивать', help.interpretation],
    ['Ограничения', help.limitations],
    ['Что проверить дальше', help.nextCheck],
  ];
  return <dl className="query-report-explanation">{sections.map(([title, text]) =>
    <div key={title}><dt>{title}</dt><dd>{text}</dd></div>
  )}</dl>;
}

export function ReportHelp({ kind }: { kind: QueryReportKind }) {
  return <HelpTip label={QUERY_REPORT_HELP[kind].title}><ReportExplanation kind={kind} /></HelpTip>;
}

/** The guide describes reports; opening it never starts their upstream loading. */
export function QueryReportGuide() {
  return <details className="query-report-guide">
    <summary>Как читать отчёты по запросу</summary>
    <p>{QUERY_REPORT_SCOPE}</p>
    <p className="query-report-guide-status">Сейчас подключён график спроса и товаров. Ниже — памятка по шести отчётам; остальные данные пока не загружаются. Наведите на «?» или нажмите, чтобы прочитать методику.</p>
    <ul>{(Object.keys(QUERY_REPORT_HELP) as QueryReportKind[]).map(kind => <li key={kind}>
      <div className="query-report-guide-heading"><h3>{QUERY_REPORT_HELP[kind].title}</h3><ReportHelp kind={kind} /></div>
      <p>{QUERY_REPORT_HELP[kind].purpose}</p>
    </li>)}</ul>
  </details>;
}
