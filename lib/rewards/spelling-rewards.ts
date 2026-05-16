import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const GOLD_BAR_TO_GOLD_COIN_RATE = 5;

export const SPELLING_REWARD_STATES = [
  "none",
  "golden_nugget",
  "warm_workshop",
  "gold_bar_earned",
] as const;

export type SpellingRewardStateName = (typeof SPELLING_REWARD_STATES)[number];

export type SpellingRewardStateRow = {
  id: string;
  child_id: string;
  parent_user_id: string;
  target_word: string;
  reward_state: SpellingRewardStateName;
  golden_nugget_at: string | null;
  warm_workshop_at: string | null;
  gold_bar_earned_at: string | null;
  gold_bar_converted_at: string | null;
  has_converted_gold_bar: boolean;
  created_at?: string;
  updated_at?: string;
};

export type SpellingRewardEventType =
  | "golden_nugget_discovered"
  | "moved_to_warm_workshop"
  | "gold_bar_earned"
  | "gold_bar_regressed"
  | "gold_bar_restored"
  | "gold_bar_converted";

function normaliseWord(word: string) {
  return word.trim().toLowerCase();
}

async function ensureEvent(
  supabase: SupabaseServerClient,
  input: {
    childId: string;
    parentUserId: string;
    targetWord: string;
    eventType: SpellingRewardEventType;
    notes: string;
  },
) {
  const { childId, parentUserId, targetWord, eventType, notes } = input;
  const { data: existing } = await supabase
    .from("spelling_reward_events")
    .select("id")
    .eq("child_id", childId)
    .eq("parent_user_id", parentUserId)
    .eq("target_word", targetWord)
    .eq("event_type", eventType)
    .maybeSingle();

  if (existing) {
    return false;
  }

  await supabase.from("spelling_reward_events").insert({
    child_id: childId,
    parent_user_id: parentUserId,
    target_word: targetWord,
    event_type: eventType,
    notes,
  });

  return true;
}

export async function getSpellingRewardState(
  supabase: SupabaseServerClient,
  input: {
    childId: string;
    parentUserId: string;
    targetWord: string;
  },
) {
  const { childId, parentUserId, targetWord } = input;
  const { data } = await supabase
    .from("spelling_reward_states")
    .select(
      "id, child_id, parent_user_id, target_word, reward_state, golden_nugget_at, warm_workshop_at, gold_bar_earned_at, gold_bar_converted_at, has_converted_gold_bar",
    )
    .eq("child_id", childId)
    .eq("parent_user_id", parentUserId)
    .eq("target_word", normaliseWord(targetWord))
    .maybeSingle();

  return (data as SpellingRewardStateRow | null) ?? null;
}

