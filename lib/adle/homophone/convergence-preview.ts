import { createHash } from "node:crypto";
import content from "@/data/adle/homophone/convergence-v1/approved-lesson-content.json";
import cheatCodes from "@/data/adle/homophone/convergence-v1/approved-cheat-codes.json";
import retainedLessons from "@/data/adle/candidates/d4-hom/v4/lessons.json";
import { homophoneActivities, type HomophoneLesson, type HomophoneLessonSnapshotV1 } from "./lesson";
import { validateConvergencePreview } from "./convergence-preview-validation";

type Member = { word: string; intendedSense: string; grammaticalRole: string; teachingSentence: string };
type ShortSentence = { id: string; word: string; sentence: string; intendedSense: string };
type Passage = { id: string; firstWord: string; firstSentence: string; secondWord: string; secondSentence: string };
type ChoiceQuestion = { id: string; word: string; sentenceWithBlank: string };
type SetContent = { setKey: string; relationKind: string; members: Member[];
  shortSentences: ShortSentence[]; passages: Passage[]; choiceQuestions: ChoiceQuestion[] };
type LessonContent = { microSkillKey: string; teachingExplanation: string; commonMisconception: string; sets: SetContent[] };

export const APPROVED_CONVERGENCE_LESSONS = content.lessons as LessonContent[];
export const CONVERGENCE_CONTENT_VERSION = content.contentVersion;
const combinedContentSha256 = createHash("sha256").update(`${content.sourceSha256}:${cheatCodes.sourceSha256}:${retainedLessons.sourceSha256}`).digest("hex");

export type ConvergenceChoiceQuestion = ChoiceQuestion & { setKey: string; options: string[] };
export type ConvergencePreview = { snapshot: HomophoneLessonSnapshotV1; selectedSetKeys: string[];
  questions: ConvergenceChoiceQuestion[]; rotation: number; rotationCount: number };

