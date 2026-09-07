import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  resolveParentIdentifiedOccurrence,
  type ParentIdentifiedOccurrenceCandidate,
} from "../lib/writing-engine/whole-writing/parent-identified-errors";
import {
  continueUnknownErrorAfterAdminDecision,
  hasAppliedGovernedUnknownErrorReplay,
} from "../lib/writing-engine/whole-writing/unknown-error-continuation";

async function main() {
  const repeated: ParentIdentifiedOccurrenceCandidate[] = [
    {
      id: "occurrence-a",
      observedText: "Becos",
      fieldPath: "/answer/0",
      startUtf16: 0,
      endUtf16: 5,
      provenance: "learner_response",
    },
    {
      id: "occurrence-b",
      observedText: "becos",
      fieldPath: "/answer/0",
      startUtf16: 12,
      endUtf16: 17,
      provenance: "learner_response",
    },
  ];

  assert.deepEqual(
    resolveParentIdentifiedOccurrence({
      observedSpelling: "becos",
      candidates: repeated,
    }),
    {
      status: "ambiguous",
      matchingOccurrenceIds: ["occurrence-a", "occurrence-b"],
    },
  );
  assert.equal(
    resolveParentIdentifiedOccurrence({
      observedSpelling: "becos",
      explicitOccurrenceId: "occurrence-b",
      candidates: repeated,
    }).status,
    "resolved",
  );
  assert.equal(
    resolveParentIdentifiedOccurrence({
      observedSpelling: "because",
      explicitOccurrenceId: "occurrence-b",
      candidates: repeated,
    }).status,
    "observed_spelling_mismatch",
  );
  assert.equal(
    resolveParentIdentifiedOccurrence({
      observedSpelling: "becos",
      candidates: [{ ...repeated[0], provenance: "unknown" }],
    }).status,
    "unavailable",
  );

  const issue = {
    id: "issue-1",
    parent_user_id: "parent-1",
    child_id: "child-1",
    source_misspelling_instance_id: "misspelling-1",
    metadata: {},
  };
  const safePlan = {
    issueId: issue.id,
    safeToApply: true,
    routeSupport: { source: "admin_decision" },
  };
  let loaded = 0;
  let applied = 0;
  let continued = 0;
  const result = await continueUnknownErrorAfterAdminDecision({
    serviceClient: {} as never,
    adminCaseId: "case-1",
    nowIso: "2026-09-07T12:00:00.000Z",
    dependencies: {
      enabled: () => true,
      load: (async () => {
        loaded += 1;
        return {
          plans: [safePlan],
          issues: [issue],
          attempts: [],
          catalogEntries: [],
        } as never;
      }) as never,
      apply: (async () => {
        applied += 1;
        return { repaired: true, mutationCount: 3, reason: null };
      }) as never,
      continueOccurrence: (async () => {
        continued += 1;
        return { canonicalIntakeCandidateId: "intake-1" } as never;
      }) as never,
    },
  });
  assert.equal(result.status, "processed");
  assert.deepEqual(result.appliedIssueIds, ["issue-1"]);
  assert.deepEqual(result.canonicalIntakeCandidateIds, ["intake-1"]);
  assert.deepEqual(
    { loaded, applied, continued },
    { loaded: 1, applied: 1, continued: 1 },
  );

  const appliedReplayIssue = {
    ...issue,
    metadata: {
      returned_correction_stage_f_replay: {
        action: "attached_verified_route",
        route_source: "admin_decision",
        dry_run_first: true,
      },
    },
  };
  assert.equal(hasAppliedGovernedUnknownErrorReplay(appliedReplayIssue), true);
  applied = 0;
  continued = 0;
  await continueUnknownErrorAfterAdminDecision({
    serviceClient: {} as never,
    adminCaseId: "case-1",
    dependencies: {
      enabled: () => true,
      load: (async () => ({
        plans: [safePlan],
        issues: [appliedReplayIssue],
        attempts: [],
        catalogEntries: [],
      })) as never,
      apply: (async () => {
        applied += 1;
        return {} as never;
      }) as never,
      continueOccurrence: (async () => {
        continued += 1;
        return { canonicalIntakeCandidateId: "intake-1" } as never;
      }) as never,
    },
  });
  assert.deepEqual({ applied, continued }, { applied: 0, continued: 1 });

  loaded = 0;
  const disabled = await continueUnknownErrorAfterAdminDecision({
    serviceClient: {} as never,
    adminCaseId: "case-1",
    dependencies: {
      enabled: () => false,
      load: (async () => {
        loaded += 1;
        return {} as never;
      }) as never,
    },
  });
  assert.equal(disabled.status, "disabled");
  assert.equal(loaded, 0);

  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260907110000_integrate_whole_writing_unknown_error_intake.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    migration,
    /parent_verified_spelling_candidate_mappings[\s\S]*source_writing_occurrence_id/,
  );
  assert.match(
    migration,
    /adle_canonical_intake_candidates[\s\S]*source_writing_occurrence_id/,
  );
  assert.match(
    migration,
    /adle_learning_item_sources[\s\S]*source_writing_occurrence_id/,
  );
  assert.match(migration, /adle_authorize_governed_source_continuation_s7/);
  assert.doesNotMatch(migration, /insert into public\.adle_learning_items/);

  const parentForm = readFileSync(
    new URL(
      "../app/courses/review/parent-missed-word-form.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const reviewAction = readFileSync(
    new URL(
      "../app/courses/review/actions/lesson-submission-review-actions.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const adminAction = readFileSync(
    new URL("../app/admin/catalog-review/actions.ts", import.meta.url),
    "utf8",
  );
  assert.match(parentForm, /Where it appeared/);
  assert.match(
    reviewAction,
    /source_writing_occurrence_id: sourceWritingOccurrenceId/,
  );
  assert.match(adminAction, /continueUnknownErrorAfterAdminDecision/);

  console.log("Whole-writing S7 regression passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
