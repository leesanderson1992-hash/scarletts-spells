import type { createClient } from "@/lib/supabase/server";
import {
  getGoldCoinLedgerTotals,
  getReservedGoldCoinTotal,
  type CourseCoinLedgerEvent,
} from "@/lib/rewards/course-coins";
import { GOLD_BAR_TO_GOLD_COIN_RATE, getSpellingRewardCounts, type SpellingRewardStateRow } from "@/lib/rewards/spelling-rewards";

export { GOLD_BAR_TO_GOLD_COIN_RATE };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type RewardCoinLedgerRow = Pick<CourseCoinLedgerEvent, "event_type" | "amount"> & {
  created_at?: string | null;
};

type RewardSpellingEventRow = {
  event_type: "golden_nugget_discovered" | "moved_to_warm_workshop" | "gold_bar_earned" | "gold_bar_regressed" | "gold_bar_restored" | "gold_bar_converted";
  created_at: string;
};

export type RewardTransferRequestRow = {
  id?: string;
  gold_coin_amount: number | null;
  status?: "pending" | "approved" | "declined" | "cancelled";
  child_note?: string | null;
  parent_note?: string | null;
  created_at?: string;
};

export type RewardSpellingStateSummaryRow = Pick<
  SpellingRewardStateRow,
  "target_word" | "reward_state" | "has_converted_gold_bar" | "gold_bar_earned_at"
>;

export function getSpendableGoldCoinBalanceFromLedger(input: {
  goldCoinEvents: RewardCoinLedgerRow[];
  pendingTransferRequests: Array<{ gold_coin_amount: number | null }>;
}) {
  const totals = getGoldCoinLedgerTotals(input.goldCoinEvents);
  const reservedGoldCoins = getReservedGoldCoinTotal(input.pendingTransferRequests);

  return {
    earnedGoldCoins: totals.earned,
    spentGoldCoins: totals.spent,
    reservedGoldCoins,
    spendableGoldCoins: Math.max(totals.earned - totals.spent - reservedGoldCoins, 0),
  };
}

export function getGoldCoinsEarnedOnDate(
  events: RewardCoinLedgerRow[],
  dateOnly: string,
) {
  return events.reduce((sum, event) => {
    const createdAt = event.created_at ?? "";
    if (!createdAt.startsWith(dateOnly)) {
      return sum;
    }

    if (
      event.event_type === "earned_daily" ||
      event.event_type === "earned_task" ||
      event.event_type === "earned_module" ||
      event.event_type === "earned_focus_block" ||
      event.event_type === "earned_course" ||
      event.event_type === "earned_checkpoint" ||
      event.event_type === "converted_from_bar" ||
      event.event_type === "adjusted" ||
      event.event_type === "released_transfer"
    ) {
      return sum + (event.amount ?? 0);
    }

    return sum;
  }, 0);
}

export function getGoldBarsEarnedSince(
  events: RewardSpellingEventRow[],
  sinceIso: string,
) {
  return events.filter(
    (event) =>
      event.event_type === "gold_bar_earned" &&
      event.created_at >= sinceIso,
  ).length;
}

export function getSpellingEventCountOnDate(
  events: RewardSpellingEventRow[],
  eventType: RewardSpellingEventRow["event_type"],
  dateOnly: string,
) {
  return events.filter(
    (event) =>
      event.event_type === eventType &&
      event.created_at.startsWith(dateOnly),
  ).length;
}

export function buildTodayRewardHeaderSnapshot(input: {
  goldCoinEvents: RewardCoinLedgerRow[];
  spellingRewardEvents: RewardSpellingEventRow[];
  todayDateOnly: string;
}) {
  return {
    coinsEarnedToday: getGoldCoinsEarnedOnDate(
      input.goldCoinEvents,
      input.todayDateOnly,
    ),
    goldBarsEarnedToday: getSpellingEventCountOnDate(
      input.spellingRewardEvents,
      "gold_bar_earned",
      input.todayDateOnly,
    ),
    goldenNuggetsFoundToday: getSpellingEventCountOnDate(
      input.spellingRewardEvents,
      "golden_nugget_discovered",
      input.todayDateOnly,
    ),
  };
}

export function buildMyProgressRewardSnapshot(input: {
  goldCoinEvents: RewardCoinLedgerRow[];
  pendingTransferRequests: Array<{ gold_coin_amount: number | null }>;
  spellingRewardStates: Array<
    Pick<
      SpellingRewardStateRow,
      "reward_state" | "has_converted_gold_bar" | "gold_bar_earned_at"
    >
  >;
  spellingRewardEvents: RewardSpellingEventRow[];
  todayDateOnly: string;
  lastFiveDaysSinceIso: string;
}) {
  const coinSnapshot = getSpendableGoldCoinBalanceFromLedger({
    goldCoinEvents: input.goldCoinEvents,
    pendingTransferRequests: input.pendingTransferRequests,
  });
  const spellingCounts = getSpellingRewardCounts(input.spellingRewardStates);

  return {
    ...coinSnapshot,
    ...spellingCounts,
    earnedTodayGoldCoins: getGoldCoinsEarnedOnDate(
      input.goldCoinEvents,
      input.todayDateOnly,
    ),
    goldBarsEarnedLastFiveDays: getGoldBarsEarnedSince(
      input.spellingRewardEvents,
      input.lastFiveDaysSinceIso,
    ),
    convertableGoldCoinValue:
      spellingCounts.redeemableGoldBars * GOLD_BAR_TO_GOLD_COIN_RATE,
  };
}

