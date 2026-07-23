import { compareOldestItemFirst, selectableLearningItems, type LearningItemFact } from "../learning-items";
import { extractAuthoredTargetToken, type MorphologyEffect, type MorphologyWordSnapshot } from "./payload";

/**
 * Version-two Prefix Word Lab compiler.  This is deliberately fact-fed: the
 * review bridge must supply only verified authentic items and reviewed profile
 * content.  It neither reads raw corrections nor creates learning items.
 */
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
  prefixChoices: Array<{ text: string; label: string; outcome: string | null; meaning: string | null; status: "target" | "valid_alternative" | "unsupported" }>;
  reflection: { promptKey: string; promptText: string };
  /** Optional reviewed child-facing profile explainer, stored with the profile. */
  introduction?: { title: string; paragraphs: string[]; examples?: Array<{ prefix: string; prefixMeaning?: string; base: string; word: string; meaning: string }> };
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
  words: { lesson: Array<MorphologyWordSnapshot & { source: "authentic" | "transfer"; baseWord: string }>; };
  activities: {
    introduction: { title: string; paragraphs: string[]; profileTitle?: string; profileParagraphs?: string[]; profileExamples?: Array<{ prefix: string; prefixMeaning?: string; base: string; word: string; meaning: string }> };
    discovery: Array<{ canonicalWordId: string; word: string; baseWord: string; baseMeaning: string; derivedMeaning: string; distractorMeaning: string; prefixLabel: string }>;
    meaningBins: DynamicPrefixProfile["meaningBins"];
    build: { canonicalWordId: string; baseWord: string; targetMeaning: string; choices: DynamicPrefixProfile["prefixChoices"] };
    /**
     * A profile may rebalance the six guided slots while retaining the
     * immutable sixteen-item assignment.  Older snapshots omit this and use
     * the released split + meaning-sort + build sequence.
     */
    guided?: {
      splitCanonicalWordIds: string[];
      builds: Array<{ canonicalWordId: string; baseWord: string; targetMeaning: string; choices: DynamicPrefixProfile["prefixChoices"] }>;
      includeMeaningSort: boolean;
    };
    dictation: Array<{ canonicalWordId: string; targetWord: string; sentence: string; targetTokenIndex: number }>;
    reflection: DynamicPrefixProfile["reflection"];
  };
}

function prefixFor(word: DynamicPrefixWord, profile: DynamicPrefixProfile): { text: string; label: string; meaning: string } | null {
  const part = word.parts.find((candidate) => candidate.role === "prefix");
  const text = word.prefixText ?? part?.text ?? profile.prefixText;
  const label = word.prefixLabel ?? (text ? `${text}-` : undefined) ?? profile.prefixLabel;
  const meaning = word.prefixMeaning ?? part?.gloss ?? profile.prefixMeaning ?? "changes the meaning";
  return text && label ? { text, label, meaning } : null;
}

function distinctAuthenticItems(items: readonly LearningItemFact[], profile: DynamicPrefixProfile): LearningItemFact[] {
  const seen = new Set<string>();
  return selectableLearningItems(items)
    .filter((item) => item.microSkillKey === profile.microSkillKey && item.sourceKind === "verified_misspelling" && profile.wordsByCanonicalId.has(item.canonicalWordId))
    .filter((item) => (seen.has(item.canonicalWordId) ? false : (seen.add(item.canonicalWordId), true)));
}

/**
 * Transfer words remain in their reviewed profile order, except that a mixed
 * profile first uses a still-unseen prefix form where one is available.  This
 * never displaces an authentic target: it only makes the transfer fill show
 * the widest useful form coverage for the same micro-skill.
 */
function coverageFirstTransfers(profile: DynamicPrefixProfile, used: ReadonlySet<string>): DynamicPrefixWord[] {
  const candidates = profile.transferCanonicalWordIds
    .map((canonicalWordId) => profile.wordsByCanonicalId.get(canonicalWordId))
    .filter((word): word is DynamicPrefixWord => Boolean(word && word.approvedTransfer && !used.has(word.canonicalWordId)));
  const seenForms = new Set(
    [...used]
      .map((canonicalWordId) => profile.wordsByCanonicalId.get(canonicalWordId))
      .map((word) => word && prefixFor(word, profile)?.text)
      .filter((prefix): prefix is string => Boolean(prefix)),
  );
  const selected: DynamicPrefixWord[] = [];
  const remaining = [...candidates];
  while (remaining.length > 0) {
    const uncovered = remaining.find((word) => {
      const prefix = prefixFor(word, profile)?.text;
      return Boolean(prefix && !seenForms.has(prefix));
    });
    const next = uncovered ?? remaining[0];
    selected.push(next);
    const prefix = prefixFor(next, profile)?.text;
    if (prefix) seenForms.add(prefix);
    remaining.splice(remaining.indexOf(next), 1);
  }
  return selected;
}

