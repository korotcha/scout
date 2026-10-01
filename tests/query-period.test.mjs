import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analysisPeriod, displayPeriod, validDisplayPeriod, changePeriodBoundary } from '../lib/query-period.ts';
import { reportMonths } from '../lib/query-items.ts';

const full = analysisPeriod(new Date('2026-10-01T00:00:00Z'));
test('one shared full range contains 36 completed months, including across a year boundary', () => {
  assert.deepEqual(full, { from: '2023-10', to: '2026-09' });
  assert.equal(reportMonths(full.from, full.to).length, 36);
  assert.deepEqual(analysisPeriod(new Date('2026-01-15T00:00:00Z')), { from: '2023-01', to: '2025-12' });
});
test('24-month and custom display do not change the acquisition range', () => {
  assert.deepEqual(displayPeriod('36', full, full), full);
  assert.deepEqual(displayPeriod('24', full, full), { from: '2024-10', to: '2026-09' });
  const custom = { from: '2025-02', to: '2025-06' };
  assert.deepEqual(displayPeriod('custom', custom, full), custom);
  assert.ok(validDisplayPeriod(custom, full));
  assert.equal(validDisplayPeriod({from: '2026-09', to: '2025-01'}, full), false);
  assert.equal(validDisplayPeriod({from: '2023-01', to: '2026-09'}, full), false);
});
test('direct month/year changes clamp to available history and keep boundaries ordered', () => {
  assert.deepEqual(changePeriodBoundary(full, 'from', '2023-01', full), full);
  assert.deepEqual(changePeriodBoundary({from:'2025-01',to:'2025-06'}, 'from', '2026-01', full), {from:'2026-01',to:'2026-01'});
  assert.deepEqual(changePeriodBoundary({from:'2025-01',to:'2025-06'}, 'to', '2024-12', full), {from:'2024-12',to:'2024-12'});
});
test('period picker has direct year/month controls, with no network actions', () => {
  const picker = readFileSync(new URL('../app/query-period-picker.tsx', import.meta.url), 'utf8');
  assert.ok(picker.includes('24 месяца'));
  assert.ok(picker.includes('Свой период'));
  assert.equal((picker.match(/<select /g) || []).length, 2);
  assert.ok(!picker.includes('fetch('));
  assert.ok(!picker.includes('type="month"'));
});
