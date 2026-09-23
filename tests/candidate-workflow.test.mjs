import test from "node:test";
import assert from "node:assert/strict";
import { analysisFindings, arrivalDate, calculateImport, calculateWb, calculatePlan, checks, newContent, newModel, contentSchema, workbookExample, readyIssues } from "../lib/candidate-workflow.ts";

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`);
function pricedExample() {
  const m = workbookExample();
  Object.assign(m.wb, { price: 25000, commissionPct: 38, acquiringPct: 3, forwardLogistics: 700,
    returnLogistics: 50, buyoutPct: 85, packaging: 40, drrPct: 5, tariffDate: "2026-09-06", tariffSource: "Test fixture" });
  Object.assign(m.plan, { startDate: "2027-01-01", sellUnits: 600, rationale: "Test scenario" });
  return m;
}
test("white import reconciles with all original workbook control totals; VAT always in cost", () => {
  const m = workbookExample(); const r = calculateImport(m); assert.equal(r.ok, true);
  close(r.unit, 7796.21884651244); close(r.cash, 4677731.30790747);
  close(r.volume, 25.339968); close(r.vat, 759760.386770986);
  close(r.freightUsd, 4837.89408); close(r.total, r.cash);
  assert.equal(r.cartons, 300); assert.equal(r.customsFee, 18465);
  assert.equal("vatInCost" in m.import, false);
});
test("cartons round upwards and dense freight uses weight", () => {
  const m = workbookExample(); m.import.quantity = 601; m.offers[0].weightKg = 100;
  const r = calculateImport(m); assert.equal(r.ok, true); assert.equal(r.cartons, 301);
  close(r.paidVolume, 30100 / 300); assert.ok(r.paidVolume > r.volume);
});
test("container mode does not require the unused groupage rate or density", () => {
  const m = workbookExample(); Object.assign(m.import, { mode: "container", rateUsdM3: null, densityKgM3: null });
  const r = calculateImport(m); assert.equal(r.ok, true); close(r.freightUsd, 8923); assert.equal(Number.isFinite(r.paidVolume), true);
});
test("missing inputs and zero buyout produce no false profit or NaN", () => {
  assert.equal(calculateImport(newModel()).ok, false);
  const m = pricedExample(); m.wb.buyoutPct = 0; assert.equal(calculateWb(m).ok, false);
  m.wb.buyoutPct = 110; assert.equal(calculateWb(m).ok, false);
  m.import.quantity = 0; assert.equal(calculateImport(m).ok, false);
});
test("supplier changes cascade through landed cost and WB profit; SPP is not subtracted twice", () => {
  const m = pricedExample(); const initial = calculateWb(m); assert.equal(initial.ok, true);
  m.wb.sppPct = 20; const spp = calculateWb(m); assert.equal(spp.ok, true);
  close(spp.buyerPrice, 20000); close(spp.profit, initial.profit);
  close(spp.outputVat, 25000 * 5 / 105);
  close(spp.logistics, 700 / 0.85 + 50 * 0.15 / 0.85);
  m.offers[0].price += 100; const higher = calculateWb(m); assert.equal(higher.ok, true); assert.ok(higher.profit < initial.profit);
});
test("daily plan conserves integers, stock and cash across all phases and payout lag", () => {
  const m = pricedExample(); m.plan.sellUnits = 599;
  const p = calculatePlan(m); assert.equal(p.ok, true);
  assert.equal(p.days.reduce((s, d) => s + d.sold, 0), 599); assert.equal(p.stock, 1);
  assert.ok(p.days.every((d) => Number.isInteger(d.sold) && d.stock >= 0));
  assert.ok(p.days.slice(0, 14).every((d) => d.receipt === 0));
  close(p.cash, p.profit - (calculateImport(m).unit + m.wb.packaging) * p.stock);
  assert.equal(p.days.length, 104); assert.equal(p.days.at(-1).phase, "Ожидание выплат");
  m.plan.payoutLag = 0; const immediate = calculatePlan(m); assert.equal(immediate.ok, true); close(immediate.cash, p.cash);
});
test("plan rejects overselling, broken percentages and invalid duration", () => {
  const m = pricedExample(); m.plan.sellUnits = 601; assert.equal(calculatePlan(m).ok, false);
  m.plan.sellUnits = 600; m.plan.phases[0].share = 30; assert.equal(calculatePlan(m).ok, false);
  m.plan.phases[0].share = 20; m.plan.phases[0].days = null; assert.equal(calculatePlan(m).ok, false);
});
test("legacy analysis stays readable with its original findings", () => {
  const c = newContent(); c.analysis.research.version = 1; assert.equal(analysisFindings(c.analysis).complete, false);
  Object.assign(c.analysis, { answers: Object.fromEntries(checks.map((x) => [x.id, x.positive])),
    startDate: "2026-09-01", launchDate: "2027-01-01", seasonMonths: 3, certification: "needed",
    comment: "Проверены лидеры", evidence: "Ссылки и периоды", bulky: true });
  assert.equal(analysisFindings(c.analysis).complete, true);
  assert.equal(arrivalDate(c.analysis), "2026-11-15");
  assert.equal(arrivalDate(c.analysis, 60), "2026-11-30");
  c.analysis.answers.dumping = "yes"; assert.equal(analysisFindings(c.analysis).complete, false);
  c.analysis.riskReason = "У другой комплектации ценовая конкуренция ниже";
  assert.equal(analysisFindings(c.analysis).complete, true);
  c.analysis.seasonMonths = 1; assert.equal(analysisFindings(c.analysis).complete, false);
});
test("unconfirmed example is never automatically ready to purchase; unsafe URLs rejected", () => {
  const c = newContent(); const m = pricedExample(); c.models = [m]; c.selectedModelId = m.id;
  assert.ok(readyIssues(c).some((s) => s.includes("Фабрика")));
  assert.equal(contentSchema.safeParse(c).success, true);
  c.models[0].offers[0].url = "javascript:alert(1)";
  assert.equal(contentSchema.safeParse(c).success, false);
});
