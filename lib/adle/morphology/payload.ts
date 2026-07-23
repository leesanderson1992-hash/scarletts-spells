import pilotLesson from "../../../data/adle/pilots/d4-mor-prefixes-un/v1/lesson.json";
import pilotFixture from "../../../data/adle/approved/d4-mor/v1/d4-mor-prefixes-un-pilot-source-fixture.json";

export const MORPHOLOGY_LESSON_SCHEMA_VERSION = 1 as const;
export const MORPHOLOGY_UN_MICRO_SKILL = "D4_MOR_PREFIXES_UN" as const;
export const MORPHOLOGY_LESSON_EXPERIENCE = "D4_MOR_GUIDED" as const;

/** A reviewed profile supplies the meaning-bin key; v1 happens to use not/reverse. */
export type MorphologyEffect = string;
export type MorphologyPartRole = "prefix" | "base" | "root" | "suffix" | "connector";
export type GuideState =
  | "invite"
  | "focus"
  | "model"
  | "observe"
  | "interpret"
  | "reframe"
  | "scaffold"
  | "celebrate"
  | "withdraw"
  | "reflect"
  | "guideSilent";

export interface GuideBeatV1 {
  id: string;
  activityId: string;
  state: GuideState;
  say?: string;
  narration?: string;
  goal: string;
  waitFor: string;
  onExplore?: string;
  onPartial?: string;
  onSlip?: string;
  onMisconception?: string;
  onRepeatedMisconception?: string;
  onHelpRequest?: string;
  onComplete: string;
}

export interface MorphologyWordSnapshot {
  canonicalWordId: string;
  displayWord: string;
  audioText: string;
  baseMeaning: string;
  derivedMeaning: string;
  effect: MorphologyEffect;
  parts: Array<{
    id: string;
    text: string;
    sourceText: string;
    role: MorphologyPartRole;
    gloss?: string;
    start: number;
    end: number;
  }>;
  joins: Array<{ afterPartId: string; beforePartId: string; joinType: "none" | "space" | "hyphen" }>;
  splitPoints: number[];
  /** Per-word teaching prefix; absent only on legacy fixed-prefix snapshots. */
  prefixText?: string;
  prefixLabel?: string;
}

export interface MorphologyActivityV1 {
  id: string;
  type:
    | "introduction"
    | "discovery"
    | "strip_build"
    | "meaning_sort"
    | "prefix_choice"
    | "look_cover_write_check"
    | "sentence_dictation"
    | "reflection";
  assignmentBindings: string[];
  answerVisibility: "teaching" | "guided" | "recall_neutral" | "post_submit";
  evidenceMode: "none" | "guided_completion" | "first_exposure_word";
  wordIds?: string[];
  baseWord?: string;
  prefixChoices?: PrefixChoiceV1[];
  /** Multiple guided builds are used by the in-/im-/il-/ir- profile. */
  builds?: Array<{ canonicalWordId: string; baseWord: string; targetMeaning?: string; prefixChoices: PrefixChoiceV1[] }>;
  /** A child-facing meaning target for a prefix build, when reviewed data supplies one. */
  targetMeaning?: string;
  sentences?: SentenceDictationV1[];
  promptKey?: string;
  promptText?: string;
  introScreens?: MorphologyIntroductionScreenV1[];
  discoveryCards?: MorphologyDiscoveryCardV1[];
  meaningBins?: Array<{ id: string; label: string; description: string }>;
  prefixLabel?: string;
}

export interface MorphologyIntroductionScreenV1 {
  id: string;
  title: string;
  paragraphs: string[];
  model?: { prefix: string; base: string; result: string };
  wordCards?: Array<{ base: string; derived: string; meaning: string }>;
  /** Reviewed profile examples, used by mixed-prefix family explainers. */
  examples?: Array<{ prefix: string; prefixMeaning?: string; base: string; word: string; meaning: string }>;
  ctaLabel: string;
}

export interface MorphologyDiscoveryCardV1 {
  word: string;
  baseWord: string;
  baseMeaning: string;
  derivedMeaning: string;
  distractorMeaning: string;
  /** Allows mixed-prefix profiles to label each discovery card precisely. */
  prefixLabel?: string;
}

export interface PrefixChoiceV1 {
  text: string;
  label: string;
  outcome: string | null;
  meaning: string | null;
  status: "target" | "valid_alternative" | "unsupported";
}

