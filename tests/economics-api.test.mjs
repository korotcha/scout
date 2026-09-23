import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync,readdirSync,mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { initialCalculatorSettings } from "../lib/calculator-settings.ts";
const db=new DatabaseSync(":memory:");
for(const f of readdirSync(new URL("../drizzle/",import.meta.url)).filter(f=>f.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(`../drizzle/${f}`,import.meta.url),"utf8"));
globalThis.__economicsDb={prepare(sql){let args=[];const q={bind(...v){args=v;return q;},async first(){return db.prepare(sql).get(...args)??null;}};return q;}};
const dir=mkdtempSync(join(tmpdir(),"market-economics-api-"));
async function moduleFor(route){const outfile=join(dir,route+".mjs");await build({entryPoints:[new URL(`../app/api/${route}/route.ts`,import.meta.url).pathname],outfile,bundle:true,platform:"node",format:"esm",logLevel:"silent",plugins:[{name:"db",setup(b){b.onResolve({filter:/^@\/db$/},()=>({path:"db",namespace:"fake"}));b.onLoad({filter:/.*/,namespace:"fake"},()=>({contents:"export const getRawDb=()=>globalThis.__economicsDb;",loader:"js"}));}}]});return import(pathToFileURL(outfile).href);}
const settingsApi=await moduleFor("calculator-settings"),wbApi=await moduleFor("wb-card");
const request=(method="GET",body,actor="korotcha@yandex.ru",origin)=>new Request("https://site.test/api/calculator-settings",{method,headers:{...(actor?{"oai-authenticated-user-email":actor}:{}),...(origin?{origin}:{}),"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
test("shared calculator defaults persist across users, require owner and enforce revision",async()=>{
 assert.equal((await settingsApi.GET(request("GET",null,""))).status,401);
 let response=await settingsApi.GET(request());let body=await response.json();assert.equal(body.revision,0);assert.equal(body.settings.wb.taxPct,15);
 const settings=initialCalculatorSettings();settings.import.cnyPurchase=13.25;
 assert.equal((await settingsApi.POST(request("POST",{settings,revision:0},"manager@example.test"))).status,403);
 assert.equal((await settingsApi.POST(request("POST",{settings,revision:0},"korotcha@yandex.ru","https://other.test"))).status,403);
 response=await settingsApi.POST(request("POST",{settings,revision:0}));assert.equal(response.status,200);
 body=await (await settingsApi.GET(request("GET",null,"manager@example.test"))).json();assert.equal(body.settings.import.cnyPurchase,13.25);assert.equal(body.revision,1);
 assert.equal((await settingsApi.POST(request("POST",{settings,revision:0}))).status,409);
 settings.wb.taxPct=101;assert.equal((await settingsApi.POST(request("POST",{settings,revision:1}))).status,400);
});
test("WB card fetch requires authentication, limits hosts, and does not silently accept another product",async()=>{
 assert.equal((await wbApi.GET(new Request("https://site.test/api/wb-card?sku=12345678"))).status,401);
 const req=sku=>new Request("https://site.test/api/wb-card?sku="+encodeURIComponent(sku),{headers:{"oai-authenticated-user-email":"manager@example.test"}});
 assert.equal((await wbApi.GET(req("https://internal.test"))).status,400);
 const original=globalThis.fetch;let requests=[];
 try{
  globalThis.fetch=async(url,options)=>{requests.push([url,options]);return Response.json({nm_id:12345678,imt_name:"Кофемашина",subj_name:"Кофемашины",options:[]});};
  const response=await wbApi.GET(req("12345678"));assert.equal(response.status,200);assert.equal((await response.json()).card.checked,false);assert.equal(requests[0][1].redirect,"error");
  globalThis.fetch=async()=>Response.json({nm_id:11111111,imt_name:"Другой товар"});
  assert.equal((await wbApi.GET(req("12345678"))).status,502);
 }finally{globalThis.fetch=original;}
});
