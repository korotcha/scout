import { selectedOffer, type Candidate } from "./candidate-workflow";
import { queryKey, scoreResearch } from "./niche-research";
import { selectScreenerRows, type ScreenerState } from "./screener";
import type { SummaryRow } from "./market-types";

export const analysisKey = (subject: string, query: string) => JSON.stringify([subject, queryKey(query)]);
export function selectWorkflowRows(rows: SummaryRow[], candidates: Candidate[], state: ScreenerState, today?: string, excludedSubjects: ReadonlySet<string> = new Set()) {
  rows = rows.filter(row => !excludedSubjects.has(row.subject));
  candidates = candidates.filter(c => !c.content.manualBlock && !excludedSubjects.has(c.subject));
  const records = new Map(candidates.map(c => [analysisKey(c.subject, c.query), c]));
  const scores = new Map(candidates.map(c => { const m = c.content.models.find(m => m.id === c.content.selectedModelId); return [analysisKey(c.subject, c.query), c.content.analysis.research.version === 2 ? scoreResearch(c.content.analysis, today, m ? selectedOffer(m)?.productionDays : undefined) : null]; }));
  const known = new Set(rows.map(r => analysisKey(r.subject, r.query)));
  const combined: SummaryRow[] = [...rows, ...candidates.filter(c => !known.has(analysisKey(c.subject, c.query))).map(c => ({query: c.query || c.subject, subject: c.subject, frequency:null, yoyDemand:null, perArticle:null, yoyPressure:null, articles:null, mom:null}))];
  const filtered = selectScreenerRows(combined, state).filter(row => {
    const key = analysisKey(row.subject, row.query), c = records.get(key), status = c?.status ?? "unstarted";
    const filter = state.status ?? "active";
    if (filter === "active" ? ["rejected", "deferred"].includes(status) : filter !== "all" && filter !== status) return false;
    if (state.minScore != null) { const s = scores.get(key); if (!s?.complete || s.total < state.minScore) return false; }
    return true;
  });
  if (state.sortByScore) filtered.sort((a,b) => {
    const sa = scores.get(analysisKey(a.subject,a.query)), sb = scores.get(analysisKey(b.subject,b.query));
    // Confirmed, then provisional, then unstarted. Missing scores are not zero.
    const rank = (s: typeof sa) => !s ? 2 : s.complete ? 0 : 1;
    return rank(sa)-rank(sb) || (state.direction === "desc" ? (sb?.total ?? -1)-(sa?.total ?? -1) : (sa?.total ?? -1)-(sb?.total ?? -1));
  });
  return {rows: filtered, records, scores};
}
