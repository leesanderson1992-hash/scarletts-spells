/**
 * ADLE Slice 7a (7a-C): the ADLE → Word Treasure reward bridge.
 *
 * Boundary (blueprint): ADLE emits events; the reward contract consumes them;
 * ADLE never writes reward state. So this consumer is reward-owned and lives in
 * lib/rewards; it is invoked from app/ completion paths. lib/adle gains no
 * reward import.
 *
 * Two consumers:
 *  - `advanceForgeForAdleTaughtWords` — on ADLE lesson completion, moves each
 *    taught word's Golden Nugget into the Forge, reusing the exact idempotent
 *    logic of `moveGoldenNuggetIntoForgeFromDailyAssignmentItem`. Words with no
 *    Nugget skip gracefully (missing_word_treasure).
 *  - `recordAdleAuthenticUsesForRewards` — advances Golden-Bar progress from
 *    parent-verified ADLE authentic uses, deduplicated by writing sample so a
 *    given real use counts exactly once ACROSS the ADLE and free-writing paths.
 *
 * Cross-path dedup (owner-resolved open question 1): both authentic-use tracks
 * ultimately describe the same real thing — a target word appearing in a
 * parent-approved writing sample. ADLE's `piece_ref` is `ws:{writing_sample_id}`
 * and the free-writing candidate carries `writing_sample_id`, so the canonical
 * per-word key is `(treasure_id, writing_sample_id)`. Both paths record an
 * `authentic_correct_use_recorded` event and both consult the same counted-set
 * before incrementing, so each (word, sample) advances a Golden Bar exactly
 * once regardless of which path observes it first.
 */

import type { createClient } from "@/lib/supabase/server";

import { normaliseWordTreasureWord, moveGoldenNuggetIntoForgeFromDailyAssignmentItem } from "./word-treasures";
import {
  ADLE_AUTHENTIC_USE_SOURCE_TYPE,
  applyForgeUses,
  authenticUseDedupKey,
  parseWritingSampleFromPieceRef,
  reconcileAuthenticUses,
} from "./adle-reward-bridge-core";

export {
  ADLE_AUTHENTIC_USE_SOURCE_TYPE,
  applyForgeUses,
  authenticUseDedupKey,
  parseWritingSampleFromPieceRef,
  reconcileAuthenticUses,
} from "./adle-reward-bridge-core";
export type { AuthenticUseCandidate } from "./adle-reward-bridge-core";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------------------
// DB consumers — reward-owned, called from app/ completion paths.
// ---------------------------------------------------------------------------

export interface AdleTaughtWordForForge {
  assignmentItemId: string;
  targetWord: string;
}

export interface ForgeAdvanceOutcome {
  targetWord: string;
  status: "entered_forge" | "already_forged" | "missing_word_treasure";
}

export interface ForgeAdvanceResult {
  outcomes: ForgeAdvanceOutcome[];
  enteredForgeCount: number;
}

/**
 * Move each taught word's Golden Nugget into the Forge (idempotent; words with
 * no Nugget skip). Reuses the daily-assignment forge transition so ADLE and the
 * legacy daily-practice path share one state machine.
 */
export async function advanceForgeForAdleTaughtWords(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  dailyAssignmentId: string;
  taughtWords: readonly AdleTaughtWordForForge[];
}): Promise<ForgeAdvanceResult> {
  // Dedupe by normalised word: a lesson can carry a word in several activities;
  // the Nugget moves once (idempotent by assignment item anyway).
  const seenWords = new Set<string>();
  const uniqueTaughtWords: AdleTaughtWordForForge[] = [];
  for (const taught of input.taughtWords) {
    const normalised = normaliseWordTreasureWord(taught.targetWord ?? "");
    if (normalised === "" || seenWords.has(normalised)) {
      continue;
    }
    seenWords.add(normalised);
    uniqueTaughtWords.push(taught);
  }

  const results = await Promise.all(uniqueTaughtWords.map(async (taught): Promise<{ outcome: ForgeAdvanceOutcome; eventCreated: boolean }> => {
    const result = await moveGoldenNuggetIntoForgeFromDailyAssignmentItem({
      supabase: input.supabase,
      childId: input.childId,
      parentUserId: input.parentUserId,
      dailyAssignmentId: input.dailyAssignmentId,
      assignmentItemId: taught.assignmentItemId,
      // ADLE never writes the legacy source_learning_item_id: that column FKs
      // the legacy `learning_items` table, and ADLE items live in
      // `adle_learning_items` (the "ADLE rows keep legacy learning_item_id
      // null" pin). Passing an ADLE id here violates the FK.
      learningItemId: null,
      targetWord: taught.targetWord,
      sourceType: "adle_lesson_completion",
      sourceEntityId: taught.assignmentItemId,
    });

    if (result.skippedReason === "missing_word_treasure") {
      return { outcome: { targetWord: taught.targetWord, status: "missing_word_treasure" }, eventCreated: false };
    }
    if (result.skippedReason === "not_golden_nugget") {
      return { outcome: { targetWord: taught.targetWord, status: "already_forged" }, eventCreated: false };
    }
    if (result.treasure && result.skippedReason === null) {
      return { outcome: { targetWord: taught.targetWord, status: "entered_forge" }, eventCreated: result.eventCreated };
    }
    return { outcome: { targetWord: taught.targetWord, status: "already_forged" }, eventCreated: false };
  }));
  return { outcomes: results.map((result) => result.outcome), enteredForgeCount: results.filter((result) => result.eventCreated).length };
}

