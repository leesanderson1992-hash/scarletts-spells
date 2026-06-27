import type { createClient } from "@/lib/supabase/server";
import {
  getGoldCoinLedgerTotals,
  getReservedGoldCoinTotal,
  type CourseCoinLedgerEvent,
} from "@/lib/rewards/course-coins";
import { GOLD_BAR_TO_GOLD_COIN_RATE, type SpellingRewardStateRow } from "@/lib/rewards/spelling-rewards";
import {
  getChildWordTreasureEvents,
  getChildWordTreasures,
  normaliseWordTreasureWord,
  type ChildWordTreasureEventRow,
  type ChildWordTreasureRow,
} from "@/lib/rewards/word-treasures";

export { GOLD_BAR_TO_GOLD_COIN_RATE };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type RewardCoinLedgerRow = Pick<CourseCoinLedgerEvent, "event_type" | "amount"> & {
  created_at?: string | null;
};

type RewardSpellingEventRow = {
  event_type: "golden_nugget_discovered" | "moved_to_warm_workshop" | "gold_bar_earned" | "gold_bar_regressed" | "gold_bar_restored" | "gold_bar_converted";
  target_word?: string | null;
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
> & {
  source?: "canonical_word_treasure" | "compatibility_spelling_reward";
  compatibility_can_convert_gold_bar?: boolean;
};

type RewardWordTreasureEventRow = Pick<
  ChildWordTreasureEventRow,
  "event_type" | "treasure_id" | "created_at"
>;

function normaliseRewardWord(word: string | null | undefined) {
  return normaliseWordTreasureWord(word ?? "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isMissingCanonicalWordTreasureTableError(error: unknown) {
  if (!isRecord(error)) {
    return false;
  }

  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message : "";

  return (
    code === "PGRST205" &&
    (message.includes("child_word_treasures") ||
      message.includes("child_word_treasure_events"))
  );
}

async function readCanonicalWordTreasureRowsOrEmpty<T>(
  readPromise: Promise<T[]>,
) {
  try {
    return await readPromise;
  } catch (error) {
    if (isMissingCanonicalWordTreasureTableError(error)) {
      return [];
    }

    throw error;
  }
}

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
  excludedWords = new Set<string>(),
) {
  return events.filter(
    (event) =>
      event.event_type === "gold_bar_earned" &&
      event.created_at >= sinceIso &&
      !excludedWords.has(normaliseRewardWord(event.target_word)),
  ).length;
}

export function getWordTreasureGoldBarsEarnedSince(
  events: RewardWordTreasureEventRow[],
  sinceIso: string,
) {
  return events.filter(
    (event) =>
      event.event_type === "golden_bar_awarded" &&
      event.created_at >= sinceIso,
  ).length;
}

export function getSpellingEventCountOnDate(
  events: RewardSpellingEventRow[],
  eventType: RewardSpellingEventRow["event_type"],
  dateOnly: string,
  excludedWords = new Set<string>(),
) {
  return events.filter(
    (event) =>
      event.event_type === eventType &&
      event.created_at.startsWith(dateOnly) &&
      !excludedWords.has(normaliseRewardWord(event.target_word)),
  ).length;
}

export function getWordTreasureEventCountOnDate(
  events: RewardWordTreasureEventRow[],
  eventType: RewardWordTreasureEventRow["event_type"],
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
  wordTreasureEvents?: RewardWordTreasureEventRow[];
  spellingRewardEvents: RewardSpellingEventRow[];
  canonicalWordKeys?: Set<string>;
  todayDateOnly: string;
}) {
  const canonicalWordKeys = input.canonicalWordKeys ?? new Set<string>();

  return {
    coinsEarnedToday: getGoldCoinsEarnedOnDate(
      input.goldCoinEvents,
      input.todayDateOnly,
    ),
    goldBarsEarnedToday:
      getWordTreasureEventCountOnDate(
        input.wordTreasureEvents ?? [],
        "golden_bar_awarded",
        input.todayDateOnly,
      ) +
      getSpellingEventCountOnDate(
        input.spellingRewardEvents,
        "gold_bar_earned",
        input.todayDateOnly,
        canonicalWordKeys,
      ),
    goldenNuggetsFoundToday:
      getWordTreasureEventCountOnDate(
        input.wordTreasureEvents ?? [],
        "golden_nugget_created",
        input.todayDateOnly,
      ) +
      getSpellingEventCountOnDate(
        input.spellingRewardEvents,
        "golden_nugget_discovered",
        input.todayDateOnly,
        canonicalWordKeys,
      ),
  };
}

