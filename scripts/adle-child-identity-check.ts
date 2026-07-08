import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;
  return value && !value.startsWith("--") ? value : null;
}

function requiredArg(name: string): string {
  const value = readArg(name);
  if (!value) {
    throw new Error(`Missing ${name} <value>.`);
  }
  return value;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Run with --env-file=.env.local or set the environment explicitly.`);
  }
  return value;
}

async function countRows(
  client: SupabaseClient,
  table: string,
  childId: string,
): Promise<number | string> {
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("child_id", childId);
  if (error) {
    return `error: ${error.message}`;
  }
  return count ?? 0;
}

async function main(): Promise<void> {
  const parentUserId = requiredArg("--parent-user-id");
  const json = process.argv.includes("--json");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: children, error } = await client
    .from("children")
    .select("id, parent_user_id, first_name, last_name, is_archived, created_at")
    .eq("parent_user_id", parentUserId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`children: ${error.message}`);
  }

  const summaries = [];
  for (const child of (children ?? []) as {
    id: string;
    parent_user_id: string;
    first_name: string | null;
    last_name: string | null;
    is_archived?: boolean | null;
    created_at?: string | null;
  }[]) {
    const displayName = [child.first_name, child.last_name].filter(Boolean).join(" ");
    const looksLikeTest =
      /\btest\b/i.test(displayName) ||
      /^test/i.test(displayName) ||
      /seed/i.test(displayName) ||
      child.id.startsWith("00000000-");
    summaries.push({
      id: child.id,
      parentUserId: child.parent_user_id,
      displayName,
      isArchived: child.is_archived ?? false,
      createdAt: child.created_at ?? null,
      seedOrTestSignal: looksLikeTest
        ? "name/id suggests seed or test data; do not use for live pilot without explicit approval"
        : "no obvious seed/test signal from name or id",
      counts: {
        adleLearningItems: await countRows(client, "adle_learning_items", child.id),
        dailyAssignments: await countRows(client, "daily_assignments", child.id),
        assignmentItems: await countRows(client, "assignment_items", child.id),
        adleReviewBundles: await countRows(client, "adle_review_bundles", child.id),
        adleReviewScheduleWords: await countRows(client, "adle_review_schedule_words", child.id),
        adleTaughtWordHistory: await countRows(client, "adle_taught_word_history", child.id),
        adleReviewOutcomeEvents: await countRows(client, "adle_review_outcome_events", child.id),
        adleAuthenticUseEvents: await countRows(client, "adle_authentic_use_events", child.id),
        adleSlippageEvents: await countRows(client, "adle_slippage_events", child.id),
        childWordTreasures: await countRows(client, "child_word_treasures", child.id),
      },
    });
  }

  const result = {
    mode: "read_only_child_identity_check",
    parentUserId,
    checkedAt: new Date().toISOString(),
    childCount: summaries.length,
    children: summaries,
    guidance:
      "Choose the real child record explicitly before running ADLE generation. Test Scarlett or seed-looking rows must be isolated from the live pilot unless separately approved.",
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`ADLE child identity check for parent ${parentUserId}`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