export async function syncSpellingRewardState(input: {
  supabase: SupabaseServerClient;
  childId: string;
  parentUserId: string;
  targetWord: string;
  isCorrect: boolean;
  // Legacy naming retained for compatibility with current callers.
  // In reward logic, "mastered" here means the word is secure enough to earn or
  // restore a Gold Bar in the reward loop, not that the Writing Engine should
  // expose the mini-skill as parent-facing "Mastered".
  shouldMarkMastered: boolean;
  hasEverMastered: boolean;
}) {
  const {
    supabase,
    childId,
    parentUserId,
    targetWord,
    isCorrect,
    shouldMarkMastered,
    hasEverMastered,
  } = input;
  const shouldMarkRewardSecure = shouldMarkMastered;
  const hasEverBeenRewardSecure = hasEverMastered;

  const safeTargetWord = normaliseWord(targetWord);
  const now = new Date().toISOString();
  const existing =
    await getSpellingRewardState(supabase, {
      childId,
      parentUserId,
      targetWord: safeTargetWord,
    });

  const hasEverEarnedGoldBar =
    Boolean(existing?.gold_bar_earned_at) || hasEverBeenRewardSecure;
  const nextState: SpellingRewardStateName = shouldMarkRewardSecure
    ? "gold_bar_earned"
    : isCorrect
      ? "warm_workshop"
      : existing?.reward_state === "gold_bar_earned"
        ? "warm_workshop"
        : existing?.reward_state === "warm_workshop"
          ? "warm_workshop"
          : "golden_nugget";

  const createdNugget =
    !isCorrect &&
    !existing?.golden_nugget_at &&
    await ensureEvent(supabase, {
      childId,
      parentUserId,
      targetWord: safeTargetWord,
      eventType: "golden_nugget_discovered",
      notes: "Golden Nugget discovered from a first wrong spelling attempt.",
    });

  const movedToWorkshop =
    nextState === "warm_workshop" &&
    !existing?.warm_workshop_at &&
    await ensureEvent(supabase, {
      childId,
      parentUserId,
      targetWord: safeTargetWord,
      eventType: "moved_to_warm_workshop",
      notes: "Word moved into the Warm Workshop after a successful review.",
    });

  const earnedGoldBar =
    shouldMarkRewardSecure &&
    !existing?.gold_bar_earned_at &&
    await ensureEvent(supabase, {
      childId,
      parentUserId,
      targetWord: safeTargetWord,
      eventType: "gold_bar_earned",
      notes:
        "Gold Bar earned after the word became secure in the reward review path.",
    });

  const regressedGoldBar =
    !isCorrect &&
    existing?.reward_state === "gold_bar_earned" &&
    await ensureEvent(supabase, {
      childId,
      parentUserId,
      targetWord: safeTargetWord,
      eventType: "gold_bar_regressed",
      notes: "Gold Bar regressed back into active review after a later mistake.",
    });

  const restoredGoldBar =
    shouldMarkRewardSecure &&
    Boolean(existing?.gold_bar_earned_at) &&
    existing?.reward_state !== "gold_bar_earned" &&
    await ensureEvent(supabase, {
      childId,
      parentUserId,
      targetWord: safeTargetWord,
      eventType: "gold_bar_restored",
      notes:
        "Previously earned Gold Bar returned to secure reward status after review.",
    });

  const payload = {
    child_id: childId,
    parent_user_id: parentUserId,
    target_word: safeTargetWord,
    reward_state: nextState,
    golden_nugget_at: existing?.golden_nugget_at ?? (createdNugget ? now : null),
    warm_workshop_at: existing?.warm_workshop_at ?? (movedToWorkshop || nextState === "warm_workshop" ? now : null),
    gold_bar_earned_at:
      existing?.gold_bar_earned_at ??
      (earnedGoldBar ? now : hasEverEarnedGoldBar ? now : null),
    gold_bar_converted_at: existing?.gold_bar_converted_at ?? null,
    has_converted_gold_bar: existing?.has_converted_gold_bar ?? false,
    updated_at: now,
  };

  await supabase.from("spelling_reward_states").upsert(payload, {
    onConflict: "child_id,target_word",
  });

  return {
    nextState,
    createdNugget: Boolean(createdNugget),
    earnedGoldBar: Boolean(earnedGoldBar),
    regressedGoldBar: Boolean(regressedGoldBar),
    restoredGoldBar: Boolean(restoredGoldBar),
  };
}

export async function markGoldBarConverted(input: {
  supabase: SupabaseServerClient;
  childId: string;
  parentUserId: string;
  targetWords: string[];
}) {
  const { supabase, childId, parentUserId, targetWords } = input;
  const safeTargetWords = Array.from(
    new Set(targetWords.map((word) => normaliseWord(word)).filter(Boolean)),
  );

  if (safeTargetWords.length === 0) {
    return 0;
  }

  const now = new Date().toISOString();

  await supabase
    .from("spelling_reward_states")
    .update({
      has_converted_gold_bar: true,
      gold_bar_converted_at: now,
      updated_at: now,
    })
    .eq("child_id", childId)
    .eq("parent_user_id", parentUserId)
    .in("target_word", safeTargetWords)
    .eq("reward_state", "gold_bar_earned")
    .eq("has_converted_gold_bar", false);

  for (const targetWord of safeTargetWords) {
    await ensureEvent(supabase, {
      childId,
      parentUserId,
      targetWord,
      eventType: "gold_bar_converted",
      notes: `Gold Bar converted into ${GOLD_BAR_TO_GOLD_COIN_RATE} Gold Coins.`,
    });
  }

  return safeTargetWords.length;
}

export function getSpellingRewardCounts(
  rows: Pick<SpellingRewardStateRow, "reward_state" | "has_converted_gold_bar" | "gold_bar_earned_at">[],
) {
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
      if (row.gold_bar_earned_at) {
        totals.lifetimeGoldBars += 1;
      }
      if (row.reward_state === "gold_bar_earned" && !row.has_converted_gold_bar) {
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
