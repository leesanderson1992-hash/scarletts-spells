import type { LatinRootLessonContent, LatinRootLessonWord } from "./latin-root-lesson";

/** Introduction examples only; these do not add assessed or assigned words. */
export function latinRootWordSums(content: LatinRootLessonContent, includeIllustrativeExamples = true) {
  const family = content.families[0];
  const examples = (includeIllustrativeExamples ? family.words.slice(0, 4) : family.words).map(({ word, meaning, parts }) => ({ word, meaning, parts }));
  if (includeIllustrativeExamples && family.root === "port") {
    const additions: Pick<LatinRootLessonWord, "word" | "meaning" | "parts">[] = [
      { word: "deport", meaning: "Officially send someone out of a country", parts: [{ text: "de", meaning: "away", role: "prefix" }, { text: "port", meaning: "carry", role: "root" }] },
      { word: "report", meaning: "Give information or news back to someone", parts: [{ text: "re", meaning: "back", role: "prefix" }, { text: "port", meaning: "carry", role: "root" }] },
      { word: "porter", meaning: "A person whose work includes carrying luggage", parts: [{ text: "port", meaning: "carry", role: "root" }, { text: "er", meaning: "person who", role: "suffix" }] },
    ];
    for (const example of additions) if (!examples.some(item => item.word === example.word)) examples.push(example);
  }
  return examples;
}

export const LATIN_ROOT_INTRO_GUIDE = [
  "Welcome to Advanced Spellcraft! Discover the ancient language hidden in words and storybook spells.",
  "One root carries a meaning into a whole family of words. Read each word sum and the meanings underneath.",
  "Read the Latin word and its meaning. Can you guess the spell? Tap the Latin tile with your wand when you are ready.",
  "Lumos! Did you get it right? The Lumos spell lights up any room!",
  "Here is a harder one. Read the two Latin ingredients. Which spell might they inspire?",
  "Expelliarmus! Two Latin words inspired this fictional disarming spell. Now discover the roots in your own words.",
] as const;
