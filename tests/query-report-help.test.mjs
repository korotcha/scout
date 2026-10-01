import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUERY_REPORT_HELP, QUERY_REPORT_SCOPE } from '../lib/query-report-help.ts';

test('all six report explanations contain calculation, purpose, interpretation and limits', () => {
  assert.deepEqual(Object.keys(QUERY_REPORT_HELP), ['demand', 'advertising', 'newcomers', 'money', 'orders', 'competition']);
  for (const help of Object.values(QUERY_REPORT_HELP)) {
    for (const key of ['title', 'calculation', 'purpose', 'interpretation', 'limitations', 'nextCheck']) {
      assert.ok(typeof help[key] === 'string' && help[key].trim().length > 10, `${help.title}: ${key}`);
    }
  }
});

test('methodology distinguishes a query cohort from attributed revenue and a market', () => {
  assert.match(QUERY_REPORT_SCOPE, /не весь рынок/);
  assert.match(QUERY_REPORT_SCOPE, /нельзя складывать/);
  assert.match(QUERY_REPORT_HELP.money.limitations, /всех каналов/);
  assert.match(QUERY_REPORT_HELP.money.calculation, /не по месту в поиске/);
  assert.match(QUERY_REPORT_HELP.demand.limitations, /не конверсия/);
});

test('risk indicators do not promise auction prices, newcomer success or actual buyouts', () => {
  assert.match(QUERY_REPORT_HELP.advertising.limitations, /не доля рекламных мест/);
  assert.match(QUERY_REPORT_HELP.advertising.interpretation, /не доказывает/);
  assert.match(QUERY_REPORT_HELP.newcomers.limitations, /неуспешные/);
  assert.match(QUERY_REPORT_HELP.orders.limitations, /оценка, не фактические выплаты/);
  assert.match(QUERY_REPORT_HELP.competition.calculation, /supplier_id/);
});

test('help is mounted in the active page and cannot enable disabled paid reports', () => {
  const panel = readFileSync(new URL('../app/search-demand-panel.tsx', import.meta.url), 'utf8');
  const guide = readFileSync(new URL('../app/query-report-help.tsx', import.meta.url), 'utf8');
  assert.ok(panel.includes('<ReportHelp kind="demand" />'));
  assert.ok(panel.includes('<QueryReportGuide />'));
  assert.ok(!panel.includes('/api/query-analysis'));
  assert.ok(!guide.includes('fetch('));
  assert.match(guide, /Дополнительные данные загружаются отдельной кнопкой/);
  assert.match(guide, /<details/);
});

test('help keeps a keyboard button, hover tooltip and a dialog for long text', () => {
  const source = readFileSync(new URL('../app/help-tip.tsx', import.meta.url), 'utf8');
  assert.match(source, /type="button"/);
  assert.match(source, /aria-label=/);
  assert.match(source, /TooltipTrigger/);
  assert.match(source, /DialogTrigger asChild/);
  assert.match(source, /DialogTitle/);
  assert.match(source, /DialogDescription/);
});
