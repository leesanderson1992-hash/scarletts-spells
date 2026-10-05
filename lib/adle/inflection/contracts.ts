/** Governed degree families. Candidate discovery never grants learner or release authority. */
export const COMPARATIVE_ROUTE_ID = "comparative_superlative_word_lab" as const;
export const COMPARATIVE_ROUTE_KEY = "comparative_superlative_word_lab:v1" as const;
export const COMPARATIVE_MICRO_SKILLS = [
  "D4_INF_COMPARATIVE_SUPERLATIVE_REGULAR",
  "D4_INF_COMPARATIVE_SUPERLATIVE_DROP_E",
  "D4_INF_COMPARATIVE_SUPERLATIVE_Y_TO_I",
  "D4_INF_COMPARATIVE_SUPERLATIVE_DOUBLE_FINAL_CONSONANT",
] as const;
export type ComparativeMicroSkill = typeof COMPARATIVE_MICRO_SKILLS[number];
export type AdjectiveDegree = "base" | "comparative" | "superlative";
export type DerivedDegree = Exclude<AdjectiveDegree, "base">;
export type DegreeRule = "regular" | "drop_e" | "y_to_i" | "double_final_consonant";
export interface DegreeWord {
  canonicalWordId: string;
  word: string;
  degree: AdjectiveDegree;
}
export interface DegreeTransformation {
  rule: DegreeRule;
  base: string;
  stem: string;
  ending: "er" | "est";
  result: string;
  explanation: string;
}
export interface SentenceGap {
  id: string;
  degree: DerivedDegree;
  before: string;
  after: string;
}
export interface PairedDegreeSentence {
  id: string;
  segments: readonly [string, string, string];
  targets: readonly [DegreeWord & { audioText: string }, DegreeWord & { audioText: string }];
}
export interface DegreeQuestion {
  id: string;
  kind: "why" | "when";
  prompt: string;
  options: readonly { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
}
export interface AdjectiveFamilyV1 {
  schemaVersion: 1;
  familyKey: string;
  microSkillKey: ComparativeMicroSkill;
  dialect: "en-GB";
  meaning: string;
  rule: DegreeRule;
  words: readonly [DegreeWord, DegreeWord, DegreeWord];
  transformations: readonly [DegreeTransformation, DegreeTransformation];
  lexicalVerification: {
    adjective: boolean;
    gradable: boolean;
    acceptsErEst: boolean;
    childSuitable: boolean;
    oneSyllable: boolean | null;
    shortVowelBeforeFinalConsonant: boolean | null;
  };
  content: {
    gaps: readonly SentenceGap[];
    pairedSentence: PairedDegreeSentence;
    questions: readonly [DegreeQuestion, DegreeQuestion];
  };
  rowStatus: "active" | "draft" | "inactive";
  reviewStatus: "in_review" | "approved_for_first_exposure" | "rejected";
  provenance: {
    sourceRefs: readonly string[];
    reviewerRef: string | null;
    approvalRef: string | null;
    contentVersion: string;
  };
}
export interface SelectedDegreeWord extends DegreeWord {
  familyKey: string;
  learningItemId: string | null;
}
export interface ComparativeLessonV1 {
  schemaVersion: 1;
  /** Absent on lessons frozen before the four-question sequence was released. */
  taskSequenceVersion?: 2;
  routeKey: typeof COMPARATIVE_ROUTE_KEY;
  microSkillKey: ComparativeMicroSkill;
  assignmentKey: string;
  /** Fixtures are never accepted by a released assignment writer. */
  authority: "reviewed_content" | "dev_fixture";
  teaching: import("../../../components/adle/first-impression/teaching-pages").TeachingPagesConfig;
  reflectionPrompt: string;
  families: readonly [AdjectiveFamilyV1, AdjectiveFamilyV1];
  words: readonly SelectedDegreeWord[];
  queuedTargets: readonly SelectedDegreeWord[];
  deferredLearningItemIds: readonly string[];
  sentenceTasks: readonly (SentenceGap & { familyKey: string })[];
  cleaverTasks: readonly {
    target: SelectedDegreeWord;
    transformation: DegreeTransformation;
    question: DegreeQuestion;
  }[];
  dictationTasks: readonly (PairedDegreeSentence & { audioOrder: readonly [0 | 1, 0 | 1] })[];
}
export interface PairedWordOutcome {
  canonicalWordId: string;
  attemptText: string;
  expectedSlot: number;
  attemptedSlot: number;
  spellingCorrect: boolean;
  placementCorrect: boolean;
}
export const degreeRuleForSkill = (skill: ComparativeMicroSkill): DegreeRule => ({
  D4_INF_COMPARATIVE_SUPERLATIVE_REGULAR: "regular",
  D4_INF_COMPARATIVE_SUPERLATIVE_DROP_E: "drop_e",
  D4_INF_COMPARATIVE_SUPERLATIVE_Y_TO_I: "y_to_i",
  D4_INF_COMPARATIVE_SUPERLATIVE_DOUBLE_FINAL_CONSONANT: "double_final_consonant",
} as const)[skill];
export const normalizeDegreeAttempt = (value: string): string => value.normalize("NFKC").trim().toLocaleLowerCase("en-GB");
export function gradePairedDegreeAttempt(sentence: PairedDegreeSentence, values: readonly [string, string]): PairedWordOutcome[] {
  const exact = (target: number, slot: number) => normalizeDegreeAttempt(values[slot]) === normalizeDegreeAttempt(sentence.targets[target].word);
  const direct = Number(exact(0, 0)) + Number(exact(1, 1));
  const swapped = Number(exact(0, 1)) + Number(exact(1, 0));
  // One-to-one attribution maximises exact spelling matches. Never credit a duplicated answer twice.
  const slots = swapped > direct ? [1, 0] : [0, 1];
  return sentence.targets.map((target, index) => ({
    canonicalWordId: target.canonicalWordId, attemptText: values[slots[index]],
    expectedSlot: index, attemptedSlot: slots[index], spellingCorrect: exact(index, slots[index]),
    placementCorrect: slots[index] === index && exact(index, index),
  }));
}
export function hasPairedSentenceShape(value: unknown): value is PairedDegreeSentence {
  if (!value || typeof value !== "object") return false;
  const sentence = value as PairedDegreeSentence;
  return typeof sentence.id === "string" && sentence.id.length > 0
    && Array.isArray(sentence.segments) && sentence.segments.length === 3 && sentence.segments.every(x => typeof x === "string")
    && Array.isArray(sentence.targets) && sentence.targets.length === 2
    && sentence.targets.every(x => x && typeof x.word === "string" && /^[a-z]+$/.test(x.word)
      && typeof x.canonicalWordId === "string" && x.canonicalWordId.length > 0
      && (x.degree === "comparative" || x.degree === "superlative") && x.audioText === x.word)
    && new Set(sentence.targets.map(x => x.degree)).size === 2
    && new Set(sentence.targets.map(x => x.canonicalWordId)).size === 2;
}
export function hasDegreeQuestionShape(value: unknown): value is DegreeQuestion {
  if (!value || typeof value !== "object") return false;
  const q = value as DegreeQuestion;
  return typeof q.id === "string" && q.id.length > 0 && (q.kind === "why" || q.kind === "when")
    && typeof q.prompt === "string" && q.prompt.length > 0 && typeof q.explanation === "string" && q.explanation.length > 0
    && Array.isArray(q.options) && q.options.length === 3
    && q.options.every(x => x && typeof x.id === "string" && typeof x.text === "string" && x.id.length > 0 && x.text.length > 0)
    && new Set(q.options.map(x => x.id)).size === 3 && q.options.some(x => x.id === q.correctOptionId);
}
export function hasTransformationShape(value: unknown): value is DegreeTransformation {
  if (!value || typeof value !== "object") return false;
  const t = value as DegreeTransformation;
  return ["regular", "drop_e", "y_to_i", "double_final_consonant"].includes(t.rule)
    && [t.base, t.stem, t.result, t.explanation].every(x => typeof x === "string" && x.length > 0)
    && (t.ending === "er" || t.ending === "est") && t.stem + t.ending === t.result;
}
/** Structural and review closure, not a substitute for lexical human verification. */
export function adjectiveFamilyBlockers(value: unknown, fixture = false): string[] {
  try { return checkedFamilyBlockers(value, fixture); } catch { return ["malformed_family"]; }
}
function checkedFamilyBlockers(value: unknown, fixture: boolean): string[] {
  if (!value || typeof value !== "object") return ["malformed_family"];
  const f = value as AdjectiveFamilyV1;
  if (f.schemaVersion !== 1 || !COMPARATIVE_MICRO_SKILLS.includes(f.microSkillKey)
    || typeof f.familyKey !== "string" || !f.familyKey || f.dialect !== "en-GB" || typeof f.meaning !== "string" || !f.meaning
    || !Array.isArray(f.words) || f.words.length !== 3
    || f.words.some((w, i) => !w || w.degree !== ["base", "comparative", "superlative"][i]
      || typeof w.word !== "string" || !/^[a-z]+$/.test(w.word) || typeof w.canonicalWordId !== "string" || !w.canonicalWordId)
    || new Set(f.words.map(w => w.canonicalWordId)).size !== 3
    || new Set(f.words.map(w => w.word)).size !== 3
    || !f.lexicalVerification || !f.provenance || !f.content) return ["malformed_family"];
  const errors: string[] = [];
  if (f.rule !== degreeRuleForSkill(f.microSkillKey)) errors.push("rule_skill_mismatch");
  if (!fixture && (f.rowStatus !== "active" || f.reviewStatus !== "approved_for_first_exposure"
    || typeof f.provenance.reviewerRef !== "string" || !f.provenance.reviewerRef.trim()
    || typeof f.provenance.approvalRef !== "string" || !f.provenance.approvalRef.trim())) errors.push("family_not_approved");
  if (!fixture && f.words.some(w => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(w.canonicalWordId))) errors.push("canonical_identity_unresolved");
  if (!Array.isArray(f.provenance.sourceRefs) || !f.provenance.sourceRefs.length
    || f.provenance.sourceRefs.some(x => typeof x !== "string" || !x)
    || typeof f.provenance.contentVersion !== "string" || !f.provenance.contentVersion) errors.push("source_provenance_missing");
  if (!fixture && (f.lexicalVerification.adjective !== true || f.lexicalVerification.gradable !== true || f.lexicalVerification.acceptsErEst !== true || f.lexicalVerification.childSuitable !== true)) errors.push("lexical_eligibility_unverified");
  const base = f.words[0].word;
  if (f.rule === "double_final_consonant" && (f.lexicalVerification.oneSyllable !== true
    || f.lexicalVerification.shortVowelBeforeFinalConsonant !== true || !/[aeiou][b-df-hj-np-tv-z]$/.test(base) || /[wxy]$/.test(base))) errors.push("doubling_condition_unverified");
  if (f.rule === "drop_e" && !base.endsWith("e")) errors.push("drop_e_condition_invalid");
  if (f.rule === "y_to_i" && !/[^aeiou]y$/.test(base)) errors.push("y_to_i_condition_invalid");
  const stem = f.rule === "drop_e" ? base.slice(0, -1) : f.rule === "y_to_i" ? base.slice(0, -1) + "i"
    : f.rule === "double_final_consonant" ? base + base.at(-1) : base;
  if (!Array.isArray(f.transformations) || f.transformations.length !== 2
    || f.transformations.some((t, i) => !hasTransformationShape(t) || t.base !== base || t.stem !== stem
      || t.rule !== f.rule || t.ending !== ["er", "est"][i] || t.result !== f.words[i + 1].word)) errors.push("transformation_invalid");
  if (!Array.isArray(f.content.gaps) || f.content.gaps.some(g => !g || typeof g.id !== "string" || !g.id
    || typeof g.before !== "string" || !g.before || typeof g.after !== "string" || !g.after
    || !["comparative", "superlative"].includes(g.degree))
    || ["comparative", "superlative"].some(d => f.content.gaps.filter(g => g.degree === d).length < 2)
    || new Set(f.content.gaps.map(g => g.id)).size !== f.content.gaps.length) errors.push("sentence_content_missing");
  if (!hasPairedSentenceShape(f.content.pairedSentence)
    || f.content.pairedSentence.targets.some(t => !f.words.some(w => w.canonicalWordId === t.canonicalWordId && w.word === t.word && w.degree === t.degree))) errors.push("paired_dictation_invalid");
  if (!Array.isArray(f.content.questions) || f.content.questions.length !== 2
    || f.content.questions.some((q, i) => !hasDegreeQuestionShape(q) || q.kind !== ["why", "when"][i])) errors.push("rule_questions_missing");
  return errors;
}
