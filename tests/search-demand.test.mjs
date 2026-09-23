import test from 'node:test';
import assert from 'node:assert/strict';
import { demandMonths, demandMonthSnapshots, compareDemand, demandPeaks, chartObservations, canonicalPoints } from '../lib/search-demand.ts';

test('monthly boundary uses January 1 for December, regardless of mid-month spikes', () => {
  const rows = demandMonthSnapshots([
    {date:'2025-11-01',frequency:287653}, {date:'2025-12-01',frequency:408808},
    {date:'2025-12-11',frequency:750461}, {date:'2025-12-31',frequency:432531},
    {date:'2026-01-01',frequency:429194},
  ], '2026-01-21');
  assert.deepEqual(rows.map(r => [r.month,r.frequency,r.approximate]), [
    ['2025-10',287653,false],['2025-11',408808,false],['2025-12',429194,false],
  ]);
  assert.equal(rows.at(-1).sourceDate,'2026-01-01');
});
test('weekly boundary fallback is labelled and never uses a later or stale observation', () => {
  const rows = demandMonthSnapshots([
    {date:'2025-11-24',frequency:111}, // too old for December 1
    {date:'2025-12-02',frequency:999}, // must not fill November from the future
    {date:'2025-12-29',frequency:429402},
    {date:'2026-01-05',frequency:419054},
  ], '2026-02-01');
  assert.equal(rows[0].frequency,null);
  assert.equal(rows.at(-1).month,'2025-12');
  assert.equal(rows.at(-1).frequency,429402);
  assert.equal(rows.at(-1).approximate,true);
  assert.equal(rows.at(-1).sourceDate,'2025-12-29');
});
test('month must be completed; zero is valid and future observations are ignored', () => {
  const points = [{date:'2025-12-29',frequency:10},{date:'2026-01-01',frequency:0},{date:'2026-02-01',frequency:20}];
  assert.deepEqual(demandMonthSnapshots(points,'2025-12-31'),[]);
  const rows = demandMonthSnapshots(points,'2026-01-21');
  assert.equal(rows.length,1); assert.equal(rows[0].frequency,0);
  assert.deepEqual(demandMonthSnapshots([],'2026-01-21'),[]);
});
function monthlySamples(year, multiply = 1) {
  return Array.from({ length: 12 }, (_, i) => [1, 8, 15, 22, 28].map(day => ({ date: `${year}-${String(i + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`, frequency: (100 + i * 10) * multiply }))).flat();
}
test('same-season growth is 2x / +100%, using means, not totals of observations', () => {
  const rows = demandMonths([...monthlySamples(2024), ...monthlySamples(2025, 2)], '2026-01-05');
  const g = compareDemand(rows, '2025-03', '2025-08');
  assert.equal(g.ratio, 2); assert.equal(g.percent, 100); assert.equal(g.matched, 6);
  assert.equal(rows[0].mean, 100);
});
test('missing months, partial current month and zero base cannot produce an invented growth', () => {
  const points = [...monthlySamples(2024), ...monthlySamples(2025, 2)];
  const missing = demandMonths(points.filter(p => !p.date.startsWith('2024-06')), '2026-01-05');
  assert.equal(compareDemand(missing, '2025-03', '2025-08').ratio, null);
  assert.equal(missing.find(m => m.month === '2024-06').mean, null);
  assert.equal(demandMonths(points, '2025-12-31').at(-1).complete, false);
  const zero = demandMonths([...monthlySamples(2024, 0), ...monthlySamples(2025)], '2026-01-05');
  assert.equal(compareDemand(zero, '2025-01', '2025-12').ratio, null);
  assert.equal(compareDemand([], '', '').ratio, null);
});
function weekly(values) { return values.map((frequency, i) => ({ date: new Date(Date.UTC(2024, 0, 1 + 7 * i)).toISOString().slice(0, 10), frequency })); }
test('peaks highlight a seasonal wave but not flat demand, isolated spikes or a rising edge', () => {
  const season = weekly([10,10,10,10,20,30,50,100,150,160,155,100,60,30,10,10,10,10,10,10]);
  const peaks = demandPeaks(season); assert.equal(peaks.length, 1); assert.equal(peaks[0].frequency, 160);
  assert.equal(demandPeaks(weekly(Array(30).fill(50))).length, 0);
  assert.equal(demandPeaks(weekly(Array.from({length:30},(_,i)=>i*10))).length, 0);
  assert.equal(demandPeaks(weekly([10,10,10,10,10,10,900,10,10,10,10,10,10])).length, 0);
});
test('duplicate dates are canonicalized, gaps are broken, missing observations are never zero', () => {
  const rows = [{date:'2025-01-01',frequency:10},{date:'2025-01-01',frequency:20},{date:'2025-02-20',frequency:40}];
  assert.equal(canonicalPoints(rows).length, 2);
  assert.equal(chartObservations(rows)[1].frequency, null);
});
