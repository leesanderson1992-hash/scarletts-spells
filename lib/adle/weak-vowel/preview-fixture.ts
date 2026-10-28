import fixtures from "@/content/secret-life-of-vowels/lesson-preview-fixtures.json";
import { WEAK_VOWEL_MICRO_SKILLS } from "../word-lab/weak-vowel-dinner";
import { validateWeakVowelLesson, weakVowelTeaching, type WeakVowelLessonV1, type WeakVowelLessonWordV1, type WeakVowelMicroSkill } from "./lesson";

export function weakVowelPreviewLesson(microSkillKey: WeakVowelMicroSkill, revision: number): WeakVowelLessonV1 {
  const source = (fixtures.lessons as Record<string, unknown>)[microSkillKey] as WeakVowelLessonWordV1[] | undefined;
  if (!source) throw new Error(`No reviewed preview words for ${microSkillKey}`);
  const lesson: WeakVowelLessonV1 = {
    schemaVersion: 1, routeKey: "weak_vowel_word_lab", contentVersion: "weak_vowel_preview_2026_10_21_v15",
    assignmentKey: `preview:${microSkillKey}:${revision}`, authority: "dev_fixture", microSkillKey,
    words: source, teaching: weakVowelTeaching(microSkillKey, source),
    reflectionPrompt: "Which quiet vowel spelling or word-family clue will help you remember these words?",
  };
  if (!validateWeakVowelLesson(lesson, true)) throw new Error(`Invalid weak-vowel preview fixture for ${microSkillKey}`);
  return lesson;
}

export const WEAK_VOWEL_PREVIEW_SKILLS: readonly WeakVowelMicroSkill[] = WEAK_VOWEL_MICRO_SKILLS;
