export type ReadinessView = "current" | "other" | "resolved" | "archived";

export type GroupDemand = { lifecycle_status: string; archived_at: string | null };
export type GroupCandidate = { child_id: string; source_candidate_mapping_id: string };
export type MicroSkillDemand = {
  microSkillKey: string;
  wordCount: number;
  occurrences: number;
  usersWaiting: number;
};

const TERMINAL = new Set(["activated", "rejected", "superseded"]);

export function distinctOccurrences(candidates: GroupCandidate[]): number {
  return new Set(candidates.map((candidate) => candidate.source_candidate_mapping_id)).size;
}

export function distinctUsersWaiting(candidates: GroupCandidate[]): number {
  return new Set(candidates.map((candidate) => candidate.child_id)).size;
}

export function summarizeReadiness<T extends {
  key: string; word: string; microSkillKey: string; occurrences: number; usersWaiting: number;
}>(rows: T[], candidatesByKey: Map<string, GroupCandidate[]>, waitingByKey: Map<string, GroupCandidate[]>) {
  const occurrenceIds = new Set<string>();
  const childIds = new Set<string>();
  const demandByMicroSkill = new Map<string, { words: Set<string>; occurrences: Set<string>; usersWaiting: Set<string> }>();
  for (const row of rows) {
    const demand = demandByMicroSkill.get(row.microSkillKey) ?? { words: new Set(), occurrences: new Set(), usersWaiting: new Set() };
    demand.words.add(row.word);
    for (const candidate of candidatesByKey.get(row.key) ?? []) {
      occurrenceIds.add(candidate.source_candidate_mapping_id);
      demand.occurrences.add(candidate.source_candidate_mapping_id);
    }
    for (const candidate of waitingByKey.get(row.key) ?? []) {
      childIds.add(candidate.child_id);
      demand.usersWaiting.add(candidate.child_id);
    }
    demandByMicroSkill.set(row.microSkillKey, demand);
  }
  const topThree: MicroSkillDemand[] = [...demandByMicroSkill].map(([microSkillKey, demand]) => ({
    microSkillKey, wordCount: demand.words.size, occurrences: demand.occurrences.size,
    usersWaiting: demand.usersWaiting.size,
  })).sort((a, b) => b.occurrences - a.occurrences || b.usersWaiting - a.usersWaiting ||
    a.microSkillKey.localeCompare(b.microSkillKey)).slice(0, 3);
  return {
    occurrencesTotal: occurrenceIds.size,
    usersWaiting: childIds.size,
    topThree,
  };
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
