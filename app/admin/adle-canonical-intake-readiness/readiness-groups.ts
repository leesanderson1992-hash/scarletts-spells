export type ReadinessView = "current" | "other" | "resolved" | "archived";

export type GroupDemand = { lifecycle_status: string; archived_at: string | null };
export type GroupCandidate = { child_id: string; source_candidate_mapping_id: string };

const TERMINAL = new Set(["activated", "rejected", "superseded"]);

export function distinctOccurrences(candidates: GroupCandidate[]): number {
  return new Set(candidates.map((candidate) => candidate.source_candidate_mapping_id)).size;
}

export function distinctUsersWaiting(candidates: GroupCandidate[]): number {
  return new Set(candidates.map((candidate) => candidate.child_id)).size;
}

export function groupIsArchived(demands: GroupDemand[]): boolean {
  const unresolved = demands.filter((demand) => !TERMINAL.has(demand.lifecycle_status));
  return unresolved.length > 0 && unresolved.every((demand) => Boolean(demand.archived_at));
}

export function groupMatchesView(input: {
  demands: GroupDemand[]; waiting: GroupCandidate[]; archived: boolean;
}, view: ReadinessView): boolean {
  if (view === "archived") return input.archived;
  if (input.archived) return false;
  const unresolved = input.demands.some((demand) => !TERMINAL.has(demand.lifecycle_status));
  if (view === "resolved") return !unresolved;
  if (view === "other") return unresolved;
  return unresolved && input.waiting.length > 0;
}

export function matchesProjectedUnresolvedView(input: {
  waitingCandidates: number;
  states: readonly ("complete" | "missing" | "unknown")[];
}, view: "current" | "other"): boolean {
  const hasMissing = input.states.includes("missing");
  return view === "current"
    ? input.waitingCandidates > 0 && hasMissing
    : input.waitingCandidates === 0 || !hasMissing;
}
