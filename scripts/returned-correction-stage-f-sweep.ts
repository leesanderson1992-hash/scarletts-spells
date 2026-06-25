import { createClient } from "@supabase/supabase-js";

import { summarizeReturnedCorrectionDeferredRouteReplayPlans } from "../lib/writing-engine/persistence/returned-correction-deferred-route-replay";
import {
  loadReturnedCorrectionDeferredRouteReplay,
  projectReturnedCorrectionReplayRecommendation,
  upsertReturnedCorrectionReplayRecommendations,
  type ReturnedCorrectionDeferredRouteReplayScope,
} from "../lib/writing-engine/persistence/returned-correction-deferred-route-replay-apply";

type Args = ReturnedCorrectionDeferredRouteReplayScope & {
  upsertRecommendations: boolean;
  supabaseUrl?: string;
  supabaseKey?: string;
  help: boolean;
};

const HELP = [
  "Returned-correction Stage F.3 replay recommendation sweep",
  "",
  "Dry-run by default:",
  "  npx tsx scripts/returned-correction-stage-f-sweep.ts --limit 100",
  "  npx tsx scripts/returned-correction-stage-f-sweep.ts --child-id <child-id> --limit 50",
  "",
  "Persist replay recommendations only with an explicit flag:",
  "  npx tsx scripts/returned-correction-stage-f-sweep.ts --limit 100 --upsert-recommendations",
  "",
  "Optional scope:",
  "  --child-id <child-id>",
  "  --submission-id <submission-id>",
  "  --canonical-mapping-id <mapping-id>",
  "  --admin-case-id <case-id>",
  "",
  "No learning-item apply is performed by this sweep.",
].join("\n");

function parseArgs(argv: string[]): Args {
  const args: Args = { upsertRecommendations: false, help: false };

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
      case "--canonical-mapping-id":
        args.canonicalMappingId = next();
        break;
      case "--admin-case-id":
        args.adminCaseId = next();
        break;
      case "--limit": {
        const limit = Number.parseInt(next(), 10);
        if (!Number.isFinite(limit) || limit <= 0) {
          throw new Error("--limit must be a positive integer.");
        }
        args.limit = limit;
        break;
      }
      case "--upsert-recommendations":
        args.upsertRecommendations = true;
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

function validateArgs(args: Args) {
  if (!args.limit) {
    throw new Error("Stage F sweep requires --limit.");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }

  validateArgs(args);

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
  const recommendations = loaded.plans
    .map((plan) => {
      const issue = loaded.issues.find((candidate) => candidate.id === plan.issueId);
      return issue
        ? projectReturnedCorrectionReplayRecommendation({
            issue,
            plan,
            metadata: {
              sweep_scope: args,
            },
          })
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  const summary = summarizeReturnedCorrectionDeferredRouteReplayPlans(loaded.plans);
  let upserted = 0;

  if (args.upsertRecommendations) {
    const result = await upsertReturnedCorrectionReplayRecommendations({
      supabase,
      rows: recommendations,
      nowIso,
      triggerSource: "sweep",
    });
    upserted = result.upserted;
  }

  console.log(
    JSON.stringify(
      {
        dryRun: !args.upsertRecommendations,
        learningItemApply: false,
        upsertedRecommendations: upserted,
        summary,
        recommendationCount: recommendations.length,
        recommendations,
        notes: args.upsertRecommendations
          ? [
              "Replay recommendations were upserted idempotently.",
              "No learning items, rewards, mastery, or daily assignments were mutated.",
            ]
          : [
              "Dry-run mode mutates nothing.",
              "Use --upsert-recommendations to persist pending or blocked replay recommendations.",
              "The sweep never applies learning-item mutations.",
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
