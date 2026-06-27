import assert from "node:assert/strict";

import {
  buildMergedWordTreasureDisplayRows,
  buildMyProgressRewardSnapshot,
  buildTodayRewardHeaderSnapshot,
  isMissingCanonicalWordTreasureTableError,
} from "../lib/rewards/read-model";
import type { ChildWordTreasureRow } from "../lib/rewards/word-treasures";

function treasure(
  word: string,
  status: ChildWordTreasureRow["status"],
  overrides: Partial<ChildWordTreasureRow> = {},
): ChildWordTreasureRow {
  const now = "2026-06-27T10:00:00.000Z";

  return {
    id: `treasure-${word}`,
    child_id: "child-1",
    parent_user_id: "parent-1",
    canonical_word_id: null,
    canonical_mapping_id: null,
    corrected_word: word,
    corrected_word_normalized: word.trim().toLowerCase(),
    original_misspelling: null,
    source_issue_id: null,
    source_learning_item_id: null,
    source_submission_id: null,
    source_misspelling_instance_id: null,
    micro_skill_key: null,
    status,
    discovered_at: now,
    correction_attempted_at: now,
    entered_forge_at: status === "in_forge" ? now : null,
    golden_bar_at: status === "golden_bar" ? now : null,
    authentic_correct_uses_after_forge: status === "golden_bar" ? 5 : 0,
    required_uses_for_bar: 5,
    metadata: {},
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

const { rows, canonicalWordKeys } = buildMergedWordTreasureDisplayRows({
  wordTreasures: [
    treasure("because", "golden_nugget"),
    treasure("through", "in_forge"),
    treasure("definitely", "golden_bar"),
  ],
  spellingRewardStates: [
    {
      target_word: "because",
      reward_state: "warm_workshop",
      has_converted_gold_bar: false,
      gold_bar_earned_at: null,
    },
    {
      target_word: "friend",
      reward_state: "golden_nugget",
      has_converted_gold_bar: false,
      gold_bar_earned_at: null,
    },
    {
      target_word: "separate",
      reward_state: "gold_bar_earned",
      has_converted_gold_bar: false,
      gold_bar_earned_at: "2026-06-26T09:00:00.000Z",
    },
  ],
});

assert.deepEqual(
  rows.map((row) => [row.target_word, row.reward_state, row.source]),
  [
    ["because", "golden_nugget", "canonical_word_treasure"],
    ["through", "warm_workshop", "canonical_word_treasure"],
    ["definitely", "gold_bar_earned", "canonical_word_treasure"],
    ["friend", "golden_nugget", "compatibility_spelling_reward"],
    ["separate", "gold_bar_earned", "compatibility_spelling_reward"],
  ],
  "Canonical Word Treasures should display first, with only non-overlapping compatibility rows appended.",
);
assert.equal(
  rows.filter((row) => row.target_word === "because").length,
  1,
  "A compatibility row for the same corrected word must not duplicate canonical display.",
);
assert.equal(
  canonicalWordKeys.has("because"),
  true,
  "Canonical corrected words should be tracked for event fallback dedupe.",
);

const snapshot = buildMyProgressRewardSnapshot({
  goldCoinEvents: [],
  pendingTransferRequests: [],
  spellingRewardStates: rows,
  spellingRewardEvents: [
    {
      target_word: "because",
      event_type: "gold_bar_earned",
      created_at: "2026-06-27T11:00:00.000Z",
    },
    {
      target_word: "separate",
      event_type: "gold_bar_earned",
      created_at: "2026-06-27T11:00:00.000Z",
    },
  ],
  wordTreasureEvents: [
    {
      treasure_id: "treasure-definitely",
      event_type: "golden_bar_awarded",
      created_at: "2026-06-27T10:00:00.000Z",
    },
  ],
  canonicalWordKeys,
  todayDateOnly: "2026-06-27",
  lastFiveDaysSinceIso: "2026-06-22T00:00:00.000Z",
});

assert.equal(snapshot.nuggets, 2, "Canonical and fallback Nuggets should count.");
assert.equal(snapshot.warmWorkshop, 1, "Canonical in_forge should display as the existing workshop state.");
assert.equal(snapshot.lifetimeGoldBars, 2, "Canonical and fallback Gold Bars should count.");
assert.equal(
  snapshot.redeemableGoldBars,
  1,
  "Only compatibility-backed Gold Bars should be available for the legacy conversion action.",
);
assert.equal(
  snapshot.goldBarsEarnedLastFiveDays,
  2,
  "Canonical Gold Bar events should be preferred, with non-overlapping legacy events as fallback.",
);

const todayHeader = buildTodayRewardHeaderSnapshot({
  goldCoinEvents: [],
  wordTreasureEvents: [
    {
      treasure_id: "treasure-because",
      event_type: "golden_nugget_created",
      created_at: "2026-06-27T10:00:00.000Z",
    },
  ],
  spellingRewardEvents: [
    {
      target_word: "because",
      event_type: "golden_nugget_discovered",
      created_at: "2026-06-27T11:00:00.000Z",
    },
    {
      target_word: "friend",
      event_type: "golden_nugget_discovered",
      created_at: "2026-06-27T11:00:00.000Z",
    },
  ],
  canonicalWordKeys,
  todayDateOnly: "2026-06-27",
});

assert.equal(
  todayHeader.goldenNuggetsFoundToday,
  2,
  "Today history should combine canonical events with non-overlapping compatibility events.",
);

assert.equal(
  isMissingCanonicalWordTreasureTableError({
    code: "PGRST205",
    message:
      "Could not find the table 'public.child_word_treasures' in the schema cache",
  }),
  true,
  "Missing canonical Word Treasure tables should be treated as bridge-fallback read-model absence.",
);

assert.equal(
  isMissingCanonicalWordTreasureTableError({
    code: "PGRST205",
    message:
      "Could not find the table 'public.child_word_treasure_events' in the schema cache",
  }),
  true,
  "Missing canonical Word Treasure event tables should be treated as bridge-fallback read-model absence.",
);

assert.equal(
  isMissingCanonicalWordTreasureTableError({
    code: "42501",
    message: "permission denied for table child_word_treasures",
  }),
  false,
  "Permission errors should still fail instead of being hidden as bridge fallback.",
);

console.log("word-treasure-my-progress-read-model-regression: ok");
