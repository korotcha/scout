import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { appendItemsPage, aggregateItems, itemRequestParams, reportMonths, completedMonth } from '../lib/query-items.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/query-items-coffee-2026-10-01.json', import.meta.url), 'utf8'));
const query = fixture.query;
const response = n => ({ startRow: 0, total: fixture.months[n].total, data: fixture.months[n].rows.map(row => Object.fromEntries(fixture.fields.map((f, i) => [f, row[i]]))) });
const august = appendItemsPage(query, '2026-08', response(0), null, '2026-10-01T06:00:00Z');
const september = appendItemsPage(query, '2026-09', response(1), null, '2026-10-01T06:00:00Z');

test('actual API fixture reproduces two independent Excel months, with explicit buyout discrepancies', () => {
  for (let i = 0; i < 2; i++) {
    const r = aggregateItems(i ? september : august, i ? august : null), x = fixture.months[i].excel;
    assert.equal(r.cards, x['Реклама'][1]); assert.equal(r.advertised, x['Реклама'][2]);
    assert.equal(r.withoutAd, x['Реклама'][3]); assert.equal(Math.round(r.adShare), Math.round(x['Реклама'][4] * 100));
    assert.equal(r.newItems, x['Новинки'][1]);
    for (const [key, col] of [['averagePrice',1],['top1',2],['top5',3],['top10',4]]) assert.equal(Math.round(r[key]), x['Деньги'][col], key);
    for (const [key, col] of [['revenue',1],['estimatedRevenue',3],['orders',4],['boughtOrders',5],['estimatedOrders',6]]) assert.equal(r[key], x['Заказы'][col], key);
    for (const [key, col] of [['share1',1],['share5',2],['share10',3]]) assert.equal(Math.round(r[key] * 10), Math.round(x['Конкуренция'][col] * 1000));
    assert.equal(r.brands, x['Конкуренция'][4]); assert.equal(r.sellers, x['Конкуренция'][5]);
    assert.equal(r.boughtRevenue - x['Заказы'][2], i ? 98 : 699);
  }
  const s = aggregateItems(september, august);
  assert.equal(s.newBrands, 3); assert.equal(s.newSellers, 7);
  assert.equal(aggregateItems(august).newBrands, null);
  assert.equal(aggregateItems(september, { ...august, month: '2026-07' }).newSellers, null);
  assert.equal(aggregateItems(september, { ...august, query: 'другой запрос' }).newSellers, null);
});
test('calendar month requests, query only, fixed FBO, no inferred SKU and no rolling date shifts', () => {
  assert.equal(itemRequestParams(query, '2024-02', 500).d2, '2024-02-29');
  assert.equal(itemRequestParams(query, '2026-12', 0).d2, '2026-12-31');
  assert.equal(itemRequestParams(query, '2026-08', 500).fbs, '0');
  assert.equal(completedMonth(new Date('2026-01-01T00:00:00Z')), '2025-12');
  assert.equal(reportMonths('2023-10', '2026-09').length, 36);
  assert.deepEqual(reportMonths('2026-09', '2026-08'), []);
});
test('incomplete, duplicate, error and changed-total responses cannot masquerade as complete', () => {
  assert.throws(() => appendItemsPage(query, '2026-08', { total: 100, data: response(0).data }, null));
  assert.throws(() => appendItemsPage(query, '2026-08', { ...response(0), error: true }, null));
  assert.throws(() => appendItemsPage(query, '2026-08', { total: 2, data: [response(0).data[0], response(0).data[0]] }, null));
  assert.throws(() => aggregateItems({ ...august, complete: false }));
  assert.throws(() => appendItemsPage(query, '2026-08', { total: 10001, data: [] }, null));
  const base = response(0).data[0];
  const page = appendItemsPage(query, '2026-08', { total: 501, data: Array.from({length:500}, (_,i) => ({...base,id:i+1})) }, null);
  assert.throws(() => appendItemsPage(query, '2026-08', { total: 502, startRow:500, data:[{...base,id:501},{...base,id:502}] }, page));
  assert.throws(() => appendItemsPage(query, '2026-08', { total: 501, startRow:500, data:[{...base,id:1}] }, page));
  assert.throws(() => appendItemsPage(query, '2026-08', { total: 501, startRow:0, data:[{...base,id:501}] }, page));
});
test('missing fields stay unknown, genuine zeros stay zero, empty denominator never becomes infinity', () => {
  const r = response(0).data[0];
  const one = item => appendItemsPage(query, '2026-08', { total: 1, data: [item] }, null);
  const missing = aggregateItems(one({ ...r, purchase: null, search_ad_position_avg: null, revenue_estimated: null, sku_first_date: null }));
  assert.equal(missing.boughtOrders, null); assert.equal(missing.adShare, null); assert.equal(missing.estimatedRevenue, null); assert.equal(missing.newItems, null);
  const zero = aggregateItems(one({ ...r, sales: 0, revenue: 0, search_ad_position_avg: 0 }));
  assert.equal(zero.orders, 0); assert.equal(zero.adShare, 0); assert.equal(zero.share1, null); assert.equal(zero.averagePrice, null);
  assert.equal(aggregateItems(one(r)).share10, 100);
  assert.equal(aggregateItems(one(r)).top5, Number(r.revenue));
  assert.equal(aggregateItems(appendItemsPage(query, '2026-08', { total: 0, data: [] }, null)).adShare, null);
});

