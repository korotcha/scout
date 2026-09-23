import test from "node:test";
import assert from "node:assert/strict";
import { newContent, contentSchema } from "../lib/candidate-workflow.ts";
import { alignResearchSeason, compareAverageCheck, competitorFieldErrors, competitorMissing, competitorPriceRange, competitorSlots, modelRepetition, modelSignals, preparation, priceScreening, researchFindings, scoreResearch, parseSkus, newCompetitor } from "../lib/niche-research.ts";
import { researchedContent } from "./research-fixture.mjs";
const today = "2026-09-08";
test("future average-check reports point to dates, while valid check amounts remain unmarked", () => {
 const c = researchedContent();
 c.analysis.research.averageCheck = { start: "2026-09-18", end: "2026-09-25", previous: 1500, current: 1670 };
 let result = compareAverageCheck(c.analysis.research, "2026-09-15");
 assert.equal(result.nextEnd, "2027-09-25");
 assert.deepEqual(Object.keys(result.fieldErrors).sort(), ["end", "start"]);
 assert.equal(result.change, null);
 c.analysis.research.averageCheck.start = "2024-09-18";
 c.analysis.research.averageCheck.end = "2024-09-25";
 result = compareAverageCheck(c.analysis.research, "2026-09-15");
 assert.deepEqual(result.fieldErrors, {});
 assert.equal(result.missing.length, 0);
 assert.ok(Math.abs(result.change - 11.33333333333333) < 1e-10);
});
test("competitor field errors isolate missing cells and accept zero sales and reviews", () => {
 const row = researchedContent().analysis.research.competitors[0];
 row.revenue = 0; row.reviews = 0; row.price = null; row.priceFrom = 1500; row.priceTo = null;
 row.stock = "unknown";
 let errors = competitorFieldErrors(row);
 assert.deepEqual(Object.keys(errors).sort(), ["priceTo", "stock"]);
 row.priceTo = 1000;
 assert.equal(competitorFieldErrors(row).priceTo, "цена «до» меньше цены «от»");
 row.priceTo = 1800; row.stock = "available";
 assert.deepEqual(competitorMissing(row), []);
 row.checkedAt = "2027-09-15";
 assert.equal(competitorFieldErrors(row, "2026-09-15").checkedAt, "дата проверки в будущем");
});
test("query analysis needs the MPStats group, not a repeated description of the compared products", () => {
 const c = researchedContent(); c.analysis.scope = "";
 assert.equal(researchFindings(c.analysis, today).complete, true);
 assert.equal(researchFindings(c.analysis, today).canProceed, true);
 c.analysis.research.cohortUrl = "";
 assert.equal(researchFindings(c.analysis, today).complete, false);
 assert.ok(researchFindings(c.analysis, today).missing.includes("Ссылка на группу или отчёт MPStats"));
});
test("whole season includes multiple peaks and handles year boundary", () => {
 const c = researchedContent(); const p = preparation(c.analysis, today);
 assert.equal(p.seasonDays, 123); assert.equal(researchFindings(c.analysis, today).complete, true);
 c.analysis.launchDate = "2026-11-01"; c.analysis.research.seasonEnd = "2027-01-31";
 assert.equal(preparation(c.analysis, today).seasonDays, 92);
 assert.ok(!researchFindings(c.analysis, today).stops.some(s => s.includes("короче")));
 c.analysis.research.seasonEnd = "2027-01-30";
 assert.ok(researchFindings(c.analysis, today).stops.some(s => s.includes("короче")));
});
test("daily preparation reserve respects real factory lead time and certification sequence", () => {
 const c = researchedContent(); c.analysis.launchDate = "2026-12-17";
 assert.equal(preparation(c.analysis, today).untilStart, 100);
 assert.equal(preparation(c.analysis, today).reserve, 25);
 assert.equal(preparation(c.analysis, today, 30).reserve, 40);
 assert.equal(preparation(c.analysis, today, 60).reserve, 10);
 c.analysis.certification = "needed";
 assert.equal(preparation(c.analysis, today, 30).reserve, 25);
 c.analysis.research.certificationMode = "before_production";
 assert.equal(preparation(c.analysis, today, 30).reserve, -5);
 assert.equal(preparation(c.analysis, "2026-09-09", 30).reserve, -6);
});
test("bulk paste accepts WB links, deduplicates and rejects foreign links or malformed SKUs", () => {
 const r = parseSkus("12345000, 12345000\nhttps://www.wildberries.ru/catalog/12345001/detail.aspx; https://evil.test/catalog/12345002/detail.aspx nope");
 assert.deepEqual(r.skus, ["12345000", "12345001"]); assert.equal(r.duplicates, 1); assert.equal(r.invalid.length, 2);
});
test("missing data remains provisional; no implicit rating, reviews, sales or zero growth", () => {
 const c = newContent(); const s = scoreResearch(c.analysis, today);
 assert.equal(s.total, 0); assert.equal(s.complete, false); assert.equal(s.tone, "neutral");
 const row = newCompetitor("12345000"); assert.equal(row.rating, null); assert.equal(row.revenue, null);
 const done = researchedContent(); done.analysis.research.competitors[0].revenue = null;
 assert.equal(scoreResearch(done.analysis, today).complete, false);
});
test("score is explainable and does not reward ideal competitors or a dead market", () => {
 const c = researchedContent(); const strong = scoreResearch(c.analysis, today);
 assert.equal(strong.total, 100); assert.equal(strong.leaders, 10); assert.equal(strong.complete, true);
 c.analysis.research.competitors.forEach(row => Object.assign(row, { content: "excellent", stock: "available", rating: 4.9, ratingIssue: "none", coverage: "adequate", priceTrend: "stable" }));
 assert.equal(scoreResearch(c.analysis, today).total, 46);
 const weak = researchedContent(); weak.analysis.research.topQueries.forEach(q => q.trend = "falling"); weak.analysis.research.supply = "behind"; weak.analysis.research.yearPrice = "falling"; weak.analysis.research.averageCheck.current = 1000; weak.analysis.research.competitors.forEach(row => row.revenue = 0);
 assert.equal(scoreResearch(weak.analysis, today).total, 0);
});
test("all group rows participate in proportional scoring and repeats remain observations", () => {
 const c = researchedContent(), before = scoreResearch(c.analysis, today);
 c.analysis.research.competitors.push({ ...c.analysis.research.competitors[0], sku: "23456000", revenue: 1, modelGroup: "23456000" });
 assert.ok(scoreResearch(c.analysis, today).total < before.total); assert.equal(scoreResearch(c.analysis, today).sample, 11);
 c.analysis.research.competitors.slice(0, 2).forEach(row => row.modelGroup = "12345000");
 assert.equal(modelRepetition(c.analysis.research), "no");
 c.analysis.research.competitors[2].modelGroup = "12345000";
 assert.equal(modelRepetition(c.analysis.research), "yes");
 assert.ok(scoreResearch(c.analysis, today).findings.risks.some(s => s.includes("три раза")));
 assert.equal(scoreResearch(c.analysis, today).total, 95);
});
test("high rating is not proof of glued reviews; manager flag needs no extra evidence", () => {
 const c = researchedContent(), row = c.analysis.research.competitors[0]; row.rating = 5; row.reviews = 1000;
 assert.ok(!researchFindings(c.analysis, today).risks.some(s => s.includes("склейки")));
 row.glue = "confirmed";
 assert.equal(researchFindings(c.analysis, today).missing.some(s => s.includes("подтверждение")), false);
 row.glueEvidence = "Фотографии отзывов показывают другой прибор";
 assert.equal(researchFindings(c.analysis, today).complete, true);
 assert.equal(scoreResearch(c.analysis, today).total, 97);
 row.rating = 6; assert.equal(contentSchema.safeParse(c).success, false);
});
test("one reference season derives preparation dates for the launch month, including January and leap years", () => {
 const c = researchedContent();
 let a = alignResearchSeason(c.analysis, "2027-10");
 assert.equal(a.launchDate, "2027-10-01"); assert.equal(a.research.seasonEnd, "2028-01-31");
 a = alignResearchSeason(c.analysis, "2027-01");
 assert.equal(a.launchDate, "2026-10-01"); assert.equal(a.research.seasonEnd, "2027-01-31");
 c.analysis.research.historyStart = "2024-02-29"; c.analysis.research.historyEnd = "2024-06-30";
 a = alignResearchSeason(c.analysis, "2027-02"); assert.equal(a.launchDate, "2027-02-28");
 c.analysis.research.seasonFollowsHistory = false; c.analysis.launchDate = "2027-02-15";
 assert.equal(alignResearchSeason(c.analysis, "2027-02").launchDate, "2027-02-15");
 c.analysis.research.seasonFollowsHistory = true; c.analysis.research.historyEnd = "";
 a = alignResearchSeason(c.analysis, "2027-02"); assert.equal(a.launchDate, ""); assert.equal(a.research.seasonEnd, "");
});
test("early price stop uses all ten prices, ignores an isolated cheap card and keeps the 1000 boundary", () => {
 const c = researchedContent(), r = c.analysis.research;
 r.competitors[0].price = 500;
 assert.equal(priceScreening(r).rejected, false);
 r.competitors.forEach(row => row.price = 999);
 assert.equal(priceScreening(r).rejected, true);
 assert.ok(researchFindings(c.analysis, today).stops.some(s => s.includes("1 000")));
 r.competitors[9].price = null;
 assert.equal(priceScreening(r).complete, false); assert.equal(priceScreening(r).rejected, false);
 r.competitors.forEach(row => row.price = 1000);
 assert.equal(priceScreening(r).complete, true); assert.equal(priceScreening(r).rejected, false);
 r.competitors.push(newCompetitor("45678000"));
 assert.equal(priceScreening(r).complete, false, "old samples over ten need all revenues to identify leaders");
});
test("card facts drive observations and score once; warehouses and model labels are no longer required", () => {
 const c = researchedContent(), r = c.analysis.research;
 r.repeatedModels = "no";
 r.competitors.forEach(row => Object.assign(row, { coverage: "unknown", ratingIssue: "unknown", modelGroup: "" }));
 assert.deepEqual(competitorMissing(r.competitors[0]), []);
 assert.equal(researchFindings(c.analysis, today).complete, true);
 assert.equal(scoreResearch(c.analysis, today).total, 100);
 assert.equal(scoreResearch(c.analysis, today).lines.some(l => /регион|склад/.test(l.label)), false);
 assert.equal(scoreResearch(c.analysis, today).lines.filter(l => /налич/.test(l.label)).length, 1);
 assert.equal(modelSignals(r).length, 10); assert.deepEqual(modelSignals(r)[0].signals, ["Цена росла в сезоне", "Заканчивались остатки"]);
 r.competitors[0].rating = 4.8;
 assert.equal(scoreResearch(c.analysis, today).lines.find(l => l.label === "Рейтинг ниже 4,8").points, 9);
 r.repeatedModels = "unknown";
 assert.equal(researchFindings(c.analysis, today).complete, false);
 r.competitors = r.competitors.slice(0, 1);
 assert.equal(scoreResearch(c.analysis, today).lines.some(l => l.label === "Слабый контент"), false);
 r.competitors[0].price = 900;
 assert.equal(priceScreening(r).rejected, true, "price screening uses the entire submitted group");
});
test("price intervals preserve old prices and only stop when the upper bound is below threshold", () => {
 const c = researchedContent(), r = c.analysis.research;
 assert.deepEqual(competitorPriceRange(r.competitors[0]), { from: 20000, to: 20000 });
 r.competitors.forEach(row => Object.assign(row, { priceFrom: 800, priceTo: 1400 }));
 let gate = priceScreening(r); assert.equal(gate.average, null); assert.equal(gate.minimum, 800); assert.equal(gate.maximum, 1400); assert.equal(gate.rejected, false); assert.equal(gate.uncertain, true);
 r.competitors.forEach(row => row.priceTo = 999);
 assert.equal(priceScreening(r).rejected, true);
 r.competitors[0].priceTo = 700;
 assert.equal(priceScreening(r).complete, false); assert.ok(competitorMissing(r.competitors[0]).some(s => s.includes('меньше')));
 r.competitors[0].priceTo = null;
 assert.equal(priceScreening(r).checked, 9, 'partial range must not fall back to the legacy price');
 r.competitors[0].endStockRisk = 'out'; assert.equal(contentSchema.safeParse(c).success, true);
});
test("ten draft slots do not become competitors and persisted slot positions survive gaps", () => {
 assert.equal(competitorSlots([]).length, 1);
 assert.equal(competitorSlots([]).filter(Boolean).length, 0);
 const a = { ...newCompetitor('12345678'), slot: 6 }, b = { ...newCompetitor('12345679'), slot: 10 }, legacy = newCompetitor('12345680');
 const slots = competitorSlots([a, b, legacy]);
 assert.equal(slots.length, 11); assert.equal(slots[6].sku, a.sku); assert.equal(slots[10].sku, b.sku); assert.equal(slots[0].sku, legacy.sku); assert.equal(slots[1], undefined);
 const r = researchedContent().analysis.research;
 r.competitors.forEach(c => c.modelGroup = ''); r.repeatedModelsThreshold = 4; r.repeatedModels = 'no';
 assert.equal(modelRepetition(r), 'unknown', 'an old no to four-or-more does not establish a no to three-or-more');
 r.repeatedModels = 'yes'; assert.equal(modelRepetition(r), 'yes');
 r.repeatedModels = 'no'; r.repeatedModelsThreshold = 3; assert.equal(modelRepetition(r), 'no');
});

