import type { TeachingPagesConfig } from "@/components/adle/first-impression/teaching-pages";
import type { LatinRootLessonContent } from "./latin-root-lesson";

export const LATIN_ROOT_SPELL_INTRO_SOURCES = [
  "https://www.open.edu/openlearn/history-the-arts/classical-studies/how-does-jk-rowling-use-latin-and-other-classical-languages-harry-potter",
  "https://www.harrypotter.com/features/the-etymology-of-harry-potter-spells",
] as const;

/** Reading copy used by the six-slide interactive introduction. */
export function latinRootTeachingPages(content: LatinRootLessonContent): TeachingPagesConfig {
  return {
    pages: [
      {
        id: "latin-root-welcome", type: "teaching", eyebrow: "What is a root word? · Slide 1",
        title: "Welcome to Advanced Spellcraft! 🪄",
        paragraphs: [
          "Did you know that many magical spells in stories are inspired by an ancient language called Latin?",
          "Latin was spoken by the Ancient Romans over 2,000 years ago, but its magic lives on today!",
          "It’s hidden inside thousands of English words, including words you’ve already used in your writing!",
        ],
        highlightFocusWords: ["Latin", "English"],
      },
      {
        id: "latin-root-meaning", type: "teaching", eyebrow: "What is a root word? · Slide 2",
        title: "What is a Latin root word?",
        paragraphs: [
          "A Latin root is a meaningful part of a word that comes from the ancient Latin language.",
          "Think of it as a secret magical ingredient that carries meaning wherever it goes. One root can appear in many different words!",
        ],

      },
    ],
    // The interactive introduction supplies its own spell slides and activity navigation.
    meetWords: { words: content.families.flatMap(group => group.words.filter(word => word.target).map(word => ({ id: word.id, word: word.word, detail: word.meaning }))) },
  };
}
