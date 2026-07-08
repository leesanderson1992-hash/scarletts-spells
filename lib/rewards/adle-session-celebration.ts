/**
 * ADLE Slice 7a (7a-D): pure "what to celebrate" deriver for the end-of-session
 * screen. Zero imports so it is unit-testable DB-free by
 * adle:session-celebration-regression, and so the reward boundary stays clean
 * (this shapes reward read-model data for display; it never writes reward state,
 * and lib/adle never imports it).
 *
 * The two ADLE reward moments land at different times: Nugget->Forge at lesson
 * completion (in-session), and Golden Bar at parent approval (out-of-session).
 * Both surface on the end-of-session screen via the reward model's TODAY window
 * — no "since last visit" tracking is introduced.
 */

/** A minimal structural subset of a child_word_treasures row — kept local so
 * this module imports nothing (ChildWordTreasureRow is assignable to it). */
export interface CelebrationTreasureInput {
  corrected_word: string;
  entered_forge_at: string | null;
  golden_bar_at: string | null;
}

export interface AdleSessionCelebrationModel {
  /** Words that entered the Forge today (excludes any that also earned a Bar
   * today — the Bar ceremony supersedes). */
  forgedTodayWords: string[];
  /** Words that earned a Golden Bar today (the ceremony). */
  goldenBarsToday: string[];
  hasSomethingToCelebrate: boolean;
}

/** Date-part (YYYY-MM-DD) of an ISO timestamp, or null. */
function isoDatePart(timestamp: string | null): string | null {
  return typeof timestamp === "string" && timestamp.length >= 10 ? timestamp.slice(0, 10) : null;
}

function uniqueSorted(words: readonly string[]): string[] {
  return Array.from(new Set(words.filter((word) => word.trim() !== ""))).sort();
}

/**
 * Derive the end-of-session celebration view model from the child's treasures.
 * `today` is a YYYY-MM-DD date-only string. Deterministic (sorted, deduped).
 */
export function deriveAdleSessionCelebration(
  treasures: readonly CelebrationTreasureInput[],
  today: string,
): AdleSessionCelebrationModel {
  const forgedRaw: string[] = [];
  const barsRaw: string[] = [];
  for (const treasure of treasures) {
    if (isoDatePart(treasure.golden_bar_at) === today) {
      barsRaw.push(treasure.corrected_word);
    }
    if (isoDatePart(treasure.entered_forge_at) === today) {
      forgedRaw.push(treasure.corrected_word);
    }
  }
  const goldenBarsToday = uniqueSorted(barsRaw);
  const barSet = new Set(goldenBarsToday);
  const forgedTodayWords = uniqueSorted(forgedRaw).filter((word) => !barSet.has(word));
  return {
    forgedTodayWords,
    goldenBarsToday,
    hasSomethingToCelebrate: forgedTodayWords.length > 0 || goldenBarsToday.length > 0,
  };
}
