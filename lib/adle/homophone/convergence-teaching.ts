import type { TeachingPagesConfig } from "@/components/adle/first-impression/teaching-pages";
import type { HomophoneConcept, HomophoneTeachingGroup } from "@/components/adle/homophone/homophone-teaching-pages";
import type { HomophoneLesson } from "./lesson";

const concepts = new Map<string, HomophoneConcept>([
  ["D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS", "apostrophe"],
  ["D4_HOM_CONFUSABLE_WORDS_SE_SY_CE_CY", "c_or_s"],
  ["D4_HOM_CONTENT_WORD_HOMOPHONES_ED_FOR_T", "past_ed"],
]);

export function convergenceTeachingConfig(lesson: HomophoneLesson): TeachingPagesConfig {
  const concept = concepts.get(lesson.microSkillKey);
  if (!lesson.teachingGroups?.length) throw new Error(`homophone_teaching_groups_missing:${lesson.microSkillKey}`);
  const groups: HomophoneTeachingGroup[] = lesson.teachingGroups.map(group => {
    const words = group.words.map(word => ({ ...word }));
    if (concept === "past_ed") words.sort((left, right) => Number(right.word.endsWith("ed")) - Number(left.word.endsWith("ed")));
    return { id: group.id, words };
  });
  const intro = { id: "homophone-intro", type: "teaching" as const, title: lesson.teachingIntro.title,
    paragraphs: lesson.teachingIntro.paragraphs, homophoneStandardIntro: true,
    homophoneFocus: lesson.teachingIntro.focus, highlightFocusWords: lesson.words.map(entry => entry.word),
    callout: lesson.teachingIntro.category };
  const conceptTitles = { apostrophe: "The Tiny Mark That Changes Everything! ✨",
    c_or_s: "C or S? One Letter Changes Everything! 🔎", past_ed: "Sounds Like T… But Is It -ed? 🔎" };
  return {
    pages: concept ? [intro, { id: "homophone-concept", type: "teaching", title: conceptTitles[concept], paragraphs: [], homophoneConcept: concept }] : [intro],
    homophone: { presentation: concept ? "pair_pages" : "word_pages", groups, concept },
    meetWords: { title: "Cheat Codes to Remember", words: lesson.words.map(entry => ({ id: entry.word, word: entry.word, detail: entry.memoryCue })) },
  };
}
