import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encryptKey } from '../lib/connection-crypto.ts';
const dir = mkdtempSync(join(tmpdir(), 'query-analysis-'));
const objects = new Map(), leases = new Set();
const token = 'fake-mpstats-token-only-for-testing-123456', secret = Buffer.alloc(32, 9).toString('base64');
const encrypted = await encryptKey(token, secret, 'market-radar:mpstats:v1');
globalThis.__queryEnv = { INTEGRATION_ENCRYPTION_KEY: secret, BUCKET: {
  get: async key => objects.has(key) ? { json: async () => JSON.parse(objects.get(key)) } : null,
  put: async (key, value) => { objects.set(key, value); },
}, DB: { prepare(sql) { return { bind(...values) { this.values = values; return this; }, async first() {
  if (sql.includes('SELECT encrypted_key')) return { encrypted_key: encrypted };
  if (sql.startsWith('INSERT')) { if (leases.has(this.values[0])) return null; leases.add(this.values[0]); return { query_key: this.values[0] }; }
  throw Error('Unexpected SQL');
}, async run() { leases.delete(this.values[0]); return {}; } }; } } };
const plugins = [{ name: 'env', setup(b) { b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'test' })); b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const env=globalThis.__queryEnv;', loader: 'js' })); b.onResolve({ filter: /^@\/lib\/object-store$/ }, args => args.importer.endsWith('/api/query-analysis/route.ts') ? { path: 'saved-analysis', namespace: 'saved-analysis' } : null); b.onLoad({ filter: /.*/, namespace: 'saved-analysis' }, () => ({ contents: 'export const getObjectStore=()=>globalThis.__queryEnv.BUCKET;', loader: 'js' })); } }];
async function bundle(entry, file) { await build({ entryPoints: [new URL(entry, import.meta.url).pathname], outfile: join(dir, file), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', plugins }); return import(pathToFileURL(join(dir, file)).href); }
const math = await bundle('../lib/query-analysis.ts', 'math.mjs');
const analysis = await bundle('../app/api/query-analysis/route.ts', 'analysis.mjs');
const competitors = await bundle('../app/api/query-competitors/route.ts', 'competitors.mjs');
const req = (body, email = 'manager@test', origin = 'https://app.test') => new Request('https://app.test/api/query-analysis', { method: 'POST', headers: { 'content-type': 'application/json', 'oai-authenticated-user-email': email, origin }, body: JSON.stringify(body) });
const item = (id, revenue) => ({ id, name: 'Товар', revenue, sales: 100, final_price_min: 1000, final_price_max: 2000, rating: 4.8, comments: 20 });

test('monthly normalization preserves gaps, validates grouping and uses consistent denominators', () => {
  const months = math.marketMonths([{ period: '2025-01', sales: 10, revenue: 20000, items: 5 }, { period: '2025-02', sales: 0 }], '2025-01-01', '2025-02-28');
  assert.equal(months[0].averagePrice, 2000); assert.equal(months[1].revenue, null); assert.equal(months[1].averagePrice, null);
  assert.throws(() => math.marketMonths([{ period: '2025-01-01' }, { period: '2025-01-02' }], '2025-01-01', '2025-01-31'));
  assert.throws(() => math.marketItems({ data: [item(123456, 10)], total: 0 }));
  const snapshot = { query: 'test', points: [{ date: '2025-02-01', frequency: 1000 }], fetchedAt: '2025-03-01' };
  const rows = math.analysisChartRows(snapshot, { months, leaders: { '2025-01': [math.marketItems({ total: 1, data: [item(123456, 30000)] }).items[0]] } }, '2025-01', '2025-02');
  assert.equal(rows[0].perItem, 200); assert.equal(rows[0].share1, null); assert.equal(rows[1].frequency, null);
  assert.throws(() => math.advertisingSnapshot({ data: [{ id: 1, page: 1, organics: null }] }, '2026-01-01'));
  assert.deepEqual(math.advertisingSnapshot({ data: [{ id: 1, page: 1, organics: 0 }, { id: 1, page: 1, organics: 0 }, { id: 2, page: 1, organics: 1 }, { id: 3, page: 2, organics: 0 }] }, '2026-01-01'), { date: '2026-01-01', advertised: 1, organic: 1, total: 2, share: 50 });
});
test('seasonal peaks require a sustained wave and reject short local bumps', () => {
  const values = {
    '2023-06':197936,'2023-07':195190,'2023-08':208145,'2023-09':202505,'2023-10':276825,'2023-11':323175,'2023-12':281300,
    '2024-01':212730,'2024-02':226920,'2024-03':168815,'2024-04':129975,'2024-05':129360,'2024-06':129485,'2024-07':162110,'2024-08':180970,'2024-09':204255,'2024-10':258785,'2024-11':267730,'2024-12':387920,
    '2025-01':329440,'2025-02':265165,'2025-03':221200,'2025-04':174390,'2025-05':148875,'2025-06':169940,'2025-07':160358,'2025-08':199232,'2025-09':255290,'2025-10':302048,'2025-11':405200,'2025-12':433170,
    '2026-01':330574,'2026-02':293886,'2026-03':282663,'2026-04':219306,'2026-05':217560,'2026-06':208556,'2026-07':223513,'2026-08':193140,
  };
  const rows = Object.entries(values).map(([month, frequency]) => ({ month, frequency }));
  const peaks = math.seasonalPeaks(rows);
  assert.deepEqual(peaks.map(p => p.month), ['2023-11','2024-12','2025-12']);
  assert.equal(peaks.some(p => ['2024-02','2025-06','2026-07'].includes(p.month)), false);
  const comparison = math.compareSeasonalPeaks(rows);
  assert.equal(comparison.previous.month, '2024-12');
  assert.equal(comparison.current.month, '2025-12');
  assert.ok(comparison.ratio > 1.11 && comparison.ratio < 1.12);
});
test('additional analysis is disabled, while saved reports remain readable without upstream calls', async () => {
  const original = globalThis.fetch; let calls = 0;
  const query = 'кофемашина';
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(query))).toString('hex');
  const key='query-analysis/wb/'+hash+'.json', saved={ query, requests:4, months:[], tasks:[] };
  objects.set(key,JSON.stringify(saved));
  globalThis.fetch = async () => { calls++; throw Error('No additional reports may be fetched'); };
  try {
    assert.equal((await analysis.POST(req({query,action:'step'},''))).status,401);
    assert.equal((await analysis.POST(req({query,action:'step'}))).status,409);
    assert.equal((await analysis.POST(req({query,action:'retry'}))).status,409);
    const read=new Request('https://app.test/api/query-analysis?query='+encodeURIComponent(query),{headers:{'oai-authenticated-user-email':'manager@test'}});
    assert.deepEqual((await (await analysis.GET(read)).json()).report,saved);
    assert.equal(objects.get(key),JSON.stringify(saved));assert.equal(calls,0);
  } finally { globalThis.fetch=original; }
});
test('competitors enforce 3M threshold, reuse selection cache, and retry group population without a duplicate group', async () => {
  const original=globalThis.fetch; let calls=0, creates=0, failAdd=true;
  globalThis.fetch=async(url,options)=>{
    calls++; assert.equal(options.headers['X-Mpstats-TOKEN'],token);
    if(url.pathname.endsWith('/search/items')){const body=JSON.parse(options.body);assert.equal(body.filterModel.revenue.filter,3000000);return Response.json({total:3,data:[item(333331,4000000),item(333332,3000000),item(333333,2800000)]});}
    if(url.pathname.endsWith('/groups')){creates++;return Response.json({success:true,id:789});}
    if(url.pathname.endsWith('/groups/789')){assert.equal(url.searchParams.get('skus'),'333331');if(failAdd)return new Response('fail',{status:503});return Response.json({success:true});}
    throw Error('Unexpected endpoint');
  };
  const body={query:'вентилятор',from:'2026-03-01',to:'2026-08-31',action:'load'};
  try{
    let result=await(await competitors.POST(req(body))).json();assert.equal(result.selection.items.length,2);assert.equal(result.selection.complete,true);
    result=await(await competitors.POST(req(body))).json();assert.equal(result.cached,true);assert.equal(calls,1);
    assert.equal((await competitors.POST(req({...body,action:'create',skus:['333333']}))).status,400);
    assert.equal((await competitors.POST(req({...body,action:'create',skus:['333331']}))).status,502);assert.equal(creates,1);
    failAdd=false;result=await(await competitors.POST(req({...body,action:'create',skus:['333331']}))).json();assert.equal(result.selection.groupState,'done');assert.equal(creates,1);assert.equal(result.selection.groupId,789);
    const before=calls;result=await(await competitors.POST(req({...body,action:'create',skus:['333331']}))).json();assert.equal(calls,before);assert.equal(result.cached,true);
  }finally{globalThis.fetch=original;}
});
