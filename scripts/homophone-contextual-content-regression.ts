import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import approved from "../data/adle/homophone/convergence-v1/approved-lesson-content.json";
import { buildApprovedContextualContent, type PublishedContrastAuthority } from "../lib/adle/homophone/approved-contextual-content";
import { compileContextualChoiceSnapshot } from "../lib/adle/homophone/contextual-choice-contract";
import { buildConvergenceReleasePackage } from "../lib/adle/homophone/convergence-release";
import { compileConvergenceAssignment, evaluateFrozenConvergenceAssignment,
  validateFrozenConvergenceAssignment } from "../lib/adle/homophone/convergence-assignment";
import { contextualProgressReadyToFinish, contextualProgressTransitionValid,
  contextualProgressValid, initialContextualProgress } from "../lib/adle/homophone/contextual-progress";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
let questions = 0;
const releaseContents = [];
for (const source of approved.lessons) {
  const authorities: PublishedContrastAuthority[] = source.sets.map(set => ({
    setId: `set:${set.setKey}`, setKey: set.setKey, microSkillKey: source.microSkillKey,
    revision: 1, semanticFingerprint: hash(set.setKey), reviewStatus: "approved",
    relationKind: set.relationKind as PublishedContrastAuthority["relationKind"],
    members: set.members.map(member => ({ ...member, canonicalWordId: `word:${member.word}` })),
  }));
  const content = buildApprovedContextualContent(source.microSkillKey, authorities);
  releaseContents.push(content);
  questions += content.questions.length;
  assert.equal(content.questions.length, source.sets.reduce((sum, set) => sum + set.choiceQuestions.length, 0));
  const queued = content.sets.length > 1 ? [{ canonicalWordId: content.sets.at(-1)!.memberWordIds[0],
    intakeOn: "2026-10-01", status: "pending" as const }] : [];
  const selected = compileContextualChoiceSnapshot({ content, queuedItems: queued,
    masteredWordIds: new Set<string>(), rotationIndex: 0 });
  assert.ok(selected);
  const assignment = compileConvergenceAssignment({ content, queuedItems: queued,
    masteredWordIds: new Set<string>(), rotationIndex: 0 });
  assert.ok(assignment);
  assert.equal(validateFrozenConvergenceAssignment(assignment), true);
  const beginning = initialContextualProgress();
  assert.equal(contextualProgressValid(beginning, assignment), true);
  const guidedDone = { ...beginning.guided, stage: "reflection" as const, binSortCompleted: true,
    balloonCompleted: true, reflectionResponse: "I checked the meaning.",
    coverAttempts: Object.fromEntries(assignment.guidedLesson.lesson.coverCheck.map(word => [word, word])),
    dictationValues: Object.fromEntries(assignment.guidedLesson.lesson.dictationPassages.map((passage, index) => [String(index), passage.targets])),
    dictationChecked: Object.fromEntries(assignment.guidedLesson.lesson.dictationPassages.map((_, index) => [String(index), true])),
  };
  const beforeContext = { ...beginning, guided: guidedDone };
  const context = { ...beforeContext, stage: "context_check" as const, guided: { ...guidedDone, completed: true } };
  assert.equal(contextualProgressTransitionValid(beforeContext, context, assignment), true);
  const checked = { ...context, responses: assignment.contextCheck.questions.map(question => ({
    questionId: question.questionId, selectedWordId: question.correctWordId,
  })), responsesLocked: true };
  assert.equal(contextualProgressReadyToFinish(checked, assignment), true);
  assert.equal(contextualProgressTransitionValid(checked, { ...checked, responses: [] }, assignment), false);
  const firstSaved = { ...context, responses: checked.responses.slice(0, 1) };
  const swapped = { ...firstSaved, responses: [{ ...firstSaved.responses[0],
    selectedWordId: assignment.contextCheck.questions[0].optionWordIds.find(id =>
      id !== firstSaved.responses[0].selectedWordId)! }] };
  assert.equal(contextualProgressTransitionValid(firstSaved, swapped, assignment), false);
  assert.deepEqual(assignment.selectedSetKeys, selected.selectedSets.map(set => set.setKey));
  const evidence = evaluateFrozenConvergenceAssignment({ assignment, responses: assignment.contextCheck.questions.map(question => ({
    questionId: question.questionId, selectedWordId: question.correctWordId,
  })) });
  assert.equal(evidence.microSkillKey, source.microSkillKey);
  assert.ok(evidence.wordOutcomes.every(outcome => outcome.correct));
  const firstQuestion = assignment.contextCheck.questions[0];
  const wrongChoice = firstQuestion.optionWordIds.find(id => id !== firstQuestion.correctWordId)!;
  const oneWrong = evaluateFrozenConvergenceAssignment({ assignment, responses: assignment.contextCheck.questions.map(question => ({
    questionId: question.questionId,
    selectedWordId: question.questionId === firstQuestion.questionId ? wrongChoice : question.correctWordId,
  })) });
  assert.equal(oneWrong.wordOutcomes.find(outcome => outcome.canonicalWordId === firstQuestion.correctWordId)?.correct, false);
  assert.throws(() => evaluateFrozenConvergenceAssignment({ assignment, responses: [] }), /incomplete/);
  assert.equal(validateFrozenConvergenceAssignment({ ...assignment, contextCheck: {
    ...assignment.contextCheck, questions: assignment.contextCheck.questions.slice(1),
  } }), false);
  assert.ok(selected.selectedSets.length >= 1 && selected.selectedSets.length <= 3);
  if (queued.length) assert.equal(selected.selectedSets[0].setKey, content.sets.at(-1)?.setKey);
  for (const set of selected.selectedSets) {
    const whole = content.sets.find(candidate => candidate.setId === set.setId)!;
    assert.deepEqual(set.members.map(member => member.canonicalWordId), whole.memberWordIds);
  }
  assert.deepEqual(new Set(selected.questions.map(question => question.correctWordId)),
    new Set(selected.selectedSets.flatMap(set => set.members.map(member => member.canonicalWordId))));
  assert.throws(() => buildApprovedContextualContent(source.microSkillKey,
    authorities.map((set, index) => index === 0 ? { ...set, members: set.members.slice(1) } : set)),
    /authority_mismatch/);
}
assert.equal(questions, 152);
const release = buildConvergenceReleasePackage({ releaseKey: "homophone-convergence-v1-test",
  approvalRefs: ["owner-approval-2026-10-24"], contents: releaseContents });
assert.equal(release.authorities.length, 58);
assert.equal(release.manifest.microSkills.length, 58);
assert.match(release.packageSha256, /^[a-f0-9]{64}$/);
console.log(JSON.stringify({ valid: true, lessons: approved.lessons.length, independentQuestions: questions }));
