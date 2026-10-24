import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import { buildConvergenceLessonForSets } from "./convergence-preview";
import { validateConvergencePreview } from "./convergence-preview-validation";
import { compileContextualChoiceSnapshot, evaluateContextualChoice, validateContextualChoiceContent,
  type ContextualChoiceContent, type ContextualChoiceResponse, type FrozenContextualChoiceSnapshot } from "./contextual-choice-contract";
import type { QueuedContrastItem } from "./contrast-set-selection";
import type { HomophoneLessonSnapshotV1 } from "./lesson";

/** One immutable selection owns both the guided lesson and independent context check. */
export type FrozenConvergenceAssignment = {
  schemaVersion: 1;
  snapshotSchemaVersion: 3;
  route: { routeId: "homophone_contextual_choice"; routeVersion: "v1" };
  recipe: { recipeKey: "homophone_contextual_choice"; recipeVersion: "v1" };
  payload: { kind: "homophone_contextual_lesson_v1"; version: 1 };
  assignment: { generationSource: "adle_composer_v1"; itemCount: number };
  microSkillKey: string;
  guidedLesson: HomophoneLessonSnapshotV1;
  contextCheck: FrozenContextualChoiceSnapshot;
  selectedSetKeys: string[];
  selectedSets: Array<{ setKey: string; revision: number; semanticFingerprint: string }>;
  sourceFingerprint: string;
  provenance: { sourceFingerprint: string };
};

export function compileConvergenceAssignment(input: {
  content: ContextualChoiceContent;
  queuedItems: readonly QueuedContrastItem[];
  masteredWordIds: ReadonlySet<string>;
  rotationIndex: number;
}): FrozenConvergenceAssignment | null {
  validateContextualChoiceContent(input.content);
  const contextCheck = compileContextualChoiceSnapshot(input);
  if (!contextCheck) return null;
  const selectedSetKeys = contextCheck.selectedSets.map(set => set.setKey);
  const guidedLesson = buildConvergenceLessonForSets(input.content.microSkillKey, selectedSetKeys).snapshot;
  const guidedSets = guidedLesson.lesson.contrastSets ?? [];
  if (guidedSets.length !== contextCheck.selectedSets.length || guidedSets.some((set, index) =>
    set.setKey !== contextCheck.selectedSets[index].setKey
      || set.members.join("\u0000") !== contextCheck.selectedSets[index].members.map(member => member.word).join("\u0000"))) {
    throw new Error("homophone_convergence_guided_context_set_mismatch");
  }
  const body = { schemaVersion: 1 as const, snapshotSchemaVersion: 3 as const,
    route: { routeId: "homophone_contextual_choice" as const, routeVersion: "v1" as const },
    recipe: { recipeKey: "homophone_contextual_choice" as const, recipeVersion: "v1" as const },
    payload: { kind: "homophone_contextual_lesson_v1" as const, version: 1 as const },
    assignment: { generationSource: "adle_composer_v1" as const, itemCount: contextCheck.questions.length },
    microSkillKey: input.content.microSkillKey, guidedLesson, contextCheck, selectedSetKeys,
    selectedSets: contextCheck.selectedSets.map(set => ({ setKey: set.setKey, revision: set.revision,
      semanticFingerprint: set.semanticFingerprint })) };
  // JSONB snapshots omit optional undefined display fields; fingerprint the
  // exact serialised value that will be persisted and replayed.
  const frozen = JSON.parse(JSON.stringify(body)) as typeof body;
  const sourceFingerprint = fingerprintSnapshotValue(frozen);
  return { ...frozen, sourceFingerprint, provenance: { sourceFingerprint } };
}