export function getMergedWordTreasureCounts(rows: RewardSpellingStateSummaryRow[]) {
  return rows.reduce(
    (totals, row) => {
      if (row.reward_state === "golden_nugget") {
        totals.nuggets += 1;
      }
      if (row.reward_state === "warm_workshop") {
        totals.warmWorkshop += 1;
      }
      if (row.reward_state === "gold_bar_earned") {
        totals.currentGoldBars += 1;
      }
      if (row.gold_bar_earned_at || row.reward_state === "gold_bar_earned") {
        totals.lifetimeGoldBars += 1;
      }
      if (
        row.reward_state === "gold_bar_earned" &&
        row.compatibility_can_convert_gold_bar
      ) {
        totals.redeemableGoldBars += 1;
      }
      if (row.has_converted_gold_bar) {
        totals.convertedGoldBars += 1;
      }
      return totals;
    },
    {
      nuggets: 0,
      warmWorkshop: 0,
      currentGoldBars: 0,
      lifetimeGoldBars: 0,
      redeemableGoldBars: 0,
      convertedGoldBars: 0,
    },
  );
}

function mapWordTreasureStatusToCompatibilityState(
  status: ChildWordTreasureRow["status"],
) {
  if (status === "golden_bar") {
    return "gold_bar_earned" as const;
  }

  if (status === "in_forge") {
    return "warm_workshop" as const;
  }

  return "golden_nugget" as const;
}

export function buildMergedWordTreasureDisplayRows(input: {
  wordTreasures: ChildWordTreasureRow[];
  spellingRewardStates: RewardSpellingStateSummaryRow[];
}) {
  const compatibilityByWord = new Map(
    input.spellingRewardStates.map((row) => [
      normaliseRewardWord(row.target_word),
      row,
    ]),
  );
  const canonicalWordKeys = new Set(
    input.wordTreasures.map((treasure) =>
      normaliseRewardWord(treasure.corrected_word_normalized || treasure.corrected_word),
    ),
  );
  const canonicalRows = input.wordTreasures.map((treasure) => {
    const wordKey = normaliseRewardWord(
      treasure.corrected_word_normalized || treasure.corrected_word,
    );
    const compatibilityRow = compatibilityByWord.get(wordKey);
    const rewardState = mapWordTreasureStatusToCompatibilityState(treasure.status);
    const compatibilityCanConvertGoldBar =
      compatibilityRow?.reward_state === "gold_bar_earned" &&
      !compatibilityRow.has_converted_gold_bar;

    return {
      target_word: treasure.corrected_word,
      reward_state: rewardState,
      has_converted_gold_bar: compatibilityRow?.has_converted_gold_bar ?? false,
      gold_bar_earned_at:
        treasure.golden_bar_at ??
        compatibilityRow?.gold_bar_earned_at ??
        (treasure.status === "golden_bar" ? treasure.updated_at : null),
      source: "canonical_word_treasure" as const,
      compatibility_can_convert_gold_bar: compatibilityCanConvertGoldBar,
    };
  });
  const compatibilityRows = input.spellingRewardStates
    .filter((row) => !canonicalWordKeys.has(normaliseRewardWord(row.target_word)))
    .map((row) => ({
      ...row,
      source: "compatibility_spelling_reward" as const,
      compatibility_can_convert_gold_bar:
        row.reward_state === "gold_bar_earned" && !row.has_converted_gold_bar,
    }));

  return {
    rows: [...canonicalRows, ...compatibilityRows],
    canonicalWordKeys,
  };
}