export interface SentenceDictationV1 {
  canonicalWordId: string;
  targetWord: string;
  sentence: string;
  targetTokenIndex: number;
}

export interface MorphologyLessonPayloadV1 {
  schemaVersion: 1;
  experience: "D4_MOR_GUIDED";
  contentVersion: string;
  microSkillId: string;
  experienceProfile: "word_lab_v1";
  guide: {
    persona: "prefix_scout";
    narrationEnabled: boolean;
    beats: GuideBeatV1[];
  };
  words: {
    anchor: MorphologyWordSnapshot;
    lesson: MorphologyWordSnapshot[];
    stretch: MorphologyWordSnapshot[];
  };
  activities: MorphologyActivityV1[];
}

export interface MorphologyPilotAssignmentItem {
  id: string;
  templateKey: string;
  sectionKey: string;
  canonicalWordId: string | null;
  targetWord: string | null;
  promptData: Record<string, unknown>;
}

export interface MorphologyPilotBindingSpec {
  binding: string;
  sectionKey: "lesson_intro" | "guided_practice" | "lesson_production" | "lesson_dictation";
  templateKey: string;
  canonicalWordId: string | null;
  targetWord: string | null;
}

type FixtureAnalysis = (typeof pilotFixture.approvedAvailableWordAnalyses)[number];
type LessonData = typeof pilotLesson;

const REQUIRED_LESSON_WORDS = ["unfair", "unkind", "unlock", "untidy"] as const;
const REQUIRED_STRETCH_WORDS = ["unnatural", "unnecessary"] as const;
const GUIDE_STATES: readonly GuideState[] = [
  "invite", "focus", "model", "observe", "interpret", "reframe", "scaffold", "celebrate", "withdraw", "reflect", "guideSilent",
];
const ACTIVITY_TYPES: readonly MorphologyActivityV1["type"][] = [
  "introduction", "discovery", "strip_build", "meaning_sort", "prefix_choice", "look_cover_write_check", "sentence_dictation", "reflection",
];

