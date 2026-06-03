import { createClient } from "@supabase/supabase-js";

type Command = "create" | "cleanup";

type ParsedArgs = {
  command: Command;
  allowPendingCandidate: boolean;
  candidateId: string | null;
  recommendationId: string | null;
};

type CandidateMappingRow = {
  id: string;
  parent_user_id: string;
  child_id: string;
  parent_verification_id: string | null;
  task_submission_id: string | null;
  writing_sample_id: string | null;
  source_suggestion_id: string | null;
  source_misspelling_instance_id: string | null;
  source_provenance: string;
  reviewed_event_source_entity_id: string | null;
  original_child_spelling: string | null;
  original_correct_spelling: string | null;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  micro_skill_key: string;
  candidate_status: string;
  promotion_scope: string;
  metadata: Record<string, unknown> | null;
};

// Supabase's generated DB type is not wired into this standalone utility.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FixtureSupabaseClient = ReturnType<typeof createClient<any>>;

const FIXTURE_MARKER = "dev_pcrm_admin_recommendation_fixture";

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] === "cleanup" ? "cleanup" : "create";
  let allowPendingCandidate = false;
  let candidateId: string | null = null;
  let recommendationId: string | null = null;

  for (let index = command === "cleanup" ? 1 : 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--allow-pending-candidate") {
      allowPendingCandidate = true;
      continue;
    }

    if (current === "--candidate-id" && next) {
      candidateId = next.trim();
      index += 1;
      continue;
    }

    if (current === "--recommendation-id" && next) {
      recommendationId = next.trim();
      index += 1;
    }
  }

  return { command, allowPendingCandidate, candidateId, recommendationId };
}

function assertFixtureAllowed(url: string) {
  if (process.env.ALLOW_DEV_PCRM_FIXTURE !== "true") {
    throw new Error(
      "Refusing to run. Set ALLOW_DEV_PCRM_FIXTURE=true for local/staging fixture work.",
    );
  }

  const lowerUrl = url.toLowerCase();
  const hostname = new URL(url).hostname.toLowerCase();
  const envName = (
    process.env.NEXT_PUBLIC_VERCEL_ENV ??
    process.env.VERCEL_ENV ??
    process.env.NODE_ENV ??
    ""
  ).toLowerCase();

  if (
    envName === "production" ||
    lowerUrl.includes("prod") ||
    lowerUrl.includes("production")
  ) {
    throw new Error("Refusing to run against a production-like environment.");
  }

  const localTarget =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local");

  if (!localTarget && process.env.ALLOW_STAGING_PCRM_FIXTURE !== "true") {
    throw new Error(
      "Refusing to run against a non-local Supabase target without ALLOW_STAGING_PCRM_FIXTURE=true.",
    );
  }
}

