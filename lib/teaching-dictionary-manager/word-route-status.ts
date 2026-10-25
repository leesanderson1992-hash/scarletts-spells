import type { LessonReadinessRow } from "./lesson-preflight";

export type WordRouteStatus = {
  wordId: string;
  routeId: string;
  routeVersion: string;
  microSkillKey: string;
  dictionaryApproved: boolean;
  relationshipApproved: boolean;
  contentRole: string | null;
  contentPresent: boolean;
  contentPreflightReady: boolean;
  editorialApproved: boolean;
  routeReleased: boolean;
  routeActivated: boolean;
  childEligibility: "not_evaluated";
  administrativeCandidate: boolean;
  blockers: string[];
};

/** An admin projection of distinct governed gates. The native selector still
 * decides whether a particular child receives a particular lesson. */
export function wordRouteStatus(input: {
  wordId: string;
  dictionaryApproved: boolean;
  approvedSkillKeys: ReadonlySet<string>;
  lesson: LessonReadinessRow;
}): WordRouteStatus {
  const { wordId, lesson } = input;
  const member = lesson.words.find((word) => word.id === wordId && word.requiredForRelease !== false);
  const relationshipApproved = input.approvedSkillKeys.has(lesson.microSkillKey);
  const contentPresent = Boolean(member);
  const contentPreflightReady = member?.ready === true;
  const editorialApproved = Boolean(member && (lesson.released || member.reviewedDraftId));
  const blockers = [
    ...(!input.dictionaryApproved ? ["Dictionary word is not approved"] : []),
    ...(!relationshipApproved ? ["Word–micro-skill relationship is not approved"] : []),
    ...(!contentPresent ? ["Word is not in the reviewed route content or member group"] : []),
    ...(member?.blockers ?? []),
    ...(contentPresent && !contentPreflightReady && !member?.blockers.length ? ["Route content preflight is blocked"] : []),
    ...(contentPresent && !editorialApproved ? ["Route content awaits editorial review"] : []),
    ...(lesson.blockers ?? []),
    ...(lesson.activationBlockers ?? []),
    ...(!lesson.released ? ["Route content is not released"] : []),
    ...(!lesson.activationEnabled ? ["ADLE route is not activated"] : []),
  ];
  return {
    wordId,
    routeId: lesson.routeId,
    routeVersion: lesson.routeVersion,
    microSkillKey: lesson.microSkillKey,
    dictionaryApproved: input.dictionaryApproved,
    relationshipApproved,
    contentRole: member?.role ?? null,
    contentPresent,
    contentPreflightReady,
    editorialApproved,
    routeReleased: lesson.released,
    routeActivated: lesson.activationEnabled,
    childEligibility: "not_evaluated",
    administrativeCandidate: blockers.length === 0,
    blockers: [...new Set(blockers)],
  };
}
