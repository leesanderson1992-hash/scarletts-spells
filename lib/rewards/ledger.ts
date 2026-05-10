import type { createClient } from "@/lib/supabase/server";

export const GOLD_BAR_TO_GOLD_COIN_RATE = 5;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type GoldBarLedgerEvent = {
  event_type: "earned" | "converted" | "adjusted";
  amount: number;
};

export type GoldBarSyncWordRow = {
  id: string;
  target_word: string;
  gold_bar_earned_at: string | null;
};

export type GoldBarSyncTaskRow = {
  id: string;
};

export type GoldBarSyncCompletionRow = {
  task_id: string;
};

export type GoldBarSyncSubmissionRow = {
  task_id: string;
};

export type GoldBarSyncFocusRow = {
  id: string;
};

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
    taskRows: _taskRows,
    completionRows: _completionRows,
    submissionRows: _submissionRows,
    focusRows: _focusRows,
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
    if (row.gold_bar_earned_at) {
      const key = `word_mastery:spelling_reward_state:${row.id}`;
      if (!earnedKeys.has(key)) {
        inserts.push({
          child_id: childId,
          parent_user_id: parentUserId,
          event_type: "earned",
          amount: 1,
          source: "word_mastery",
          related_entity_type: "spelling_reward_state",
          related_entity_id: row.id,
          notes: `Gold Bar earned from secure spelling mastery for ${row.target_word}.`,
        });
        earnedKeys.add(key);
      }
    }
  }

  if (inserts.length > 0) {
    await supabase.from("child_gold_bar_ledger_events").insert(inserts);
  }
}
