/**
 * Dry-run-first linkage reconciliation. It only links existing active ADLE
 * learning items to existing active word schedules; it never creates a word,
 * micro-skill, learning item, assignment, outcome, or reward.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- operational reconciliation reads additive tables absent from generated types */
import { createClient } from "@supabase/supabase-js";

const APPLY_TOKEN = "APPLY_ADLE_SHARED_ROUTE_LINKS_TO_STAGING";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  if (apply && process.argv.at(-1) !== APPLY_TOKEN) {
    throw new Error(
      `Refusing mutation without final confirmation token ${APPLY_TOKEN}.`,
    );
  }
  const db = createClient(
    required("STAGING_SUPABASE_URL"),
    required("STAGING_SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
  const [
    { data: schedules, error: scheduleError },
    { data: items, error: itemError },
  ] = await Promise.all([
    db
      .from("adle_review_schedule_words")
      .select("id,child_id,canonical_word_id,taught_on")
      .eq("row_status", "active")
      .limit(10000),
    db
      .from("adle_learning_items")
      .select(
        "id,child_id,canonical_word_id,micro_skill_key,intake_on,item_status",
      )
      .eq("row_status", "active")
      .neq("item_status", "resolved")
      .limit(10000),
  ]);
  if (scheduleError)
    throw new Error(`Read schedules: ${scheduleError.message}`);
  if (itemError) throw new Error(`Read learning items: ${itemError.message}`);
  const scheduleIds = (schedules ?? []).map((row: any) => row.id as string);
  const { data: links, error: linkError } = scheduleIds.length
    ? await db
        .from("adle_review_schedule_word_routes")
        .select("schedule_word_id,learning_item_id,row_status")
        .in("schedule_word_id", scheduleIds)
        .eq("row_status", "active")
        .limit(20000)
    : { data: [], error: null };
  if (linkError) throw new Error(`Read route links: ${linkError.message}`);

  const itemByChildWord = new Map<string, any[]>();
  for (const item of items ?? []) {
    const key = `${(item as any).child_id}\u0000${(item as any).canonical_word_id}`;
    const rows = itemByChildWord.get(key) ?? [];
    rows.push(item);
    itemByChildWord.set(key, rows);
  }
  const linked = new Set(
    (links ?? []).map(
      (row: any) => `${row.schedule_word_id}\u0000${row.learning_item_id}`,
    ),
  );
  const proposed: any[] = [];
  const multiSkillWords: Array<{
    childId: string;
    canonicalWordId: string;
    microSkillKeys: string[];
  }> = [];
  for (const schedule of schedules ?? []) {
    const key = `${(schedule as any).child_id}\u0000${(schedule as any).canonical_word_id}`;
    const routeItems = [...(itemByChildWord.get(key) ?? [])].sort((a, b) =>
      a.intake_on !== b.intake_on
        ? `${a.intake_on}`.localeCompare(`${b.intake_on}`)
        : `${a.id}`.localeCompare(`${b.id}`),
    );
    const skills = [
      ...new Set(routeItems.map((item) => item.micro_skill_key as string)),
    ].sort();
    if (skills.length > 1)
      multiSkillWords.push({
        childId: (schedule as any).child_id,
        canonicalWordId: (schedule as any).canonical_word_id,
        microSkillKeys: skills,
      });
    routeItems.forEach((item, index) => {
      if (!linked.has(`${(schedule as any).id}\u0000${item.id}`)) {
        proposed.push({
          schedule_word_id: (schedule as any).id,
          learning_item_id: item.id,
          micro_skill_key: item.micro_skill_key,
          attached_on: (schedule as any).taught_on,
          attachment_ordinal: index + 1,
          row_status: "active",
        });
      }
    });
  }

  if (apply && proposed.length > 0) {
    const { error } = await db
      .from("adle_review_schedule_word_routes")
      .insert(proposed);
    if (error) throw new Error(`Insert route links: ${error.message}`);
  }
  console.log(
    JSON.stringify(
      {
        mode: apply ? "staging_apply" : "dry_run",
        activeSchedules: (schedules ?? []).length,
        proposedLinks: proposed.length,
        multiSkillWords,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
