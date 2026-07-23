import type { GuideBeatV1, MorphologyLessonPayloadV1 } from "./payload";
import { validateDynamicPrefixWordLabPayload, type DynamicPrefixLessonPayloadV2 } from "./dynamic-prefix-word-lab";

/**
 * Presents a v2 immutable snapshot through the shared Word Lab mechanics.
 * This is an adapter only: the persisted source remains the v2 payload.
 */
export function dynamicPrefixRuntime(payload: unknown): MorphologyLessonPayloadV1 | null {
  if (!validateDynamicPrefixWordLabPayload(payload)) return null;
  const snapshot = payload as DynamicPrefixLessonPayloadV2;
  const words = snapshot.words.lesson;
  const first = words[0];
  const guided = snapshot.activities.guided ?? {
    splitCanonicalWordIds: [first?.canonicalWordId],
    builds: [snapshot.activities.build],
    includeMeaningSort: true,
  };
  const splitWords = guided.splitCanonicalWordIds.map((id) => words.find((word) => word.canonicalWordId === id));
  const builds = guided.builds.map((build) => ({ ...build, word: words.find((word) => word.canonicalWordId === build.canonicalWordId) }));
  if (!first || splitWords.some((word) => !word) || builds.some((build) => !build.word)) return null;
  const bindings = {
    strip: splitWords.map((word) => `guided-strip-${word!.canonicalWordId}`),
    build: builds.map(({ word }) => `guided-build-${word!.canonicalWordId}`),
    meaning: guided.includeMeaningSort ? words.map((word) => `guided-meaning-${word.canonicalWordId}`) : [],
    controlled: words.map((word) => `controlled-${word.canonicalWordId}`),
    dictation: words.map((word) => `dictation-${word.canonicalWordId}`),
  };
  const beats: GuideBeatV1[] = [
    { id: "intro", activityId: "introduction", state: "invite", goal: "notice the prefix", waitFor: "continue", onComplete: "discover" },
    { id: "discover", activityId: "discover", state: "observe", goal: "notice meaning", waitFor: "choose", onComplete: "strip-build" },
    { id: "strip-build", activityId: "strip-build", state: "scaffold", goal: "find the parts", waitFor: "split", onComplete: guided.includeMeaningSort ? "meaning-match" : "build-word" },
    ...(guided.includeMeaningSort ? [{ id: "meaning-match", activityId: "meaning-match", state: "interpret" as const, goal: "sort meanings", waitFor: "sort", onComplete: "build-word" }] : []),
    { id: "build-word", activityId: "build-word", state: "scaffold", goal: "build the word", waitFor: "build", onComplete: "controlled-spelling" },
    { id: "controlled-spelling", activityId: "controlled-spelling", state: "withdraw", goal: "remember each word", waitFor: "write", onComplete: "dictation" },
    { id: "dictation", activityId: "dictation", state: "guideSilent", goal: "write the sentence", waitFor: "dictate", onComplete: "reflection" },
    { id: "reflection", activityId: "reflection", state: "reflect", goal: "explain what you noticed", waitFor: "reflect", onComplete: "done" },
  ];
  return {
    schemaVersion: 1, experience: "D4_MOR_GUIDED", contentVersion: snapshot.contentVersion, microSkillId: snapshot.microSkillId, experienceProfile: "word_lab_v1",
    guide: { persona: "prefix_scout", narrationEnabled: true, beats }, words: { anchor: first, lesson: words, stretch: [] },
    activities: [
      { id: "introduction", type: "introduction", assignmentBindings: ["intro-root", "intro-words"], answerVisibility: "teaching", evidenceMode: "none", introScreens: [{ id: "prefix", title: snapshot.activities.introduction.title, paragraphs: snapshot.activities.introduction.paragraphs, model: { prefix: first.prefixText ?? snapshot.prefix.text, base: first.baseWord, result: first.displayWord }, ctaLabel: snapshot.activities.introduction.profileTitle ? "Meet this prefix family" : "Explore the words" }, snapshot.activities.introduction.profileTitle ? { id: "profile", title: snapshot.activities.introduction.profileTitle, paragraphs: snapshot.activities.introduction.profileParagraphs ?? [], examples: snapshot.activities.introduction.profileExamples, ctaLabel: "Explore the words" } : { id: "words", title: "Four words to explore", paragraphs: ["See how the prefix changes each base word."], wordCards: words.map((word) => ({ base: word.baseWord, derived: word.displayWord, meaning: word.derivedMeaning })), ctaLabel: "Watch the meaning change" }, snapshot.activities.introduction.profileTitle ? { id: "words", title: "Four words to explore", paragraphs: ["See how the prefix family changes each base or root word."], wordCards: words.map((word) => ({ base: word.baseWord, derived: word.displayWord, meaning: word.derivedMeaning })), ctaLabel: "Watch the meaning change" } : { id: "ready", title: "Ready to investigate?", paragraphs: ["Find the prefix and the base word."], ctaLabel: "Start" }] },
      { id: "discover", type: "discovery", assignmentBindings: [], answerVisibility: "teaching", evidenceMode: "none", prefixLabel: snapshot.prefix.label, discoveryCards: snapshot.activities.discovery },
      { id: "strip-build", type: "strip_build", assignmentBindings: bindings.strip, answerVisibility: "guided", evidenceMode: "guided_completion", wordIds: splitWords.map((word) => word!.canonicalWordId) },
      ...(guided.includeMeaningSort ? [{ id: "meaning-match", type: "meaning_sort" as const, assignmentBindings: bindings.meaning, answerVisibility: "guided" as const, evidenceMode: "guided_completion" as const, prefixLabel: snapshot.prefix.label, meaningBins: snapshot.activities.meaningBins }] : []),
      { id: "build-word", type: "prefix_choice", assignmentBindings: bindings.build, answerVisibility: "guided", evidenceMode: "guided_completion", builds: builds.map(({ word, choices, targetMeaning }) => ({ canonicalWordId: word!.canonicalWordId, baseWord: word!.baseWord, targetMeaning, prefixChoices: choices })), baseWord: builds[0].word!.baseWord, targetMeaning: builds[0].targetMeaning, prefixChoices: builds[0].choices },
      { id: "controlled-spelling", type: "look_cover_write_check", assignmentBindings: bindings.controlled, answerVisibility: "recall_neutral", evidenceMode: "first_exposure_word" },
      { id: "dictation", type: "sentence_dictation", assignmentBindings: bindings.dictation, answerVisibility: "recall_neutral", evidenceMode: "first_exposure_word", sentences: snapshot.activities.dictation.map((sentence) => ({ canonicalWordId: sentence.canonicalWordId, targetWord: sentence.targetWord, sentence: sentence.sentence, targetTokenIndex: sentence.targetTokenIndex })) },
      { id: "reflection", type: "reflection", assignmentBindings: [], answerVisibility: "post_submit", evidenceMode: "none", promptKey: snapshot.activities.reflection.promptKey, promptText: snapshot.activities.reflection.promptText },
    ],
  };
}

