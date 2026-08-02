import type { LearningItemFact } from "../learning-items";
import {
  extractAuthoredTargetToken,
  type MorphologyEffect,
  type MorphologyWordSnapshot,
} from "./payload";

export const DYNAMIC_PREFIX_WORD_LAB_CONTENT_VERSION = "d4_mor_prefix_word_lab_v2";
export const DYNAMIC_PREFIX_WORD_LAB_PROFILE = "prefix_word_lab_v2";
export const DYNAMIC_PREFIX_WORD_LAB_WORD_COUNT = 4;
/** First released dynamic profile; legacy fixed v1 remains independently supported. */
export const DYNAMIC_PREFIX_INITIAL_PROFILE_KEY = "D4_MOR_PREFIXES_UN";

export interface DynamicPrefixWord {
  canonicalWordId: string;
  displayWord: string;
  audioText: string;
  baseWord: string;
  /** Child-facing non-prefix teaching text used to reconstruct the word. */
  teachingBuildText?: string;
  baseMeaning: string;
  derivedMeaning: string;
  effect: MorphologyEffect;
  parts: MorphologyWordSnapshot["parts"];
  joins: MorphologyWordSnapshot["joins"];
  splitPoints: number[];
  dictationSentence: string;
  dictationTargetTokenIndex: number;
  /** The approved teaching prefix for this word (for example dis-, mis-, il-). */
  prefixText?: string;
  prefixLabel?: string;
  prefixMeaning?: string;
  /** Only reviewed, assignment-safe words can be selected as transfers. */
  approvedTransfer: boolean;
}

export interface DynamicPrefixProfile {
  microSkillKey: string;
  productionEnabled: boolean;
  /** Legacy/profile fallback only. Mixed profiles use each word's prefix fields. */
  prefixLabel?: string;
  prefixText?: string;
  prefixMeaning?: string;
  meaningBins: Array<{ id: string; label: string; description: string }>;
  /** Reviewed target + transfer corpus for precisely this micro-skill. */
  wordsByCanonicalId: ReadonlyMap<string, DynamicPrefixWord>;
  transferCanonicalWordIds: readonly string[];
  prefixChoices: Array<{
    text: string;
    label: string;
    outcome: string | null;
    meaning: string | null;
    status: "target" | "valid_alternative" | "unsupported";
  }>;
  reflection: { promptKey: string; promptText: string };
  /** Optional reviewed child-facing profile explainer, stored with the profile. */
  introduction?: {
    title: string;
    paragraphs: string[];
    examples?: Array<{
      prefix: string;
      prefixMeaning?: string;
      base: string;
      word: string;
      meaning: string;
    }>;
  };
}

export interface DynamicPrefixSelection {
  profile: DynamicPrefixProfile;
  authenticTargets: LearningItemFact[];
  transfers: DynamicPrefixWord[];
}

export interface DynamicPrefixLessonPayloadV2 {
  schemaVersion: 2;
  experience: "D4_MOR_GUIDED";
  contentVersion: string;
  microSkillId: string;
  experienceProfile: "prefix_word_lab_v2";
  prefix: { text: string; label: string; meaning: string };
  authenticCanonicalWordIds: string[];
  words: {
    lesson: Array<MorphologyWordSnapshot & {
      source: "authentic" | "transfer";
      baseWord: string;
    }>;
  };
  activities: {
    introduction: {
      title: string;
      paragraphs: string[];
      profileTitle?: string;
      profileParagraphs?: string[];
      profileExamples?: Array<{
        prefix: string;
        prefixMeaning?: string;
        base: string;
        word: string;
        meaning: string;
      }>;
    };
    discovery: Array<{
      canonicalWordId: string;
      word: string;
      baseWord: string;
      baseMeaning: string;
      derivedMeaning: string;
      distractorMeaning: string;
      prefixLabel: string;
    }>;
    meaningBins: DynamicPrefixProfile["meaningBins"];
    build: {
      canonicalWordId: string;
      baseWord: string;
      targetMeaning: string;
      choices: DynamicPrefixProfile["prefixChoices"];
    };
    /** Older snapshots omit this and use split + meaning-sort + build. */
    guided?: {
      splitCanonicalWordIds: string[];
      builds: Array<{
        canonicalWordId: string;
        baseWord: string;
        targetMeaning: string;
        choices: DynamicPrefixProfile["prefixChoices"];
      }>;
      includeMeaningSort: boolean;
    };
    dictation: Array<{
      canonicalWordId: string;
      targetWord: string;
      sentence: string;
      targetTokenIndex: number;
    }>;
    reflection: DynamicPrefixProfile["reflection"];
  };
}

