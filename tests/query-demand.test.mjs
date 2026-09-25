import test from 'node:test';
import assert from 'node:assert/strict';
import { queryDemandPoint, queryDemandRows, queryDemandDates, QUERY_DEMAND_SOURCE } from '../lib/query-demand.ts';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const query='кофемашина';
const point=(date='2026-09-01')=>({date,frequency:191898,items:49090});
const report=(word=query)=>({error:false,total:1,data:[{word,wb_count:191898,results:49090,items:585,count:61949}]});
test('36 calendar report dates, including leap years, never rolling 30-day jumps',()=>{
 assert.equal(queryDemandDates('2026-09-25').length,36);
 assert.equal(queryDemandDates('2026-09-25')[0],'2026-09-01');
 assert.equal(queryDemandDates('2026-09-25').at(-1),'2023-10-01');
 assert.ok(queryDemandDates('2026-09-25').includes('2024-03-01'));
 for(let y=2023;y<2033;y++)for(let m=1;m<=12;m++){
  const dates=queryDemandDates(y+'-'+String(m).padStart(2,'0')+'-25');
  assert.equal(new Set(dates).size,36);assert.ok(dates.every(d=>d.endsWith('-01')));
 }
});
test('uses exact word, WB frequency and all-page results, never first-page items or Ozon frequency',()=>{
 assert.deepEqual(queryDemandPoint(report(),query,'2026-09-01'),point());
 assert.deepEqual(queryDemandPoint(report('Кофемашина'),query,'2026-09-01'),point());
 assert.throws(()=>queryDemandPoint(report('кофемашина с капучинатором'),query,'2026-09-01'));
 assert.throws(()=>queryDemandPoint({...report(),total:2},query,'2026-09-01'));
 assert.throws(()=>queryDemandPoint({...report(),error:true},query,'2026-09-01'));
 for(const v of [null,undefined,'',-1,1.2,Infinity]){
  assert.throws(()=>queryDemandPoint({total:1,data:[{word:query,wb_count:1,results:v}]},query,'2026-09-01'));
 }
});
test('empty report is missing, zero is real, never divide by zero',()=>{
 const empty=queryDemandPoint({total:0,data:[]},query,'2026-09-01');
 assert.deepEqual(empty,{date:'2026-09-01',frequency:null,items:null});
 const h={version:2,source:QUERY_DEMAND_SOURCE,query,fetchedAt:'2026-09-25',requestedFrom:'2026-08-01',requestedTo:'2026-09-01',complete:true,points:[{date:'2026-08-01',frequency:0,items:0},empty]};
 const rows=queryDemandRows(h);
 assert.equal(rows[0].frequency,0);assert.equal(rows[0].items,0);assert.equal(rows[0].perItem,null);
 assert.equal(rows[1].frequency,null);assert.equal(rows[1].perItem,null);
});
test('monthly values use the report date exactly, no previous-day fallback or mixed sources',()=>{
 const h={version:2,source:QUERY_DEMAND_SOURCE,query,fetchedAt:'2026-09-25',requestedFrom:'2026-08-01',requestedTo:'2026-09-01',complete:false,points:[point('2026-07-31'),point('2026-09-01')]};
 const rows=queryDemandRows(h);
 assert.equal(rows[0].frequency,null);assert.equal(rows[0].loaded,false);
 assert.equal(rows[1].month,'2026-08');assert.equal(rows[1].perItem,191898/49090);
});

test('live 36-month snapshot matches all 18 competitor workbook rows without date shifts',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/query-demand-coffee-2026-09-25.json',import.meta.url),'utf8'));
 assert.equal(fixture.history.source,QUERY_DEMAND_SOURCE);
 const rows=queryDemandRows(fixture.history);
 assert.equal(rows.length,36);assert.ok(rows.every(r=>r.paired));
 assert.equal(fixture.reference.rows.length,18);
 for(const expected of fixture.reference.rows){
  const actual=rows.find(r=>r.month===expected.month);
  assert.ok(actual,expected.month);
  for(const metric of ['frequency','items','perItem'])assert.equal(actual[metric],expected[metric],expected.month+' '+metric);
  const [year,month]=expected.month.split('-').map(Number);
  assert.equal(actual.sourceDate,new Date(Date.UTC(year,month,1)).toISOString().slice(0,10));
 }
 // Previously missing when the chart depended on an individual SKU.
 assert.equal(rows.find(r=>r.month==='2023-12').items,937);
});

const dir=mkdtempSync(join(tmpdir(),'query-demand-seo-'));
const objects=new Map();let leased=false,failSave=false;
globalThis.__queryDemandStore={get:async k=>objects.has(k)?{json:async()=>JSON.parse(objects.get(k))}:null,put:async(k,v)=>{if(failSave)throw Error('storage failed');objects.set(k,v);}};
globalThis.__queryDemandDb={prepare(sql){return{bind(){return this;},async first(){if(sql.startsWith('SELECT'))return null;if(leased)return null;leased=true;return{};},async run(){leased=false;}};}};
await build({entryPoints:['app/api/query-demand/route.ts','app/api/query-analysis/route.ts'],outdir:dir,outbase:'app/api',bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},logLevel:'silent',plugins:[{name:'fakes',setup(b){b.onResolve({filter:/^@\/(db|lib\/object-store)$/},args=>({path:args.path,namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},args=>({contents:args.path==='@/db'?'export const getRawDb=()=>globalThis.__queryDemandDb':'export const getObjectStore=()=>globalThis.__queryDemandStore',loader:'js'}));}}]});
const api=await import(pathToFileURL(join(dir,'query-demand/route.mjs')).href);
const legacy=await import(pathToFileURL(join(dir,'query-analysis/route.mjs')).href);
const token='fake-api-token-1234567890';
const req=(body,headers={})=>new Request('https://app.test/api/query-demand',{method:'POST',headers:{origin:'https://app.test','content-type':'application/json','oai-authenticated-user-email':'korotcha@yandex.ru',...headers},body:JSON.stringify(body)});
const read=()=>api.GET(new Request('https://app.test/api/query-demand?query='+encodeURIComponent(query),{headers:{'oai-authenticated-user-email':'korotcha@yandex.ru'}}));