function targetMatch(sentence: string, word: string): RegExpExecArray {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`, "gi");
  const matches = [...sentence.matchAll(expression)];
  if (matches.length !== 1) throw new Error(`homophone_sentence_target_invalid:${word}:${sentence}`);
  return matches[0] as RegExpExecArray;
}

function gap(sentence: string, word: string): string {
  const match = targetMatch(sentence, word);
  return `${sentence.slice(0, match.index)}____${sentence.slice(match.index! + match[0].length)}`;
}

function passageParts(passage: Passage): [string, string, string] {
  const first = targetMatch(passage.firstSentence, passage.firstWord);
  const second = targetMatch(passage.secondSentence, passage.secondWord);
  return [passage.firstSentence.slice(0, first.index),
    `${passage.firstSentence.slice(first.index! + first[0].length)} ${passage.secondSentence.slice(0, second.index)}`,
    passage.secondSentence.slice(second.index! + second[0].length)];
}

function balancedPrompts(sets: SetContent[], limit: number) {
  const byWord = new Map<string, (ShortSentence & { setKey: string })[]>();
  for (const set of sets) for (const member of set.members) {
    byWord.set(member.word, set.shortSentences.filter(sentence => sentence.word === member.word).map(sentence => ({ ...sentence, setKey: set.setKey })));
  }
  const chosen: (ShortSentence & { setKey: string })[] = [];
  for (let round = 0; chosen.length < limit; round++) {
    let added = false;
    for (const sentences of byWord.values()) {
      if (sentences[round] && chosen.length < limit) { chosen.push(sentences[round]); added = true; }
    }
    if (!added) break;
  }
  return chosen.map(sentence => ({ sentence: gap(sentence.sentence, sentence.word), answer: sentence.word, setKey: sentence.setKey }));
}

function naturalWordList(words: string[]): string {
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export function buildConvergencePreview(microSkillKey: string, requestedRotation = 0): ConvergencePreview {
  const source = APPROVED_CONVERGENCE_LESSONS.find(lesson => lesson.microSkillKey === microSkillKey);
  if (!source) throw new Error(`homophone_preview_skill_missing:${microSkillKey}`);
  const rotationCount = Math.ceil(source.sets.length / 3);
  const rotation = Math.min(rotationCount - 1, Math.max(0, Math.trunc(requestedRotation)));
  return buildSelectedConvergenceLesson(microSkillKey,
    source.sets.slice(rotation * 3, rotation * 3 + 3).map(set => set.setKey),
    `rotation-${rotation}`, rotation, rotationCount);
}

/** Build the same reviewed teaching sequence for the frozen, queue-prioritised set selection. */
export function buildConvergenceLessonForSets(microSkillKey: string, selectedSetKeys: readonly string[]): ConvergencePreview {
  const selectionHash = createHash("sha256").update(selectedSetKeys.join("\u0000")).digest("hex").slice(0, 12);
  return buildSelectedConvergenceLesson(microSkillKey, selectedSetKeys, `sets-${selectionHash}`, 0, 1);
}

function buildSelectedConvergenceLesson(microSkillKey: string, selectedSetKeys: readonly string[],
  variant: string, rotation: number, rotationCount: number): ConvergencePreview {
  const source = APPROVED_CONVERGENCE_LESSONS.find(lesson => lesson.microSkillKey === microSkillKey);
  if (!source) throw new Error(`homophone_preview_skill_missing:${microSkillKey}`);
  const byKey = new Map(source.sets.map(set => [set.setKey, set]));
  if (selectedSetKeys.length < 1 || selectedSetKeys.length > 3 || new Set(selectedSetKeys).size !== selectedSetKeys.length
    || selectedSetKeys.some(key => !byKey.has(key))) throw new Error(`homophone_selected_sets_invalid:${microSkillKey}`);
  const selected = selectedSetKeys.map(key => byKey.get(key)!);
  const members = selected.flatMap(set => set.members);
  const memberWords = members.map(member => member.word);
  if (new Set(memberWords).size !== memberWords.length) throw new Error("homophone_preview_duplicate_member");
  const prompts = balancedPrompts(selected, selected.reduce((sum, set) => sum + set.shortSentences.length, 0));
  const binCount = Math.max(4, memberWords.length);
  const dictation = selected.length === 1 ? selected[0].passages.slice(0, 3) : selected.map(set => set.passages[0]);
  const relations = new Set(selected.map(set => set.relationKind));
  if (cheatCodes.contentVersion !== content.contentVersion) throw new Error("homophone_cheat_code_version_mismatch");
  const bySetWord = new Map(cheatCodes.wordPages.map(item => [`${item.setKey}\u0000${item.word}`, item]));
  const teachingGroups = selected.map(set => ({ id: set.setKey, words: set.members.map(member => {
    const sheet = bySetWord.get(`${set.setKey}\u0000${member.word}`);
    if (!sheet?.cheatCode) throw new Error(`homophone_cheat_code_missing:${set.setKey}:${member.word}`);
    const imageSrc = source.sets.length === 1
      ? `/adle/homophones/convergence-v1/word-art/${member.word.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.jpg`
      : undefined;
    return { word: member.word, definition: member.intendedSense, cheatCode: sheet.cheatCode,
      imageSrc, imageDescription: imageSrc ? sheet.imageDescription : undefined };
  }) }));
  const lesson: HomophoneLesson = {
    microSkillKey, title: memberWords.join(" / "),
    contrastKind: relations.size === 1 && relations.has("homophone") ? "homophone" : "confusable",
    contrastSets: selected.map(set => ({ setKey: set.setKey, members: set.members.map(member => member.word) })),
    teachingGroups,
    words: members.map(member => ({ word: member.word, memoryCue: member.intendedSense,
      feedbackReason: member.intendedSense, imageRequired: false, imageBrief: "", imageSrc: null,
      highlightStart: 0, highlightLength: member.word.length })),
    binSort: prompts.slice(0, binCount), balloonPrompts: prompts.slice(binCount),
    coverCheck: memberWords,
    dictationPassages: dictation.map(passage => ({ id: passage.id, segments: passageParts(passage),
      targets: [passage.firstWord, passage.secondWord] })),
    teachingIntro: { title: retainedLessons.lessons[0].teachingIntro.title,
      paragraphs: [...retainedLessons.lessons[0].teachingIntro.paragraphs],
      focus: `Today, we are focusing on ${naturalWordList(memberWords)}.`,
      category: relations.size === 1 && (relations.has("homophone") || microSkillKey === "D4_HOM_CONTENT_WORD_HOMOPHONES_ED_FOR_T")
        ? "These words are homophones."
        : "These words are confusables." },
  };
  const snapshot: HomophoneLessonSnapshotV1 = {
    snapshotSchemaVersion: 3, route: { routeId: "homophone_word_lab", routeVersion: "v2" },
    recipe: { recipeKey: "homophone_word_lab", recipeVersion: "v2" },
    contentVersion: `${CONVERGENCE_CONTENT_VERSION}:intro-v3:word-art-v1:cheat-${cheatCodes.sourceSha256.slice(0, 12)}:${variant}`,
    sourceSha256: content.sourceSha256, contentSha256: combinedContentSha256,
    microSkillKey, lesson, activities: homophoneActivities(lesson),
  };
  const questions = selected.flatMap(set => set.choiceQuestions.map(question => ({ ...question,
    setKey: set.setKey, options: set.members.map(member => member.word) })));
  const issues = validateConvergencePreview(snapshot);
  if (issues.length) throw new Error(`homophone_preview_invalid:${microSkillKey}:${issues.join(",")}`);
  return { snapshot, selectedSetKeys: selected.map(set => set.setKey), questions, rotation, rotationCount };
}
