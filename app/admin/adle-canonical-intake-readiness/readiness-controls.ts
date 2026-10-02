import { FACET_KEYS, type FacetKey, type FacetState } from "./readiness-projection";

export const SORT_KEYS = ["word", "microSkillKey", "occurrences", "usersWaiting", ...FACET_KEYS] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDirection = "asc" | "desc";
export type WithoutFilter = FacetKey | "all";

export type ReadinessControls = {
  microSkill: string;
  without: WithoutFilter;
  sort: SortKey;
  direction: SortDirection;
};

export function parseReadinessControls(params: {
  skill?: string; without?: string; sort?: string; direction?: string;
}): ReadinessControls {
  return {
    microSkill: (params.skill ?? "").trim().slice(0, 160),
    without: FACET_KEYS.includes(params.without as FacetKey) ? params.without as FacetKey : "all",
    sort: SORT_KEYS.includes(params.sort as SortKey) ? params.sort as SortKey : "usersWaiting",
    direction: params.direction === "asc" ? "asc" : "desc",
  };
}

export function readinessHref(input: ReadinessControls & {
  view: string; search: string; page?: number;
}): string {
  const params = new URLSearchParams({ view: input.view });
  if (input.search) params.set("q", input.search);
  if (input.microSkill) params.set("skill", input.microSkill);
  if (input.without !== "all") params.set("without", input.without);
  if (input.sort !== "usersWaiting" || input.direction !== "desc") {
    params.set("sort", input.sort);
    params.set("direction", input.direction);
  }
  if (input.page && input.page > 1) params.set("page", String(input.page));
  return `/admin/adle-canonical-intake-readiness?${params}`;
}

const STATE_ORDER: Record<FacetState, number> = { missing: 0, unknown: 1, complete: 2 };

export function compareReadinessRows<T extends {
  key: string; word: string; microSkillKey: string; occurrences: number; usersWaiting: number;
  facets: Record<FacetKey, { state: FacetState }>;
}>(a: T, b: T, controls: ReadinessControls): number {
  const field = controls.sort;
  let comparison: number;
  if (field === "word" || field === "microSkillKey") comparison = a[field].localeCompare(b[field]);
  else if (field === "occurrences" || field === "usersWaiting") comparison = a[field] - b[field];
  else comparison = STATE_ORDER[a.facets[field].state] - STATE_ORDER[b.facets[field].state];
  return (controls.direction === "desc" ? -comparison : comparison) ||
    a.word.localeCompare(b.word) || a.microSkillKey.localeCompare(b.microSkillKey);
}

export function matchesWithoutFilter(row: { facets: Record<FacetKey, { state: FacetState }> },
  without: WithoutFilter): boolean {
  return without === "all" || row.facets[without].state === "missing";
}
