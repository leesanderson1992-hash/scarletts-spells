import type { CompoundWordLessonReadingPageV2 } from "./compound-word-lesson-v2";

/**
 * Product-owner supplied reading copy for the combined separated/hyphenated
 * micro-skill. It is source configuration for the next immutable teaching-
 * content authority; it does not activate or republish the Production route.
 */
export const SEPARATED_HYPHENATED_READING_PAGES_V2 = [
  {
    key: "descriptions",
    title: "Hyphens: When Do We Join Words Together?",
    introduction: [
      "A hyphen (-) is a little line that can join words together.",
      "The easiest way to understand hyphens is to ask:",
      "Are these words working together as one thing?",
    ],
    sections: [
      {
        key: "two-word-description",
        heading: "1. Two words describing a noun",
        paragraphs: [
          "Sometimes two words team up to make one description.",
          "When that description comes before the noun, we often join the words with a hyphen.",
        ],
      },
      {
        key: "before-the-noun",
        heading: "Before the noun → hyphen",
        paragraphs: [],
        examples: [
          { text: "a well-known rule" },
          { text: "a full-time job" },
          { text: "a five-minute break" },
          { text: "a high-speed train" },
          { text: "Think: well + known → one description → well-known rule" },
        ],
      },
      {
        key: "after-the-noun",
        heading: "After the noun → usually no hyphen",
        paragraphs: [
          "But when the description comes after the noun, we often don't need the hyphen because the sentence is already clear.",
        ],
        examples: [
          { text: "The rule is well known." },
          { text: "Her job is full time." },
          { text: "The break lasted five minutes." },
        ],
      },
    ],
  },
  {
    key: "phrasal-verbs",
    title: "2. Phrasal verbs can turn into nouns",
    introduction: [
      "A phrasal verb is a verb made from a verb plus another small word:",
    ],
    sections: [
      {
        key: "phrasal-verb-examples",
        paragraphs: [],
        examples: [
          { text: "break + in → break in" },
          { text: "take + off → take off" },
          { text: "warm + up → warm up" },
        ],
      },
      {
        key: "actions-stay-separate",
        heading: "When it is an action → keep the words separate",
        paragraphs: ["When you're describing the action, keep the words separate:"],
        examples: [{ text: "The burglar tried to break in." }],
      },
      {
        key: "actions-become-nouns",
        heading: "When the action becomes a noun → it may use a hyphen",
        paragraphs: [
          "Sometimes that action becomes the name of a thing or event. Then we may use a hyphen.",
        ],
        examples: [
          { text: "The burglars broke in.", explanation: "verb: what they did" },
          { text: "There was a break-in.", explanation: "noun: the name of the event" },
          { text: "Let's warm up before football.", explanation: "verb" },
          { text: "Let's do a warm-up.", explanation: "noun" },
        ],
      },
    ],
  },
  {
    key: "compound-nouns",
    title: "3. Compound nouns",
    introduction: [
      "A compound noun is when two or more words join together to name one person, place, thing or idea.",
      "Even though there are two words, together they name one thing.",
    ],
    sections: [
      {
        key: "open-compounds",
        heading: "Many compound nouns stay as separate words",
        paragraphs: ["They don't automatically need a hyphen."],
        examples: [
          { text: "primary school" },
          { text: "business owner" },
          { text: "apple pie" },
        ],
      },
      {
        key: "hyphenated-compounds",
        heading: "Some are traditionally written with hyphens",
        paragraphs: [],
        examples: [
          { text: "brother-in-law" },
          { text: "mother-in-law" },
          { text: "jack-of-all-trades" },
        ],
      },
      {
        key: "closed-compounds",
        heading: "Others are written as one word",
        paragraphs: [],
        examples: [
          { text: "football" },
          { text: "toothbrush" },
          { text: "bedroom" },
        ],
      },
      {
        key: "remember",
        heading: "The easiest way to remember",
        paragraphs: [
          "There isn't one perfect rule for compound nouns. If you're unsure, check a dictionary.",
        ],
        examples: [
          { text: "Description before a noun? → Often use a hyphen: well-known author" },
          { text: "Description after the noun? → Often leave it open: The author is well known." },
          { text: "Is it an action? → Usually separate: break in" },
          { text: "Has the action become the name of something? → It may be hyphenated: a break-in" },
          { text: "Is it the name of one thing made from several words? → It's a compound noun. Check the dictionary if you're unsure: apple pie, toothbrush, brother-in-law." },
        ],
      },
    ],
  },
] as const satisfies readonly CompoundWordLessonReadingPageV2[];
