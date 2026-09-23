import { newContent } from "../lib/candidate-workflow.ts";
import { newCompetitor } from "../lib/niche-research.ts";
export function researchedContent() {
 const c = newContent("Сопоставимые модели проверены по общему сезону. Есть возможности улучшить контент.", "2027-10");
 Object.assign(c.analysis, { scope: "Автоматические зерновые кофемашины", certification: "not_needed" });
 Object.assign(c.analysis.research, { averageCheck: { start: "2024-01-15", end: "2024-05-15", previous: 2000, current: 2500 }, demandScope: "legacy", seasonFollowsHistory: true, cohortUrl: "https://mpstats.io/test-group", historyStart: "2025-10-01", historyEnd: "2026-01-31", seasonEnd: "2028-01-31", seasonPattern: "waves", peakMonths: ["10", "12"], trendSource: "Wildbox 2023–2025", supply: "ahead", yearPrice: "rising", sellerShare: 20, sellerSource: "Вся группа MPStats", topQueries: ["кофемашина", "кофемашина зерновая", "кофемашина автомат"].map(query => ({ query, trend: "double" })), competitors: Array.from({ length: 10 }, (_, i) => ({ ...newCompetitor(String(12345000 + i)), revenue: 5e6 - i * 1e5, price: 20000, priceTrend: "rising", stock: "replenished", endStock: 10, endStockRisk: "normal", rating: 4.5, reviews: 200, checkedAt: "2026-09-01", glue: "no", content: "poor", ratingIssue: "fixable", coverage: "gap", modelGroup: String(12345000 + i) })) });
 return c;
}