export async function getChildRewardLedgerReadModel(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
}) {
  const { supabase, parentUserId, childId } = input;
  const [goldCoinLedgerResult, transferRequestsResult] = await Promise.all([
    supabase
      .from("child_gold_coin_ledger_events")
      .select("event_type, amount, source, created_at")
      .eq("child_id", childId)
      .eq("parent_user_id", parentUserId)
      .order("created_at", { ascending: false }),
    supabase
      .from("gold_coin_transfer_requests")
      .select("id, gold_coin_amount, status, child_note, parent_note, created_at")
      .eq("child_id", childId)
      .eq("parent_user_id", parentUserId)
      .order("created_at", { ascending: false }),
  ]);

  const goldCoinLedgerEvents = (goldCoinLedgerResult.data ?? []) as Array<
    RewardCoinLedgerRow & { source?: string | null }
  >;
  const transferRequests = (transferRequestsResult.data ?? []) as RewardTransferRequestRow[];
  const pendingTransferRequests = transferRequests.filter(
    (request) => request.status === "pending",
  );

  return {
    goldCoinLedgerEvents,
    transferRequests,
    pendingTransferRequests,
    ledgerTotals: getGoldCoinLedgerTotals(goldCoinLedgerEvents),
    spendableSnapshot: getSpendableGoldCoinBalanceFromLedger({
      goldCoinEvents: goldCoinLedgerEvents,
      pendingTransferRequests,
    }),
  };
}

export async function getChildRewardReadModel(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  todayDateOnly: string;
  lastFiveDaysSinceIso: string;
}) {
  const {
    supabase,
    parentUserId,
    childId,
    todayDateOnly,
    lastFiveDaysSinceIso,
  } = input;
  const [ledgerReadModel, spellingRewardStatesResult, spellingRewardEventsResult] =
    await Promise.all([
      getChildRewardLedgerReadModel({
        supabase,
        parentUserId,
        childId,
      }),
      supabase
        .from("spelling_reward_states")
        .select("target_word, reward_state, has_converted_gold_bar, gold_bar_earned_at")
        .eq("parent_user_id", parentUserId)
        .eq("child_id", childId)
        .order("gold_bar_earned_at", { ascending: false, nullsFirst: false }),
      supabase
        .from("spelling_reward_events")
        .select("event_type, created_at")
        .eq("parent_user_id", parentUserId)
        .eq("child_id", childId)
        .gte("created_at", lastFiveDaysSinceIso)
        .order("created_at", { ascending: false }),
    ]);

  const spellingRewardStates =
    (spellingRewardStatesResult.data ?? []) as RewardSpellingStateSummaryRow[];
  const spellingRewardEvents =
    (spellingRewardEventsResult.data ?? []) as RewardSpellingEventRow[];

  return {
    ...ledgerReadModel,
    spellingRewardStates,
    spellingRewardEvents,
    rewardSnapshot: buildMyProgressRewardSnapshot({
      goldCoinEvents: ledgerReadModel.goldCoinLedgerEvents,
      pendingTransferRequests: ledgerReadModel.pendingTransferRequests,
      spellingRewardStates,
      spellingRewardEvents,
      todayDateOnly,
      lastFiveDaysSinceIso,
    }),
    todayHeaderSnapshot: buildTodayRewardHeaderSnapshot({
      goldCoinEvents: ledgerReadModel.goldCoinLedgerEvents,
      spellingRewardEvents,
      todayDateOnly,
    }),
  };
}

export async function getParentRewardHistoryReadModel(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
}) {
  const ledgerReadModel = await getChildRewardLedgerReadModel(input);
  const approvedTransferCoins = ledgerReadModel.transferRequests
    .filter((request) => request.status === "approved")
    .reduce((sum, request) => sum + (request.gold_coin_amount ?? 0), 0);
  const pendingTransferCoins = ledgerReadModel.pendingTransferRequests.reduce(
    (sum, request) => sum + (request.gold_coin_amount ?? 0),
    0,
  );
  const convertedFromBarsCoins = ledgerReadModel.goldCoinLedgerEvents
    .filter((event) => event.event_type === "converted_from_bar")
    .reduce((sum, event) => sum + (event.amount ?? 0), 0);

  return {
    ...ledgerReadModel,
    approvedTransferCoins,
    pendingTransferCoins,
    convertedFromBarsCoins,
  };
}
