/**
 * Controlled backfill for unresolved returned corrections that can now be
 * pre-resolved from one governed resolver-visible canonical exact pair.
 *
 * Dry-run (default):
 *   npm run writing-engine:returned-known-match-backfill -- --issue-id <uuid>
 *
 * Apply:
 *   RETURNED_KNOWN_MATCH_BACKFILL=apply npm run \
 *     writing-engine:returned-known-match-backfill -- --issue-id <uuid>
 */
import { createServiceRoleClient } from "../lib/supabase/service-role";
import {
  preResolveReturnedCorrectionKnownMatch,
  type ReturnedCorrectionKnownMatchIssue,
} from "../lib/writing-engine/persistence/returned-correction-known-match";

const APPLY_CONFIRMATION = "apply";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function valuesForFlag(flag: string) {
  return process.argv.flatMap((value, index) =>
    value === flag && typeof process.argv[index + 1] === "string"
      ? [process.argv[index + 1]!]
      : [],
  );
}

async function main() {
  const issueIds = [...new Set(valuesForFlag("--issue-id"))];
  const submissionIds = [...new Set(valuesForFlag("--submission-id"))];

  if (issueIds.length === 0 && submissionIds.length === 0) {
    throw new Error(
      "Provide at least one exact --issue-id or --submission-id. Broad backfills are not allowed.",
    );
  }

  const invalidIds = [...issueIds, ...submissionIds].filter(
    (value) => !UUID_PATTERN.test(value),
  );
  if (invalidIds.length > 0) {
    throw new Error(`Backfill ids must be UUIDs: ${invalidIds.join(", ")}`);
  }

  const apply =
    process.env.RETURNED_KNOWN_MATCH_BACKFILL === APPLY_CONFIRMATION;
  const supabase = createServiceRoleClient();
  let query = supabase
    .from("writing_issues")
    .select(
      "id, child_id, parent_user_id, task_submission_id, source_misspelling_instance_id, issue_status, final_classification, observed_text, suggested_replacement, approved_replacement, micro_skill_key, metadata",
    )
    .eq("issue_status", "child_responded")
    .is("final_classification", null);

  if (issueIds.length > 0 && submissionIds.length > 0) {
    query = query.or(
      `id.in.(${issueIds.join(",")}),task_submission_id.in.(${submissionIds.join(",")})`,
    );
  } else if (issueIds.length > 0) {
    query = query.in("id", issueIds);
  } else {
    query = query.in("task_submission_id", submissionIds);
  }

  const { data, error } = await query.order("created_at", {
    ascending: true,
  });
  if (error) throw error;

  const issues = (data ?? []) as Array<
    ReturnedCorrectionKnownMatchIssue & {
      task_submission_id: string;
      source_misspelling_instance_id: string | null;
    }
  >;
  const sourceMisspellingIds = issues
    .map((issue) => issue.source_misspelling_instance_id)
    .filter((value): value is string => Boolean(value));
  const [candidateResult, catalogResult] = await Promise.all([
    sourceMisspellingIds.length > 0
      ? supabase
          .from("parent_verified_spelling_candidate_mappings")
          .select("source_misspelling_instance_id")
          .in("source_misspelling_instance_id", sourceMisspellingIds)
          .in("candidate_status", [
            "pending_parent_promotion",
            "parent_local_promoted",
          ])
      : Promise.resolve({ data: [], error: null }),
    sourceMisspellingIds.length > 0
      ? supabase
          .from("spelling_catalog_review_cases")
          .select("source_misspelling_instance_id")
          .in("source_misspelling_instance_id", sourceMisspellingIds)
          .eq("case_status", "open")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (candidateResult.error) throw candidateResult.error;
  if (catalogResult.error) throw catalogResult.error;

  const handedOffIds = new Set(
    [...(candidateResult.data ?? []), ...(catalogResult.data ?? [])]
      .map((row) => row.source_misspelling_instance_id)
      .filter((value): value is string => Boolean(value)),
  );
  const results: Array<Record<string, unknown>> = [];

  for (const issue of issues) {
    if (
      issue.source_misspelling_instance_id &&
      handedOffIds.has(issue.source_misspelling_instance_id)
    ) {
      results.push({
        issueId: issue.id,
        submissionId: issue.task_submission_id,
        status: "skipped_admin_handoff_exists",
      });
      continue;
    }

    const result = await preResolveReturnedCorrectionKnownMatch({
      supabase,
      issue,
      persist: apply,
    });
    results.push({
      issueId: issue.id,
      submissionId: issue.task_submission_id,
      observedText: issue.observed_text,
      correctedText:
        issue.approved_replacement ?? issue.suggested_replacement,
      ...result,
    });
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry_run",
        requestedIssueIds: issueIds,
        requestedSubmissionIds: submissionIds,
        matchedIssueCount: issues.length,
        results,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
