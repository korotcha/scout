import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { clearNumericFilters, initialScreenerState, selectScreenerRows, sourceNumber } from "../lib/screener.ts";

const makeRow = (overrides = {}) => ({ subject: "Предмет", query: "Запрос", frequency: 1000, yoyDemand: 0.1, perArticle: 6, yoyPressure: 0.1, articles: 20, mom: 0.1, ...overrides });

test("standard filter keeps the source rows with positive growth and per-product metrics", async () => {
  const { rows } = JSON.parse(await readFile(new URL("../public/source-summary.json", import.meta.url), "utf8"));
  const before = JSON.stringify(rows);
  assert.equal(rows.length, 33611);
  const state = initialScreenerState();
  assert.equal(selectScreenerRows(rows, state).length, 4736);
  assert.equal(selectScreenerRows(rows, { ...state, filters: clearNumericFilters(state.filters) }).length, 33611);
  assert.equal(JSON.stringify(rows), before, "filtering and sorting must not mutate source values or order");
});

test("strict boundaries use unrounded values; zero growth and missing comparisons do not pass", () => {
  const good = makeRow({ query: "Чуть больше нуля", perArticle: 0.000000000000001, yoyDemand: 0.000000001 });
  const rows = [makeRow({ perArticle: 0 }), makeRow({ yoyDemand: 0 }), makeRow({ yoyPressure: 0 }), makeRow({ yoyPressure: null }), makeRow({ yoyDemand: null }), good];
  assert.deepEqual(selectScreenerRows(rows, initialScreenerState()), [good]);
});

test("show all retains the search and supplied subject scope, including falls and missing data", () => {
  const state = initialScreenerState();
  const rows = [makeRow({ query: "Кофемашина", yoyDemand: -0.3 }), makeRow({ query: "Кофемашина новая", yoyPressure: null }), makeRow({ query: "Чайник" })];
  const result = selectScreenerRows(rows, { ...state, search: "КОФЕ", filters: clearNumericFilters(state.filters) });
  assert.equal(result.length, 2);
  assert.ok(result.some((row) => row.yoyPressure === null));
  assert.ok(result.some((row) => row.yoyDemand < 0));
});

test("percent thresholds, disabled rules and ascending sorting handle nulls correctly", () => {
  const state = initialScreenerState();
  const filters = clearNumericFilters(state.filters);
  filters.mom = { enabled: true, threshold: 10, operator: "gte" };
  const rows = [makeRow({ mom: 0.0999999999 }), makeRow({ mom: 0.1 }), makeRow({ mom: 0.2, frequency: null }), makeRow({ mom: null })];
  const result = selectScreenerRows(rows, { ...state, sort: "frequency", direction: "asc", filters });
  assert.deepEqual(result, [rows[1], rows[2]]);
});

test("source number rendering does not round values or add multiplication noise", () => {
  assert.equal(sourceNumber(5.002320185614849), "5,002320185614849");
  assert.equal(sourceNumber(0.1453, true), "+14,53%");
  assert.equal(sourceNumber(-0.06508995892846196, true), "−6,508995892846196%");
  assert.equal(sourceNumber(1e-7, true), "+0,00001%");
  assert.equal(sourceNumber(1000000), "1\u00a0000\u00a0000");
  assert.equal(sourceNumber(null, true), "—");
  assert.equal(sourceNumber(0, true), "0%");
});
