import assert from "node:assert/strict";
import { renderOverviewCsv, selectOverviewCsvRowsForSkill } from
  "../lib/teaching-dictionary-manager/overview-csv";

const skill = "D4_INF_ING_ENDINGS_REGULAR";
const rows: Record<string, unknown>[] = [
  { canonical_word_id: "word-a", normalised_word: "reading", affected_micro_skills: skill,
    review_group: "sense_facts" },
  { canonical_word_id: "word-a", normalised_word: "reading", affected_micro_skills: "",
    review_group: "route_facts" },
  { canonical_word_id: "word-b", normalised_word: "misreading",
    affected_micro_skills: `${skill}_EXTRA`, review_group: "other" },
  { canonical_word_id: "word-c", normalised_word: "asking",
    affected_micro_skills: `D4_OTHER; ${skill}`, review_group: "sense_facts" },
];
const selected = selectOverviewCsvRowsForSkill(rows, skill);
assert.deepEqual(selected.map(row => row.review_group),
  ["sense_facts", "route_facts", "sense_facts"],
  "Exact skill filtering must keep all rows for each associated word");
assert.equal(selectOverviewCsvRowsForSkill(rows, "D4_INF_ING_ENDINGS_DROP_E").length, 0);
const csv = renderOverviewCsv(selected);
assert.equal(csv.split("\r\n").length, 5, "Filtered rows must retain the round-trip header");
assert(!csv.includes("misreading"));
console.log("overview skill export: passed");