/** The already-counted (treasure, sample) keys across BOTH authentic-use paths,
 * read from the shared event ledger. ADLE events key the sample in
 * source_entity_id (`ws:{sample}`); free-writing events carry it in metadata. */
export async function loadCountedAuthenticUseKeys(
  supabase: SupabaseServerClient,
  treasureIds: readonly string[],
): Promise<Set<string>> {
  const keys = new Set<string>();
  if (treasureIds.length === 0) {
    return keys;
  }
  const { data, error } = await supabase
    .from("child_word_treasure_events")
    .select("treasure_id, source_type, source_entity_id, metadata")
    .in("treasure_id", treasureIds as string[])
    .eq("event_type", "authentic_correct_use_recorded");
  if (error) {
    throw error;
  }
  for (const row of (data ?? []) as Array<{
    treasure_id: string;
    source_type: string | null;
    source_entity_id: string | null;
    metadata: Record<string, unknown> | null;
  }>) {
    const fromRef =
      typeof row.source_entity_id === "string" ? parseWritingSampleFromPieceRef(row.source_entity_id) : null;
    const fromMeta =
      row.metadata && typeof row.metadata.writing_sample_id === "string"
        ? (row.metadata.writing_sample_id as string)
        : null;
    const sampleId = fromRef ?? fromMeta;
    if (sampleId) {
      keys.add(authenticUseDedupKey(row.treasure_id, sampleId));
    }
  }
  return keys;
}

/**
 * The (treasure, sample) keys already counted by the ADLE path only
 * (source_type = adle_authentic_use). The free-writing path calls this to skip
 * a piece ADLE already credited — the other half of the cross-path dedup,
 * leaving free-writing's own dedup untouched.
 */
export async function loadAdleCountedSampleKeys(
  supabase: SupabaseServerClient,
  treasureIds: readonly string[],
): Promise<Set<string>> {
  const keys = new Set<string>();
  if (treasureIds.length === 0) {
    return keys;
  }
  const { data, error } = await supabase
    .from("child_word_treasure_events")
    .select("treasure_id, source_entity_id")
    .in("treasure_id", treasureIds as string[])
    .eq("event_type", "authentic_correct_use_recorded")
    .eq("source_type", ADLE_AUTHENTIC_USE_SOURCE_TYPE);
  if (error) {
    throw error;
  }
  for (const row of (data ?? []) as Array<{ treasure_id: string; source_entity_id: string | null }>) {
    const sampleId = typeof row.source_entity_id === "string" ? parseWritingSampleFromPieceRef(row.source_entity_id) : null;
    if (sampleId) {
      keys.add(authenticUseDedupKey(row.treasure_id, sampleId));
    }
  }
  return keys;
}

export interface AuthenticUseRewardResult {
  recordedUses: number;
  skippedAlreadyCounted: number;
  goldenBarsAwarded: number;
  barWords: string[];
}

/**
 * Advance Golden-Bar progress from parent-verified ADLE authentic uses. Reads
 * `adle_authentic_use_events`, matches each to an in-forge treasure by
 * normalised word, and increments once per (treasure, writing sample) — skipping
 * any (treasure, sample) already counted by the free-writing path or a prior run.
 */
