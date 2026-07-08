import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { moveGoldenNuggetIntoForgeFromDailyAssignmentItem } from "../lib/rewards/word-treasures";
import { completeDailySpellingPracticeItems } from "../lib/writing-practice/daily-spelling-practice-completion";

const CONFIRM = "LOCAL_WORD_TREASURE_FORGE_SMOKE";
const DAILY_PRACTICE_TITLE = "Daily spelling practice";
const PRACTICE_DATE = "2026-06-28";
const TARGET_WORD = "because";

function loadEnvFile(path: string) {
  if (!existsSync(path)) {
    return;
  }

  const content = readFileSync(path, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed
      .slice(equalsIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;

  return value && !value.startsWith("--") ? value : null;
}

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing ${name}.`);
  }

  return value;
}

function assertLocalSupabaseUrl(value: string) {
  const url = new URL(value);

  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("Refusing to run against a non-local Supabase URL.");
  }
}

function base64UrlJson(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createLocalServiceRoleKey() {
  const secret =
    process.env.SUPABASE_JWT_SECRET ??
    "super-secret-jwt-token-with-at-least-32-characters-long";
  const header = base64UrlJson({
    alg: "HS256",
    typ: "JWT",
  });
  const payload = base64UrlJson({
    iss: "supabase",
    ref: "local",
    role: "service_role",
    iat: 1641769200,
    exp: 1957345200,
  });
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

function assertNoError(error: { message?: string } | null, label: string) {
  if (error) {
    const details = [
      error.message,
      "name" in error && typeof error.name === "string" ? error.name : null,
      "status" in error && typeof error.status === "number"
        ? `status ${error.status}`
        : null,
      "code" in error && typeof error.code === "string" ? error.code : null,
    ]
      .filter(Boolean)
      .join("; ");

    throw new Error(`${label}: ${details || JSON.stringify(error)}`);
  }
}

async function countRows(
  supabase: ReturnType<typeof createClient<any, "public">>,
  table: string,
  childId: string,
) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("child_id", childId);

  assertNoError(error, `Failed to count ${table}`);

  return count ?? 0;
}

function assertRow<T>(value: T | null, label: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(`${label}: expected a row but received none.`);
  }
}

async function main() {
  const explicitServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  loadEnvFile(".env.local");

  const confirm = readArg("--confirm") ?? "";
  if (confirm !== CONFIRM) {
    throw new Error(`Refusing local smoke without --confirm ${CONFIRM}.`);
  }

  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() ??
    readRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  assertLocalSupabaseUrl(supabaseUrl);
  const serviceRoleKey = explicitServiceRoleKey ?? createLocalServiceRoleKey();

  process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const stamp = Date.now();
  const email = `phase-3-5-forge-smoke-${stamp}@example.test`;
  const password = `${randomUUID()}Aa1!`;
  let parentUserId: string | null = null;
  let childId: string | null = null;

  try {
    const { data: userData, error: userError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    assertNoError(userError, "Failed to create disposable auth user");
    parentUserId = userData.user?.id ?? null;

    if (!parentUserId) {
      throw new Error("Disposable auth user did not return an id.");
    }

    const { data: child, error: childError } = await supabase
      .from("children")
      .insert({
        parent_user_id: parentUserId,
        first_name: "ForgeSmoke",
      })
      .select("id")
      .single();
    assertNoError(childError, "Failed to create disposable child");
    assertRow(child, "Failed to create disposable child");
    childId = child.id as string;

    const { data: learningItem, error: learningItemError } = await supabase
      .from("learning_items")
      .insert({
        child_id: childId,
        parent_user_id: parentUserId,
        micro_skill_key: "phase_3_5_smoke_skill",
        progress_state: "golden_nugget",
        is_active: true,
        metadata: {
          target_word: TARGET_WORD,
          smoke: true,
        },
      })
      .select("id")
      .single();
    assertNoError(learningItemError, "Failed to create learning item");
    assertRow(learningItem, "Failed to create learning item");
    const learningItemId = learningItem.id as string;

    const { data: assignment, error: assignmentError } = await supabase
      .from("daily_assignments")
      .insert({
        child_id: childId,
        parent_user_id: parentUserId,
        assignment_date: PRACTICE_DATE,
        title: DAILY_PRACTICE_TITLE,
        status: "pending",
        assignment_generation_source: "learning_items",
        source_learning_item_ids: [learningItemId],
      })
      .select("id")
      .single();
    assertNoError(assignmentError, "Failed to create daily assignment");
    assertRow(assignment, "Failed to create daily assignment");
    const dailyAssignmentId = assignment.id as string;

    const { data: assignmentItem, error: assignmentItemError } = await supabase
      .from("assignment_items")
      .insert({
        daily_assignment_id: dailyAssignmentId,
        child_id: childId,
        parent_user_id: parentUserId,
        domain_module: "spelling",
        item_type: "controlled_spelling",
        source_type: "learning_item_evidence",
        source_entity_id: randomUUID(),
        learning_item_id: learningItemId,
        template_key: "phase_3_5_smoke_template",
        target_word: TARGET_WORD,
        prompt_data: {
          targetWord: TARGET_WORD,
        },
        expected_answer: {
          correctSpelling: TARGET_WORD,
        },
        position: 0,
        status: "ready",
        metadata: {
          smoke: true,
        },
      })
      .select("id, status")
      .single();
    assertNoError(assignmentItemError, "Failed to create assignment item");
    assertRow(assignmentItem, "Failed to create assignment item");
    const assignmentItemId = assignmentItem.id as string;

    const { data: treasure, error: treasureError } = await supabase
      .from("child_word_treasures")
      .insert({
        child_id: childId,
        parent_user_id: parentUserId,
        corrected_word: TARGET_WORD,
        corrected_word_normalized: TARGET_WORD,
        original_misspelling: "becuase",
        source_learning_item_id: learningItemId,
        micro_skill_key: "phase_3_5_smoke_skill",
        status: "golden_nugget",
        metadata: {
          smoke: true,
        },
      })
      .select("id, status, entered_forge_at")
      .single();
    assertNoError(treasureError, "Failed to create word treasure");
    assertRow(treasure, "Failed to create word treasure");
    const treasureId = treasure.id as string;

    const eventCountBeforeCompletion = await countRows(
      supabase,
      "child_word_treasure_events",
      childId,
    );

    if (treasure.status !== "golden_nugget" || treasure.entered_forge_at) {
      throw new Error("Assignment visibility moved the treasure before completion.");
    }

    if (eventCountBeforeCompletion !== 0) {
      throw new Error("Assignment visibility created a lifecycle event.");
    }

    const forbiddenTables = [
      "spelling_reward_states",
      "spelling_reward_events",
      "learning_item_evidence",
      "child_gold_coin_ledger_events",
    ];
    const forbiddenCountsBefore = new Map<string, number>();

    for (const table of forbiddenTables) {
      forbiddenCountsBefore.set(table, await countRows(supabase, table, childId));
    }

    const completion = await completeDailySpellingPracticeItems({
      supabase,
      parentUserId,
      childId,
      dailyAssignmentId,
      practiceDate: PRACTICE_DATE,
      moveGoldenNuggetIntoForge: (input) =>
        moveGoldenNuggetIntoForgeFromDailyAssignmentItem({
          ...input,
          supabase,
        }),
    });

    if (completion.completedItemCount !== 1) {
      throw new Error("Completion did not report the supported assignment item.");
    }

    const { data: completedItem, error: completedItemError } = await supabase
      .from("assignment_items")
      .select("status")
      .eq("id", assignmentItemId)
      .single();
    assertNoError(completedItemError, "Failed to reread assignment item");
    assertRow(completedItem, "Failed to reread assignment item");

    if (completedItem.status !== "completed") {
      throw new Error("Assignment item was not marked completed.");
    }

    const { data: forgedTreasure, error: forgedTreasureError } = await supabase
      .from("child_word_treasures")
      .select("status, entered_forge_at, source_learning_item_id")
      .eq("id", treasureId)
      .single();
    assertNoError(forgedTreasureError, "Failed to reread forged treasure");
    assertRow(forgedTreasure, "Failed to reread forged treasure");

    if (
      forgedTreasure.status !== "in_forge" ||
      !forgedTreasure.entered_forge_at ||
      forgedTreasure.source_learning_item_id !== learningItemId
    ) {
      throw new Error("Golden Nugget did not move into Forge correctly.");
    }

    const { data: forgeEvents, error: forgeEventsError } = await supabase
      .from("child_word_treasure_events")
      .select("id, event_type, source_type, source_entity_id, previous_status, new_status, metadata")
      .eq("treasure_id", treasureId)
      .eq("event_type", "entered_forge");
    assertNoError(forgeEventsError, "Failed to read Forge events");

    if ((forgeEvents ?? []).length !== 1) {
      throw new Error("Expected exactly one entered_forge event.");
    }

    const forgeEvent = forgeEvents?.[0] as {
      source_type: string;
      source_entity_id: string;
      previous_status: string;
      new_status: string;
      metadata: Record<string, unknown>;
    };

    if (
      forgeEvent.source_type !== "daily_assignment_item" ||
      forgeEvent.source_entity_id !== assignmentItemId ||
      forgeEvent.previous_status !== "golden_nugget" ||
      forgeEvent.new_status !== "in_forge" ||
      forgeEvent.metadata.daily_assignment_id !== dailyAssignmentId ||
      forgeEvent.metadata.learning_item_id !== learningItemId
    ) {
      throw new Error("Forge event metadata/source linkage is incorrect.");
    }

    await completeDailySpellingPracticeItems({
      supabase,
      parentUserId,
      childId,
      dailyAssignmentId,
      practiceDate: PRACTICE_DATE,
      moveGoldenNuggetIntoForge: (input) =>
        moveGoldenNuggetIntoForgeFromDailyAssignmentItem({
          ...input,
          supabase,
        }),
    });

    const eventCountAfterRepeat = await countRows(
      supabase,
      "child_word_treasure_events",
      childId,
    );

    if (eventCountAfterRepeat !== 1) {
      throw new Error("Repeated completion created a duplicate lifecycle event.");
    }

    const goldenBarAt = new Date().toISOString();
    const { error: laterStatusError } = await supabase
      .from("child_word_treasures")
      .update({
        status: "golden_bar",
        golden_bar_at: goldenBarAt,
      })
      .eq("id", treasureId);
    assertNoError(laterStatusError, "Failed to set later treasure status");

    const { error: resetItemError } = await supabase
      .from("assignment_items")
      .update({ status: "ready" })
      .eq("id", assignmentItemId);
    assertNoError(resetItemError, "Failed to reset assignment item for idempotency check");

    await completeDailySpellingPracticeItems({
      supabase,
      parentUserId,
      childId,
      dailyAssignmentId,
      practiceDate: PRACTICE_DATE,
      moveGoldenNuggetIntoForge: (input) =>
        moveGoldenNuggetIntoForgeFromDailyAssignmentItem({
          ...input,
          supabase,
        }),
    });

    const { data: laterTreasure, error: laterTreasureError } = await supabase
      .from("child_word_treasures")
      .select("status, golden_bar_at")
      .eq("id", treasureId)
      .single();
    assertNoError(laterTreasureError, "Failed to reread later treasure");
    assertRow(laterTreasure, "Failed to reread later treasure");

    if (laterTreasure.status !== "golden_bar" || !laterTreasure.golden_bar_at) {
      throw new Error("Completion rewrote or regressed a later Word Treasure status.");
    }

    const eventCountAfterLaterStatus = await countRows(
      supabase,
      "child_word_treasure_events",
      childId,
    );

    if (eventCountAfterLaterStatus !== 1) {
      throw new Error("Later-status completion created a duplicate Forge event.");
    }

    for (const table of forbiddenTables) {
      const before = forbiddenCountsBefore.get(table) ?? 0;
      const after = await countRows(supabase, table, childId);

      if (after !== before) {
        throw new Error(`${table} changed during the Forge smoke.`);
      }
    }

    console.log("Phase 3.5 Daily Assignment Forge smoke passed.");
    console.log(
      JSON.stringify(
        {
          assignmentItemId,
          childId,
          dailyAssignmentId,
          events: eventCountAfterLaterStatus,
          parentUserId,
          targetWord: TARGET_WORD,
          treasureId,
        },
        null,
        2,
      ),
    );
  } finally {
    if (parentUserId) {
      await supabase.auth.admin.deleteUser(parentUserId);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