const dir = mkdtempSync(join(tmpdir(), 'query-items-api-'));
const objects = new Map(); let leased = false, failSave = false;
globalThis.__itemsStore = { get: async k => objects.has(k) ? { json: async () => JSON.parse(objects.get(k)) } : null, put: async (k,v) => { if(failSave) throw Error('storage failed'); objects.set(k,v); } };
globalThis.__itemsDb = { prepare(sql) { return { bind() { return this; }, async first() { if(sql.startsWith('SELECT')) return null; if(leased) return null; leased = true; return {}; }, async run() { leased = false; } }; } };
await build({ entryPoints: ['app/api/query-items/route.ts'], outfile: join(dir, 'route.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'fakes', setup(b) {
  b.onResolve({filter:/^@\/(db|lib\/object-store)$/}, args => ({path:args.path,namespace:'fake'}));
  b.onLoad({filter:/.*/,namespace:'fake'}, args => ({contents: args.path === '@/db' ? 'export const getRawDb=()=>globalThis.__itemsDb' : 'export const getObjectStore=()=>globalThis.__itemsStore',loader:'js'}));
} }] });
const api = await import(pathToFileURL(join(dir, 'route.mjs')).href);
const headers = { 'oai-authenticated-user-email': 'korotcha@yandex.ru', origin: 'https://app.test', 'content-type': 'application/json' };
const post = (body = {}, extra = {}) => api.POST(new Request('https://app.test/api/query-items', {method:'POST',headers:{...headers,...extra},body:JSON.stringify({query,month:'2026-08',action:'load',...body})}));
const get = (q = query) => api.GET(new Request('https://app.test/api/query-items?' + new URLSearchParams({query:q,from:'2026-08',to:'2026-09'}),{headers}));

