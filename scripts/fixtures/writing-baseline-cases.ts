import type { BaselineCase, BaselineExpectation } from "../../lib/writing-engine/baseline/analyse";

function label(text: string, word: string, expected: BaselineExpectation["expected"], intendedWord?: string): BaselineExpectation {
  const start = text.indexOf(word);
  if (start < 0) throw new Error("Invalid synthetic fixture");
  return { fieldKey: "sample_text", start, end: start + word.length, observedText: word, expected, intendedWord };
}

function sample(id: string, text: string, expectations: BaselineExpectation[] = []): BaselineCase {
  return { id, source: { kind: "writing_sample", sourceId: `synthetic:${id}`, revision: "1", sampleText: text }, expectations };
}

const missed = "I was runing home.";
const anotherMiss = "I can recieve a letter.";
const detected = "I went home becuase it was cold.";
const context = "I went too the shop. It was too cold.";
const valid = "The dog barked loudly.";

/** Synthetic acceptance controls, not an estimate of learner-writing accuracy. */
export const writingBaselineCases: BaselineCase[] = [
  sample("missed-runing", missed, [label(missed, "runing", "misspelling", "running")]),
  sample("missed-recieve", anotherMiss, [label(anotherMiss, "recieve", "misspelling", "receive")]),
  sample("detected-becuase", detected, [label(detected, "becuase", "misspelling", "because")]),
  sample("mixed-context", context, [label(context, "too", "contextual_misuse", "to"), {
    fieldKey: "sample_text", start: context.lastIndexOf("too"), end: context.lastIndexOf("too") + 3,
    observedText: "too", expected: "valid",
  }]),
  sample("valid-control", valid, [label(valid, "barked", "valid")]),
  sample("unicode-and-contractions", "  🐕 They’re ready. They're at the café. Cafe\u0301 is open.  \n"),
  {
    id: "field-provenance",
    source: {
      kind: "course_draft", sourceId: "synthetic:fields", revision: "1", promptText: "Use the word running.",
      draftPayload: {
        prompt: "Copy running here.", answer: "  runing\n", reflection: "running  ", choice: "running", empty: "  ",
        __field_meta: { prompt: { excludeFromSpelling: true }, answer: { type: "textarea" }, reflection: { type: "textarea" }, choice: { type: "select-one" } },
      },
    },
    expectations: [{ fieldKey: "answer", start: 2, end: 8, observedText: "runing", expected: "misspelling", intendedWord: "running" }],
  },
  sample("repeated-occurrences", "running running. running"),
  sample("ambiguous-context", "Their going to school."),
];
