import type { SummaryRow } from "./market-types";

// Display-only counts over the full subject pool, independent of screener filters.
export function summarizeSubjectDemand(rows: SummaryRow[]) {
  const result = { total: rows.length, growing: 0, falling: 0, stable: 0, unknown: 0 };
  for (const { yoyDemand } of rows) {
    if (yoyDemand == null || !Number.isFinite(yoyDemand)) result.unknown++;
    else if (yoyDemand > 0) result.growing++;
    else if (yoyDemand < 0) result.falling++;
    else result.stable++;
  }
  return result;
}
