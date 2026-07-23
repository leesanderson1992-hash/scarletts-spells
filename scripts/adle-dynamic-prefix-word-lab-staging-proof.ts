import { createClient } from "@supabase/supabase-js";
import { compileDynamicPrefixWordLabPayload, selectDynamicPrefixWordLab, validateDynamicPrefixWordLabPayload, type DynamicPrefixProfile } from "../lib/adle/morphology/dynamic-prefix-word-lab";
import type { LearningItemFact } from "../lib/adle/learning-items";

const STAGING_HOST = "jlhotktspjvffslvuyfz.supabase.co";
const CHILD_ID = "2384c61c-7eb6-4bc5-8bd7-939a71ab51bb";
const SKILL = "D4_MOR_PREFIXES_UN";
const SOURCE_PREFIX = "staging-verified-seed:dynamic-prefix-un:2026-07-21:";

const approvedProfileWords = [
  { wordKey: "unhappy_en_gb", baseWord: "happy", baseMeaning: "feeling pleased", derivedMeaning: "not happy", effect: "not" as const },
  { wordKey: "unfair_en_gb", baseWord: "fair", baseMeaning: "fair and equal", derivedMeaning: "not fair", effect: "not" as const },
  { wordKey: "unkind_en_gb", baseWord: "kind", baseMeaning: "caring and helpful", derivedMeaning: "not kind", effect: "not" as const },
  { wordKey: "unlock_en_gb", baseWord: "lock", baseMeaning: "close with a lock", derivedMeaning: "reverse the lock", effect: "reverse" as const },
  { wordKey: "untidy_en_gb", baseWord: "tidy", baseMeaning: "neat and ordered", derivedMeaning: "not tidy", effect: "not" as const },
  { wordKey: "unnatural_en_gb", baseWord: "natural", baseMeaning: "found in nature", derivedMeaning: "not natural", effect: "not" as const },
  { wordKey: "unnecessary_en_gb", baseWord: "necessary", baseMeaning: "needed", derivedMeaning: "not necessary", effect: "not" as const },
] as const;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  if (process.env.ADLE_DYNAMIC_PREFIX_ACCEPT_STAGING !== "disposable-data-only") throw new Error("Refusing remote proof without ADLE_DYNAMIC_PREFIX_ACCEPT_STAGING=disposable-data-only.");
  const url = required("STAGING_SUPABASE_URL");
  if (new URL(url).host !== STAGING_HOST) throw new Error(`Refusing non-staging host ${new URL(url).host}.`);
  const db = createClient(url, required("STAGING_SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const keys = approvedProfileWords.map((word) => word.wordKey);
  const [{ data: words, error: wordsError }, { data: items, error: itemsError }] = await Promise.all([
    db.from("canonical_teaching_dictionary_words").select("id,word_key,display_word,row_status,review_status,canonical_teaching_dictionary_dictation_sentences!inner(dictation_sentence,dictation_target_token_index,audio_text,row_status,review_status)").in("word_key", keys),
    db.from("adle_learning_items").select("id,child_id,canonical_word_id,micro_skill_key,item_status,source_kind,source_ref,source_attempt_text,reteach_priority,ejected_on,intake_on,row_status").eq("child_id", CHILD_ID).eq("micro_skill_key", SKILL).like("source_ref", `${SOURCE_PREFIX}%`).order("intake_on"),
  ]);
  if (wordsError) throw new Error(`Read words: ${wordsError.message}`);
  if (itemsError) throw new Error(`Read learning items: ${itemsError.message}`);
  assert((words ?? []).length === 7, "Expected exactly seven approved canonical profile words.");
  assert((items ?? []).length >= 5, "Expected at least five seeded verified learning items.");
  const wordByKey = new Map((words ?? []).map((word) => [word.word_key, word]));
  const profileWords = new Map();
  for (const definition of approvedProfileWords) {
    const word = wordByKey.get(definition.wordKey) as any;
    assert(word && word.row_status === "active" && word.review_status === "approved_for_first_exposure", `Word ${definition.wordKey} is not approved.`);
    const dictations = word.canonical_teaching_dictionary_dictation_sentences as Array<any>;
    assert(dictations?.length === 1, `Expected exactly one dictionary dictation row for ${definition.wordKey}.`);
    const dictation = dictations[0];
    assert(dictation.row_status === "active" && dictation.review_status === "approved_for_first_exposure", `Dictation for ${definition.wordKey} is not approved.`);
    const displayWord = word.display_word as string;
    profileWords.set(word.id, {
      canonicalWordId: word.id, displayWord, audioText: dictation.audio_text, baseWord: definition.baseWord, baseMeaning: definition.baseMeaning, derivedMeaning: definition.derivedMeaning, effect: definition.effect,
      parts: [
        { id: `${word.id}:prefix`, text: "un", sourceText: "un", role: "prefix", gloss: definition.effect === "reverse" ? "opposite of" : "not", start: 0, end: 2 },
        { id: `${word.id}:base`, text: definition.baseWord, sourceText: definition.baseWord, role: "base", start: 2, end: displayWord.length },
      ],
      joins: [{ afterPartId: `${word.id}:prefix`, beforePartId: `${word.id}:base`, joinType: "none" }], splitPoints: [2], dictationSentence: dictation.dictation_sentence, dictationTargetTokenIndex: dictation.dictation_target_token_index, approvedTransfer: true,
    });
  }
  const profile: DynamicPrefixProfile = {
    microSkillKey: SKILL, productionEnabled: true, prefixLabel: "un-", prefixText: "un", prefixMeaning: "not or the opposite of", meaningBins: [{ id: "not", label: "NOT", description: "not" }, { id: "reverse", label: "REVERSE", description: "reverse" }], wordsByCanonicalId: profileWords,
    transferCanonicalWordIds: approvedProfileWords.map((definition) => (wordByKey.get(definition.wordKey) as any).id),
    prefixChoices: [{ text: "un", label: "un-", outcome: "correct", meaning: "not or the opposite of", status: "target" }, { text: "re", label: "re-", outcome: null, meaning: "again", status: "valid_alternative" }, { text: "", label: "no prefix", outcome: null, meaning: null, status: "unsupported" }],
    reflection: { promptKey: "dynamic-prefix-un-observation-v2", promptText: "What did un- do to the meaning of each word?" },
  };
  const facts: LearningItemFact[] = (items ?? []).map((item: any) => ({ learningItemId: item.id, childId: item.child_id, canonicalWordId: item.canonical_word_id, microSkillKey: item.micro_skill_key, itemStatus: item.item_status, sourceKind: item.source_kind, sourceRef: item.source_ref, sourceAttemptText: item.source_attempt_text, reteachPriority: item.reteach_priority, ejectedOn: item.ejected_on, intakeOn: item.intake_on, rowStatus: item.row_status }));
  assert(facts.every((item) => item.sourceKind === "verified_misspelling" && item.sourceAttemptText === null && item.itemStatus === "pending" && item.rowStatus === "active"), "Seed queue is not verified, unresolved, and raw-free.");
  const scenarios = [1, 2, 3, 4, 5].map((targetCount) => {
    const selection = selectDynamicPrefixWordLab({ profiles: [profile], learningItems: facts.slice(0, targetCount) });
    assert(selection, `Dynamic selector failed closed unexpectedly for ${targetCount} authentic targets.`);
    assert(selection.authenticTargets.length === Math.min(targetCount, 4) && selection.transfers.length === Math.max(0, 4 - targetCount), `Unexpected transfer fill for ${targetCount} authentic targets.`);
    if (targetCount > 4) assert(facts.slice(4, targetCount).every((item) => item.itemStatus === "pending"), "Overflow authentic targets must remain pending.");
    const payload = compileDynamicPrefixWordLabPayload(selection);
    assert(payload && validateDynamicPrefixWordLabPayload(payload), `Compiled payload is invalid for ${targetCount} authentic targets.`);
    return { authenticTargetsPresented: selection.authenticTargets.length, authenticTargetsPendingOverflow: Math.max(0, targetCount - 4), transfers: selection.transfers.length, selectedWordOrder: payload.words.lesson.map((word) => word.displayWord), dictationValidated: payload.activities.dictation.length === 4 };
  });
  console.log(JSON.stringify({ status: "passed", childId: CHILD_ID, scenarios, routeActivated: false }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
