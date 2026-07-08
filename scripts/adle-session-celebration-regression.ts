/**
 * ADLE Slice 7a (7a-D): end-of-session celebration deriver regression — pure,
 * DB-free. Proves the today-window selection of forged / bar words, the
 * bar-supersedes-forge rule, date-boundary handling, dedup/sort determinism,
 * and the empty -> fail-soft case.
 */

import { deriveAdleSessionCelebration } from "../lib/rewards/adle-session-celebration";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const TODAY = "2026-07-08";
const t = (
  corrected_word: string,
  entered_forge_at: string | null,
  golden_bar_at: string | null,
) => ({ corrected_word, entered_forge_at, golden_bar_at });

// --- forged today vs earlier ------------------------------------------------

{
  const model = deriveAdleSessionCelebration(
    [
      t("cat", "2026-07-08T09:00:00Z", null), // forged today
      t("dog", "2026-07-07T23:59:00Z", null), // forged yesterday -> excluded
      t("mat", null, null), // never forged
    ],
    TODAY,
  );
  assert(model.forgedTodayWords.join(",") === "cat", "only today's forge entry is celebrated");
  assert(model.goldenBarsToday.length === 0, "no bars");
  assert(model.hasSomethingToCelebrate, "a forged word is something to celebrate");
}

// --- bars today, and bar supersedes forge -----------------------------------

{
  const model = deriveAdleSessionCelebration(
    [
      t("friend", "2026-07-08T08:00:00Z", "2026-07-08T10:00:00Z"), // forged AND barred today
      t("because", "2026-07-01T08:00:00Z", "2026-07-08T11:00:00Z"), // barred today (forged earlier)
      t("there", "2026-07-06T08:00:00Z", "2026-07-07T10:00:00Z"), // barred yesterday -> excluded
    ],
    TODAY,
  );
  assert(model.goldenBarsToday.join(",") === "because,friend", "both of today's bars, sorted");
  assert(
    !model.forgedTodayWords.includes("friend"),
    "a word barred today is not also listed as forged (bar supersedes)",
  );
  assert(model.forgedTodayWords.length === 0, "friend's same-day forge is superseded by its bar");
}

// --- dedup + determinism ----------------------------------------------------

{
  const model = deriveAdleSessionCelebration(
    [
      t("zebra", "2026-07-08T09:00:00Z", null),
      t("apple", "2026-07-08T09:30:00Z", null),
      t("apple", "2026-07-08T10:00:00Z", null), // duplicate word
      t("  ", "2026-07-08T09:00:00Z", null), // blank -> dropped
    ],
    TODAY,
  );
  assert(model.forgedTodayWords.join(",") === "apple,zebra", "forged words are deduped and sorted");
}

// --- empty / nothing today -> fail-soft -------------------------------------

{
  const empty = deriveAdleSessionCelebration([], TODAY);
  assert(!empty.hasSomethingToCelebrate, "no treasures -> nothing to celebrate");
  const stale = deriveAdleSessionCelebration(
    [t("old", "2026-06-01T00:00:00Z", "2026-06-05T00:00:00Z")],
    TODAY,
  );
  assert(!stale.hasSomethingToCelebrate, "only old activity -> nothing to celebrate today");
}

console.log("adle-session-celebration-regression: all checks passed");
