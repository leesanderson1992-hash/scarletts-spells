import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

// Dry-run first:
// npm run maintenance:duplicate-submission-cleanup -- --parent-user-id UUID
//   --child-id UUID --course-id UUID --task-id UUID --from ISO --to ISO
// Apply only after reviewing the emitted audit JSON:
// ...same scope... --apply --audit-file PATH --confirm-delete-duplicates

type Args = {
  parentUserId: string;
  childId: string;
  taskId: string;
  courseId: string;
  from: string;
  to: string;
  apply: boolean;
  auditFile: string | null;
  confirm: boolean;
};

type Submission = {
  id: string;
  submission_text: string;
  submitted_at: string;
  parent_review_status: "pending" | "approved" | "returned";
  parent_review_note: string | null;
  parent_reviewed_at: string | null;
};

type Audit = {
  version: 1;
  scope: Omit<Args, "apply" | "auditFile" | "confirm">;
  generatedAt: string;
  canonicalSubmissionId: string;
  duplicateSubmissionIds: string[];
  normalizedTextHash: string;
  payloadHashes: Record<string, string | null>;
  dependentCounts: Record<string, number>;
};

function valueAfter(argv: string[], name: string) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? "" : "";
}

function parseArgs(argv: string[]): Args {
  const args = {
    parentUserId: valueAfter(argv, "--parent-user-id"),
    childId: valueAfter(argv, "--child-id"),
    taskId: valueAfter(argv, "--task-id"),
    courseId: valueAfter(argv, "--course-id"),
    from: valueAfter(argv, "--from"),
    to: valueAfter(argv, "--to"),
    apply: argv.includes("--apply"),
    auditFile: valueAfter(argv, "--audit-file") || null,
    confirm: argv.includes("--confirm-delete-duplicates"),
  };
  const uuid = /^[0-9a-f-]{36}$/i;
  if (![args.parentUserId, args.childId, args.taskId, args.courseId].every((value) => uuid.test(value))) {
    throw new Error("Exact --parent-user-id, --child-id, --task-id and --course-id UUIDs are required.");
  }
  if (!args.from || !args.to || Number.isNaN(Date.parse(args.from)) || Number.isNaN(Date.parse(args.to))) {
    throw new Error("Exact ISO --from and --to incident timestamps are required.");
  }
  if (Date.parse(args.from) >= Date.parse(args.to)) throw new Error("--from must precede --to.");
  if (args.apply && (!args.auditFile || !args.confirm)) {
    throw new Error("Apply requires a reviewed --audit-file and --confirm-delete-duplicates.");
  }
  return args;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizePayload(value: unknown) {
  if (!value || Array.isArray(value) || typeof value !== "object") return value;
  const payload = { ...(value as Record<string, unknown>) };
  // These are generated independently for every HTTP request. The durable
  // lesson answers and identity fields must still match exactly.
  delete payload.draft_saved_at;
  delete payload.submitted_at;
  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from("task_submissions")
    .select("id, submission_text, submitted_at, parent_review_status, parent_review_note, parent_reviewed_at")
    .eq("parent_user_id", args.parentUserId)
    .eq("child_id", args.childId)
    .eq("task_id", args.taskId)
    .eq("course_id", args.courseId)
    .gte("submitted_at", args.from)
    .lt("submitted_at", args.to)
    .order("submitted_at", { ascending: true });
  if (error) throw error;
  const submissions = (data ?? []) as Submission[];
  if (submissions.length < 2) throw new Error(`Expected duplicates; found ${submissions.length} scoped submission(s).`);

  const textHashes = new Set(submissions.map((row) => hash(normalizeText(row.submission_text))));
  if (textHashes.size !== 1) throw new Error("Scoped submissions differ materially; automatic cleanup refused.");

  const nonPending = submissions.filter(
    (row) => row.parent_review_status !== "pending" || row.parent_review_note || row.parent_reviewed_at,
  );
  if (nonPending.length > 1) throw new Error("More than one submission contains review truth; automatic cleanup refused.");

  const ids = submissions.map((row) => row.id);
  const { data: payloadRows, error: payloadError } = await supabase
    .from("task_submission_payloads")
    .select("submission_id, payload_json")
    .in("submission_id", ids);
  if (payloadError) throw payloadError;
  const payloadHashes = Object.fromEntries(ids.map((id) => [id, null])) as Record<string, string | null>;
  for (const row of payloadRows ?? []) {
    payloadHashes[row.submission_id] = hash(stable(normalizePayload(row.payload_json)));
  }
  const distinctPayloadHashes = new Set(Object.values(payloadHashes).filter(Boolean));
  if (distinctPayloadHashes.size > 1) throw new Error("Structured payloads differ materially; automatic cleanup refused.");

  const canonical = submissions[submissions.length - 1];
  if (nonPending.some((row) => row.id !== canonical.id)) {
    throw new Error("An earlier submission contains review truth; refusing to delete it in favour of the latest submission.");
  }
  if (!payloadHashes[canonical.id] && Object.values(payloadHashes).some(Boolean)) {
    throw new Error("The latest submission has no structured payload but an earlier submission does; automatic cleanup refused.");
  }
  const duplicateIds = ids.filter((id) => id !== canonical.id);

  const protectedTables = [
    "learning_item_evidence",
    "parent_verifications",
    "parent_verified_spelling_candidate_mappings",
    "writing_issue_correction_attempts",
    "writing_issue_suggestions",
    "writing_issues",
    "spelling_canonical_mapping_recommendations",
    "spelling_catalog_review_cases",
  ] as const;
  const dependentCounts: Record<string, number> = {};
  for (const table of protectedTables) {
    const { count, error: countError } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .in("task_submission_id", duplicateIds);
    if (countError) throw countError;
    dependentCounts[table] = count ?? 0;
  }
  const protectedCount = Object.values(dependentCounts).reduce((sum, count) => sum + count, 0);
  if (protectedCount > 0) {
    throw new Error(`Duplicate submissions have ${protectedCount} protected review/evidence row(s); automatic cleanup refused.`);
  }

  const { count: treasureCount, error: treasureError } = await supabase
    .from("child_word_treasures")
    .select("*", { count: "exact", head: true })
    .in("source_submission_id", duplicateIds);
  if (treasureError) throw treasureError;
  dependentCounts.child_word_treasures = treasureCount ?? 0;
  if (treasureCount) throw new Error("A duplicate submission has confirmed reward truth; cleanup refused.");

  const { data: evidenceRows, error: evidenceError } = await supabase
    .from("child_word_treasure_evidence_candidates")
    .select("id, confirmation_status")
    .in("task_submission_id", duplicateIds);
  if (evidenceError) throw evidenceError;
  if ((evidenceRows ?? []).some((row) => row.confirmation_status === "confirmed")) {
    throw new Error("A duplicate submission has confirmed Word Treasure evidence; cleanup refused.");
  }
  dependentCounts.child_word_treasure_evidence_candidates = evidenceRows?.length ?? 0;
  const { data: sampleRows, error: sampleError } = await supabase
    .from("writing_samples")
    .select("id")
    .in("task_submission_id", duplicateIds);
  if (sampleError) throw sampleError;
  dependentCounts.writing_samples = sampleRows?.length ?? 0;

  const audit: Audit = {
    version: 1,
    scope: {
      parentUserId: args.parentUserId,
      childId: args.childId,
      taskId: args.taskId,
      courseId: args.courseId,
      from: args.from,
      to: args.to,
    },
    generatedAt: new Date().toISOString(),
    canonicalSubmissionId: canonical.id,
    duplicateSubmissionIds: duplicateIds,
    normalizedTextHash: [...textHashes][0],
    payloadHashes,
    dependentCounts,
  };

  if (!args.apply) {
    const output = resolve(`duplicate-submission-audit-${Date.now()}.json`);
    writeFileSync(output, `${JSON.stringify(audit, null, 2)}\n`, { flag: "wx" });
    console.log(JSON.stringify({ mode: "dry-run", auditFile: output, ...audit }, null, 2));
    return;
  }

  const reviewedAudit = JSON.parse(readFileSync(resolve(args.auditFile!), "utf8")) as Audit;
  if (
    reviewedAudit.version !== 1 ||
    stable(reviewedAudit.scope) !== stable(audit.scope) ||
    reviewedAudit.canonicalSubmissionId !== audit.canonicalSubmissionId ||
    stable(reviewedAudit.duplicateSubmissionIds) !== stable(audit.duplicateSubmissionIds) ||
    reviewedAudit.normalizedTextHash !== audit.normalizedTextHash ||
    stable(reviewedAudit.payloadHashes) !== stable(audit.payloadHashes) ||
    stable(reviewedAudit.dependentCounts) !== stable(audit.dependentCounts)
  ) {
    throw new Error("Current production rows do not exactly match the reviewed audit; apply refused.");
  }

  const { data: deletedCount, error: deleteError } = await supabase.rpc(
    "cleanup_verified_duplicate_task_submissions",
    {
      p_parent_user_id: args.parentUserId,
      p_canonical_submission_id: canonical.id,
      p_duplicate_submission_ids: duplicateIds,
    },
  );
  if (deleteError) throw deleteError;
  if (deletedCount !== duplicateIds.length) {
    throw new Error(`Atomic cleanup reported ${deletedCount} deletions; expected ${duplicateIds.length}.`);
  }

  const { count: remaining, error: verifyError } = await supabase
    .from("task_submissions")
    .select("*", { count: "exact", head: true })
    .in("id", ids);
  if (verifyError || remaining !== 1) throw verifyError ?? new Error(`Post-cleanup verification found ${remaining} rows.`);
  console.log(JSON.stringify({ mode: "applied", canonicalSubmissionId: canonical.id, deleted: duplicateIds.length }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