export function buildMyProgressRewardSnapshot(input: {
  goldCoinEvents: RewardCoinLedgerRow[];
  pendingTransferRequests: Array<{ gold_coin_amount: number | null }>;
  spellingRewardStates: RewardSpellingStateSummaryRow[];
  spellingRewardEvents: RewardSpellingEventRow[];
  wordTreasureEvents?: RewardWordTreasureEventRow[];
  canonicalWordKeys?: Set<string>;
  todayDateOnly: string;
  lastFiveDaysSinceIso: string;
}) {
  const coinSnapshot = getSpendableGoldCoinBalanceFromLedger({
    goldCoinEvents: input.goldCoinEvents,
    pendingTransferRequests: input.pendingTransferRequests,
  });
  const spellingCounts = getMergedWordTreasureCounts(
    input.spellingRewardStates,
  );

  return {
    ...coinSnapshot,
    ...spellingCounts,
    earnedTodayGoldCoins: getGoldCoinsEarnedOnDate(
      input.goldCoinEvents,
      input.todayDateOnly,
    ),
    goldBarsEarnedLastFiveDays:
      getWordTreasureGoldBarsEarnedSince(
        input.wordTreasureEvents ?? [],
        input.lastFiveDaysSinceIso,
      ) +
      getGoldBarsEarnedSince(
        input.spellingRewardEvents,
        input.lastFiveDaysSinceIso,
        input.canonicalWordKeys,
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
  const [
    ledgerReadModel,
    wordTreasuresResult,
    wordTreasureEventsResult,
    spellingRewardStatesResult,
    spellingRewardEventsResult,
  ] =
    await Promise.all([
      getChildRewardLedgerReadModel({
        supabase,
        parentUserId,
        childId,
      }),
      readCanonicalWordTreasureRowsOrEmpty(getChildWordTreasures({
        supabase,
        parentUserId,
        childId,
      })),
      readCanonicalWordTreasureRowsOrEmpty(getChildWordTreasureEvents({
        supabase,
        parentUserId,
        childId,
      })),
      supabase
        .from("spelling_reward_states")
        .select("target_word, reward_state, has_converted_gold_bar, gold_bar_earned_at")
        .eq("parent_user_id", parentUserId)
        .eq("child_id", childId)
        .order("gold_bar_earned_at", { ascending: false, nullsFirst: false }),
      supabase
        .from("spelling_reward_events")
        .select("target_word, event_type, created_at")
        .eq("parent_user_id", parentUserId)
        .eq("child_id", childId)
        .gte("created_at", lastFiveDaysSinceIso)
        .order("created_at", { ascending: false }),
    ]);

  const spellingRewardStates =
    (spellingRewardStatesResult.data ?? []) as RewardSpellingStateSummaryRow[];
  const spellingRewardEvents =
    (spellingRewardEventsResult.data ?? []) as RewardSpellingEventRow[];
  const wordTreasures = wordTreasuresResult as ChildWordTreasureRow[];
  const wordTreasureEvents = wordTreasureEventsResult as RewardWordTreasureEventRow[];
  const mergedWordTreasureDisplay = buildMergedWordTreasureDisplayRows({
    wordTreasures,
    spellingRewardStates,
  });

  return {
    ...ledgerReadModel,
    childWordTreasures: wordTreasures,
    childWordTreasureEvents: wordTreasureEvents,
    compatibilitySpellingRewardStates: spellingRewardStates,
    spellingRewardStates: mergedWordTreasureDisplay.rows,
    spellingRewardEvents,
    rewardSnapshot: buildMyProgressRewardSnapshot({
      goldCoinEvents: ledgerReadModel.goldCoinLedgerEvents,
      pendingTransferRequests: ledgerReadModel.pendingTransferRequests,
      spellingRewardStates: mergedWordTreasureDisplay.rows,
      spellingRewardEvents,
      wordTreasureEvents,
      canonicalWordKeys: mergedWordTreasureDisplay.canonicalWordKeys,
      todayDateOnly,
      lastFiveDaysSinceIso,
    }),
    todayHeaderSnapshot: buildTodayRewardHeaderSnapshot({
      goldCoinEvents: ledgerReadModel.goldCoinLedgerEvents,
      wordTreasureEvents,
      spellingRewardEvents,
      canonicalWordKeys: mergedWordTreasureDisplay.canonicalWordKeys,
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
