// Approved, version-pinned teaching content. Assignment generation still
// requires the database release and activation gates.
import source from "@/data/adle/candidates/d4-hom/v4/lessons.json";
import approval from "@/data/adle/candidates/d4-hom/v4/content-approval.json";

export const HOMOPHONE_ROUTE = { routeId: "homophone_word_lab", routeVersion: "v2" } as const;
export const HOMOPHONE_RECIPE = { recipeKey: "homophone_word_lab", recipeVersion: "v2" } as const;

export interface HomophoneWord {
  word: string;
  memoryCue: string;
  feedbackReason: string;
  imageRequired: boolean;
  imageBrief: string;
  imageSrc: string | null;
  highlightStart: number | null;
  highlightLength: number | null;
}

export interface HomophoneSentencePrompt { sentence: string; answer: string }
export interface HomophonePassage { id: string; segments: [string, string, string]; targets: [string, string] }
export interface HomophoneTeachingIntro { title: string; paragraphs: string[]; focus: string; category: string }
export interface HomophoneLesson {
  microSkillKey: string;
  title: string;
  contrastKind: "homophone" | "confusable" | "near_homophone_and_confusable";
  words: HomophoneWord[];
  binSort: HomophoneSentencePrompt[];
  balloonPrompts: HomophoneSentencePrompt[];
  coverCheck: string[];
  dictationPassages: HomophonePassage[];
  teachingIntro: HomophoneTeachingIntro;
}

export interface HomophoneLessonSnapshotV1 {
  snapshotSchemaVersion: 3;
  route: typeof HOMOPHONE_ROUTE;
  recipe: typeof HOMOPHONE_RECIPE;
  contentVersion: string;
  sourceSha256: string;
  contentSha256: string;
  microSkillKey: string;
  lesson: HomophoneLesson;
  activities: readonly {
    id: string;
    concept: "INTRODUCTION" | "MEANING_SORT" | "BALLOON_POP" | "COVER_CHECK" | "DICTATION" | "LESSON_REFLECTION";
    mode: string;
    answerVisibility: "teaching" | "guided" | "recall_neutral";
    wordBindings: readonly string[];
  }[];
}

