import test from "node:test";
import assert from "node:assert/strict";
import { newContent, workbookExample, withSharedContainer, calculateImport, calculateWb, contentSchema } from "../lib/candidate-workflow.ts";
import { modelWithDefaults, settingsFromModel, calculatorSettingsSchema } from "../lib/calculator-settings.ts";
import { initialScreenerState, clearNumericFilters } from "../lib/screener.ts";
import { selectWorkflowRows } from "../lib/workflow-screener.ts";
import { parseWbCard, wbCardDataUrls } from "../lib/wb-card.ts";
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function shared(){const c=newContent(), a=workbookExample(),b=workbookExample();b.import.quantity=1200;c.models=[a,b];c.sharedContainer={modelIds:[a.id,b.id],costUsd:10000,count:1,capacityM3:90,expensesRub:60000};return c;}

test("shared container conserves freight and shared expenses, and reallocates when quantity changes",()=>{
 const c=shared(),resolved=withSharedContainer(c), a=calculateImport(resolved.models[0]),b=calculateImport(resolved.models[1]);
 assert.equal(a.ok,true);assert.equal(b.ok,true);close(a.freightUsd+b.freightUsd,10000);
 close(resolved.models[0].import.allocation.share,1/3);
 close(resolved.models.reduce((sum,m)=>sum+m.import.allocation.expensesRub,0),60000);
 close(a.lines.find(x=>x.label==="Доля общих расходов контейнера").total,20000);
 const changed=structuredClone(resolved);changed.models[0].import.quantity=300;
 const next=withSharedContainer(changed);close(next.models[0].import.allocation.share,0.2);close(next.models[0].import.allocation.freightUsd,2000);
 assert.equal(c.models[0].import.allocation,null,"canonical inputs are not mutated");
 const roundtrip=withSharedContainer(contentSchema.parse(JSON.parse(JSON.stringify(next))));close(calculateImport(roundtrip.models[0]).unit,calculateImport(next.models[0]).unit);
});
test("incomplete and oversized shared shipments never produce a partial apparently valid landed cost",()=>{
 const c=shared();c.models[1].offers[0].lengthMm=null;
 assert.equal(calculateImport(withSharedContainer(c).models[0]).ok,false);
 c.models[1].offers[0].lengthMm=656;c.sharedContainer.capacityM3=10;
 assert.match(calculateImport(withSharedContainer(c).models[0]).issues[0],/превышает/);
 c.sharedContainer=null;const separate=withSharedContainer(c);assert.equal(separate.models[0].import.allocation,null);
 assert.equal(calculateImport(separate.models[0]).ok,true);
});
test("defaults prefill logistics and unified FX but never copy quantities or suppliers; later changes remain independent",()=>{
 const example=workbookExample();example.wb.commissionPct=38;
 const defaults=settingsFromModel(example);defaults.import.cnyPurchase=15;const m=modelWithDefaults(defaults);
 assert.equal(m.import.cnyPurchase,15);assert.equal(m.import.cnyCustoms,15);assert.equal(m.import.usdCustoms,m.import.usdPurchase);assert.equal(m.import.quantity,null);assert.equal(m.import.dutyPct,example.import.dutyPct);assert.equal(m.wb.commissionPct,38);assert.equal(m.offers.length,0);
 m.import.cnyPurchase=16;assert.equal(defaults.import.cnyPurchase,15);
 m.wb.forwardLogistics=0;defaults.wb.forwardLogistics=750;defaults.import.broker=5000;
 assert.equal(m.wb.forwardLogistics,0);assert.equal(m.import.broker,example.import.broker);
 const next=modelWithDefaults(defaults);assert.equal(next.wb.forwardLogistics,750);assert.equal(next.import.broker,5000);
 const saved=contentSchema.parse({...newContent(),models:[m]});assert.equal(saved.models[0].wb.forwardLogistics,0);
});
test("older presets gain new logistics fields without overwriting their stored values",()=>{
 const old={import:{cnyPurchase:13,cnyCustoms:12,usdPurchase:95,usdCustoms:90,vatPct:20,agentPct:1,currencyControlPct:0,borderPct:30,densityKgM3:300},wb:{scheme:"FBS",acquiringPct:2,drrPct:8,vatPct:5,taxMode:"profit",taxPct:15,minimumTaxReserve:true}};
 const s=calculatorSettingsSchema.parse(old);assert.equal(s.import.cnyCustoms,13);assert.equal(s.import.usdCustoms,95);assert.equal(s.import.vatPct,20);assert.equal(s.import.rateUsdM3,null);assert.equal(s.wb.commissionPct,null);assert.equal(s.wb.scheme,"FBS");assert.equal(s.wb.drrPct,8);
 assert.equal(calculatorSettingsSchema.safeParse({import:null,wb:old.wb}).success,false);
});
test("rejected and deferred research remains reachable in the Screener, including absent source rows",()=>{
 const c={id:"candidate",subject:"Кофемашины",query:"кофемашина",status:"rejected",analysisPassed:false,content:newContent(),revision:1};
 const state=initialScreenerState();state.filters=clearNumericFilters(state.filters);
 assert.equal(selectWorkflowRows([], [c],state).rows.length,0);
 state.status="rejected";let result=selectWorkflowRows([], [c],state);assert.equal(result.rows.length,1);assert.equal(result.rows[0].frequency,null);
 state.status="all";assert.equal(selectWorkflowRows(result.rows,[c],state).rows.length,1);
 state.minScore=40;assert.equal(selectWorkflowRows(result.rows,[c],state).rows.length,0,"unfinished work cannot pass final score filter");
});
test("WB lookup matches the requested SKU and does not infer prices, tariffs or factory packaging",()=>{
 const fixture={nm_id:12345678,imt_name:"Кофемашина",subj_name:"Кофемашины",selling:{brand_name:"Тест"},options:[{name:"Ширина упаковки",value:"35 см"}]};
 const card=parseWbCard(fixture,"12345678","https://basket-01.wbbasket.ru/test");assert.equal(card.subject,"Кофемашины");assert.equal(card.checked,false);assert.equal(card.attributes[0].value,"35 см");
 assert.equal("price" in card,false);assert.equal("import" in card,false);assert.equal(parseWbCard(fixture,"87654321","https://example.test"),null);
 assert.deepEqual(wbCardDataUrls("https://internal.test"),[]);assert.ok(wbCardDataUrls("12345678").every(u=>new URL(u).hostname.endsWith(".wbbasket.ru")||new URL(u).hostname.endsWith(".wb.ru")));
});
