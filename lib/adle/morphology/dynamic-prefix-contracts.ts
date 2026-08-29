import type { LearningItemFact } from "../learning-items";
import {
  extractAuthoredTargetToken,
  type MorphologyEffect,
  type PrefixCleaverFeedbackPolicyV1,
  type MorphologyWordSnapshot,
} from "./payload";

export type { PrefixCleaverFeedbackPolicyV1 } from "./payload";

export const DYNAMIC_PREFIX_WORD_LAB_CONTENT_VERSION = "d4_mor_prefix_word_lab_v2";
export const DYNAMIC_PREFIX_WORD_LAB_PROFILE = "prefix_word_lab_v2";
export const DYNAMIC_PREFIX_WORD_LAB_WORD_COUNT = 4;
export const DYNAMIC_PREFIX_PEDAGOGY_VERSION = "dynamic_prefix_pedagogy_v1" as const;
export const DEFAULT_PREFIX_CLEAVER_FEEDBACK_POLICY: PrefixCleaverFeedbackPolicyV1 = {
  kind: "prefix_teaching_cards_retry_v1",
  firstMiss: [
    "Look for the prefix at the start of the word.",
    "Use today’s prefix cards to help.",
    "Try again.",
  ],
  repeatedMiss: [
    "Look for the prefix at the start of the word.",
    "Use today’s prefix cards to help.",
    "Try again.",
  ],
  revealCorrectBoundaryAfterMisses: false,
};
/** First released dynamic v2 profile; the retired fixed-v1 route is not a fallback. */
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
  /** Governed row identities used only by immutable specialist snapshots. */
  governance?: {
    memberId: string;
    memberSourceRowHash: string;
    dictionaryWordSourceRowHash: string;
    dictationId: string;
    dictationSourceRowHash: string;
  };
}

export interface PrefixTeachingCardV1 {
  text: string;
  label: string;
  meaning: string;
  rules: [string, ...string[]];
  example?: {
    prefix: string;
    base: string;
    word: string;
    meaning: string;
  };
}

export interface PrefixChoiceAuditV1 {
  word: string;
  choiceVerdicts: Record<string, boolean>;
}

export interface DynamicPrefixPedagogyV1 {
  version: typeof DYNAMIC_PREFIX_PEDAGOGY_VERSION;
  teachingCards: PrefixTeachingCardV1[];
  validChoiceAudit: PrefixChoiceAuditV1[];
  meaningCheckKind: "meaning" | "prefix_form";
  meaningResultsPresentation: "none";
  coverClosePolicy: { kind: "track_ratio"; threshold: 0.8 };
}

export interface DynamicPrefixProfile {
  microSkillKey: string;
  productionEnabled: boolean;
  /** Legacy/profile fallback only. Mixed profiles use each word's prefix fields. */
  prefixLabel?: string;
  prefixText?: string;
  prefixMeaning?: string;
  meaningBins: Array<{ id: string; label: string; description: string; prefixText?: string }>;
  /** Reviewed target + transfer corpus for precisely this micro-skill. */
  wordsByCanonicalId: ReadonlyMap<string, DynamicPrefixWord>;
  transferCanonicalWordIds: readonly string[];
  prefixChoices: Array<{
    text: string;
    label: string;
    outcome: string | null;
    meaning: string | null;
    rules?: readonly string[];
    example?: PrefixTeachingCardV1["example"];
    reviewedSource?: string;
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
  /** Required for newly released pedagogy snapshots; omitted by historical profiles. */
  pedagogy?: DynamicPrefixPedagogyV1;
  governance?: { profileId: string; importBatchId: string; sourceRowHash: string };
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
  presentationPolicyVersion?: typeof DYNAMIC_PREFIX_PEDAGOGY_VERSION;
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
      teachingCards?: PrefixTeachingCardV1[];
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
      meaningCheckKind?: "meaning" | "prefix_form";
      meaningResultsPresentation?: "none" | "overview_and_reflection";
      cleaverFeedbackPolicy?: PrefixCleaverFeedbackPolicyV1;
    };
    dictation: Array<{
      canonicalWordId: string;
      targetWord: string;
      sentence: string;
      targetTokenIndex: number;
    }>;
    reflection: DynamicPrefixProfile["reflection"];
    controlledPolicy?: {
      coverClosePolicy: { kind: "track_ratio"; threshold: 0.8 };
    };
  };
}

function validTeachingCard(value: PrefixTeachingCardV1): boolean {
  return Boolean(
    value
    && value.text?.trim()
    && value.label?.trim()
    && value.meaning?.trim()
    && Array.isArray(value.rules)
    && value.rules.length > 0
    && value.rules.every((rule) => rule.trim()),
  );
}

function validPedagogyPayload(payload: DynamicPrefixLessonPayloadV2): boolean {
  if (payload.presentationPolicyVersion === undefined) return true;
  if (payload.presentationPolicyVersion !== DYNAMIC_PREFIX_PEDAGOGY_VERSION) return false;
  const cards = payload.activities.introduction.teachingCards;
  const guided = payload.activities.guided;
  const controlled = payload.activities.controlledPolicy;
  if (
    !cards
    || cards.length === 0
    || cards.some((card) => !validTeachingCard(card))
    || new Set(cards.map((card) => card.text)).size !== cards.length
    || !guided
    || !guided.includeMeaningSort
    || !["meaning", "prefix_form"].includes(String(guided.meaningCheckKind))
    || guided.meaningResultsPresentation !== "none"
    || controlled?.coverClosePolicy.kind !== "track_ratio"
    || controlled.coverClosePolicy.threshold !== 0.8
  ) return false;
  if (guided.cleaverFeedbackPolicy !== undefined) {
    const policy = guided.cleaverFeedbackPolicy;
    if (
      policy.kind !== "prefix_teaching_cards_retry_v1"
      || policy.revealCorrectBoundaryAfterMisses !== false
      || !policy.firstMiss.length
      || !policy.repeatedMiss.length
      || [...policy.firstMiss, ...policy.repeatedMiss].some((line) => !line.trim())
      || policy.firstMiss.at(-1) !== "Try again."
      || policy.repeatedMiss.at(-1) !== "Try again."
      || (policy.reviewedHint !== undefined && (
        !policy.reviewedHint.text.trim()
        || policy.reviewedHint.disclosure !== "non_answer_revealing"
        || !policy.reviewedHint.source.trim()
      ))
    ) return false;
  }
  const byText = new Map(cards.map((card) => [card.text, card]));
  return payload.words.lesson.every((word) => Boolean(word.prefixText && byText.has(word.prefixText)))
    && guided.builds.every((build) => build.choices.length >= 3
      && new Set(build.choices.map((choice) => choice.text)).size === build.choices.length
      && build.choices.every((choice) => Boolean(
        choice.text.trim()
        && choice.label.trim()
        && choice.meaning?.trim()
        && choice.rules?.length
        && choice.rules.every((rule) => rule.trim())
        && choice.reviewedSource?.trim(),
      )));
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
    && validPedagogyPayload(payload)
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
