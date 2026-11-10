import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadGenericV3DictationForWords } from "../lib/adle/loaders/composer-facts-loader";
import { loadCurrentLessonSenses } from "../lib/teaching-dictionary-manager/lesson-sense-projection";

process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT = "local";
const word = "11111111-1111-4111-8111-111111111111";
const skill = "D3_PH_SPLIT_DIGRAPH_I_E";
const liveStage = { id: "stage", definition: "performed in real time", partOfSpeech: "adjective",
  pronunciationId: "stage-pronunciation", dictationSentence: "The band will play live on stage.",
  dictationTargetTokenIndex: 4 };
const liveSound = { id: "stage-pronunciation", ipa: "/laɪv/", spokenSyllableCount: 1,
  stressPattern: "primary" };
let stale = false;
let missingSentenceAuthority = false;
let twoMeanings = false;
const data = (table: string) => table === "canonical_teaching_dictionary_dictation_sentences"
  ? [{ canonical_word_id: word, dictation_sentence: "I live here.", audio_text: "I live here.",
      dictation_target_token_index: 1, source_row_hash: "legacy-hash" }]
  : table === "teaching_dictionary_effective_lesson_sense_bindings"
    ? [{ canonical_word_id: word, micro_skill_key: skill, sense_id: "stage",
        sense_snapshot: stale ? { ...liveStage, definition: "older meaning" } : liveStage,
        pronunciation_snapshot: liveSound }, ...(twoMeanings ? [{ canonical_word_id: word,
          micro_skill_key: skill, sense_id: "other", sense_snapshot: { ...liveStage, id: "other" },
          pronunciation_snapshot: liveSound }] : [])]
    : table === "teaching_dictionary_reviewed_sense_sets"
      ? [{ canonical_word_id: word, sense_set: { senses: [liveStage,
          ...(twoMeanings ? [{ ...liveStage, id: "other" }] : [])], pronunciations: [liveSound] } }]
    : table === "teaching_dictionary_reviewed_sense_sentences"
      ? missingSentenceAuthority ? [] : [{ id: "22222222-2222-4222-8222-222222222222", canonical_word_id: word,
          sense_id: "stage", sentence: liveStage.dictationSentence,
          target_token_index: 4, source_row_hash: "a".repeat(64) }]
      : [];
const db = { from: (table: string) => {
  const query = {
    select: () => query, eq: () => query, is: () => query, in: () => query,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: data(table), error: null })),
  };
  return query;
} } as unknown as SupabaseClient;

async function main() {
  const current = await loadCurrentLessonSenses(db, [word], [skill]);
  assert.equal(current.get(`${word}:${skill}`)?.status, "current");
  const selected = await loadGenericV3DictationForWords(db, [word], skill);
  assert.equal(selected.get(word)?.sentence, liveStage.dictationSentence);
  assert.equal(selected.get(word)?.targetTokenIndex, 4);
  assert.notEqual(selected.get(word)?.sourceRowHash, "legacy-hash");
  stale = true;
  const old = await loadCurrentLessonSenses(db, [word], [skill]);
  assert.equal(old.get(`${word}:${skill}`)?.status, "stale");
  assert.equal((await loadGenericV3DictationForWords(db, [word], skill)).has(word), false);
  stale = false;
  missingSentenceAuthority = true;
  assert.equal((await loadGenericV3DictationForWords(db, [word], skill)).has(word), false);
  missingSentenceAuthority = false;
  twoMeanings = true;
  assert.equal((await loadCurrentLessonSenses(db, [word], [skill])).get(`${word}:${skill}`)?.status,
    "stale", "legacy word-level lessons must not choose an arbitrary meaning");
  assert.equal((await loadGenericV3DictationForWords(db, [word], skill)).has(word), false);
  console.log("lesson sense adapter regression passed");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