test('authentication, origin and token ownership are enforced; SKU input rejected',async()=>{
 for(const [headers,status] of [[{'oai-authenticated-user-email':''},401],[{origin:'https://evil.test'},403],[{'oai-authenticated-user-email':'manager@example.test'},403]]){
  assert.equal((await api.POST(req({query,action:'load',token},headers))).status,status);
 }
 assert.equal((await api.POST(req({query,action:'load',referenceSku:'46467713',token}))).status,400);
 assert.equal((await legacy.POST(req({query,action:'step',token}))).status,409);
});
test('bounded batches use direct query endpoint, cache all months, and preserve legacy objects',async()=>{
 const original=globalThis.fetch;objects.clear();let calls=0;
 objects.set('query-demand/wb/legacy.json','{"version":1,"referenceSku":"46467713"}');
 globalThis.fetch=async(url,options)=>{
  calls++;assert.equal(url.pathname,'/api/seo/keywords/selection');
  assert.equal(url.searchParams.size,1);assert.ok(url.searchParams.get('date').endsWith('-01'));
  assert.equal(options.headers['X-Mpstats-TOKEN'],token);assert.equal(options.redirect,'manual');
  assert.deepEqual(JSON.parse(options.body),{startRow:0,endRow:2,filterModel:{word:{filterType:'text',type:'equals',filter:query}},sortModel:[]});
  return Response.json(report());
 };
 try{
  let result=await (await api.POST(req({query,action:'load',token}))).json();
  assert.equal(calls,6);assert.equal(result.history.complete,false);assert.equal(result.history.version,2);
  const cachedPartial=await(await read()).json();assert.equal(cachedPartial.history.points.length,6);
  assert.equal(cachedPartial.pending,true);
  leased=true;assert.equal((await api.POST(req({query,action:'resume',token}))).status,409);leased=false;
  for(let i=0;i<5;i++) result=await(await api.POST(req({query,action:'resume',token}))).json();
  assert.equal(calls,36);assert.equal(result.history.points.length,36);assert.equal(result.history.complete,true);
  assert.equal((await(await api.POST(req({query,action:'load'}))).json()).cached,true);assert.equal(calls,36);
  assert.equal((await(await read()).json()).pending,false);
  assert.equal(objects.get('query-demand/wb/legacy.json'),'{"version":1,"referenceSku":"46467713"}');
 }finally{globalThis.fetch=original;leased=false;}
});
test('failed initial load checkpoints months and resumes without re-requesting them',async()=>{
 const original=globalThis.fetch;objects.clear();let calls=0;const dates=[];
 globalThis.fetch=async(url)=>{calls++;if(calls===3)return new Response('secret '+token,{status:429});dates.push(url.searchParams.get('date'));return Response.json(report());};
 try{
  const r=await api.POST(req({query,action:'load',token}));assert.equal(r.status,502);
  const partial=await r.json();assert.equal(partial.history.points.length,2);assert.ok(!JSON.stringify(partial).includes(token));
  const readPartial=await(await read()).json();assert.equal(readPartial.history.points.length,2);
  const resumed=await(await api.POST(req({query,action:'resume',token}))).json();
  assert.equal(resumed.history.points.length,8);assert.equal(new Set(dates).size,8);assert.equal(calls,9);
 }finally{globalThis.fetch=original;}
});
test('failed refresh keeps completed graph; storage failure never claims a successful save',async()=>{
 const original=globalThis.fetch;objects.clear();
 globalThis.fetch=async()=>Response.json(report());
 try{
  for(let i=0;i<6;i++)assert.equal((await api.POST(req({query,action:i?'resume':'load',token}))).status,200);
  const complete=(await(await read()).json()).history;
  let calls=0;
  globalThis.fetch=async()=>{calls++;return calls===2?new Response(token,{status:500}):Response.json(report());};
  const failed=await api.POST(req({query,action:'refresh',token}));assert.equal(failed.status,502);
  const current=await(await read()).json();assert.deepEqual(current.history,complete);assert.equal(current.pending,true);assert.equal(calls,2);
  globalThis.fetch=async()=>Response.json(report());failSave=true;
  assert.equal((await api.POST(req({query,action:'resume',token}))).status,502);
  assert.deepEqual((await(await read()).json()).history,complete);
 }finally{globalThis.fetch=original;failSave=false;}
});
test('graph UI has no reference SKU requirement, preserves one bounded loading flow',()=>{
 const source=readFileSync(new URL('../app/search-demand-panel.tsx',import.meta.url),'utf8');
 assert.ok(!source.includes('referenceSku'));assert.ok(!source.includes('/api/query-analysis'));
 assert.ok(source.includes('batch < 6'));assert.ok(source.includes('inFlight.current'));
 assert.ok(source.includes('Подбор запросов'));assert.ok(source.includes('Продолжить загрузку недостающих месяцев'));
});
