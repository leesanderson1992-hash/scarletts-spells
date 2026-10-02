import { COMPARATIVE_MICRO_SKILLS, degreeRuleForSkill, type AdjectiveFamilyV1, type ComparativeMicroSkill, type DegreeQuestion, type DegreeRule } from "./contracts";

export const COMPARATIVE_REFLECTION_PROMPT = "Reflect on any questions that you got wrong. What is the one thing you would like to remember from this lesson? Write one memory cue sentence.";

export const DEGREE_RULE_COPY: Record<DegreeRule, { title: string; explanation: string; reflection: string }> = {
  regular: { title: "Keep the base word", explanation: "For these adjectives, keep the base word and add -er or -est. No letters need to change.", reflection: COMPARATIVE_REFLECTION_PROMPT },
  drop_e: { title: "Drop the final e", explanation: "Drop the final e, then add -er or -est. You can also remember the same spelling as keeping e and adding -r or -st. Do not write two e letters.", reflection: COMPARATIVE_REFLECTION_PROMPT },
  y_to_i: { title: "Change y to i", explanation: "For these adjectives ending in a consonant + y, change y to i before adding -er or -est.", reflection: COMPARATIVE_REFLECTION_PROMPT },
  double_final_consonant: { title: "Double the final consonant", explanation: "For these short, one-syllable adjectives, a short vowel is followed by one final consonant. Double that consonant before adding -er or -est. Final w, x and y do not double.", reflection: COMPARATIVE_REFLECTION_PROMPT },
};
type Seed = readonly [base: string, meaning: string, noun: string, plural: string, people?: boolean, after?: string];
export const DEGREE_FAMILY_SEEDS: Record<DegreeRule, readonly Seed[]> = {
  regular: [["fast", "moving quickly", "runner", "runners"], ["tall", "having a large height", "tree", "trees"], ["small", "having a little size", "button", "buttons"], ["long", "having a large length", "ribbon", "ribbons"], ["old", "having existed for a long time", "toy", "toys"], ["cold", "having a low temperature", "drink", "drinks"]],
  drop_e: [["nice", "kind and pleasant", "friend", "friends", true], ["large", "having a big size", "box", "boxes"], ["brave", "ready to face something difficult", "explorer", "explorers", true], ["wide", "having a large distance from side to side", "path", "paths"], ["safe", "protected from danger", "path", "paths"], ["close", "nearby", "chair", "chairs", false, " to the desk"]],
  double_final_consonant: [["big", "having a large size", "box", "boxes"], ["hot", "having a high temperature", "drink", "drinks"], ["sad", "feeling unhappy", "friend", "friends", true], ["thin", "having a small thickness", "ribbon", "ribbons"], ["wet", "covered with water", "towel", "towels"], ["red", "having the colour red", "leaf", "leaves"]],
  y_to_i: [["happy", "feeling pleased", "friend", "friends", true], ["funny", "making people laugh", "friend", "friends", true], ["busy", "having many things to do", "friend", "friends", true], ["easy", "not difficult", "puzzle", "puzzles"], ["heavy", "having a large weight", "bag", "bags"], ["pretty", "pleasant to look at", "flower", "flowers"]],
};
function questionPair(rule: DegreeRule, key: string): readonly [DegreeQuestion, DegreeQuestion] {
  const banks: Record<DegreeRule, readonly [string, readonly string[], number, string, readonly string[], number]> = {
    regular: ["Why can we make {word} by adding -{ending} to {base}? Because…", ["this adjective keeps its base spelling", "every adjective takes these endings", "we always remove the last letter"], 0, "For these regular adjectives, we…", ["change every final vowel", "keep the base and add -er or -est", "double every final consonant"], 1],
    drop_e: ["Why does {word} not have an extra e before -{ending}? Because…", ["the base already ends in e", "comparative words only use one e anywhere", "we remove every final vowel"], 0, "When the base already ends in e, we…", ["add another e before the ending", "drop the final e, then add -er or -est", "remove the whole ending"], 1],
    y_to_i: ["Why did the y change to i in {word}? Because…", ["the base ends in a consonant + y", "the base ends in any y", "it does that sometimes"], 0, "We change y to i before -er or -est when…", ["there is any final y", "there is a vowel + y", "these adjectives end in a consonant + y"], 2],
    double_final_consonant: ["Why did the final {last} double in {word}? Because…", ["this one-syllable adjective ends in a short vowel followed by one consonant", "every final consonant doubles", "-er always doubles the last letter"], 0, "For these one-syllable adjectives, we double the final consonant when…", ["there is any final consonant", "a short vowel is followed by one final consonant, other than w, x or y", "there are two consonants anywhere"], 1],
  };
  const [why, options1, answer1, when, options2, answer2] = banks[rule];
  return [
    { id: `${key}:why`, kind: "why", prompt: why, options: options1.map((text, i) => ({ id: String(i), text })), correctOptionId: String(answer1), explanation: DEGREE_RULE_COPY[rule].explanation },
    { id: `${key}:when`, kind: "when", prompt: when, options: options2.map((text, i) => ({ id: String(i), text })), correctOptionId: String(answer2), explanation: DEGREE_RULE_COPY[rule].explanation },
  ];
}
/** Draft only: no reviewer, approval, resolved canonical IDs, or runtime activation. */
export function createDraftDegreeFamilies(): AdjectiveFamilyV1[] {
  return COMPARATIVE_MICRO_SKILLS.flatMap(skill => DEGREE_FAMILY_SEEDS[degreeRuleForSkill(skill)].map(seed => draftFamily(skill, seed)));
}