function tokenCount(text: string, word: string): number {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...text.matchAll(new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`, "gi"))].length;
}

export function fullHomophonePassage(passage: HomophonePassage): string {
  return `${passage.segments[0]}${passage.targets[0]}${passage.segments[1]}${passage.targets[1]}${passage.segments[2]}`;
}

export function validateHomophoneLesson(lesson: HomophoneLesson): string[] {
  const problems: string[] = [];
  const words = lesson.words.map(entry => entry.word);
  const unique = new Set(words);
  if (words.length < 2 || unique.size !== words.length) problems.push("word_set_invalid");
  if (!lesson.teachingIntro || !lesson.teachingIntro.title?.trim() || !Array.isArray(lesson.teachingIntro.paragraphs) || lesson.teachingIntro.paragraphs.length !== 3
    || lesson.teachingIntro.paragraphs.some(paragraph => !paragraph.trim())
    || !lesson.teachingIntro.focus.trim() || !lesson.teachingIntro.category.trim()
    || words.some(word => !lesson.teachingIntro.focus.includes(word))) problems.push("teaching_intro_invalid");
  for (const entry of lesson.words) {
    if (!entry.memoryCue.trim() || !entry.feedbackReason.trim()) problems.push(`missing_teaching:${entry.word}`);
    if (entry.imageRequired && (!entry.imageBrief.trim() || !entry.imageSrc?.trim())) problems.push(`missing_image:${entry.word}`);
    if (entry.highlightStart === null || entry.highlightLength === null || entry.highlightStart < 0 || entry.highlightLength < 1 || entry.highlightStart + entry.highlightLength > entry.word.length) problems.push(`missing_highlight:${entry.word}`);
  }
  const checkPrompts = (name: string, prompts: HomophoneSentencePrompt[]) => {
    for (const prompt of prompts) {
      if (!unique.has(prompt.answer) || prompt.sentence.split("____").length !== 2) problems.push(`${name}_prompt_invalid`);
    }
  };
  if (lesson.binSort.length !== 4) problems.push("bin_sort_count");
  checkPrompts("bin_sort", lesson.binSort);
  if (lesson.balloonPrompts.length !== 20) problems.push("balloon_prompt_count");
  checkPrompts("balloon", lesson.balloonPrompts);
  if (new Set(lesson.balloonPrompts.map(prompt => prompt.sentence.toLocaleLowerCase("en-GB"))).size !== lesson.balloonPrompts.length) problems.push("balloon_prompt_duplicate");
  if (words.some(word => !lesson.balloonPrompts.some(prompt => prompt.answer === word))) problems.push("balloon_word_coverage");
  if (lesson.coverCheck.length !== words.length || new Set(lesson.coverCheck).size !== unique.size || lesson.coverCheck.some(word => !unique.has(word))) problems.push("cover_check_invalid");
  if (lesson.dictationPassages.length !== 3) problems.push("dictation_passage_count");
  const passageWords = lesson.dictationPassages.flatMap(entry => Array.isArray(entry.targets) ? entry.targets : []);
  if (words.some(word => !passageWords.includes(word)) || passageWords.some(word => !unique.has(word))) problems.push("dictation_target_coverage");
  if (new Set(lesson.dictationPassages.map(passage => passage.id)).size !== lesson.dictationPassages.length
    || new Set(lesson.dictationPassages.map(passage => Array.isArray(passage.targets) ? passage.targets.join("|") : "")).size < 2) problems.push("dictation_order_invalid");
  for (const passage of lesson.dictationPassages) {
    if (!Array.isArray(passage.segments) || passage.segments.length !== 3 || !Array.isArray(passage.targets) || passage.targets.length !== 2
      || passage.targets[0] === passage.targets[1] || passage.segments.some(segment => segment.includes("{{") || segment.includes("____"))) {
      problems.push("dictation_gap_invalid");
      continue;
    }
    const text = fullHomophonePassage(passage);
    if (!text.trim() || passage.targets.some(word => tokenCount(text, word) !== 1)) problems.push("dictation_text_coverage");
    const sentenceCount = text.split(/[.!?]+(?:\s|$)/).filter(Boolean).length;
    if (sentenceCount !== 2) problems.push("dictation_sentence_count");
  }
  return [...new Set(problems)];
}

export const HOMOPHONE_CONTENT_VERSION = source.contentVersion;
export const HOMOPHONE_SOURCE_SHA256 = source.sourceSha256;
export const HOMOPHONE_CONTENT_SHA256 = source.contentSha256;
export const HOMOPHONE_RUNTIME_ENABLED: boolean = source.runtimeEnabled;
export const HOMOPHONE_LESSONS = source.lessons as HomophoneLesson[];

export function homophoneContentApproved(): boolean {
  return approval.approvalStatus === "approved"
    && approval.contentVersion === source.contentVersion
    && approval.contentSha256 === source.contentSha256
    && /^[a-f0-9]{64}$/.test(approval.imageAssetManifestSha256)
    && source.lessons.length === 14
    && HOMOPHONE_LESSONS.every(lesson => validateHomophoneLesson(lesson).length === 0);
}

export function getHomophoneLesson(microSkillKey: string): HomophoneLesson | null {
  if (!homophoneContentApproved()) return null;
  const lesson = HOMOPHONE_LESSONS.find(entry => entry.microSkillKey === microSkillKey);
  return lesson && validateHomophoneLesson(lesson).length === 0 ? lesson : null;
}

function homophoneActivities(lesson: HomophoneLesson): HomophoneLessonSnapshotV1["activities"] {
  return [
    { id: "teaching", concept: "INTRODUCTION", mode: "teaching_page", answerVisibility: "teaching", wordBindings: lesson.words.map(word => word.word) },
    { id: "bin-sort", concept: "MEANING_SORT", mode: "sentence_choice", answerVisibility: "guided", wordBindings: lesson.binSort.map(prompt => prompt.answer) },
    { id: "balloon-pop", concept: "BALLOON_POP", mode: "timed_sentence_choice", answerVisibility: "guided", wordBindings: lesson.words.map(word => word.word) },
    ...lesson.coverCheck.map((word, index) => ({ id: `cover-${index + 1}`, concept: "COVER_CHECK" as const, mode: "whole_word", answerVisibility: "recall_neutral" as const, wordBindings: [word] })),
    ...lesson.dictationPassages.map((passage, index) => ({ id: `dictation-${index + 1}`, concept: "DICTATION" as const, mode: "two_word_gaps", answerVisibility: "recall_neutral" as const, wordBindings: passage.targets })),
    { id: "reflection", concept: "LESSON_REFLECTION", mode: "standard_lesson_reflection", answerVisibility: "recall_neutral", wordBindings: lesson.words.map(word => word.word) },
  ];
}

export function compileHomophoneLessonSnapshot(microSkillKey: string): HomophoneLessonSnapshotV1 {
  const sourceLesson = getHomophoneLesson(microSkillKey);
  if (!sourceLesson) throw new Error(`homophone_lesson_not_ready:${microSkillKey}`);
  const lesson = structuredClone(sourceLesson);
  return {
    snapshotSchemaVersion: 3,
    route: HOMOPHONE_ROUTE,
    recipe: HOMOPHONE_RECIPE,
    contentVersion: HOMOPHONE_CONTENT_VERSION,
    sourceSha256: HOMOPHONE_SOURCE_SHA256,
    contentSha256: HOMOPHONE_CONTENT_SHA256,
    microSkillKey,
    lesson,
    activities: homophoneActivities(lesson),
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function validateHomophoneLessonSnapshot(snapshot: HomophoneLessonSnapshotV1): string[] {
  const issues = validateHomophoneLesson(snapshot.lesson);
  if (snapshot.snapshotSchemaVersion !== 3 || snapshot.route.routeId !== HOMOPHONE_ROUTE.routeId || snapshot.route.routeVersion !== HOMOPHONE_ROUTE.routeVersion
    || snapshot.recipe.recipeKey !== HOMOPHONE_RECIPE.recipeKey || snapshot.recipe.recipeVersion !== HOMOPHONE_RECIPE.recipeVersion) issues.push("route_mismatch");
  if (!homophoneContentApproved() || snapshot.contentVersion !== HOMOPHONE_CONTENT_VERSION || snapshot.sourceSha256 !== HOMOPHONE_SOURCE_SHA256 || snapshot.contentSha256 !== HOMOPHONE_CONTENT_SHA256) issues.push("content_version_mismatch");
  const sourceLesson = HOMOPHONE_LESSONS.find(entry => entry.microSkillKey === snapshot.microSkillKey);
  if (!sourceLesson || stableJson(snapshot.lesson) !== stableJson(sourceLesson)) issues.push("lesson_content_mismatch");
  if (stableJson(snapshot.activities) !== stableJson(homophoneActivities(snapshot.lesson))) issues.push("activity_contract_mismatch");
  return [...new Set(issues)];
}