function readStringMetadata(
  metadata: Record<string, unknown> | null,
  key: string,
) {
  const value = metadata?.[key];

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function getSourceRowType(candidate: CandidateMappingRow) {
  if (readStringMetadata(candidate.metadata, "source_route") === "returned_correction") {
    return "returned_correction";
  }

  if (candidate.source_provenance === "lesson_submission_parent_added_missed_word") {
    return "parent_added_missed_word";
  }

  return "engine_suggested";
}

async function findCandidate(input: {
  allowPendingCandidate: boolean;
  candidateId: string | null;
  supabase: FixtureSupabaseClient;
}) {
  const selectedColumns = [
    "id",
    "parent_user_id",
    "child_id",
    "parent_verification_id",
    "task_submission_id",
    "writing_sample_id",
    "source_suggestion_id",
    "source_misspelling_instance_id",
    "source_provenance",
    "reviewed_event_source_entity_id",
    "original_child_spelling",
    "original_correct_spelling",
    "misspelling_normalized",
    "correct_spelling_normalized",
    "micro_skill_key",
    "candidate_status",
    "promotion_scope",
    "metadata",
  ].join(", ");

  let query = input.supabase
    .from("parent_verified_spelling_candidate_mappings")
    .select(selectedColumns)
    .eq("promotion_scope", "parent_local")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (input.candidateId) {
    query = query.eq("id", input.candidateId);
  } else if (input.allowPendingCandidate) {
    query = query.in("candidate_status", [
      "parent_local_promoted",
      "pending_parent_promotion",
    ]);
  } else {
    query = query.eq("candidate_status", "parent_local_promoted");
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  const candidate = data as CandidateMappingRow | null;

  if (!candidate) {
    throw new Error(
      input.allowPendingCandidate
        ? "No parent-local candidate mapping found for fixture creation."
        : "No promoted parent-local candidate mapping found. Promote one first, pass --candidate-id, or rerun with --allow-pending-candidate for an admin-UI-only fixture.",
    );
  }

  if (
    candidate.candidate_status !== "parent_local_promoted" &&
    !input.allowPendingCandidate
  ) {
    throw new Error(
      "Candidate is not parent_local_promoted. Rerun with --allow-pending-candidate only for a dev/staging admin-UI fixture.",
    );
  }

  return candidate;
}

async function createFixture(input: {
  allowPendingCandidate: boolean;
  candidateId: string | null;
  supabase: FixtureSupabaseClient;
}) {
  const candidate = await findCandidate(input);
  const sourceRowType = getSourceRowType(candidate);
  const { data, error } = await input.supabase
    .from("spelling_canonical_mapping_recommendations")
    .insert({
      parent_user_id: candidate.parent_user_id,
      child_id: candidate.child_id,
      task_submission_id: candidate.task_submission_id,
      writing_sample_id: candidate.writing_sample_id,
      source_misspelling_instance_id: candidate.source_misspelling_instance_id,
      source_writing_issue_id:
        sourceRowType === "returned_correction"
          ? readStringMetadata(candidate.metadata, "original_writing_issue_id")
          : null,
      source_correction_attempt_id:
        sourceRowType === "returned_correction"
          ? readStringMetadata(candidate.metadata, "correction_attempt_id")
          : null,
      parent_verification_id: candidate.parent_verification_id,
      source_suggestion_id: candidate.source_suggestion_id,
      candidate_mapping_id: candidate.id,
      source_row_type: sourceRowType,
      source_provenance: candidate.source_provenance,
      reviewed_event_source_entity_id: candidate.reviewed_event_source_entity_id,
      original_child_spelling: candidate.original_child_spelling,
      original_correct_spelling: candidate.original_correct_spelling,
      misspelling_normalized: candidate.misspelling_normalized,
      correct_spelling_normalized: candidate.correct_spelling_normalized,
      micro_skill_key: candidate.micro_skill_key,
      recommendation_status: "pending_admin_review",
      recommendation_note: "Dev/staging PCRM admin curation smoke fixture.",
      metadata: {
        action_source: FIXTURE_MARKER,
        fixture_marker: FIXTURE_MARKER,
        cleanup_safe: true,
        resolver_visible: false,
        source_candidate_mapping_id: candidate.id,
        source_candidate_mapping_status: candidate.candidate_status,
        source_candidate_mapping_scope: candidate.promotion_scope,
      },
    })
    .select("id, misspelling_normalized, correct_spelling_normalized, micro_skill_key")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create PCRM fixture row.");
  }

  console.log("Created dev/staging PCRM recommendation fixture:");
  console.log(JSON.stringify(data, null, 2));
  console.log("");
  console.log("Cleanup command:");
  console.log(
    `ALLOW_DEV_PCRM_FIXTURE=true npx tsx scripts/dev-pcrm-recommendation-fixture.ts cleanup --recommendation-id ${data.id}`,
  );
}

async function cleanupFixture(input: {
  recommendationId: string | null;
  supabase: FixtureSupabaseClient;
}) {
  if (!input.recommendationId) {
    throw new Error("Cleanup requires --recommendation-id <fixture-row-id>.");
  }

  const { data: existing, error: readError } = await input.supabase
    .from("spelling_canonical_mapping_recommendations")
    .select("id, metadata")
    .eq("id", input.recommendationId)
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  const metadata =
    existing?.metadata && typeof existing.metadata === "object"
      ? (existing.metadata as Record<string, unknown>)
      : {};

  if (!existing || metadata.fixture_marker !== FIXTURE_MARKER) {
    throw new Error(
      "Refusing cleanup. The row was not found or does not carry the PCRM fixture marker.",
    );
  }

  const { error } = await input.supabase
    .from("spelling_canonical_mapping_recommendations")
    .delete()
    .eq("id", input.recommendationId)
    .eq("metadata->>fixture_marker", FIXTURE_MARKER);

  if (error) {
    throw error;
  }

  console.log(`Deleted PCRM recommendation fixture ${input.recommendationId}.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = readRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  assertFixtureAllowed(url);

  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  if (args.command === "cleanup") {
    await cleanupFixture({
      recommendationId: args.recommendationId,
      supabase,
    });
    return;
  }

  await createFixture({
    allowPendingCandidate: args.allowPendingCandidate,
    candidateId: args.candidateId,
    supabase,
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`PCRM fixture command failed: ${message}`);
  process.exitCode = 1;
});