/** Resolve a reviewed family once, carrying canonical identity into the paired
 * dictation bindings as well as the visible word triplet. */
export function bindDegreeFamilyCanonicalWords(
  family: AdjectiveFamilyV1,
  canonicalWordIdByWord: ReadonlyMap<string, string>,
): AdjectiveFamilyV1 {
  const bindWord = (word: AdjectiveFamilyV1["words"][number]) => {
    const canonicalWordId = canonicalWordIdByWord.get(word.word);
    if (!canonicalWordId) throw new Error(`comparative_canonical_word_missing:${word.word}`);
    return { ...word, canonicalWordId };
  };
  const words = [bindWord(family.words[0]), bindWord(family.words[1]), bindWord(family.words[2])] as AdjectiveFamilyV1["words"];
  const canonicalWordIdFor = (word: string) => {
    const canonicalWordId = canonicalWordIdByWord.get(word);
    if (!canonicalWordId) throw new Error(`comparative_canonical_word_missing:${word}`);
    return canonicalWordId;
  };
  return {
    ...family,
    words,
    content: {
      ...family.content,
      pairedSentence: {
        ...family.content.pairedSentence,
        targets: [family.content.pairedSentence.targets[0], family.content.pairedSentence.targets[1]].map(target => ({
          ...target,
          canonicalWordId: canonicalWordIdFor(target.word),
        })) as unknown as AdjectiveFamilyV1["content"]["pairedSentence"]["targets"],
      },
    },
  };
}
function draftFamily(microSkillKey: ComparativeMicroSkill, [base, meaning, noun, plural, people = false, qualifier = ""]: Seed): AdjectiveFamilyV1 {
  const rule = degreeRuleForSkill(microSkillKey);
  const key = `degree:en-GB:${base}`;
  const stem = rule === "drop_e" ? base.slice(0, -1) : rule === "y_to_i" ? base.slice(0, -1) + "i" : rule === "double_final_consonant" ? base + base.at(-1) : base;
  const words: AdjectiveFamilyV1["words"] = [
    { canonicalWordId: `candidate:${base}`, word: base, degree: "base" },
    { canonicalWordId: `candidate:${stem}er`, word: `${stem}er`, degree: "comparative" },
    { canonicalWordId: `candidate:${stem}est`, word: `${stem}est`, degree: "superlative" },
  ];
  const gaps: AdjectiveFamilyV1["content"]["gaps"] = [
    { id: `${key}:c1`, degree: "comparative", before: people ? "Mia is " : `The blue ${noun} is `, after: people ? " than Amy." : `${qualifier} than the red ${noun}.` },
    { id: `${key}:c2`, degree: "comparative", before: people ? "John is " : `The green ${noun} is `, after: people ? " than Katie." : `${qualifier} than the yellow ${noun}.` },
    { id: `${key}:s1`, degree: "superlative", before: people ? "Of his three friends, Matthew is the " : `Of the three ${plural}, the blue ${noun} is the `, after: `${qualifier}.` },
    { id: `${key}:s2`, degree: "superlative", before: people ? "Of her four friends, Phoebe is the " : `Of the four ${plural}, the green ${noun} is the `, after: `${qualifier}.` },
  ];
  return {
    schemaVersion: 1, familyKey: key, microSkillKey, dialect: "en-GB", meaning, rule, words,
    transformations: [
      { rule, base, stem, ending: "er", result: words[1].word, explanation: DEGREE_RULE_COPY[rule].explanation },
      { rule, base, stem, ending: "est", result: words[2].word, explanation: DEGREE_RULE_COPY[rule].explanation },
    ],
    lexicalVerification: { adjective: false, gradable: false, acceptsErEst: false, childSuitable: false, oneSyllable: null, shortVowelBeforeFinalConsonant: null },
    content: { gaps, questions: questionPair(rule, key), pairedSentence: {
      id: `${key}:paired`, segments: people ? ["Mia is ", " than Amy, but Phoebe is the ", " of all three friends."]
        : [`The blue ${noun} is `, `${qualifier} than the red ${noun}, but the yellow ${noun} is the `, `${qualifier} of all three ${plural}.`],
      targets: [{ ...words[1], audioText: words[1].word }, { ...words[2], audioText: words[2].word }],
    } },
    rowStatus: "draft", reviewStatus: "in_review",
    provenance: { sourceRefs: ["owner_recipe_2026-09-29", "ai_assisted_draft_not_lexical_authority"], reviewerRef: null, approvalRef: null, contentVersion: "comparative_candidate_v1_2026-09-29" },
  };
}