export async function recordAdleAuthenticUsesForRewards(input: {
  supabase: SupabaseServerClient;
  serviceClient: SupabaseServerClient;
  parentUserId: string;
  childId: string;
}): Promise<AuthenticUseRewardResult> {
  const nowIso = new Date().toISOString();
  const result: AuthenticUseRewardResult = {
    recordedUses: 0,
    skippedAlreadyCounted: 0,
    goldenBarsAwarded: 0,
    barWords: [],
  };

  // 1. Parent-verified ADLE authentic uses for this child.
  const { data: eventRows, error: eventError } = await input.serviceClient
    .from("adle_authentic_use_events")
    .select("canonical_word_id, piece_ref, use_kind, parent_verified, row_status")
    .eq("child_id", input.childId)
    .eq("use_kind", "authentic_correct_use")
    .eq("parent_verified", true)
    .eq("row_status", "active");
  if (eventError) {
    throw eventError;
  }
  const events = ((eventRows ?? []) as Array<{ canonical_word_id: string; piece_ref: string }>)
    .map((row) => ({
      canonicalWordId: row.canonical_word_id,
      writingSampleId: parseWritingSampleFromPieceRef(row.piece_ref ?? ""),
    }))
    .filter((event): event is { canonicalWordId: string; writingSampleId: string } => event.writingSampleId !== null);
  if (events.length === 0) {
    return result;
  }

  // 2. Resolve canonical_word_id -> normalised word (the treasure match key).
  const canonicalIds = Array.from(new Set(events.map((event) => event.canonicalWordId)));
  const { data: wordRows, error: wordError } = await input.serviceClient
    .from("canonical_teaching_dictionary_words")
    .select("id, normalised_word")
    .in("id", canonicalIds);
  if (wordError) {
    throw wordError;
  }
  const normalisedByCanonical = new Map(
    ((wordRows ?? []) as Array<{ id: string; normalised_word: string }>).map((row) => [
      row.id,
      normaliseWordTreasureWord(row.normalised_word),
    ]),
  );

  // 3. In-forge treasures for those words (the only status that accrues bar
  //    progress), matched by corrected_word_normalized.
  const normalisedWords = Array.from(new Set([...normalisedByCanonical.values()].filter(Boolean)));
  if (normalisedWords.length === 0) {
    return result;
  }
  const { data: treasureRows, error: treasureError } = await input.supabase
    .from("child_word_treasures")
    .select(
      "id, corrected_word, corrected_word_normalized, status, authentic_correct_uses_after_forge, required_uses_for_bar, metadata",
    )
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .eq("status", "in_forge")
    .in("corrected_word_normalized", normalisedWords);
  if (treasureError) {
    throw treasureError;
  }
  const treasureByWord = new Map(
    ((treasureRows ?? []) as Array<{
      id: string;
      corrected_word: string;
      corrected_word_normalized: string;
      status: string;
      authentic_correct_uses_after_forge: number;
      required_uses_for_bar: number;
      metadata: Record<string, unknown> | null;
    }>).map((row) => [row.corrected_word_normalized, row]),
  );
  if (treasureByWord.size === 0) {
    return result;
  }

  // 4. The cross-path counted-set, then reconcile.
  const treasureIds = [...treasureByWord.values()].map((treasure) => treasure.id);
  const alreadyCounted = await loadCountedAuthenticUseKeys(input.supabase, treasureIds);

  const candidates = events
    .map((event) => {
      const normalised = normalisedByCanonical.get(event.canonicalWordId);
      const treasure = normalised ? treasureByWord.get(normalised) : undefined;
      return treasure ? { treasure, writingSampleId: event.writingSampleId } : null;
    })
    .filter((candidate): candidate is { treasure: (typeof treasureRows)[number]; writingSampleId: string } => candidate !== null)
    .map((candidate) => ({
      treasureId: candidate.treasure.id,
      writingSampleId: candidate.writingSampleId,
      treasure: candidate.treasure,
    }));

  const { credited } = reconcileAuthenticUses(candidates, alreadyCounted);

  // 5. Apply each credited use one at a time (running count per treasure).
  const runningUses = new Map<string, number>();
  for (const use of credited) {
    const treasure = use.treasure;
    const current = runningUses.get(treasure.id) ?? treasure.authentic_correct_uses_after_forge;
    const { nextUses, awardsBar } = applyForgeUses(current, treasure.required_uses_for_bar, 1);
    runningUses.set(treasure.id, nextUses);

    const inserted = await insertAuthenticUseEventIfMissing({
      supabase: input.supabase,
      treasureId: treasure.id,
      childId: input.childId,
      parentUserId: input.parentUserId,
      sourceEntityId: `ws:${use.writingSampleId}`,
      writingSampleId: use.writingSampleId,
      previousStatus: awardsBar ? "in_forge" : "in_forge",
      newStatus: awardsBar ? "golden_bar" : "in_forge",
    });
    if (!inserted) {
      // A prior identical ADLE event already counted this piece — leave the
      // running count as-is by rolling back the optimistic increment.
      runningUses.set(treasure.id, current);
      result.skippedAlreadyCounted += 1;
      continue;
    }

    const { error: updateError } = await input.supabase
      .from("child_word_treasures")
      .update({
        authentic_correct_uses_after_forge: nextUses,
        status: awardsBar ? "golden_bar" : treasure.status,
        golden_bar_at: awardsBar ? nowIso : null,
      })
      .eq("id", treasure.id)
      .eq("parent_user_id", input.parentUserId)
      .eq("child_id", input.childId);
    if (updateError) {
      throw updateError;
    }
    result.recordedUses += 1;

    if (awardsBar) {
      const barInserted = await insertGoldenBarEventIfMissing({
        supabase: input.supabase,
        treasureId: treasure.id,
        childId: input.childId,
        parentUserId: input.parentUserId,
      });
      if (barInserted) {
        result.goldenBarsAwarded += 1;
        result.barWords.push(treasure.corrected_word);
      }
    }
  }

  result.skippedAlreadyCounted += candidates.length - credited.length;
  return result;
}

