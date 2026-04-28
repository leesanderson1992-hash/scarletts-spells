import { doesCourseTaskEarnGoldBar } from "@/lib/courses/progress";
import { isWordSecure } from "@/lib/progress/stateModel";
import type { createClient } from "@/lib/supabase/server";

export const GOLD_BAR_TO_GOLD_COIN_RATE = 5;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type GoldBarLedgerEvent = {
  event_type: "earned" | "converted" | "adjusted";
  amount: number;
};

export type GoldBarSyncWordRow = {
  id: string;
  mastered_at: string | null;
  review_stage: number | null;
  mastery_level: number | null;
  correct_attempts: number | null;
  incorrect_attempts: number | null;
};

export type GoldBarSyncTaskRow = {
  id: string;
  task_type: string;
  monthly_goal_total: number | null;
  gold_bar_rule: "auto" | "on_completion" | "on_monthly_target" | "none";
};

export type GoldBarSyncCompletionRow = {
  task_id: string;
  completion_date: string;
  quantity_completed: number;
};

export type GoldBarSyncSubmissionRow = {
  task_id: string;
  parent_review_status?: "pending" | "approved" | "returned";
};

export type GoldBarSyncFocusRow = {
  id: string;
  is_active: boolean;
};

function getCurrentMonthPrefix() {
  return new Date().toISOString().slice(0, 7);
}

function getMonthlyCompletedTotal(
  taskId: string,
  completions: GoldBarSyncCompletionRow[],
) {
  const monthPrefix = getCurrentMonthPrefix();

  return completions
    .filter(
      (completion) =>
        completion.task_id === taskId &&
        completion.completion_date.startsWith(monthPrefix),
    )
    .reduce((sum, completion) => sum + (completion.quantity_completed ?? 1), 0);
}

export function getGoldBarLedgerTotals(events: GoldBarLedgerEvent[]) {
  return events.reduce(
    (totals, event) => {
      if (event.event_type === "earned" || event.event_type === "adjusted") {
        totals.earned += event.amount ?? 0;
      }

      if (event.event_type === "converted") {
        totals.converted += event.amount ?? 0;
      }

      return totals;
    },
    { earned: 0, converted: 0 },
  );
}

export function getAvailableGoldBars(events: GoldBarLedgerEvent[]) {
  const totals = getGoldBarLedgerTotals(events);
  return Math.max(totals.earned - totals.converted, 0);
}

export async function syncEarnedGoldBars(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  wordRows: GoldBarSyncWordRow[];
  taskRows: GoldBarSyncTaskRow[];
  completionRows: GoldBarSyncCompletionRow[];
  submissionRows: GoldBarSyncSubmissionRow[];
  focusRows: GoldBarSyncFocusRow[];
}) {
  const {
    supabase,
    parentUserId,
    childId,
    wordRows,
    taskRows,
    completionRows,
    submissionRows,
    focusRows,
  } = input;

  const { data: existingEvents } = await supabase
    .from("child_gold_bar_ledger_events")
    .select("event_type, source, related_entity_type, related_entity_id")
    .eq("child_id", childId)
    .eq("parent_user_id", parentUserId)
    .eq("event_type", "earned");

  const earnedKeys = new Set(
    (existingEvents ?? []).map(
      (event) =>
        `${event.source}:${event.related_entity_type ?? "none"}:${event.related_entity_id ?? "none"}`,
    ),
  );

  const inserts: Array<{
    child_id: string;
    parent_user_id: string;
    event_type: "earned";
    amount: number;
    source: string;
    related_entity_type: string;
    related_entity_id: string;
    notes: string;
  }> = [];

  for (const row of wordRows) {
    if (
      isWordSecure({
        reviewStage: row.review_stage,
        masteryLevel: row.mastery_level,
        correctAttempts: row.correct_attempts,
        incorrectAttempts: row.incorrect_attempts,
        masteredAt: row.mastered_at,
      })
    ) {
      const key = `word_mastery:word_progress:${row.id}`;
      if (!earnedKeys.has(key)) {
        inserts.push({
          child_id: childId,
          parent_user_id: parentUserId,
          event_type: "earned",
          amount: 1,
          source: "word_mastery",
          related_entity_type: "word_progress",
          related_entity_id: row.id,
          notes: "Gold Bar earned from secure spelling mastery.",
        });
        earnedKeys.add(key);
      }
    }
  }

  for (const row of taskRows) {
    if (
      doesCourseTaskEarnGoldBar(row, completionRows, submissionRows)
    ) {
      const key = `course_task_mastery:course_task:${row.id}`;
      if (!earnedKeys.has(key)) {
        inserts.push({
          child_id: childId,
          parent_user_id: parentUserId,
          event_type: "earned",
          amount: 1,
          source: "course_task_mastery",
          related_entity_type: "course_task",
          related_entity_id: row.id,
          notes: "Gold Bar earned from secure course task completion.",
        });
        earnedKeys.add(key);
      }
    }
  }

  for (const row of focusRows) {
    if (!row.is_active) {
      const key = `focus_block_completion:focus_block:${row.id}`;
      if (!earnedKeys.has(key)) {
        inserts.push({
          child_id: childId,
          parent_user_id: parentUserId,
          event_type: "earned",
          amount: 1,
          source: "focus_block_completion",
          related_entity_type: "focus_block",
          related_entity_id: row.id,
          notes: "Gold Bar earned from completed focus block.",
        });
        earnedKeys.add(key);
      }
    }
  }

  if (inserts.length > 0) {
    await supabase.from("child_gold_bar_ledger_events").insert(inserts);
  }
}