export function resolveDynamicPrefixFacts(
  word: DynamicPrefixWord,
  profile: DynamicPrefixProfile,
): { text: string; label: string; meaning: string } | null {
  const part = word.parts.find((candidate) => candidate.role === "prefix");
  const text = word.prefixText ?? part?.text ?? profile.prefixText;
  const label = word.prefixLabel ?? (text ? `${text}-` : undefined) ?? profile.prefixLabel;
  const meaning = word.prefixMeaning ?? part?.gloss ?? profile.prefixMeaning ?? "changes the meaning";
  return text && label ? { text, label, meaning } : null;
}

export function validateDynamicPrefixWordLabPayload(
  value: unknown,
): value is DynamicPrefixLessonPayloadV2 {
  if (value === null || typeof value !== "object") return false;
  const payload = value as DynamicPrefixLessonPayloadV2;
  if (
    payload.schemaVersion !== 2
    || payload.experience !== "D4_MOR_GUIDED"
    || payload.experienceProfile !== DYNAMIC_PREFIX_WORD_LAB_PROFILE
    || !payload.microSkillId
    || payload.words?.lesson?.length !== DYNAMIC_PREFIX_WORD_LAB_WORD_COUNT
    || payload.authenticCanonicalWordIds.length < 1
    || payload.authenticCanonicalWordIds.length > DYNAMIC_PREFIX_WORD_LAB_WORD_COUNT
  ) return false;
  if (
    new Set(payload.words.lesson.map((word) => word.canonicalWordId)).size !== DYNAMIC_PREFIX_WORD_LAB_WORD_COUNT
    || payload.activities.dictation.length !== DYNAMIC_PREFIX_WORD_LAB_WORD_COUNT
    || payload.activities.discovery.length !== DYNAMIC_PREFIX_WORD_LAB_WORD_COUNT
    || !Array.isArray(payload.activities.meaningBins)
    || payload.activities.meaningBins.length < 2
  ) return false;
  const bins = new Set(payload.activities.meaningBins.map((bin) => bin.id));
  const guided = payload.activities.guided;
  const validGuided = !guided || (
    guided.splitCanonicalWordIds.length > 0
    && guided.builds.length > 0
    && guided.splitCanonicalWordIds.every((id) =>
      payload.words.lesson.some((word) => word.canonicalWordId === id),
    )
    && guided.builds.every((build) =>
      payload.words.lesson.some((word) => word.canonicalWordId === build.canonicalWordId)
      && build.choices.filter((choice) => choice.status === "target").length === 1,
    )
  );
  const introduction = payload.activities.introduction;
  const validExamples = !introduction.profileExamples
    || introduction.profileExamples.every((example) => Boolean(
      example.prefix?.trim()
      && (!example.prefixMeaning || example.prefixMeaning.trim())
      && example.base?.trim()
      && example.word?.trim()
      && example.meaning?.trim(),
    ));
  const validIntroduction = !introduction.profileTitle || Boolean(
    introduction.profileTitle.trim()
    && introduction.profileParagraphs?.length
    && introduction.profileParagraphs.every((paragraph) => paragraph.trim())
    && validExamples,
  );
  return validIntroduction
    && validGuided
    && payload.words.lesson.every((word, index) =>
      word.parts.length >= 2
      && word.joins.length === word.parts.length - 1
      && !!word.prefixText
      && !!word.prefixLabel
      && bins.has(word.effect)
      && payload.activities.discovery[index]?.prefixLabel === word.prefixLabel
      && payload.activities.dictation[index]?.canonicalWordId === word.canonicalWordId
      && extractAuthoredTargetToken(
        payload.activities.dictation[index].sentence,
        payload.activities.dictation[index].targetTokenIndex,
      ) === word.displayWord,
    )
    && Boolean(payload.activities.build.targetMeaning?.trim())
    && (!guided || guided.builds.every((build) => Boolean(build.targetMeaning?.trim())))
    && payload.activities.build.choices.filter((choice) => choice.status === "target").length === 1;
}