export function tokeniseSentence(sentence: string): string[] {
  return sentence
    .trim()
    .split(/\s+/)
    .map((token) => token.toLocaleLowerCase("en-GB").replace(/[^a-z'-]/g, ""))
    .filter(Boolean);
}

export function extractAuthoredTargetToken(sentence: string, targetTokenIndex: number): string {
  return tokeniseSentence(sentence)[targetTokenIndex] ?? "";
}

export function compileMorphologyUnPilotPayload(
  canonicalWordIds: Readonly<Record<string, string>>,
): MorphologyLessonPayloadV1 {
  const analyses = pilotFixture.approvedAvailableWordAnalyses;
  const byWord = new Map(analyses.map((analysis) => [analysis.displayWord, analysis]));
  const snapshot = (word: string): MorphologyWordSnapshot => {
    const analysis = byWord.get(word);
    const canonicalWordId = canonicalWordIds[word];
    const meaning = pilotLesson.meanings[word as keyof LessonData["meanings"]];
    if (!analysis || !canonicalWordId || !meaning) {
      throw new Error(`Cannot compile morphology pilot word ${word}`);
    }
    return snapshotFromAnalysis(analysis, canonicalWordId, meaning);
  };

  const lessonWords = REQUIRED_LESSON_WORDS.map(snapshot);
  const sentences = lessonWords.map((word) => {
    const authored = pilotLesson.dictation[word.displayWord as keyof LessonData["dictation"]];
    if (!authored) {
      throw new Error(`Missing dictation for ${word.displayWord}`);
    }
    return {
      canonicalWordId: word.canonicalWordId,
      targetWord: word.displayWord,
      sentence: authored.sentence,
      targetTokenIndex: authored.targetTokenIndex,
    };
  });

  return {
    schemaVersion: 1,
    experience: MORPHOLOGY_LESSON_EXPERIENCE,
    contentVersion: pilotLesson.contentVersion,
    microSkillId: MORPHOLOGY_UN_MICRO_SKILL,
    experienceProfile: "word_lab_v1",
    guide: {
      persona: "prefix_scout",
      narrationEnabled: pilotLesson.guide.narrationEnabled,
      beats: pilotLesson.beats as GuideBeatV1[],
    },
    words: {
      anchor: snapshot("unhappy"),
      lesson: lessonWords,
      stretch: REQUIRED_STRETCH_WORDS.map(snapshot),
    },
    activities: [
      { id: "introduction", type: "introduction", assignmentBindings: ["intro-root", "intro-words"], answerVisibility: "teaching", evidenceMode: "none", wordIds: ["unhappy", ...REQUIRED_LESSON_WORDS], introScreens: pilotLesson.introduction.screens as MorphologyIntroductionScreenV1[] },
      { id: "discover", type: "discovery", assignmentBindings: [], answerVisibility: "teaching", evidenceMode: "none", wordIds: ["unhappy", "unkind", "unlock", "untidy"], discoveryCards: pilotLesson.discovery.cards as MorphologyDiscoveryCardV1[] },
      { id: "strip-build", type: "strip_build", assignmentBindings: ["guided-strip-unhappy"], answerVisibility: "guided", evidenceMode: "guided_completion", wordIds: ["unhappy"] },
      { id: "meaning-match", type: "meaning_sort", assignmentBindings: REQUIRED_LESSON_WORDS.map((word) => `guided-meaning-${word}`), answerVisibility: "guided", evidenceMode: "guided_completion", wordIds: [...REQUIRED_LESSON_WORDS] },
      { id: "build-word", type: "prefix_choice", assignmentBindings: ["guided-build-untidy"], answerVisibility: "guided", evidenceMode: "guided_completion", wordIds: ["untidy"], baseWord: "tidy", prefixChoices: pilotLesson.prefixChoices as PrefixChoiceV1[] },
      { id: "controlled-spelling", type: "look_cover_write_check", assignmentBindings: REQUIRED_LESSON_WORDS.map((word) => `controlled-${word}`), answerVisibility: "recall_neutral", evidenceMode: "first_exposure_word", wordIds: [...REQUIRED_LESSON_WORDS] },
      { id: "dictation", type: "sentence_dictation", assignmentBindings: REQUIRED_LESSON_WORDS.map((word) => `dictation-${word}`), answerVisibility: "recall_neutral", evidenceMode: "first_exposure_word", wordIds: [...REQUIRED_LESSON_WORDS], sentences },
      { id: "reflection", type: "reflection", assignmentBindings: [], answerVisibility: "post_submit", evidenceMode: "none", wordIds: [...REQUIRED_LESSON_WORDS], promptKey: pilotLesson.reflection.promptKey, promptText: pilotLesson.reflection.promptText },
    ],
  };
}

export function morphologyPilotBindingSpecs(payload: MorphologyLessonPayloadV1): MorphologyPilotBindingSpec[] {
  const byWord = new Map(
    [payload.words.anchor, ...payload.words.lesson, ...payload.words.stretch].map((word) => [word.displayWord, word]),
  );
  const spec = (
    binding: string,
    sectionKey: MorphologyPilotBindingSpec["sectionKey"],
    templateKey: string,
    word: string | null = null,
  ): MorphologyPilotBindingSpec => ({
    binding,
    sectionKey,
    templateKey,
    canonicalWordId: word === null ? null : byWord.get(word)?.canonicalWordId ?? null,
    targetWord: word,
  });
  return [
    spec("intro-root", "lesson_intro", "MICRO_READ_ONLY_INTRO"),
    spec("intro-words", "lesson_intro", "LESSON_WORDS_INTRO"),
    spec("guided-strip-unhappy", "guided_practice", "MOR_STRIP_BUILD", "unhappy"),
    ...REQUIRED_LESSON_WORDS.map((word) => spec(`guided-meaning-${word}`, "guided_practice", "MOR_MEANING_MATCH", word)),
    spec("guided-build-untidy", "guided_practice", "MOR_BUILD_WORD", "untidy"),
    ...REQUIRED_LESSON_WORDS.map((word) => spec(`controlled-${word}`, "lesson_production", "CONTROLLED_SPELLING", word)),
    ...REQUIRED_LESSON_WORDS.map((word) => spec(`dictation-${word}`, "lesson_dictation", "DICTATION_NO_IMAGE", word)),
  ];
}

function snapshotFromAnalysis(
  analysis: FixtureAnalysis,
  canonicalWordId: string,
  meaning: { base: string; derived: string; effect: string },
): MorphologyWordSnapshot {
  return {
    canonicalWordId,
    displayWord: analysis.displayWord,
    audioText: analysis.displayWord,
    baseMeaning: meaning.base,
    derivedMeaning: meaning.derived,
    effect: meaning.effect as MorphologyEffect,
    parts: analysis.parts.map((part) => ({
      id: `${analysis.analysisKey}:${part.id}`,
      text: part.surfaceText,
      sourceText: part.sourceText,
      role: part.kind as MorphologyPartRole,
      gloss: part.gloss || undefined,
      start: part.displayRange.start,
      end: part.displayRange.end,
    })),
    joins: analysis.joins.map((join) => ({
      afterPartId: `${analysis.analysisKey}:${join.afterPartId}`,
      beforePartId: `${analysis.analysisKey}:${join.beforePartId}`,
      joinType: join.joinType as "none" | "space" | "hyphen",
    })),
    splitPoints: [...analysis.sourceSplitPoints],
  };
}

export function validateMorphologyLessonPayload(value: unknown): MorphologyLessonPayloadV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.experience !== MORPHOLOGY_LESSON_EXPERIENCE || value.microSkillId !== MORPHOLOGY_UN_MICRO_SKILL || value.experienceProfile !== "word_lab_v1") {
    return null;
  }
  if (typeof value.contentVersion !== "string" || value.contentVersion.trim() === "" || !isRecord(value.guide) || value.guide.persona !== "prefix_scout" || typeof value.guide.narrationEnabled !== "boolean" || !Array.isArray(value.guide.beats)) {
    return null;
  }
  if (!isRecord(value.words) || !isWord(value.words.anchor) || !Array.isArray(value.words.lesson) || !Array.isArray(value.words.stretch)) {
    return null;
  }
  if (!value.words.lesson.every(isWord) || !value.words.stretch.every(isWord) || !Array.isArray(value.activities)) {
    return null;
  }
  const lesson = value.words.lesson as MorphologyWordSnapshot[];
  if (lesson.map((word) => word.displayWord).join("|") !== REQUIRED_LESSON_WORDS.join("|")) {
    return null;
  }
  if ((value.words.anchor as MorphologyWordSnapshot).displayWord !== "unhappy" || (value.words.stretch as MorphologyWordSnapshot[]).map((word) => word.displayWord).join("|") !== REQUIRED_STRETCH_WORDS.join("|")) return null;
  if (!(value.guide.beats as unknown[]).every(isBeat) || !(value.activities as unknown[]).every(isActivity)) {
    return null;
  }
  const beats = value.guide.beats as GuideBeatV1[];
  const beatIds = new Set(beats.map((beat) => beat.id));
  if (beatIds.size !== beats.length || beats.some((beat) => beat.onComplete !== "done" && !beatIds.has(beat.onComplete))) return null;
  const activityIds = new Set((value.activities as MorphologyActivityV1[]).map((activity) => activity.id));
  if (activityIds.size !== value.activities.length) {
    return null;
  }
  const activities = value.activities as MorphologyActivityV1[];
  if (activities.length !== ACTIVITY_TYPES.length || ACTIVITY_TYPES.some((type) => !activities.some((activity) => activity.type === type))) return null;
  const expectedActivityIds: Record<MorphologyActivityV1["type"], string> = {
    introduction: "introduction",
    discovery: "discover",
    strip_build: "strip-build",
    meaning_sort: "meaning-match",
    prefix_choice: "build-word",
    look_cover_write_check: "controlled-spelling",
    sentence_dictation: "dictation",
    reflection: "reflection",
  };
  if (activities.some((activity) => activity.id !== expectedActivityIds[activity.type])) return null;
  const recallActivities = (value.activities as MorphologyActivityV1[]).filter((activity) => activity.type === "look_cover_write_check" || activity.type === "sentence_dictation");
  if (recallActivities.some((activity) => activity.answerVisibility !== "recall_neutral")) return null;
  const introduction = (value.activities as MorphologyActivityV1[]).find((activity) => activity.type === "introduction");
  const discovery = (value.activities as MorphologyActivityV1[]).find((activity) => activity.type === "discovery");
  if (!introduction?.introScreens || introduction.introScreens.length !== 3 || introduction.answerVisibility !== "teaching" || introduction.evidenceMode !== "none") return null;
  if (!discovery?.discoveryCards || discovery.discoveryCards.length !== 4 || discovery.assignmentBindings.length !== 0 || discovery.answerVisibility !== "teaching" || discovery.evidenceMode !== "none" || !discovery.discoveryCards.every(isDiscoveryCard)) return null;
  const prefix = (value.activities as MorphologyActivityV1[]).find((activity) => activity.type === "prefix_choice");
  if (!prefix?.prefixChoices || !prefix.prefixChoices.every(isPrefixChoice) || prefix.prefixChoices.filter((choice) => choice.status === "target").length !== 1 || prefix.baseWord !== "tidy") {
    return null;
  }
  if (prefix.prefixChoices.map((choice) => choice.text).join("|") !== "un|re|pre") return null;
  const dictation = (value.activities as MorphologyActivityV1[]).find((activity) => activity.type === "sentence_dictation");
  if (!dictation?.sentences || dictation.sentences.length !== 4 || !dictation.sentences.every(isSentenceDictation) || dictation.sentences.some((entry, index) => entry.canonicalWordId !== lesson[index].canonicalWordId || entry.targetWord !== lesson[index].displayWord || extractAuthoredTargetToken(entry.sentence, entry.targetTokenIndex) !== entry.targetWord)) {
    return null;
  }
  const reflection = (value.activities as MorphologyActivityV1[]).find((activity) => activity.type === "reflection");
  if (!reflection || reflection.assignmentBindings.length !== 0 || reflection.answerVisibility !== "post_submit" || reflection.evidenceMode !== "none" || reflection.promptKey !== "word-lab-un-observation-v1" || typeof reflection.promptText !== "string" || reflection.promptText.trim() === "") return null;
  const payload = value as unknown as MorphologyLessonPayloadV1;
  const expectedBindings = morphologyPilotBindingSpecs(payload).map((entry) => entry.binding);
  const actualBindings = payload.activities.flatMap((activity) => activity.assignmentBindings);
  if (actualBindings.length !== expectedBindings.length || actualBindings.some((binding, index) => binding !== expectedBindings[index])) return null;
  const activityWords = new Set([payload.words.anchor, ...payload.words.lesson, ...payload.words.stretch].map((word) => word.displayWord));
  if (activities.some((activity) => activity.wordIds?.some((word) => !activityWords.has(word)))) return null;
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  if (beats.some((beat) => !activityById.has(beat.activityId))) return null;
  return payload;
}

export function resolveMorphologyPilotRuntime(
  enabled: boolean,
  items: readonly MorphologyPilotAssignmentItem[],
): MorphologyLessonPayloadV1 | null {
  if (!enabled) return null;
  const root = items.find((item) => item.promptData.pilotActivityId === "intro-root");
  const payload = validateMorphologyLessonPayload(root?.promptData.morphologyLesson);
  if (!payload) return null;
  const specs = morphologyPilotBindingSpecs(payload);
  if (items.length !== specs.length) return null;
  const itemByBinding = new Map<string, MorphologyPilotAssignmentItem>();
  for (const item of items) {
    const binding = item.promptData.pilotActivityId;
    if (typeof binding !== "string") return null;
    if (itemByBinding.has(binding)) return null;
    itemByBinding.set(binding, item);
  }
  if (itemByBinding.size !== specs.length) return null;
  for (const spec of specs) {
    const item = itemByBinding.get(spec.binding);
    if (!item || item.sectionKey !== spec.sectionKey || item.templateKey !== spec.templateKey || item.canonicalWordId !== spec.canonicalWordId || item.targetWord !== spec.targetWord) return null;
  }
  return payload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isWord(value: unknown): value is MorphologyWordSnapshot {
  if (!isRecord(value) || typeof value.canonicalWordId !== "string" || typeof value.displayWord !== "string" || typeof value.audioText !== "string" || typeof value.baseMeaning !== "string" || typeof value.derivedMeaning !== "string" || (value.effect !== "not" && value.effect !== "reverse") || !Array.isArray(value.parts) || !Array.isArray(value.joins) || !Array.isArray(value.splitPoints)) return false;
  if (value.parts.length < 2 || !value.parts.every((part) => isRecord(part) && typeof part.id === "string" && typeof part.text === "string" && typeof part.sourceText === "string" && ["prefix", "base", "root", "suffix", "connector"].includes(String(part.role)) && Number.isInteger(part.start) && Number.isInteger(part.end) && Number(part.start) >= 0 && Number(part.end) > Number(part.start))) return false;
  const parts = value.parts as Array<{ id: string; text: string; start: number; end: number }>;
  const displayWord = value.displayWord as string;
  if (new Set(parts.map((part) => part.id)).size !== parts.length || parts.some((part, index) => part.start !== (index === 0 ? 0 : parts[index - 1].end) || part.text !== displayWord.slice(part.start, part.end)) || parts.at(-1)?.end !== displayWord.length) return false;
  const partIds = new Set(parts.map((part) => part.id));
  if (!(value.joins as unknown[]).every((join) => isRecord(join) && typeof join.afterPartId === "string" && typeof join.beforePartId === "string" && partIds.has(join.afterPartId) && partIds.has(join.beforePartId) && ["none", "space", "hyphen"].includes(String(join.joinType)))) return false;
  const joins = value.joins as Array<{ afterPartId: string; beforePartId: string }>;
  if (joins.length !== parts.length - 1 || joins.some((join, index) => join.afterPartId !== parts[index].id || join.beforePartId !== parts[index + 1].id)) return false;
  const reconstructed = (value.parts as Array<{ text: string }>).map((part) => part.text).join("");
  return reconstructed === displayWord && value.splitPoints.every((point) => Number.isInteger(point) && Number(point) > 0 && Number(point) < displayWord.length);
}

function isBeat(value: unknown): value is GuideBeatV1 {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.activityId !== "string" || !GUIDE_STATES.includes(value.state as GuideState) || typeof value.goal !== "string" || typeof value.waitFor !== "string" || typeof value.onComplete !== "string") return false;
  return ["say", "narration", "onExplore", "onPartial", "onSlip", "onMisconception", "onRepeatedMisconception", "onHelpRequest"].every((field) => value[field] === undefined || typeof value[field] === "string");
}

function isActivity(value: unknown): value is MorphologyActivityV1 {
  return isRecord(value) && typeof value.id === "string" && ACTIVITY_TYPES.includes(value.type as MorphologyActivityV1["type"]) && Array.isArray(value.assignmentBindings) && value.assignmentBindings.every((binding) => typeof binding === "string") && (value.wordIds === undefined || (Array.isArray(value.wordIds) && value.wordIds.every((word) => typeof word === "string"))) && (value.introScreens === undefined || (Array.isArray(value.introScreens) && value.introScreens.every(isIntroductionScreen))) && ["teaching", "guided", "recall_neutral", "post_submit"].includes(String(value.answerVisibility)) && ["none", "guided_completion", "first_exposure_word"].includes(String(value.evidenceMode));
}

function isIntroductionScreen(value: unknown): value is MorphologyIntroductionScreenV1 {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string" || typeof value.ctaLabel !== "string" || !Array.isArray(value.paragraphs) || !value.paragraphs.every((paragraph) => typeof paragraph === "string")) return false;
  if (value.model !== undefined && (!isRecord(value.model) || typeof value.model.prefix !== "string" || typeof value.model.base !== "string" || typeof value.model.result !== "string")) return false;
  if (value.wordCards !== undefined && (!Array.isArray(value.wordCards) || !value.wordCards.every((card) => isRecord(card) && typeof card.base === "string" && typeof card.derived === "string" && typeof card.meaning === "string"))) return false;
  return true;
}

function isDiscoveryCard(value: unknown): value is MorphologyDiscoveryCardV1 {
  return isRecord(value) && [value.word, value.baseWord, value.baseMeaning, value.derivedMeaning, value.distractorMeaning].every((entry) => typeof entry === "string" && entry.trim() !== "");
}

function isPrefixChoice(value: unknown): value is PrefixChoiceV1 {
  return isRecord(value) && typeof value.text === "string" && typeof value.label === "string" && (value.outcome === null || typeof value.outcome === "string") && (value.meaning === null || typeof value.meaning === "string") && ["target", "valid_alternative", "unsupported"].includes(String(value.status));
}

function isSentenceDictation(value: unknown): value is SentenceDictationV1 {
  return isRecord(value) && typeof value.canonicalWordId === "string" && typeof value.targetWord === "string" && typeof value.sentence === "string" && Number.isInteger(value.targetTokenIndex) && Number(value.targetTokenIndex) >= 0;
}
