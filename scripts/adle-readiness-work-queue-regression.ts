import assert from "node:assert/strict";

import { compareReadinessRows, matchesWithoutFilter, parseReadinessControls, readinessHref } from "../app/admin/adle-canonical-intake-readiness/readiness-controls";
import { summarizeReadiness, type GroupCandidate } from "../app/admin/adle-canonical-intake-readiness/readiness-groups";
import type { FacetKey, FacetState } from "../app/admin/adle-canonical-intake-readiness/readiness-projection";

const states = (overrides: Partial<Record<FacetKey, FacetState>> = {}) => ({
  resolver: { state: overrides.resolver ?? "complete" },
  teaching: { state: overrides.teaching ?? "complete" },
  dictionary: { state: overrides.dictionary ?? "complete" },
  metadata: { state: overrides.metadata ?? "complete" },
  lesson: { state: overrides.lesson ?? "complete" },
});
const rows = [
  { key: "a", word: "apple", microSkillKey: "D4_a", occurrences: 3, usersWaiting: 2, facets: states({ teaching: "missing" }) },
  { key: "b", word: "berry", microSkillKey: "D4_b", occurrences: 4, usersWaiting: 1, facets: states({ dictionary: "missing" }) },
  { key: "c", word: "cherry", microSkillKey: "D4_c", occurrences: 4, usersWaiting: 2, facets: states({ teaching: "unknown" }) },
  { key: "d", word: "date", microSkillKey: "D4_d", occurrences: 1, usersWaiting: 0, facets: states({ teaching: "missing" }) },
];

assert.deepEqual(rows.filter((row) => matchesWithoutFilter(row, "teaching")).map((row) => row.key), ["a", "d"]);
assert.equal(matchesWithoutFilter(rows[2], "teaching"), false, "neutral state is not Missing");
const controls = parseReadinessControls({ skill: "D4_a", without: "teaching", sort: "occurrences", direction: "asc" });
assert.deepEqual(controls, { microSkill: "D4_a", without: "teaching", sort: "occurrences", direction: "asc" });
const href = readinessHref({ ...controls, view: "current", search: "app", page: 2 });
assert.deepEqual(parseReadinessControls(Object.fromEntries(new URL(href, "https://example.test").searchParams)), controls);
assert.equal(new URL(href, "https://example.test").searchParams.get("page"), "2");
assert.deepEqual([...rows].sort((a, b) => compareReadinessRows(a, b, controls)).map((row) => row.key), ["d", "a", "b", "c"]);
assert.deepEqual([...rows].sort((a, b) => compareReadinessRows(a, b, { ...controls, sort: "teaching", direction: "asc" })).map((row) => row.key), ["a", "d", "c", "b"]);

const candidate = (source_candidate_mapping_id: string, child_id: string): GroupCandidate => ({ source_candidate_mapping_id, child_id });
const candidates = new Map([
  ["a", [candidate("s1", "u1"), candidate("s2", "u2"), candidate("s2", "u2")]],
  ["b", [candidate("s2", "u2"), candidate("s3", "u3")]],
  ["c", [candidate("s4", "u1")]],
  ["d", [candidate("s5", "u4")]],
]);
const waiting = new Map([
  ["a", [candidate("s1", "u1"), candidate("s2", "u2")]],
  ["b", [candidate("s2", "u2")]],
  ["c", [candidate("s4", "u1")]],
  ["d", []],
]);
const overview = summarizeReadiness(rows, candidates, waiting);
assert.equal(overview.occurrencesTotal, 5, "source occurrences are distinct across rows");
assert.equal(overview.usersWaiting, 2, "waiting children are distinct across rows");
assert.deepEqual(overview.topThree.map((row) => row.key), ["c", "b", "a"]);
const filtered = summarizeReadiness(rows.filter((row) => matchesWithoutFilter(row, "teaching")), candidates, waiting);
assert.equal(filtered.occurrencesTotal, 3);
assert.equal(filtered.usersWaiting, 2);

console.log("ADLE readiness work queue regression passed");