/** Select the largest distinct authentic queue, then reteach, age, and key. */
export function selectDynamicPrefixWordLab(params: { profiles: readonly DynamicPrefixProfile[]; learningItems: readonly LearningItemFact[] }): DynamicPrefixSelection | null {
  const candidates = params.profiles
    .filter((profile) => profile.productionEnabled)
    .map((profile) => ({ profile, authentic: distinctAuthenticItems(params.learningItems, profile) }))
    .filter((candidate) => candidate.authentic.length > 0)
    .sort((left, right) => {
      if (left.authentic.length !== right.authentic.length) return right.authentic.length - left.authentic.length;
      const leftReteach = left.authentic.some((item) => item.reteachPriority);
      const rightReteach = right.authentic.some((item) => item.reteachPriority);
      if (leftReteach !== rightReteach) return leftReteach ? -1 : 1;
      const oldest = compareOldestItemFirst(left.authentic[0], right.authentic[0]);
      return oldest || left.profile.microSkillKey.localeCompare(right.profile.microSkillKey);
    });
  const selected = candidates[0];
  if (!selected) return null;
  const authenticTargets = selected.authentic.slice(0, DYNAMIC_PREFIX_WORD_LAB_WORD_COUNT);
  const used = new Set(authenticTargets.map((item) => item.canonicalWordId));
  const transfers: DynamicPrefixWord[] = [];
  if (authenticTargets.length === DYNAMIC_PREFIX_WORD_LAB_WORD_COUNT) {
    return { profile: selected.profile, authenticTargets, transfers };
  }
  for (const word of coverageFirstTransfers(selected.profile, used)) {
    if (used.has(word.canonicalWordId)) continue;
    transfers.push(word); used.add(word.canonicalWordId);
    if (authenticTargets.length + transfers.length === DYNAMIC_PREFIX_WORD_LAB_WORD_COUNT) break;
  }
  return authenticTargets.length + transfers.length === DYNAMIC_PREFIX_WORD_LAB_WORD_COUNT
    ? { profile: selected.profile, authenticTargets, transfers }
    : null;
}

