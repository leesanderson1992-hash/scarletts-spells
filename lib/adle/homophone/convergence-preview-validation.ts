import type { HomophoneLessonSnapshotV1 } from "./lesson";

/** The review preview shares the v2 activity UI; its content authority is the approved workbook. */
export function validateConvergencePreview(snapshot: HomophoneLessonSnapshotV1): string[] {
  const lesson = snapshot.lesson;
  const words = new Set(lesson.words.map(item => item.word));
  const issues: string[] = [];
  const pairScoped = ["D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS", "D4_HOM_CONFUSABLE_WORDS_SE_SY_CE_CY", "D4_HOM_CONTENT_WORD_HOMOPHONES_ED_FOR_T"].includes(snapshot.microSkillKey);
  if (words.size < 2 || words.size !== lesson.words.length) issues.push("word_set_invalid");
  if (!lesson.binSort.length || !lesson.balloonPrompts.length || !lesson.dictationPassages.length) issues.push("activity_content_missing");
  if (lesson.coverCheck.length !== words.size || lesson.coverCheck.some(word => !words.has(word))) issues.push("cover_set_invalid");
  if (lesson.binSort.some(item => !words.has(item.answer) || item.sentence.split("____").length !== 2)) issues.push("bin_prompt_invalid");
  if (lesson.balloonPrompts.some(item => !words.has(item.answer) || item.sentence.split("____").length !== 2)) issues.push("balloon_prompt_invalid");
  if (pairScoped && !lesson.contrastSets?.length) issues.push("contrast_set_membership_missing");
  if (!lesson.teachingGroups?.length || lesson.teachingGroups.length !== lesson.contrastSets?.length
    || lesson.teachingGroups.some(group => group.words.some(word => !word.definition.trim() || !word.cheatCode.trim()))) issues.push("teaching_groups_invalid");
  if (!pairScoped && lesson.teachingGroups?.some(group => group.words.some(word => !word.imageSrc?.trim() || !word.imageDescription?.trim()))) issues.push("teaching_word_image_missing");
  if (lesson.contrastSets) {
    const sets = new Map(lesson.contrastSets.map(set => [set.setKey, set.members]));
    const members = lesson.contrastSets.flatMap(set => set.members);
    if (sets.size !== lesson.contrastSets.length || members.length !== words.size
      || new Set(members).size !== words.size || members.some(word => !words.has(word))) issues.push("contrast_set_membership_invalid");
    if ([...lesson.binSort, ...lesson.balloonPrompts].some(item => !item.setKey
      || !sets.get(item.setKey)?.includes(item.answer))) issues.push("prompt_contrast_set_invalid");
    if (pairScoped && lesson.contrastSets.some(set => set.members.length !== 2)) issues.push("pair_choice_set_invalid");
    if (lesson.teachingGroups?.some((group, index) => group.id !== lesson.contrastSets?.[index]?.setKey
      || group.words.map(word => word.word).join("\u0000") !== lesson.contrastSets?.[index]?.members.join("\u0000"))) issues.push("teaching_group_membership_invalid");
  }
  if ([...words].some(word => !lesson.balloonPrompts.some(item => item.answer === word)
    || !lesson.dictationPassages.some(item => item.targets.includes(word)))) issues.push("word_not_assessed");
  if (lesson.dictationPassages.some(item => item.targets[0] === item.targets[1]
    || item.segments.length !== 3 || item.targets.some(word => !words.has(word)))) issues.push("passage_invalid");
  return issues;
}