export function validateFrozenConvergenceAssignment(value: unknown): value is FrozenConvergenceAssignment {
  if (!value || typeof value !== "object") return false;
  const candidate = value as FrozenConvergenceAssignment;
  try {
    if (candidate.schemaVersion !== 1 || candidate.snapshotSchemaVersion !== 3
      || candidate.route?.routeId !== "homophone_contextual_choice"
      || candidate.route.routeVersion !== "v1" || !candidate.microSkillKey
      || candidate.recipe?.recipeKey !== "homophone_contextual_choice" || candidate.recipe.recipeVersion !== "v1"
      || candidate.payload?.kind !== "homophone_contextual_lesson_v1" || candidate.payload.version !== 1
      || candidate.assignment?.generationSource !== "adle_composer_v1"
      || candidate.assignment.itemCount !== candidate.contextCheck?.questions.length
      || candidate.contextCheck?.microSkillKey !== candidate.microSkillKey
      || candidate.guidedLesson?.microSkillKey !== candidate.microSkillKey
      || !Array.isArray(candidate.selectedSetKeys) || candidate.selectedSetKeys.length < 1
      || candidate.selectedSetKeys.length > 3 || new Set(candidate.selectedSetKeys).size !== candidate.selectedSetKeys.length
      || candidate.selectedSetKeys.join("\u0000") !== candidate.contextCheck.selectedSets.map(set => set.setKey).join("\u0000")
      || candidate.selectedSets.length !== candidate.contextCheck.selectedSets.length
      || candidate.selectedSets.some((set, index) => set.setKey !== candidate.contextCheck.selectedSets[index].setKey
        || set.revision !== candidate.contextCheck.selectedSets[index].revision
        || set.semanticFingerprint !== candidate.contextCheck.selectedSets[index].semanticFingerprint)
      || candidate.provenance?.sourceFingerprint !== candidate.sourceFingerprint) return false;
    const guided = candidate.guidedLesson;
    if (validateConvergencePreview(guided).length) return false;
    const selected = candidate.contextCheck.selectedSets;
    const guidedSets = guided.lesson.contrastSets ?? [];
    if (guidedSets.length !== selected.length || guidedSets.some((set, index) => set.setKey !== selected[index].setKey
      || set.members.join("\u0000") !== selected[index].members.map(member => member.word).join("\u0000"))) return false;
    const selectedIds = new Set(selected.map(set => set.setId));
    const questions = candidate.contextCheck.questions;
    if (!questions.length || new Set(questions.map(question => question.questionId)).size !== questions.length
      || questions.some(question => !selectedIds.has(question.setId) || question.evidenceMode !== "independent_sentence"
        || question.optionWordIds.join("\u0000") !== selected.find(set => set.setId === question.setId)?.members.map(member => member.canonicalWordId).join("\u0000")
        || !question.optionWordIds.includes(question.correctWordId))) return false;
    for (const set of selected) {
      if (!set.setId || !set.setKey || set.revision < 1 || !/^[a-f0-9]{64}$/.test(set.semanticFingerprint)
        || set.members.length < 2 || set.members.length > 3 || new Set(set.members.map(member => member.canonicalWordId)).size !== set.members.length
        || set.members.some(member => !member.intendedSense || !member.grammaticalRole || !member.teachingSentence)) return false;
      const tested = new Set(questions.filter(question => question.setId === set.setId).map(question => question.correctWordId));
      if (set.members.some(member => !tested.has(member.canonicalWordId))) return false;
    }
    const { sourceFingerprint: _ignored, provenance: _ignoredProvenance, ...body } = candidate;
    void _ignored;
    void _ignoredProvenance;
    return fingerprintSnapshotValue(body) === candidate.sourceFingerprint;
  } catch { return false; }
}

/** The completion boundary consumes only the frozen independent sentences. */
export function evaluateFrozenConvergenceAssignment(input: {
  assignment: unknown;
  responses: readonly ContextualChoiceResponse[];
}) {
  if (!validateFrozenConvergenceAssignment(input.assignment))
    throw new Error("homophone_convergence_assignment_invalid");
  return evaluateContextualChoice({ snapshot: input.assignment.contextCheck, responses: input.responses });
}
