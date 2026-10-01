import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const directory = mkdtempSync(join(tmpdir(), 'scout-report-ui-'));
// Bundle React and the components in one module so hook rendering shares a runtime.
await build({ stdin: { contents: `
  import React from 'react';
  import {renderToStaticMarkup} from 'react-dom/server';
  import {QueryPeriodPicker} from './app/query-period-picker';
  import {QueryItemsPanel} from './app/query-items-panel';
  import {DemandHistory} from './app/search-demand-panel';
  export const picker = props => renderToStaticMarkup(React.createElement(QueryPeriodPicker, {...props, onPreset:()=>{}, onCustom:()=>{}}));
  export const reports = props => renderToStaticMarkup(React.createElement(QueryItemsPanel, props));
  export const demand = props => renderToStaticMarkup(React.createElement(DemandHistory, props));
`, resolveDir: process.cwd(), loader: 'tsx' }, outfile: join(directory, 'ui.mjs'), bundle: true,
  platform: 'node', format: 'esm', jsx: 'automatic', loader: {'.css':'empty'}, logLevel: 'silent',
  banner: {js: "import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);"} });
const ui = await import(pathToFileURL(join(directory, 'ui.mjs')).href);
const full = {from:'2023-10',to:'2026-09'};
test('rendered compact picker exposes three presets and direct month/year selectors', () => {
  const compact = ui.picker({preset:'36',custom:full,full});
  assert.equal((compact.match(/<button /g)||[]).length,3);
  assert.ok(!compact.includes('<select'));
  const custom = ui.picker({preset:'custom',custom:full,full});
  assert.equal((custom.match(/<select /g)||[]).length,4);
  for (const label of ['3 года','24 месяца','Свой период','С: год','По: месяц']) assert.ok(custom.includes(label));
});
test('rendered five reports have headings and closed tables, without the old controls or help wall', () => {
  const html = ui.reports({rows:[]});
  assert.equal((html.match(/<h3 /g)||[]).length,5);
  assert.ok(html.includes('Заказы и выкупы по месяцам'));
  assert.ok(!html.includes('Остальные отчёты по запросу'));
  assert.ok(!html.includes('<button'));
  assert.ok(!/<details[^>]* open/.test(html));
});
test('demand chart honours the same 24-month range and retains a missing newest month', () => {
  const history = {version:2,source:'mpstats-seo-keywords-selection',query:'кофемашина',fetchedAt:'2026-09-25T00:00:00Z',
    requestedFrom:'2023-10-01',requestedTo:'2026-09-01',complete:true,points:[{date:'2026-09-01',frequency:191898,items:4983}]};
  const html = ui.demand({history,full,period:{from:'2024-10',to:'2026-09'}});
  assert.equal((html.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0].match(/<tr>/g)||[]).length,24);
  assert.ok(html.includes('Ещё не загружено'));
  assert.ok(!html.includes('<select'));
});
