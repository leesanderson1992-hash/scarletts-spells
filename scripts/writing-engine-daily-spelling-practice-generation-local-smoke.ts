import { createClient } from "@supabase/supabase-js";

import { generateDailySpellingPracticeAssignment } from "../lib/writing-practice/daily-spelling-practice-generation";

const LOCAL_CONFIRM = "LOCAL_DAILY_SPELLING_PRACTICE_SMOKE";
const DAILY_PRACTICE_TITLE = "Daily spelling practice";

type Args = {
  childId?: string;
  confirm?: string;
  help?: boolean;
  parentUserId?: string;
  practiceDate?: string;
  supabaseServiceRoleKey?: string;
  supabaseUrl?: string;
};

type AssignmentItemSmokeRow = {
  id: string;
  daily_assignment_id: string;
  parent_user_id: string;
  learning_item_id: string | null;
  item_type: string;
  target_word: string | null;
  template_key: string | null;
  source_type: string;
  source_entity_id: string;
  position: number;
};

type SmokeQueryError = {
  message: string;
};

type SmokeQueryBuilder = {
  select(columns: string): SmokeQueryBuilder;
  eq(column: string, value: unknown): SmokeQueryBuilder;
  maybeSingle(): Promise<{
    data: unknown;
    error: SmokeQueryError | null;
  }>;
  order(
    column: string,
    options: {
      ascending: boolean;
    },
  ): Promise<{
    data: unknown[] | null;
    error: SmokeQueryError | null;
  }>;
};

type SmokeSupabaseClient = {
  from: (table: string) => SmokeQueryBuilder;
};

function parseArgs(argv: string[]) {
  const args: Args = {};

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
      case "--confirm":
        args.confirm = next();
        break;
      case "--parent-user-id":
        args.parentUserId = next();
        break;
      case "--practice-date":
        args.practiceDate = next();
        break;
      case "--supabase-service-role-key":
        args.supabaseServiceRoleKey = next();
        break;
      case "--supabase-url":
        args.supabaseUrl = next();
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  args.supabaseUrl =
    args.supabaseUrl ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  args.supabaseServiceRoleKey =
    args.supabaseServiceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  args.confirm = args.confirm ?? "";

  return args;
}

function help() {
  return [
    "Slice 6C local daily spelling practice generation smoke",
    "",
    "Usage:",
    `  npm run writing-engine:daily-spelling-practice-generation-local-smoke -- --supabase-url http://127.0.0.1:54321 --supabase-service-role-key <local-service-role-key> --parent-user-id <uuid> --child-id <uuid> --practice-date 2026-06-24 --confirm ${LOCAL_CONFIRM}`,
    "",
    "This smoke is local-only. It does not seed learning truth, create rewards, mark sessions complete, or add child UI.",
  ].join("\n");
}

function assertNonEmpty(value: string | undefined, label: string) {
  if (!value?.trim()) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function assertPracticeDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Practice date must be YYYY-MM-DD.");
  }

  return value;
}

function isLocalSupabaseUrl(value: string) {
  const parsed = new URL(value);
  return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
}

function assertAllowedTarget(args: Args) {
  const supabaseUrl = assertNonEmpty(args.supabaseUrl, "Supabase URL");
  const supabaseServiceRoleKey = assertNonEmpty(
    args.supabaseServiceRoleKey,
    "Supabase service-role key",
  );

  if (!isLocalSupabaseUrl(supabaseUrl)) {
    throw new Error("Slice 6C smoke refuses non-local Supabase targets.");
  }

  if (args.confirm !== LOCAL_CONFIRM) {
    throw new Error(`Refusing local smoke without --confirm ${LOCAL_CONFIRM}.`);
  }

  return {
    supabaseServiceRoleKey,
    supabaseUrl,
  };
}

function duplicateKey(row: AssignmentItemSmokeRow) {
  return [
    row.daily_assignment_id,
    row.parent_user_id,
    row.learning_item_id ?? "",
    row.item_type,
    row.target_word ?? "",
    row.template_key ?? "",
    row.source_type,
    row.source_entity_id,
  ].join("|");
}

function getDuplicateKeys(rows: AssignmentItemSmokeRow[]) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const key = duplicateKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
}