test('API validates authentication, origin, dates, range and strict fields before any fetch', async () => {
  assert.equal((await post({}, {'oai-authenticated-user-email':''})).status,401);
  assert.equal((await post({}, {origin:'https://evil.test'})).status,403);
  for(const body of [{month:'2030-01'},{month:'2026-13'},{sku:'123'},{action:'refresh'}]) assert.equal((await post(body)).status,400);
  assert.equal((await post({token:'temporary-test-key-12345'}, {'oai-authenticated-user-email':'reader@test.com'})).status,403);
  assert.equal((await post({query:'temporary-test-key-12345',token:'temporary-test-key-12345'})).status,400);
  assert.equal((await api.GET(new Request('https://app.test/api/query-items?query=x&from=2026-08&to=2026-09'))).status,401);
});
test('API one upstream page builds five reports, persists them and rereads without tokens or calls', async () => {
  objects.clear(); const original = globalThis.fetch, oldToken = process.env.MPSTATS_API_KEY; let calls=0;
  process.env.MPSTATS_API_KEY='test-secret-not-for-output';
  globalThis.fetch = async (url, options) => {
    calls++; assert.equal(url.pathname,'/api/analytics/v1/wb/search/items'); assert.equal(url.searchParams.get('path'),query); assert.equal(url.searchParams.get('fbs'),'0');
    assert.deepEqual(JSON.parse(options.body),{startRow:0,endRow:500,filterModel:{},sortModel:[{colId:'revenue',sort:'desc'}]});
    return Response.json(response(url.searchParams.get('d1') === '2026-08-01' ? 0 : 1));
  };
  try {
    const aug = await (await post()).json(); assert.equal(aug.row.metrics.orders,6304); assert.equal(aug.requests,1);
    const sep = await (await post({month:'2026-09'})).json(); assert.equal(sep.row.metrics.newSellers,7); assert.equal(calls,2);
    delete process.env.MPSTATS_API_KEY;
    assert.equal((await(await post()).json()).cached,true); assert.equal(calls,2);
    const read = await(await get()).json(); assert.equal(read.rows.filter(r=>r.loaded).length,2); assert.equal(calls,2);
    assert.ok(!JSON.stringify(read).includes('test-secret')); assert.ok(!JSON.stringify(read).includes('supplier_id'));
    assert.equal((await(await get('другой запрос')).json()).rows.filter(r=>r.loaded).length,0);
  } finally { globalThis.fetch=original; if(oldToken===undefined) delete process.env.MPSTATS_API_KEY; else process.env.MPSTATS_API_KEY=oldToken; }
});
test('pagination checkpoints, lease, 429 and storage failure never publish partial or unsaved totals', async () => {
  objects.clear(); const original=globalThis.fetch, oldToken=process.env.MPSTATS_API_KEY; let calls=0, fail=false;
  process.env.MPSTATS_API_KEY='test-secret';
  const base=response(0).data[0]; const data=Array.from({length:501},(_,i)=>({...base,id:i+1}));
  globalThis.fetch=async(url,options)=>{calls++;if(fail)return new Response('secret',{status:429});const start=JSON.parse(options.body).startRow;return Response.json({total:501,startRow:start,data:data.slice(start,start+500)});};
  try {
    const partial=await(await post()).json(); assert.equal(partial.row.loaded,false); assert.equal(partial.row.received,500); assert.equal(partial.row.metrics,null);
    leased=true; assert.equal((await post()).status,409); assert.equal(calls,1); leased=false;
    fail=true; const failed=await post(); assert.equal(failed.status,502); assert.ok(!(await failed.text()).includes('secret'));
    assert.equal((await(await get()).json()).rows[0].received,500);
    fail=false;failSave=true; assert.equal((await post()).status,502); assert.equal((await(await get()).json()).rows[0].loaded,false);
    failSave=false;const complete=await(await post()).json();assert.equal(complete.row.received,501);assert.equal(complete.row.loaded,true);
  } finally { globalThis.fetch=original;failSave=false;leased=false;if(oldToken===undefined)delete process.env.MPSTATS_API_KEY;else process.env.MPSTATS_API_KEY=oldToken; }
});
test('owner one-time token is accepted for the unified analysis but is never persisted', async () => {
  objects.clear(); const original = globalThis.fetch;
  const token = 'temporary-test-key-12345';
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers['X-Mpstats-TOKEN'], token);
    return Response.json(response(0));
  };
  try {
    const r = await post({token}); assert.equal(r.status, 200);
    assert.ok(!(await r.text()).includes(token));
    assert.ok(![...objects.values()].some(v => v.includes(token)));
  } finally { globalThis.fetch = original; }
});
test('UI mounts all five reports, no auto-paid fetch on mount, stops runs and preserves gaps',()=>{
  const ui=readFileSync(new URL('../app/query-items-panel.tsx',import.meta.url),'utf8');
  assert.equal((ui.match(/<Group title=/g)||[]).length,5);
  assert.ok(ui.includes('connectNulls={false}'));assert.ok(ui.includes('flight.current'));assert.ok(ui.includes('steps++ >= 40'));
  assert.ok(ui.includes('The form is the sole upstream trigger'));assert.ok(!ui.includes('localStorage'));
  assert.ok(!ui.includes('query-items-controls')); assert.ok(!ui.includes('ReportHelp'));
  assert.ok(readFileSync(new URL('../app/search-demand-panel.tsx',import.meta.url),'utf8').includes('<QueryItemsPanel rows={visibleItems}'));
});
