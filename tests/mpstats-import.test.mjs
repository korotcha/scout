import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { parseProductReport, reportDates, readProductReport, mergeProductReport } from '../lib/mpstats-import.ts';
import { competitorMissing, scoreResearch } from '../lib/niche-research.ts';
import { contentSchema } from '../lib/candidate-workflow.ts';
import { researchedContent } from './research-fixture.mjs';
const csv = '\uFEFFSKU;Name;Revenue, ₽;Bayout, ₽;Min Price, ₽;Max Price, ₽;Fractional rating;Rating;Comments\n963789567;"Вентилятор; колонный";2887771;2501393;0;4271;4,7;5;200\n12345000;Второй;4000000;3200000;1000;2000;4,8;5;0';
const today = '2026-09-17';
test('CSV imports separate metrics, decimal rating, zero reviews and unknown minimum without dropping below-threshold SKU', () => {
 const rows = parseProductReport(csv, today); assert.equal(rows.length, 2); assert.equal(rows[0].revenue,2887771); assert.equal(rows[0].buyouts,2501393); assert.equal(rows[0].priceFrom,null); assert.equal(rows[0].priceTo,4271); assert.equal(rows[0].rating,4.7); assert.equal(rows[1].reviews,0);
 Object.assign(rows[0], { priceTrend:'waves',stock:'unavailable',endStockRisk:'unavailable',glue:'no' }); assert.deepEqual(competitorMissing(rows[0]),[]);
});
test('ZIP matches CSV and extracts period, missing/invalid dates remain unknown',async()=>{
 const bytes=zipSync({'report.csv':strToU8(csv)}); const file=new File([bytes],'Группа 01.03.2026-31.08.2026 (17.09.2026).zip');
 const data=await readProductReport(file,today); assert.equal(data.rows.length,2); assert.equal(data.start,'2026-03-01');assert.equal(data.end,'2026-08-31');
 assert.deepEqual(reportDates('file.csv'),{start:'',end:''});assert.deepEqual(reportDates('31.02.2026-31.08.2026'),{start:'',end:''});
 await assert.rejects(readProductReport(new File([zipSync({'a.csv':strToU8(csv),'b.csv':strToU8(csv)})],'two.zip'),today),/несколько CSV/);
});
test('invalid and duplicate rows reject import without partial success',()=>{
 assert.throws(()=>parseProductReport(csv+'\n'+csv.split('\n')[1],today),/повторяется/);
 assert.throws(()=>parseProductReport('Дата;Заказы\n2026-01-01;3',today),/по товарам/);
 assert.throws(()=>parseProductReport(csv.replace('2887771','bad'),today),/некорректное/);
});
test('reimport updates source figures, preserves manual observations and extra models, and is idempotent',()=>{
 const incoming=parseProductReport(csv,today), old={...incoming[0], revenue:1, priceTrend:'rising',note:'Проверил',stock:'unavailable',glue:'confirmed'};
 const merged=mergeProductReport([old],incoming); assert.equal(merged[0].revenue,2887771);assert.equal(merged[0].note,'Проверил');assert.equal(merged[0].priceTrend,'rising');assert.equal(merged[0].glue,'confirmed');assert.deepEqual(mergeProductReport(merged,incoming),merged);
});
test('all 61 competitors persist and contribute; content cannot change the score',()=>{
 const c=researchedContent(), base=c.analysis.research.competitors[0];
 c.analysis.research.competitors=Array.from({length:61},(_,i)=>({...base,sku:String(90000000+i),slot:i,content:'unknown',stock:'unavailable',endStockRisk:'unavailable'}));
 c.analysis.research.repeatedModels='no';c.analysis.research.repeatedModelsThreshold=3;
 assert.equal(contentSchema.safeParse(c).success,true);const before=scoreResearch(c.analysis,today);assert.equal(before.sample,61);assert.equal(before.checked,61);assert.equal(before.findings.complete,true);assert.equal(before.penalties,0);
 c.analysis.research.competitors.forEach(r=>r.content='poor');assert.equal(scoreResearch(c.analysis,today).total,before.total);
 c.analysis.research.competitors[60].glue='confirmed';assert.ok(scoreResearch(c.analysis,today).penalties<0);
});