export function resolveDynamicPrefixRuntime(
  enabled: boolean,
  items: readonly {
    promptData: Record<string, unknown>;
    sectionKey: string;
    templateKey: string;
    canonicalWordId: string | null;
    targetWord: string | null;
  }[],
): MorphologyLessonPayloadV1 | null {
  if (!enabled) return null;
  const root = items.find((item) => item.promptData.dynamicPrefixActivityId === "intro-root");
  const runtime = dynamicPrefixRuntime(root?.promptData.dynamicPrefixLesson);
  if (!runtime || !hasCompleteDynamicPrefixBindings(items, runtime)) return null;
  return runtime;
}

/** Reject a partially written or mismatched v2 assignment rather than rendering it. */
function hasCompleteDynamicPrefixBindings(
  items: readonly { promptData: Record<string, unknown>; sectionKey: string; templateKey: string; canonicalWordId: string | null; targetWord: string | null }[],
  runtime: MorphologyLessonPayloadV1,
): boolean {
  const words = runtime.words.lesson;
  if (words.length !== 4) return false;
  const strip = runtime.activities.find((activity) => activity.type === "strip_build");
  const prefix = runtime.activities.find((activity) => activity.type === "prefix_choice");
  if (!strip || !prefix) return false;
  const includeMeaningSort = Boolean(runtime.activities.find((activity) => activity.type === "meaning_sort"));
  const splitWords = strip.assignmentBindings.map((binding) => words.find((word) => binding === `guided-strip-${word.canonicalWordId}`));
  const buildWords = prefix.assignmentBindings.map((binding) => words.find((word) => binding === `guided-build-${word.canonicalWordId}`));
  if (splitWords.some((word) => !word) || buildWords.some((word) => !word)) return false;
  const expected = [
    { id: "intro-root", section: "lesson_intro", template: "MICRO_READ_ONLY_INTRO", word: null },
    { id: "intro-words", section: "lesson_intro", template: "LESSON_WORDS_INTRO", word: null },
    ...splitWords.map((word) => ({ id: `guided-strip-${word!.canonicalWordId}`, section: "guided_practice", template: "MOR_STRIP_BUILD", word: word! })),
    ...(includeMeaningSort ? words.map((word) => ({ id: `guided-meaning-${word.canonicalWordId}`, section: "guided_practice", template: "MOR_MEANING_MATCH", word })) : []),
    ...buildWords.map((word) => ({ id: `guided-build-${word!.canonicalWordId}`, section: "guided_practice", template: "MOR_BUILD_WORD", word: word! })),
    ...words.map((word) => ({ id: `controlled-${word.canonicalWordId}`, section: "lesson_production", template: "CONTROLLED_SPELLING", word })),
    ...words.map((word) => ({ id: `dictation-${word.canonicalWordId}`, section: "lesson_dictation", template: "DICTATION_NO_IMAGE", word })),
  ];
  return items.length === expected.length && expected.every(({ id, section, template, word }) => items.some((item) =>
    item.promptData.dynamicPrefixActivityId === id
    && item.sectionKey === section
    && item.templateKey === template
    && (word === null || (item.canonicalWordId === word.canonicalWordId && item.targetWord === word.displayWord)),
  ));
}
