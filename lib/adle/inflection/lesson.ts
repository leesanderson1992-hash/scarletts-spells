import { COMPARATIVE_ROUTE_KEY, adjectiveFamilyBlockers, type ComparativeLessonV1, type DegreeQuestion } from "./contracts";
import type { DegreeFamilySelection } from "./selection";
import { comparativeTeachingPages } from "./presentation";
import { DEGREE_RULE_COPY } from "./content";
import { semanticJson } from "./semantic-json";

export function compileComparativeLesson(selection: Extract<DegreeFamilySelection, { ok: true }>, assignmentKey: string, authority: ComparativeLessonV1["authority"] = "reviewed_content", taskSequenceVersion: 1 | 2 = 2): ComparativeLessonV1 {
  if (!assignmentKey || selection.families.some(f => adjectiveFamilyBlockers(f, authority === "dev_fixture").length)) throw new Error("comparative_content_not_ready");
  const [a, b] = selection.families;
  if (a.familyKey === b.familyKey || a.microSkillKey !== b.microSkillKey) throw new Error("comparative_family_mismatch");
  const gap = (family: typeof a, degree: "comparative" | "superlative", index: number) => ({ ...family.content.gaps.filter(g => g.degree === degree)[index], familyKey: family.familyKey });
  const variant = Array.from(assignmentKey).reduce((value, character) => value + character.charCodeAt(0), 0) % 2;
  const fourGaps = variant === 0 ? [gap(a, "comparative", 0), gap(b, "superlative", 0), gap(b, "comparative", 0), gap(a, "superlative", 0)]
    : [gap(b, "superlative", 0), gap(a, "comparative", 0), gap(a, "superlative", 0), gap(b, "comparative", 0)];
  const fourTargets = variant === 0 ? [selection.words[1], selection.words[5], selection.words[2], selection.words[4]]
    : [selection.words[4], selection.words[2], selection.words[5], selection.words[1]];
  const lesson: ComparativeLessonV1 = {
    schemaVersion: 1, ...(taskSequenceVersion === 2 ? { taskSequenceVersion } : {}), routeKey: COMPARATIVE_ROUTE_KEY, microSkillKey: a.microSkillKey, assignmentKey, authority,
    teaching: comparativeTeachingPages(selection), reflectionPrompt: DEGREE_RULE_COPY[a.rule].reflection,
    families: selection.families, words: selection.words, queuedTargets: selection.queuedTargets,
    deferredLearningItemIds: selection.deferredLearningItemIds,
    sentenceTasks: taskSequenceVersion === 2 ? fourGaps : [gap(a, "comparative", 0), gap(b, "comparative", 0), gap(a, "comparative", 1), gap(b, "superlative", 0), gap(a, "superlative", 0), gap(b, "superlative", 1)],
    cleaverTasks: (taskSequenceVersion === 2 ? fourTargets : selection.queuedTargets).map((target, index) => {
      const family = selection.families.find(f => f.familyKey === target.familyKey)!;
      const transformation = family.transformations[target.degree === "comparative" ? 0 : 1];
      const question = family.content.questions[index % 2];
      // Why questions name the actual queued target, including -est, not a fixed example.
      const adapted: DegreeQuestion = { ...question, id: `${question.id}:${target.canonicalWordId}`,
        prompt: question.prompt.replaceAll("{base}", transformation.base).replaceAll("{word}", transformation.result).replaceAll("{ending}", transformation.ending).replaceAll("{last}", transformation.base.at(-1)!) };
      return { target, transformation, question: adapted };
    }),
    dictationTasks: selection.families.map((family, index) => {
      const seed = Array.from(assignmentKey).reduce((n, c) => n + c.charCodeAt(0), index);
      return { ...family.content.pairedSentence, audioOrder: seed % 2 ? [1, 0] : [0, 1] };
    }),
  };
  // JSON copy prevents mutable dictionary input from changing a compiled assignment.
  return JSON.parse(JSON.stringify(lesson)) as ComparativeLessonV1;
}
export function validateComparativeLesson(value: unknown, allowFixture = false): value is ComparativeLessonV1 {
  if (!value || typeof value !== "object") return false;
  const p = value as ComparativeLessonV1;
  try {
    if (p.schemaVersion !== 1 || p.routeKey !== COMPARATIVE_ROUTE_KEY || !p.assignmentKey
      || (p.authority !== "reviewed_content" && !(allowFixture && p.authority === "dev_fixture"))
      || !Array.isArray(p.families) || p.families.length !== 2
      || p.families.some(f => adjectiveFamilyBlockers(f, p.authority === "dev_fixture").length > 0 || f.microSkillKey !== p.microSkillKey)
      || p.families[0].familyKey === p.families[1].familyKey
      || !Array.isArray(p.words) || p.words.length !== 6 || new Set(p.words.map(w => w.canonicalWordId)).size !== 6
      || !Array.isArray(p.queuedTargets) || p.queuedTargets.length < 2 || p.queuedTargets.length > 4
      || p.queuedTargets.some(w => !w.learningItemId || w.degree === "base" || !p.words.some(x => semanticJson(x) === semanticJson(w)))
      || new Set(p.queuedTargets.map(w => w.canonicalWordId)).size !== p.queuedTargets.length
      || new Set(p.queuedTargets.map(w => w.learningItemId)).size !== p.queuedTargets.length
      || new Set(p.queuedTargets.map(w => w.familyKey)).size !== 2
      || !Array.isArray(p.deferredLearningItemIds) || p.deferredLearningItemIds.some(id => typeof id !== "string" || !id)
      || p.words.some(w => w.learningItemId !== null && !p.queuedTargets.some(t => t.canonicalWordId === w.canonicalWordId))) return false;
    const expectedWords = p.families.flatMap(f => f.words.map(w => ({ ...w, familyKey: f.familyKey, learningItemId: p.queuedTargets.find(t => t.canonicalWordId === w.canonicalWordId)?.learningItemId ?? null })));
    if (semanticJson(expectedWords) !== semanticJson(p.words)) return false;
    if (!p.teaching || !Array.isArray(p.teaching.pages) || p.teaching.pages.length !== 2
      || p.teaching.pages.some(page => !page || typeof page.title !== "string" || !page.title.trim()
        || !Array.isArray(page.paragraphs) || !page.paragraphs.length || page.paragraphs.some((text: unknown) => typeof text !== "string" || !text.trim()))
      || !Array.isArray(p.teaching.meetWords?.words) || p.teaching.meetWords.words.length !== 6
      || p.teaching.meetWords.words.some((card, index) => card.id !== p.words[index].canonicalWordId || card.word !== p.words[index].word
        || typeof card.label !== "string" || !card.label.includes(p.words[index].degree))
      || typeof p.reflectionPrompt !== "string" || !p.reflectionPrompt.trim()) return false;
    if (p.taskSequenceVersion !== undefined && p.taskSequenceVersion !== 2) return false;
    const expected = compileComparativeLesson({ ok: true, families: p.families, words: p.words, queuedTargets: p.queuedTargets, deferredLearningItemIds: p.deferredLearningItemIds }, p.assignmentKey, p.authority, p.taskSequenceVersion ?? 1);
    // Authored teaching is frozen; later copy edits must not rewrite saved assignments.
    return semanticJson({ ...expected, teaching: p.teaching, reflectionPrompt: p.reflectionPrompt }) === semanticJson(p);
  } catch { return false; }
}
