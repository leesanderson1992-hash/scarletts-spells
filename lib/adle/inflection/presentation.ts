import type { LessonRouteResolutionResult } from "../composable-lesson/route-resolution";
import { parsePersistedLessonRouteMetadata } from "../composable-lesson/persisted-route-metadata";
import { COMPARATIVE_ROUTE_ID, type ComparativeLessonV1 } from "./contracts";
import { DEGREE_RULE_COPY } from "./content";
import type { TeachingPagesConfig } from "../../../components/adle/first-impression/teaching-pages";

export function comparativeTeachingPages(lesson: Pick<ComparativeLessonV1, "families" | "words">): TeachingPagesConfig {
  const rule = DEGREE_RULE_COPY[lesson.families[0].rule];
  return {
    pages: [
      { id: "comparison", type: "teaching", title: "Comparative and superlative", paragraphs: ["A comparative compares two things or people. For the adjectives in this lesson, add -er.", "A superlative picks out the greatest degree in a group of three or more. For these adjectives, add -est."],
        callout: "Two: -er. A group: -est.", sections: [{ tone: "gold", heading: "Helpful sentence clues", paragraphs: ["‘Than’ often helps you spot a comparative. ‘The’ often comes before a superlative. These are useful clues in our examples, not rules for every sentence."] }] },
      { id: "spelling-rule", type: "teaching", title: rule.title, paragraphs: [rule.explanation],
        examples: lesson.families.map(f => ({ text: f.words.map(w => w.word).join(" → "), explanation: f.meaning })) },
    ],
    meetWords: { title: "Today’s six words", introduction: "Two families. A base, a comparative and a superlative in each.",
      words: lesson.words.map(w => ({ id: w.canonicalWordId, word: w.word, label: `${w.degree} · ${lesson.families.find(f => f.familyKey === w.familyKey)!.words[0].word} family`, detail: lesson.families.find(f => f.familyKey === w.familyKey)!.meaning })) },
  };
}

/** Keep comparative lesson chrome consistent after the runtime enters session_complete. */
export function isComparativeLessonPresentation(
  routeResolution: LessonRouteResolutionResult | null,
  lessonRouteMetadata: unknown,
): boolean {
  if (routeResolution?.status === "resolved_explicit" &&
      routeResolution.runtime.adapterKey === "comparative_superlative_v1") return true;
  const persisted = parsePersistedLessonRouteMetadata(lessonRouteMetadata);
  return persisted.ok && persisted.metadata.route.routeId === COMPARATIVE_ROUTE_ID;
}
