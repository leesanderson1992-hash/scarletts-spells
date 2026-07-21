/** Read-only proof: compile real staging base-word-family snapshots, without learner writes. */

import { createClient } from "@supabase/supabase-js";
import { loadBaseWordFamilyLessonReadModel } from "../lib/adle/loaders/base-word-family-lesson-read-model";
import { compileBaseWordFamilyLessonSnapshot, validateBaseWordFamilyLessonSnapshot } from "../lib/adle/morphology/base-word-family-payload";

const SKILL = "D4_MOR_BASE_WORDS_PRESERVE_BASE";

function requiredEnv(name: string): string { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}.`); return value; }

const scenarios = [
  { name: "play-player + govern-government", targets: ["player", "government"], transfers: ["play", "playing", "govern", "governor"] },
  { name: "play-played + govern-government", targets: ["played", "government"], transfers: ["play", "replay", "govern", "governor"] },
  { name: "play-player + play-played", targets: ["player", "played"], transfers: ["play", "playing", "replay", "replayed"] },
] as const;

async function main(): Promise<void> {
  const db = createClient(requiredEnv("STAGING_SUPABASE_URL"), requiredEnv("STAGING_SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: words, error } = await db.from("canonical_teaching_dictionary_words").select("id,display_word").eq("row_status", "active").in("display_word", [...new Set(scenarios.flatMap((scenario) => [...scenario.targets, ...scenario.transfers]))]);
  if (error) throw new Error(`read words: ${error.message}`);
  const wordIdByDisplay = new Map((words ?? []).map((word) => [word.display_word, word.id]));
  const wordId = (displayWord: string) => { const id = wordIdByDisplay.get(displayWord); if (!id) throw new Error(`Missing active staging word ${displayWord}.`); return id; };

  const results = [];
  for (const [index, scenario] of scenarios.entries()) {
    const targetIds = scenario.targets.map(wordId);
    const transferIds = scenario.transfers.map(wordId);
    const playIds = [...targetIds, ...transferIds].filter((id) => ["play", "player", "played", "playing", "replay", "replayed"].map(wordId).includes(id));
    const governIds = [...targetIds, ...transferIds].filter((id) => ["govern", "government", "governor"].map(wordId).includes(id));
    const readModel = await loadBaseWordFamilyLessonReadModel(db, {
      microSkillKey: SKILL,
      contentVersion: "d4-mor-base-word-family-v1",
      authenticTargets: targetIds.map((canonicalWordId, targetIndex) => ({ canonicalWordId, learningItemId: `read-only-staging-proof:${index + 1}:${targetIndex + 1}`, sourceRef: `read-only-staging-proof:${scenario.name}` })),
      sections: [
        ...(playIds.length ? [{ baseFamilyKey: "play_base_family", authenticTargetWordIds: targetIds.filter((id) => playIds.includes(id)), guidedWordIds: playIds }] : []),
        ...(governIds.length ? [{ baseFamilyKey: "govern_base_family", authenticTargetWordIds: targetIds.filter((id) => governIds.includes(id)), guidedWordIds: governIds }] : []),
      ],
      independentSlots: [
        ...targetIds.map((canonicalWordId, targetIndex) => ({ canonicalWordId, provenance: "authentic_target" as const, baseFamilyKey: scenario.targets[targetIndex] === "government" ? "govern_base_family" : "play_base_family", learningItemId: `read-only-staging-proof:${index + 1}:${targetIndex + 1}` })),
        ...transferIds.map((canonicalWordId, transferIndex) => ({ canonicalWordId, provenance: "transfer" as const, baseFamilyKey: scenario.transfers[transferIndex] === "govern" || scenario.transfers[transferIndex] === "governor" ? "govern_base_family" : "play_base_family", learningItemId: null })),
      ],
      pilotLessonNumber: index + 1,
    });
    if (!readModel) throw new Error(`${scenario.name}: staging read model was unavailable.`);
    const snapshot = compileBaseWordFamilyLessonSnapshot(readModel);
    if (!validateBaseWordFamilyLessonSnapshot(snapshot)) throw new Error(`${scenario.name}: compiled snapshot failed validation.`);
    results.push({ scenario: scenario.name, authenticTargets: snapshot.authenticTargets.map((target) => words?.find((word) => word.id === target.canonicalWordId)?.display_word), independentWords: snapshot.independentWords.map((word) => ({ word: word.displayWord, meaning: word.childFriendlyMeaning, wordSum: word.wordSum })), activityCount: snapshot.activities.length, familyCount: snapshot.familySections.length });
  }
  console.log(JSON.stringify({ status: "three_real_staging_snapshots_compiled", snapshots: results }, null, 2));
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
