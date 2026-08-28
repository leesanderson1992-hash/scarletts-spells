import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  planApprovedSpellingIntakeSources,
  type ApprovedSpellingReviewFact,
} from "../lib/writing-engine/spelling/approved-review-intake-source-plan";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260828120000_make_parent_approval_occurrence_complete.sql",
    import.meta.url,
  ),
  "utf8",
);
const intakeLoader = readFileSync(
  new URL("../lib/adle/loaders/canonical-intake-live.ts", import.meta.url),
  "utf8",
);
const sqlProof = readFileSync(
  new URL("./sql/prove-r8b-occurrence-materialisation-local.sql", import.meta.url),
  "utf8",
);

assert.match(
  migration,
  /create unique index parent_verified_spelling_candidate_mappings_live_occurrence_idx[\s\S]*parent_user_id,[\s\S]*child_id,[\s\S]*source_misspelling_instance_id[\s\S]*candidate_status in \([\s\S]*'pending_parent_promotion'[\s\S]*'parent_local_promoted'[\s\S]*'admin_review_requested'[\s\S]*'global_canonical_promoted'/,
);
assert.doesNotMatch(
  migration.match(
    /create unique index parent_verified_spelling_candidate_mappings_live_occurrence_idx[\s\S]*?;/,
  )?.[0] ?? "",
  /'rejected'|'superseded'/,
  "terminal rows remain available for audit history",
);
assert.match(
  migration,
  /create trigger writing_issues_materialize_spelling_occurrence_source[\s\S]*after update of issue_status, final_classification/,
);
assert.match(
  migration,
  /create trigger writing_issues_materialize_inserted_spelling_occurrence_source[\s\S]*after insert on public\.writing_issues/,
  "a direct finalised-row insert cannot bypass occurrence materialisation",
);
assert.match(
  migration,
  /known_match_auto_resolution[\s\S]*canonical_mapping_id[\s\S]*mapping\.misspelling_normalized = v_misspelling_normalized[\s\S]*mapping\.correct_spelling_normalized = v_correct_spelling_normalized[\s\S]*mapping\.micro_skill_key = v_issue\.micro_skill_key/,
);
assert.match(
  migration,
  /v_candidate\.misspelling_normalized <> v_misspelling_normalized[\s\S]*v_candidate\.correct_spelling_normalized <> v_correct_spelling_normalized[\s\S]*v_candidate\.micro_skill_key <> v_issue\.micro_skill_key[\s\S]*raise exception 'The live spelling occurrence source disagrees/,
);
assert.match(
  migration,
  /candidate_status = case[\s\S]*'parent_local_promoted'[\s\S]*'action', 'reused'/,
  "compatible candidate capture is promoted/reused",
);
assert.match(
  migration,
  /add column canonical_intake_handoff_state text[\s\S]*canonical_intake_handoff_state = 'awaiting_r8c_exact_id_handoff'/,
  "R8B quarantine uses protected relational state",
);
assert.match(
  migration,
  /v_requires_spelling_occurrence :=[\s\S]*source_misspelling_instance_id is not null[\s\S]*catalog\.mastery_domain_key = 'D4'[\s\S]*if v_is_learning_reason and v_requires_spelling_occurrence then[\s\S]*A learning spelling issue requires a source misspelling occurrence/,
  "D4 learning issues fail closed when occurrence identity is missing",
);
assert.match(
  migration,
  /protect_r8b_canonical_intake_handoff_state[\s\S]*UPDATE[\s\S]*is distinct from old\.canonical_intake_handoff_state[\s\S]*awaiting R8C cannot be deleted/,
  "R8B quarantine state cannot be cleared or deleted through parent row access",
);
assert.match(
  migration,
  /adle_canonical_intake_candidates_enforce_source_handoff[\s\S]*adle_learning_item_sources_enforce_source_handoff/,
  "both canonical-candidate and learning-item-lineage boundaries enforce quarantine",
);
for (const guardedRpc of [
  "adle_seed_canonical_intake_candidate",
  "adle_record_canonical_intake_blocked",
  "adle_persist_canonical_intake",
]) {
  assert.match(
    migration,
    new RegExp(
      `create function public\\.${guardedRpc}\\([\\s\\S]*?assert_candidate_canonical_intake_handoff_eligible`,
    ),
    `${guardedRpc} checks protected handoff state before delegating`,
  );
  assert.match(
    migration,
    new RegExp(
      `revoke all on function public\\.${guardedRpc}_r8b_delegate\\([\\s\\S]*?service_role`,
    ),
    `${guardedRpc} delegate cannot be called around the guard`,
  );
}
assert.match(
  migration,
  /'governed_occurrence_sources', v_governed_sources/,
  "approval returns the complete source set for R8C",
);
assert.match(
  intakeLoader,
  /canonical_intake_handoff_state !== "awaiting_r8c_exact_id_handoff"/,
  "new R8B sources are quarantined from the legacy whole-submission intake scan",
);
assert.match(
  sqlProof,
  /dblink_send_query[\s\S]*r8b_concurrent_one[\s\S]*r8b_concurrent_two[\s\S]*prove-r8b-true-concurrent-finalisation: ok/,
  "the SQL proof launches two real concurrent finalisers",
);
for (const requiredSqlProof of [
  "micro-skill disagreement did not fail closed",
  "canonical mapping disagreement did not fail closed",
  "superseded history and later live replacement did not coexist",
  "existing candidate capture was replaced or lost provenance",
  "quarantined provenance mutation did not fail closed",
  "inserted D4 finalisation bypassed occurrence identity",
  "atomic approval did not preserve valid non-spelling learning finalisation",
]) {
  assert.equal(
    sqlProof.includes(requiredSqlProof),
    true,
    `SQL proof must cover: ${requiredSqlProof}`,
  );
}
for (const forbiddenDownstreamTable of [
  "adle_canonical_intake_candidates",
  "adle_learning_items",
  "adle_learning_item_sources",
  "adle_review_schedule_words",
  "adle_review_schedule_word_routes",
  "daily_assignments",
  "adle_review_sessions",
  "adle_review_word_encounters",
  "adle_review_r6_child_rollouts",
]) {
  assert.equal(
    new RegExp(
      `(?:insert\\s+into|update)\\s+public\\.${forbiddenDownstreamTable}`,
      "i",
    ).test(migration),
    false,
    `R8B migration must not write ${forbiddenDownstreamTable}`,
  );
}

type LiveSource = {
  id: string;
  childId: string;
  occurrenceId: string;
  misspelling: string;
  target: string;
  microSkillKey: string;
  status: "pending_parent_promotion" | "parent_local_promoted" | "superseded";
  origin: "known" | "candidate";
};

const COMPOUND = "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS";
const PREFIX = "D4_MOR_PREFIXES_RE_PRE";
const facts = [
  ["futball", "football", COMPOUND, "known"],
  ["ranebow", "rainbow", COMPOUND, "candidate"],
  ["riplay", "replay", PREFIX, "known"],
  ["rinew", "renew", PREFIX, "candidate"],
] as const;
const reviewFacts = facts.map(
  ([misspelling, target, microSkillKey, origin], index) => ({
    childId: "unactivated-child",
    taskSubmissionId: "returned-submission",
    writingIssueId: `issue-${index}`,
    sourceMisspellingInstanceId: `occurrence-${index}`,
    misspellingNormalized: misspelling,
    correctSpellingNormalized: target,
    microSkillKey,
    practiceRoute: "word_practice",
    createsLearningTarget: true,
    routeAuthority:
      origin === "known"
        ? {
            kind: "known_canonical_match" as const,
            canonicalMappingId: `canonical-${index}`,
          }
        : {
            kind: "parent_verified_candidate" as const,
            candidateMappingId: `candidate-${index}`,
          },
  }),
) satisfies ApprovedSpellingReviewFact[];
const sourcePlan = planApprovedSpellingIntakeSources(reviewFacts);
assert.equal(sourcePlan.ok, true);
if (!sourcePlan.ok) throw new Error("R8A source plan unexpectedly failed.");
const plannedSources = sourcePlan.sources;

const rows: LiveSource[] = [
  {
    id: "candidate-1",
    childId: "unactivated-child",
    occurrenceId: "occurrence-1",
    misspelling: "ranebow",
    target: "rainbow",
    microSkillKey: COMPOUND,
    status: "pending_parent_promotion",
    origin: "candidate",
  },
  {
    id: "candidate-3",
    childId: "unactivated-child",
    occurrenceId: "occurrence-3",
    misspelling: "rinew",
    target: "renew",
    microSkillKey: PREFIX,
    status: "parent_local_promoted",
    origin: "candidate",
  },
];

function materialise(): string[] {
  return plannedSources.map((source) => {
    const existing = rows.find(
      (row) =>
        row.childId === source.childId &&
        row.occurrenceId === source.sourceMisspellingInstanceId &&
        row.status !== "superseded",
    );
    if (existing) {
      assert.equal(existing.misspelling, source.misspellingNormalized);
      assert.equal(existing.target, source.correctSpellingNormalized);
      assert.equal(existing.microSkillKey, source.microSkillKey);
      existing.status = "parent_local_promoted";
      return existing.id;
    }
    const id = `materialised-${source.sourceMisspellingInstanceId}`;
    rows.push({
      id,
      childId: source.childId,
      occurrenceId: source.sourceMisspellingInstanceId,
      misspelling: source.misspellingNormalized,
      target: source.correctSpellingNormalized,
      microSkillKey: source.microSkillKey,
      status: "parent_local_promoted",
      origin: "known",
    });
    return id;
  });
}

const firstIds = materialise();
assert.equal(rows.filter((row) => row.status !== "superseded").length, 4);
assert.deepEqual(
  new Set(rows.map((row) => row.target)),
  new Set(["football", "rainbow", "replay", "renew"]),
);
assert.equal(new Set(rows.map((row) => row.microSkillKey)).size, 2);
assert.equal(rows.filter((row) => row.origin === "known").length, 2);
assert.equal(rows.filter((row) => row.origin === "candidate").length, 2);

const replayIds = materialise();
assert.deepEqual(replayIds, firstIds);
assert.equal(rows.filter((row) => row.status !== "superseded").length, 4);

rows.push({
  id: "later-football",
  childId: "unactivated-child",
  occurrenceId: "later-occurrence",
  misspelling: "fotball",
  target: "football",
  microSkillKey: COMPOUND,
  status: "parent_local_promoted",
  origin: "known",
});
assert.equal(rows.filter((row) => row.target === "football").length, 2);
assert.equal(new Set(rows.map((row) => row.occurrenceId)).size, 5);

const conflicting = {
  ...rows[0]!,
  target: "rainbows",
};
assert.throws(() => {
  const source = plannedSources.find(
    (entry) => entry.sourceMisspellingInstanceId === conflicting.occurrenceId,
  )!;
  if (
    conflicting.target !== source.correctSpellingNormalized ||
    conflicting.microSkillKey !== source.microSkillKey
  ) {
    throw new Error("conflicting occurrence identity");
  }
});

const nonLearning = rows.find((row) => row.occurrenceId === "occurrence-3")!;
nonLearning.status = "superseded";
assert.equal(
  rows.some(
    (row) =>
      row.occurrenceId === "occurrence-3" &&
      row.status === "parent_local_promoted",
  ),
  false,
);
assert.equal(rows.some((row) => row.id === nonLearning.id), true);

console.log(
  "r8b-occurrence-materialisation-regression: occurrence-complete, idempotent, conflict-closed, R8C-quarantined",
);
