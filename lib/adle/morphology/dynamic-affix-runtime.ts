import type { GuideBeatV1, MorphologyLessonPayloadV1 } from "./payload";
import { validateDynamicAffixWordLabPayload, type DynamicAffixLessonPayloadV3 } from "./affix-word-lab";

export function dynamicAffixRuntime(payload: unknown): MorphologyLessonPayloadV1 | null {
  if (!validateDynamicAffixWordLabPayload(payload)) return null;
  const snapshot = payload as DynamicAffixLessonPayloadV3;
  const words = snapshot.words.lesson.map((word) => ({ ...word, affixPosition: snapshot.affix.position, affixText: word.affixText, affixLabel: word.affixLabel }));
  const first = words[0];
  const split = snapshot.activities.guided.splitCanonicalWordIds.map((id) => words.find((word) => word.canonicalWordId === id));
  if (!first || split.some((word) => !word)) return null;
  const term = snapshot.affix.position === "after" ? "suffix" : "prefix";
  const affixMeaningSentence = `The ${term} ${snapshot.affix.label} means ${snapshot.affix.meaning}.`;
  const beats: GuideBeatV1[] = [
    { id: "intro", activityId: "introduction", state: "invite", goal: `notice the ${term}`, waitFor: "continue", onComplete: "discover" },
    { id: "discover", activityId: "discover", state: "observe", goal: "notice meaning", waitFor: "choose", onComplete: "strip-build" },
    { id: "strip-build", activityId: "strip-build", state: "scaffold", goal: "find the parts", waitFor: "split", onComplete: "build-word" },
    { id: "build-word", activityId: "build-word", state: "scaffold", goal: "build the word", waitFor: "build", onComplete: "controlled-spelling" },
    { id: "controlled-spelling", activityId: "controlled-spelling", state: "withdraw", goal: "remember each word", waitFor: "write", onComplete: "dictation" },
    { id: "dictation", activityId: "dictation", state: "guideSilent", goal: "write the sentence", waitFor: "dictate", onComplete: "reflection" },
    { id: "reflection", activityId: "reflection", state: "reflect", goal: "explain what you noticed", waitFor: "reflect", onComplete: "done" },
  ];
  return { schemaVersion: 1, experience: "D4_MOR_GUIDED", contentVersion: snapshot.contentVersion, microSkillId: snapshot.microSkillId, experienceProfile: "word_lab_v1", guide: { persona: "prefix_scout", narrationEnabled: true, beats }, words: { anchor: first, lesson: words, stretch: [] }, activities: [
    { id: "introduction", type: "introduction", assignmentBindings: ["intro-root", "intro-words"], answerVisibility: "teaching", evidenceMode: "none", introScreens: [
      { id: "affix", title: snapshot.activities.introduction.title, paragraphs: [...snapshot.activities.introduction.paragraphs, affixMeaningSentence, ...snapshot.activities.introduction.spellingRules], model: snapshot.affix.position === "after" ? { prefix: first.teachingBaseText, base: first.affixText, result: first.displayWord } : { prefix: first.affixText, base: first.teachingBaseText, result: first.displayWord }, ctaLabel: "Explore the words" },
      { id: "words", title: "Four words to explore", paragraphs: [`See how the ${term} changes each base or root word.`], wordCards: words.map((word) => ({ base: word.semanticBaseText, derived: word.displayWord, meaning: word.derivedMeaning })), ctaLabel: "Watch the meaning change" },
      { id: "ready", title: "Ready to investigate?", paragraphs: [`Find the base or root and the ${term}.`], ctaLabel: "Start" },
    ] },
    { id: "discover", type: "discovery", assignmentBindings: [], answerVisibility: "teaching", evidenceMode: "none", prefixLabel: snapshot.affix.label, affixTerm: term, affixPosition: snapshot.affix.position, discoveryCards: snapshot.activities.discovery.map((card) => ({ ...card, prefixLabel: card.affixLabel })) },
    { id: "strip-build", type: "strip_build", assignmentBindings: split.map((word) => `guided-strip-${word!.canonicalWordId}`), answerVisibility: "guided", evidenceMode: "guided_completion", wordIds: split.map((word) => word!.canonicalWordId), affixTerm: term, affixPosition: snapshot.affix.position },
    { id: "build-word", type: "prefix_choice", assignmentBindings: snapshot.activities.guided.builds.map((build) => `guided-build-${build.canonicalWordId}`), answerVisibility: "guided", evidenceMode: "guided_completion", affixTerm: term, affixPosition: snapshot.affix.position, builds: snapshot.activities.guided.builds.map((build) => ({ canonicalWordId: build.canonicalWordId, baseWord: build.baseWord, targetMeaning: build.targetMeaning, prefixChoices: build.choices })), baseWord: snapshot.activities.guided.builds[0].baseWord, targetMeaning: snapshot.activities.guided.builds[0].targetMeaning, prefixChoices: snapshot.activities.guided.builds[0].choices },
    { id: "controlled-spelling", type: "look_cover_write_check", assignmentBindings: words.map((word) => `controlled-${word.canonicalWordId}`), answerVisibility: "recall_neutral", evidenceMode: "first_exposure_word" },
    { id: "dictation", type: "sentence_dictation", assignmentBindings: words.map((word) => `dictation-${word.canonicalWordId}`), answerVisibility: "recall_neutral", evidenceMode: "first_exposure_word", sentences: snapshot.activities.dictation },
    { id: "reflection", type: "reflection", assignmentBindings: [], answerVisibility: "post_submit", evidenceMode: "none", promptKey: snapshot.activities.reflection.promptKey, promptText: snapshot.activities.reflection.promptText },
  ] };
}

export function resolveDynamicAffixRuntime(enabled: boolean, items: readonly { promptData: Record<string, unknown>; sectionKey: string; templateKey: string; canonicalWordId: string | null; targetWord: string | null }[]): MorphologyLessonPayloadV1 | null {
  if (!enabled) return null;
  const root = items.find((item) => item.promptData.dynamicAffixActivityId === "intro-root");
  const runtime = dynamicAffixRuntime(root?.promptData.dynamicAffixLesson);
  if (!runtime || items.length !== 16) return null;
  const required = new Set(["intro-root", "intro-words", ...runtime.activities.flatMap((activity) => activity.assignmentBindings)]);
  return [...required].every((id) => items.some((item) => item.promptData.dynamicAffixActivityId === id)) ? runtime : null;
}
