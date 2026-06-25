import { createClient } from "@supabase/supabase-js";

import { summarizeReturnedCorrectionDeferredRouteReplayPlans } from "../lib/writing-engine/persistence/returned-correction-deferred-route-replay";
import {
  applyReturnedCorrectionDeferredRouteReplayPlan,
  loadReturnedCorrectionDeferredRouteReplay,
  type ReturnedCorrectionDeferredRouteReplayScope,
} from "../lib/writing-engine/persistence/returned-correction-deferred-route-replay-apply";

type Args = ReturnedCorrectionDeferredRouteReplayScope & {
  apply: boolean;
  supabaseUrl?: string;
  supabaseKey?: string;
  help: boolean;
};

const HELP = [
  "Returned-correction Stage F deferred route replay",
  "",
  "Dry-run by default:",
  "  npx tsx scripts/returned-correction-stage-f-deferred-route-replay.ts --child-id <child-id>",
  "  npx tsx scripts/returned-correction-stage-f-deferred-route-replay.ts --admin-case-id <case-id>",
  "  npx tsx scripts/returned-correction-stage-f-deferred-route-replay.ts --canonical-mapping-id <mapping-id>",
  "",
  "Apply requires --apply plus one focused scope:",
  "  npx tsx scripts/returned-correction-stage-f-deferred-route-replay.ts --admin-case-id <case-id> --apply",
  "  npx tsx scripts/returned-correction-stage-f-deferred-route-replay.ts --writing-issue-id <issue-id> --apply",
  "  npx tsx scripts/returned-correction-stage-f-deferred-route-replay.ts --child-id <child-id> --limit <n> --apply",
  "",
  "Environment:",
  "  RETURNED_CORRECTION_REPLAY_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL",
  "  RETURNED_CORRECTION_REPLAY_SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, or NEXT_PUBLIC_SUPABASE_ANON_KEY",
].join("\n");

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    switch (arg) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--child-id":
        args.childId = next();
        break;
      case "--submission-id":
        args.submissionId = next();
        break;
      case "--writing-issue-id":
        args.writingIssueId = next();
        break;
      case "--admin-case-id":
        args.adminCaseId = next();
        break;
      case "--canonical-mapping-id":
        args.canonicalMappingId = next();
        break;
      case "--micro-skill-key":
        args.microSkillKey = next();
        break;
      case "--limit": {
        const limit = Number.parseInt(next(), 10);
        if (!Number.isFinite(limit) || limit <= 0) {
          throw new Error("--limit must be a positive integer.");
        }
        args.limit = limit;
        break;
      }
      case "--apply":
        args.apply = true;
        break;
      case "--supabase-url":
        args.supabaseUrl = next();
        break;
      case "--supabase-key":
        args.supabaseKey = next();
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  args.supabaseUrl =
    args.supabaseUrl ??
    process.env.RETURNED_CORRECTION_REPLAY_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  args.supabaseKey =
    args.supabaseKey ??
    process.env.RETURNED_CORRECTION_REPLAY_SUPABASE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return args;
}

function assertRequired(value: string | undefined, label: string) {
  if (!value?.trim()) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function validateScope(args: Args) {
  const hasAnyScope = Boolean(
    args.childId ||
      args.submissionId ||
      args.writingIssueId ||
      args.adminCaseId ||
      args.canonicalMappingId ||
      args.microSkillKey,
  );

  if (!hasAnyScope) {
    throw new Error(
      "Stage F requires targeted scope: --child-id, --submission-id, --writing-issue-id, --admin-case-id, --canonical-mapping-id, or --micro-skill-key.",
    );
  }

  if (
    args.apply &&
    !args.writingIssueId &&
    !args.adminCaseId &&
    !args.canonicalMappingId &&
    !args.submissionId &&
    !(args.childId && args.limit)
  ) {
    throw new Error(
      "Apply mode requires --writing-issue-id, --admin-case-id, --canonical-mapping-id, --submission-id, or --child-id plus --limit.",
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }

  validateScope(args);

  const supabaseUrl = assertRequired(args.supabaseUrl, "Supabase URL");
  const supabaseKey = assertRequired(args.supabaseKey, "Supabase key");
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const nowIso = new Date().toISOString();
  const loaded = await loadReturnedCorrectionDeferredRouteReplay({
    supabase,
    scope: args,
  });
  const summary = summarizeReturnedCorrectionDeferredRouteReplayPlans(loaded.plans);
  let mutationsApplied = 0;
  const repairedIssueIds: string[] = [];
  const skipped = loaded.plans.map((plan) => ({
    issueId: plan.issueId,
    bucket: plan.bucket,
    reason: plan.reasons.join(" "),
  }));

  if (args.apply) {
    for (const plan of loaded.plans) {
      const issue = loaded.issues.find((candidate) => candidate.id === plan.issueId);
      if (!issue || !plan.safeToApply) {
        continue;
      }

      const result = await applyReturnedCorrectionDeferredRouteReplayPlan({
        supabase,
        issue,
        attempts: loaded.attempts.filter(
          (attempt) => attempt.writing_issue_id === issue.id,
        ),
        plan,
        catalogEntries: loaded.catalogEntries,
        nowIso,
      });
      mutationsApplied += result.mutationCount;
      if (result.repaired) {
        repairedIssueIds.push(plan.issueId);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun: !args.apply,
        mutationsApplied,
        summary,
        repairedIssueIds,
        skippedIssueIds: skipped.filter((row) => !repairedIssueIds.includes(row.issueId)),
        proposedMutations: loaded.plans.flatMap((plan) => plan.proposedMutations),
        rows: loaded.plans,
        idempotencyNotes: args.apply
          ? [
              "Issue links are checked before insert and protected by the learning_item_issue_links unique index.",
              "Stage F evidence rows include correction_attempt_id metadata and are checked before insert.",
              "Running apply again should report zero new replay mutations for rows already linked.",
            ]
          : [
              "Dry-run mode does not write data.",
              "Use --apply with a focused scope to mutate safe rows.",
              "Canonical/admin route support alone is insufficient without preserved learning-relevant final classification.",
            ],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