async function fetchDailyAssignment(input: {
  client: SmokeSupabaseClient;
  childId: string;
  parentUserId: string;
  practiceDate: string;
}) {
  const { data, error } = await input.client
    .from("daily_assignments")
    .select("id, status, assignment_generation_source, source_learning_item_ids")
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .eq("assignment_date", input.practiceDate)
    .eq("title", DAILY_PRACTICE_TITLE)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to inspect daily assignment: ${error.message}`);
  }

  return data as {
    id: string;
    status: string;
    assignment_generation_source: string | null;
    source_learning_item_ids: string[] | null;
  } | null;
}

async function fetchAssignmentItems(input: {
  client: SmokeSupabaseClient;
  dailyAssignmentId: string;
  parentUserId: string;
}) {
  const { data, error } = await input.client
    .from("assignment_items")
    .select(
      [
        "id",
        "daily_assignment_id",
        "parent_user_id",
        "learning_item_id",
        "item_type",
        "target_word",
        "template_key",
        "source_type",
        "source_entity_id",
        "position",
      ].join(", "),
    )
    .eq("daily_assignment_id", input.dailyAssignmentId)
    .eq("parent_user_id", input.parentUserId)
    .order("position", { ascending: true });

  if (error) {
    throw new Error(`Unable to inspect assignment items: ${error.message}`);
  }

  return (data ?? []) as AssignmentItemSmokeRow[];
}

function summarizeCandidateResults(
  results: Awaited<ReturnType<typeof generateDailySpellingPracticeAssignment>>["candidateResults"],
) {
  const candidates = results.filter((result) => result.status === "candidate").length;
  const skippedReasons = results.flatMap((result) =>
    result.status === "skipped" ? [result.reason] : [],
  );

  return {
    candidates,
    skipped: skippedReasons.length,
    skippedReasons,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(help());
    return;
  }

  const target = assertAllowedTarget(args);
  const parentUserId = assertNonEmpty(args.parentUserId, "Parent user ID");
  const childId = assertNonEmpty(args.childId, "Child ID");
  const practiceDate = assertPracticeDate(
    assertNonEmpty(args.practiceDate, "Practice date"),
  );
  const client = createClient(target.supabaseUrl, target.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
    },
  });

  const firstResult = await generateDailySpellingPracticeAssignment({
    supabase: client as never,
    parentUserId,
    childId,
    practiceDate,
  });

  if (
    firstResult.status === "empty_plan" ||
    firstResult.status === "blocked_closed_daily_assignment"
  ) {
    const summary = summarizeCandidateResults(firstResult.candidateResults);
    console.log("Daily spelling practice local smoke");
    console.log(`Practice date: ${firstResult.practiceDate}`);
    console.log(`Status: ${firstResult.status}`);
    console.log(`Planner selected: ${firstResult.plan.selectedLearningItemIds.length}`);
    console.log(
      `Candidates: ${summary.candidates} candidate, ${summary.skipped} skipped`,
    );
    console.log("First run appended: 0");
    console.log("Second run appended: not run");
    console.log(`Daily assignment: ${firstResult.dailyAssignmentId ?? "none"}`);
    console.log("Duplicate safety: not exercised");
    console.log("Reward writes: not invoked by this path");
    return;
  }

  const secondResult = await generateDailySpellingPracticeAssignment({
    supabase: client as never,
    parentUserId,
    childId,
    practiceDate,
  });
  const dailyAssignment = await fetchDailyAssignment({
    client: (client as unknown) as SmokeSupabaseClient,
    parentUserId,
    childId,
    practiceDate,
  });
  const assignmentItems = dailyAssignment
    ? await fetchAssignmentItems({
        client: (client as unknown) as SmokeSupabaseClient,
        dailyAssignmentId: dailyAssignment.id,
        parentUserId,
      })
    : [];
  const duplicateKeys = getDuplicateKeys(assignmentItems);
  const firstSummary = summarizeCandidateResults(firstResult.candidateResults);

  if (secondResult.status !== "generated") {
    throw new Error(`Expected second generation to run, got ${secondResult.status}.`);
  }

  if (secondResult.dailyAssignmentId !== firstResult.dailyAssignmentId) {
    throw new Error("Second generation did not reuse the same daily assignment.");
  }

  if (secondResult.appendedItems.length !== 0) {
    throw new Error("Second generation appended duplicate assignment items.");
  }

  if (duplicateKeys.length > 0) {
    throw new Error(
      `Duplicate assignment item keys found after smoke: ${duplicateKeys.join(", ")}`,
    );
  }

  console.log("Daily spelling practice local smoke");
  console.log(`Practice date: ${firstResult.practiceDate}`);
  console.log(`Planner selected: ${firstResult.plan.selectedLearningItemIds.length}`);
  console.log(
    `Candidates: ${firstSummary.candidates} candidate, ${firstSummary.skipped} skipped`,
  );
  console.log(
    `Skipped reasons: ${
      firstSummary.skippedReasons.length > 0
        ? firstSummary.skippedReasons.join(", ")
        : "none"
    }`,
  );
  console.log(`First run appended: ${firstResult.appendedItems.length}`);
  console.log(`Second run appended: ${secondResult.appendedItems.length}`);
  console.log(`Daily assignment: ${firstResult.dailyAssignmentId}`);
  console.log("Duplicate safety: passed");
  console.log("Reward writes: not invoked by this path");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