/** Immutable payload compilation. Missing reviewed analysis, sentence, or profile fields fail closed. */
export function compileDynamicPrefixWordLabPayload(selection: DynamicPrefixSelection): DynamicPrefixLessonPayloadV2 | null {
  const selected = [...selection.authenticTargets.map((item) => ({ item, source: "authentic" as const })), ...selection.transfers.map((word) => ({ word, source: "transfer" as const }))];
  if (selected.length !== DYNAMIC_PREFIX_WORD_LAB_WORD_COUNT || !selection.profile.reflection.promptKey || !selection.profile.reflection.promptText || selection.profile.meaningBins.length < 2 || new Set(selection.profile.meaningBins.map((bin) => bin.id)).size !== selection.profile.meaningBins.length) return null;
  const words = selected.map((entry) => {
    const word = "item" in entry ? selection.profile.wordsByCanonicalId.get(entry.item.canonicalWordId) : entry.word;
    const prefix = word && prefixFor(word, selection.profile);
    const teachingBuildText = word?.teachingBuildText ?? word?.parts.filter((part) => part.role !== "prefix").map((part) => part.text).join("");
    if (!word || !prefix || !word.displayWord || !word.baseWord || !teachingBuildText || `${prefix.text}${teachingBuildText}` !== word.displayWord || !word.baseMeaning || !word.derivedMeaning || word.parts.length < 2 || word.joins.length !== word.parts.length - 1 || word.parts.map((part) => part.text).join("") !== word.displayWord || word.splitPoints.length !== 1 || !Number.isInteger(word.splitPoints[0]) || word.splitPoints[0] <= 0 || word.splitPoints[0] >= word.displayWord.length || !word.dictationSentence || word.audioText !== word.dictationSentence || extractAuthoredTargetToken(word.dictationSentence, word.dictationTargetTokenIndex) !== word.displayWord) return null;
    return { canonicalWordId: word.canonicalWordId, displayWord: word.displayWord, audioText: word.audioText, baseMeaning: word.baseMeaning, derivedMeaning: word.derivedMeaning, effect: word.effect, parts: word.parts, joins: word.joins, splitPoints: word.splitPoints, baseWord: word.baseWord, prefixText: prefix.text, prefixLabel: prefix.label, source: entry.source };
  });
  if (words.some((word) => word === null) || new Set(words.map((word) => word!.canonicalWordId)).size !== DYNAMIC_PREFIX_WORD_LAB_WORD_COUNT || words.some((word) => !selection.profile.meaningBins.some((bin) => bin.id === word!.effect))) return null;
  const completeWords = words as DynamicPrefixLessonPayloadV2["words"]["lesson"];
  // The cleaver uses the first immutable lesson word. In a mixed-form
  // profile, the build task deliberately uses another form when available so
  // a dis-/mis- (or equivalent) lesson demonstrates both forms.
  const cleaverWord = completeWords[0];
  const buildWord = completeWords.find((word) => word.prefixText !== cleaverWord.prefixText) ?? cleaverWord;
  const buildChoices = selection.profile.prefixChoices.map((choice) => choice.text === buildWord.prefixText
    ? { ...choice, status: "target" as const }
    : choice.status === "target" ? { ...choice, status: "valid_alternative" as const } : choice);
  if (buildChoices.filter((choice) => choice.status === "target").length !== 1) return null;
  const isInFamily = selection.profile.microSkillKey === "D4_MOR_PREFIXES_IN_IM_IL_IR";
  const isSubInterSuperFamily = selection.profile.microSkillKey === "D4_MOR_PREFIXES_SUB_INTER_SUPER";
  const teachingBuildTextFor = (word: (typeof completeWords)[number]) => selection.profile.wordsByCanonicalId.get(word.canonicalWordId)?.teachingBuildText ?? word.parts.filter((part) => part.role !== "prefix").map((part) => part.text).join("");
  const buildFor = (word: (typeof completeWords)[number]) => {
    const choices = selection.profile.prefixChoices.map((choice) => choice.text === word.prefixText
      ? { ...choice, status: "target" as const }
      : choice.status === "target" ? { ...choice, status: "valid_alternative" as const } : choice);
    return { canonicalWordId: word.canonicalWordId, baseWord: teachingBuildTextFor(word), targetMeaning: word.derivedMeaning, choices };
  };
  const inFamilyBuilds = isInFamily
    ? ["in", "im", "il", "ir"].map((form) => completeWords.find((word) => word.prefixText === form)).filter((word): word is (typeof completeWords)[number] => Boolean(word)).map(buildFor)
    : [];
  // This profile keeps an 18-item immutable contract. It first selects one
  // cleaver for every represented form, then uses additional selected words
  // only when fewer than three forms occur in the authentic-led lesson.
  const subInterSuperSplits = (() => {
    if (!isSubInterSuperFamily) return [] as (typeof completeWords)[number][];
    const forms = new Set<string>();
    const selectedByForm = completeWords.filter((word) => forms.has(word.prefixText ?? "") ? false : (forms.add(word.prefixText ?? ""), true));
    const fill = completeWords.filter((word) => !selectedByForm.some((selected) => selected.canonicalWordId === word.canonicalWordId));
    return [...selectedByForm, ...fill].slice(0, 3);
  })();
  // The in-/im-/il-/ir- lesson teaches one build for every form represented
  // in its immutable four-word selection. Remaining guided slots become
  // additional split practice, so the lesson remains sixteen items even when
  // an authentic-target-heavy selection contains a repeated form.
  return {
    schemaVersion: 2, experience: "D4_MOR_GUIDED", contentVersion: DYNAMIC_PREFIX_WORD_LAB_CONTENT_VERSION, microSkillId: selection.profile.microSkillKey, experienceProfile: DYNAMIC_PREFIX_WORD_LAB_PROFILE,
    prefix: { text: buildWord.prefixText!, label: buildWord.prefixLabel!, meaning: prefixFor(selection.profile.wordsByCanonicalId.get(buildWord.canonicalWordId)!, selection.profile)!.meaning },
    authenticCanonicalWordIds: selection.authenticTargets.map((item) => item.canonicalWordId), words: { lesson: completeWords },
    activities: {
      introduction: selection.profile.introduction
        ? {
            title: "What is a prefix?",
            paragraphs: ["A prefix is a group of letters added to the beginning of a word. It can help to make a new word and change its meaning."],
            profileTitle: selection.profile.introduction.title,
            profileParagraphs: selection.profile.introduction.paragraphs,
            profileExamples: selection.profile.introduction.examples,
          }
        : isInFamily
          ? {
            title: "What is a prefix?",
            paragraphs: ["A prefix is a group of letters added to the beginning of a word. It can help to make a new word and change its meaning."],
            profileTitle: "Meet the in- prefix family",
            profileParagraphs: ["In this lesson, in-, im-, il- and ir- are different forms of the same prefix family. They can make a word mean not.", "Use im- before b, m or p; il- before l; and ir- before r. Use in- before the other letters."],
          }
          : { title: "Today’s prefix choices", paragraphs: ["A prefix goes at the beginning of a word. Different prefix forms can change what a word means."] },
      // Discovery contrasts the new word's meaning with the reviewed base/root
      // meaning. It must never use a placeholder distractor.
      discovery: completeWords.map((word) => ({ canonicalWordId: word.canonicalWordId, word: word.displayWord, baseWord: word.baseWord, baseMeaning: word.baseMeaning, derivedMeaning: word.derivedMeaning, distractorMeaning: word.baseMeaning, prefixLabel: word.prefixLabel! })),
      meaningBins: selection.profile.meaningBins,
      build: { canonicalWordId: buildWord.canonicalWordId, baseWord: teachingBuildTextFor(buildWord), targetMeaning: buildWord.derivedMeaning, choices: buildChoices },
      guided: isInFamily
        ? {
            // Six guided slots: one build per represented prefix form; the
            // balance is repeated split practice using the selected words.
            splitCanonicalWordIds: completeWords.slice(0, 6 - inFamilyBuilds.length).map((word) => word.canonicalWordId),
            builds: inFamilyBuilds,
            includeMeaningSort: false,
          }
        : isSubInterSuperFamily
          ? {
              splitCanonicalWordIds: subInterSuperSplits.map((word) => word.canonicalWordId),
              builds: [buildFor(buildWord)],
              includeMeaningSort: true,
            }
        : undefined,
      dictation: completeWords.map((word) => { const source = selection.profile.wordsByCanonicalId.get(word.canonicalWordId)!; return { canonicalWordId: word.canonicalWordId, targetWord: word.displayWord, sentence: source.dictationSentence, targetTokenIndex: source.dictationTargetTokenIndex }; }),
      reflection: selection.profile.reflection,
    },
  };
}

