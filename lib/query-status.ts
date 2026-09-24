import type { Candidate } from "./candidate-workflow";

export type QueryStatus = "unreviewed" | "shortlisted" | "deferred" | "candidate" | "excluded";
export type QueryList = "all" | "unreviewed" | "shortlisted" | "excluded";
export type ScreenerStatus = "unreviewed" | "shortlisted" | "excluded";

export const queryStatusLabels: Record<QueryStatus, string> = {
  unreviewed: "Не разобрано",
  shortlisted: "Чистовик",
  deferred: "Отложено",
  candidate: "Кандидат в закуп",
  excluded: "Исключено",
};

export const screenerStatusLabels: Record<ScreenerStatus, string> = {
  unreviewed: "Не разобрано",
  shortlisted: "Чистовик",
  excluded: "Исключено",
};

export function screenerStatus(mark?: "shortlisted" | "excluded"): ScreenerStatus {
  return mark === "excluded" ? "excluded" : mark === "shortlisted" ? "shortlisted" : "unreviewed";
}

export function queryStatus(candidate?: Pick<Candidate, "status">, excluded = false, shortlisted = false): QueryStatus {
  if (excluded || candidate?.status === "rejected") return "excluded";
  if (candidate?.status === "deferred") return "deferred";
  if (candidate && ["sourcing", "ready", "purchased"].includes(candidate.status)) return "candidate";
  if (candidate?.status === "unreviewed") return "unreviewed";
  if (candidate || shortlisted) return "shortlisted";
  return "unreviewed";
}

export type ReviewProgress = {
  selected: boolean;
  manager: "waiting" | "active" | "done";
  owner: "waiting" | "active" | "done";
  outcome: "candidate" | "deferred" | "excluded" | null;
};

// The visible progress is derived from the existing workflow state. It is deliberately
// not another editable status field: the user sees one pipeline, while the backend can
// keep its detailed states for locking, history and unit-economics rules.
export function reviewProgress(candidate?: Pick<Candidate, "status">, shortlisted = false): ReviewProgress {
  if (!shortlisted && !candidate) return { selected: false, manager: "waiting", owner: "waiting", outcome: null };
  if (candidate?.status === "rejected") return { selected: true, manager: "done", owner: "done", outcome: "excluded" };
  if (candidate?.status === "deferred") return { selected: true, manager: "done", owner: "done", outcome: "deferred" };
  if (candidate && ["sourcing", "ready", "purchased"].includes(candidate.status)) return { selected: true, manager: "done", owner: "done", outcome: "candidate" };
  if (candidate?.status === "analysis_ready") return { selected: true, manager: "done", owner: "active", outcome: null };
  if (candidate && ["analysis", "unreviewed"].includes(candidate.status)) return { selected: true, manager: "active", owner: "waiting", outcome: null };
  return { selected: true, manager: "waiting", owner: "waiting", outcome: null };
}