test("future season keeps the exact year and preparation updates daily", () => {
 const c = researchedContent(), a = c.analysis;
 a.research.seasonFollowsHistory = false;
 a.launchDate = "2027-01-15"; a.research.seasonEnd = "2027-05-15";
 a.research.historyStart = ""; a.research.historyEnd = "";
 a.research.peakMonths = ["2027-02", "2027-04"];
 const saved = alignResearchSeason(a, "2026-09");
 assert.equal(saved.launchDate, "2027-01-15");
 assert.equal(saved.research.seasonEnd, "2027-05-15");
 assert.equal(researchFindings(saved, "2026-09-15").complete, true);
 const p = preparation(saved, "2026-09-15"), next = preparation(saved, "2026-09-16");
 assert.equal(p.untilStart, 122); assert.equal(next.reserve, p.reserve - 1);
 assert.equal(next.orderBy, p.orderBy);
 a.research.peakMonths = ["2026-12"];
 assert.ok(researchFindings(a, "2026-09-15").missing.some(x => x.includes("пика")));
 a.research.peakMonths = []; a.research.seasonPattern = "steady";
 assert.equal(researchFindings(a, "2026-09-15").complete, true);
});

test("one selected query determines multiyear demand without requiring three queries", () => {
 const c = researchedContent(), r = c.analysis.research;
 r.demandScope = "query"; r.queryTrend = "growing"; r.topQueries = [];
 assert.equal(researchFindings(c.analysis, today).complete, true);
 assert.equal(scoreResearch(c.analysis, today).lines[0].points, 10);
 r.queryTrend = "falling";
 assert.ok(researchFindings(c.analysis, today).risks.some(x => x.includes("анализируемому запросу")));
 r.queryTrend = "unknown";
 assert.equal(researchFindings(c.analysis, today).complete, false);
});

test("removed average-check block cannot affect progress, risks or the score", () => {
 const c = researchedContent(), r = c.analysis.research;
 const original = scoreResearch(c.analysis, today);
 for (const value of [null, { start: "2026-09-18", end: "2026-09-25", previous: 1500, current: 1670 }, { start: "2024-01-15", end: "2024-05-15", previous: 2000, current: 500 }]) {
  r.averageCheck = value;
  const score = scoreResearch(c.analysis, today);
  assert.equal(score.findings.canProceed, true);
  assert.deepEqual(score.findings, original.findings);
  assert.equal(score.total, original.total);
  assert.ok(!score.lines.some(line => /средн.*чек/i.test(line.label)));
 }
 assert.equal(original.marketMax, 30);
 assert.equal(original.marketMax + original.entryMax, 65);
 assert.equal(original.total, 100);
});

test("manager can complete initial research before the owner checks certification", () => {
 const c = researchedContent(); c.analysis.certification = "unknown";
 assert.equal(researchFindings(c.analysis, today).complete, true);
 assert.equal(preparation(c.analysis, today).certificationUnknown, true);
});