// --- event ledger writes (idempotent) --------------------------------------

async function insertAuthenticUseEventIfMissing(input: {
  supabase: SupabaseServerClient;
  treasureId: string;
  childId: string;
  parentUserId: string;
  sourceEntityId: string;
  writingSampleId: string;
  previousStatus: string;
  newStatus: string;
}): Promise<boolean> {
  const { data: existing, error: existingError } = await input.supabase
    .from("child_word_treasure_events")
    .select("id")
    .eq("treasure_id", input.treasureId)
    .eq("event_type", "authentic_correct_use_recorded")
    .eq("source_type", ADLE_AUTHENTIC_USE_SOURCE_TYPE)
    .eq("source_entity_id", input.sourceEntityId)
    .maybeSingle();
  if (existingError) {
    throw existingError;
  }
  if (existing) {
    return false;
  }
  const { error } = await input.supabase.from("child_word_treasure_events").insert({
    treasure_id: input.treasureId,
    child_id: input.childId,
    parent_user_id: input.parentUserId,
    event_type: "authentic_correct_use_recorded",
    source_type: ADLE_AUTHENTIC_USE_SOURCE_TYPE,
    source_entity_id: input.sourceEntityId,
    previous_status: input.previousStatus,
    new_status: input.newStatus,
    authentic_use_increment: 1,
    metadata: { source: "adle_authentic_use", writing_sample_id: input.writingSampleId },
  });
  if (error) {
    throw error;
  }
  return true;
}

async function insertGoldenBarEventIfMissing(input: {
  supabase: SupabaseServerClient;
  treasureId: string;
  childId: string;
  parentUserId: string;
}): Promise<boolean> {
  const { data: existing, error: existingError } = await input.supabase
    .from("child_word_treasure_events")
    .select("id")
    .eq("treasure_id", input.treasureId)
    .eq("event_type", "golden_bar_awarded")
    .eq("source_type", "word_treasure")
    .eq("source_entity_id", input.treasureId)
    .maybeSingle();
  if (existingError) {
    throw existingError;
  }
  if (existing) {
    return false;
  }
  const { error } = await input.supabase.from("child_word_treasure_events").insert({
    treasure_id: input.treasureId,
    child_id: input.childId,
    parent_user_id: input.parentUserId,
    event_type: "golden_bar_awarded",
    source_type: "word_treasure",
    source_entity_id: input.treasureId,
    previous_status: "in_forge",
    new_status: "golden_bar",
    authentic_use_increment: 0,
    metadata: { source: "adle_authentic_use" },
  });
  if (error) {
    throw error;
  }
  return true;
}