export function validateDynamicPrefixWordLabPayload(value: unknown): value is DynamicPrefixLessonPayloadV2 {
  if (value === null || typeof value !== "object") return false;
  const payload = value as DynamicPrefixLessonPayloadV2;
  if (payload.schemaVersion !== 2 || payload.experience !== "D4_MOR_GUIDED" || payload.experienceProfile !== DYNAMIC_PREFIX_WORD_LAB_PROFILE || !payload.microSkillId || payload.words?.lesson?.length !== 4 || payload.authenticCanonicalWordIds.length < 1 || payload.authenticCanonicalWordIds.length > 4) return false;
  if (new Set(payload.words.lesson.map((word) => word.canonicalWordId)).size !== 4 || payload.activities.dictation.length !== 4 || payload.activities.discovery.length !== 4 || !Array.isArray(payload.activities.meaningBins) || payload.activities.meaningBins.length < 2) return false;
  const bins = new Set(payload.activities.meaningBins.map((bin) => bin.id));
  const guided = payload.activities.guided;
  const validGuided = !guided || (
    guided.splitCanonicalWordIds.length > 0
    && guided.builds.length > 0
    && guided.splitCanonicalWordIds.every((id) => payload.words.lesson.some((word) => word.canonicalWordId === id))
    && guided.builds.every((build) => payload.words.lesson.some((word) => word.canonicalWordId === build.canonicalWordId) && build.choices.filter((choice) => choice.status === "target").length === 1)
  );
  const introduction = payload.activities.introduction;
  const validExamples = !introduction.profileExamples || introduction.profileExamples.every((example) => Boolean(example.prefix?.trim() && (!example.prefixMeaning || example.prefixMeaning.trim()) && example.base?.trim() && example.word?.trim() && example.meaning?.trim()));
  const validIntroduction = !introduction.profileTitle || Boolean(introduction.profileTitle.trim() && introduction.profileParagraphs?.length && introduction.profileParagraphs.every((paragraph) => paragraph.trim()) && validExamples);
  return validIntroduction && validGuided && payload.words.lesson.every((word, index) => word.parts.length >= 2 && word.joins.length === word.parts.length - 1 && !!word.prefixText && !!word.prefixLabel && bins.has(word.effect) && payload.activities.discovery[index]?.prefixLabel === word.prefixLabel && payload.activities.dictation[index]?.canonicalWordId === word.canonicalWordId && extractAuthoredTargetToken(payload.activities.dictation[index].sentence, payload.activities.dictation[index].targetTokenIndex) === word.displayWord)
    && Boolean(payload.activities.build.targetMeaning?.trim())
    && (!guided || guided.builds.every((build) => Boolean(build.targetMeaning?.trim())))
    && payload.activities.build.choices.filter((choice) => choice.status === "target").length === 1;
}
