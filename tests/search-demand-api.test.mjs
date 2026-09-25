import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decryptKey } from '../lib/connection-crypto.ts';
const dir = mkdtempSync(join(tmpdir(), 'demand-api-'));
const objects = new Map(); let connection = null, leased = false, calls = 0;
const secret = Buffer.alloc(32, 8).toString('base64');
globalThis.__demandEnv = { INTEGRATION_ENCRYPTION_KEY: secret, BUCKET: {
  get: async key => objects.has(key) ? { json: async () => JSON.parse(objects.get(key)) } : null,
  put: async (key, value) => { objects.set(key, value); },
}, DB: { prepare(sql) { assert.ok(sql.includes("'mpstats'")); return { bind(...values) { this.values = values; return this; },
  async first() {
    if (sql.startsWith('SELECT')) return connection;
    if (sql.startsWith('INSERT')) { if (leased) return null; leased = true; connection ??= { encrypted_key: '', revision: 0 }; return { revision: connection.revision }; }
    if (sql.includes('SET encrypted_key = ?')) { connection.encrypted_key = this.values[0]; connection.revision++; return { revision: connection.revision }; }
    throw new Error('unexpected query');
  }, async run() { if (sql.includes("encrypted_key = ''")) connection.encrypted_key = ''; return {}; }
}; } } };
await build({entryPoints:[new URL('../app/api/search-demand/route.ts',import.meta.url).pathname],outfile:join(dir,'route.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'env',setup(b){b.onResolve({filter:/^@\/(db|lib\/object-store)$/},args=>({path:args.path,namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path==='@/db'?'export const getRawDb=()=>globalThis.__demandEnv.DB':'export const getObjectStore=()=>globalThis.__demandEnv.BUCKET',loader:'js'}));}}]});
const api = await import(pathToFileURL(join(dir,'route.mjs')).href);
const token='not-a-real-token-1234567890';
const req = (body, email='korotcha@yandex.ru', origin='https://app.test') => new Request('https://app.test/api/search-demand?query=кофемашина',{method:body?'POST':'GET',headers:{'oai-authenticated-user-email':email,origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
test('query integration caches safely, reuses encrypted key, preserves history on failure and enforces access',async()=>{
  const original=globalThis.fetch, previousSecret=process.env.INTEGRATION_ENCRYPTION_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY=secret;
  globalThis.fetch=async(url,opts)=>{ calls++; assert.equal(url.pathname,'/api/analytics/v1/wb/keywords/frequency');assert.equal(opts.headers['X-Mpstats-TOKEN'],token);return Response.json([{date:'2024-01-01',frequency:10},{date:'2025-01-01',frequency:20}]); };
  try {
    assert.equal((await api.POST(req({query:'кофемашина',action:'load',token},'other@test'))).status,403);
    assert.equal((await api.POST(req({query:'кофемашина',action:'load',token},undefined,'https://evil.test'))).status,403);
    assert.equal((await api.POST(req({query:token,action:'load',token}))).status,400);
    assert.equal(calls,0);
    const loaded=await (await api.POST(req({query:'кофемашина',action:'load',token,remember:true}))).json();
    assert.equal(loaded.saved,true);assert.equal(loaded.connected,true);assert.equal(calls,1);
    assert.equal(await decryptKey(connection.encrypted_key,secret,'market-radar:mpstats:v1'),token);
    await assert.rejects(()=>decryptKey(connection.encrypted_key,secret));
    const saved=JSON.stringify([...objects.values()]);assert.equal(saved.includes(token),false);
    const read=await (await api.GET(req())).json();assert.equal(read.snapshot.points.length,2);assert.equal(JSON.stringify(read).includes(token),false);
    const cache=await (await api.POST(req({query:'кофемашина',action:'load'}))).json();assert.equal(cache.cached,true);assert.equal(calls,1);
    assert.equal((await api.POST(req({query:'кофемашина',action:'refresh'}))).status,429);assert.equal(calls,1);
    leased=false;globalThis.fetch=async()=>{calls++;return new Response('forbidden '+token,{status:403});};
    const failed=await (await api.POST(req({query:'кофемашина',action:'refresh'}))).json();assert.equal(failed.httpStatus,403);
    assert.equal(JSON.stringify(failed).includes(token),false);assert.equal(JSON.stringify([...objects.values()]),saved);
    await api.POST(req({query:'кофемашина',action:'disconnect'}));assert.equal(connection.encrypted_key,'');assert.equal(JSON.stringify([...objects.values()]),saved);
  }finally{globalThis.fetch=original;if(previousSecret===undefined)delete process.env.INTEGRATION_ENCRYPTION_KEY;else process.env.INTEGRATION_ENCRYPTION_KEY=previousSecret;}
});
test('server-managed MPStats key needs no repeated browser entry and is never returned',async()=>{
 const original=globalThis.fetch, previous=process.env.MPSTATS_API_KEY;process.env.MPSTATS_API_KEY=token;
 objects.clear();connection=null;leased=false;
 globalThis.fetch=async(url,opts)=>{assert.equal(opts.headers['X-Mpstats-TOKEN'],token);return Response.json([{date:'2025-01-01',frequency:20}]);};
 try{
  const status=await (await api.GET(req())).json();assert.equal(status.connected,true);assert.equal(JSON.stringify(status).includes(token),false);
  const loaded=await (await api.POST(req({query:'кофемашина',action:'load'}))).json();assert.equal(loaded.saved,true);assert.equal(loaded.connected,true);assert.equal(JSON.stringify(loaded).includes(token),false);
  assert.equal(connection.encrypted_key,'');
  assert.equal((await api.POST(req({query:'кофемашина',action:'disconnect'}))).status,409);
 }finally{globalThis.fetch=original;if(previous===undefined)delete process.env.MPSTATS_API_KEY;else process.env.MPSTATS_API_KEY=previous;}
});
