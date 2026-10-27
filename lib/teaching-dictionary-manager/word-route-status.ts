import type { LessonReadinessRow } from "./lesson-preflight";
import {
  routeContentContractFor,
  type RouteContentContract,
} from "@/lib/adle/composable-lesson/route-content-contract";

export type WordRouteBlocker = {
  code: string;
  gate: "dictionary" | "relationship" | "content" | "editorial" | "release" | "activation";
  message: string;
};

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
  /** Complete only when native validation is known to pass. A mixed legacy
   * blocker leaves this unproven rather than guessing that facts are missing. */
  technicalFacts: "complete" | "not_proven" | "not_evaluated";
  editorialApproved: boolean;
  routeReleased: boolean;
  routeActivated: boolean;
  childEligibility: "not_evaluated";
  administrativeCandidate: boolean;
  contractVersion: RouteContentContract["contractVersion"] | null;
  blockerDetails: WordRouteBlocker[];
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
  const contract = routeContentContractFor(lesson.routeId, lesson.microSkillKey);
  const contractCurrent = contract?.routeVersion === lesson.routeVersion;
  const member = lesson.words.find((word) => word.id === wordId && word.role === "published route word")
    ?? lesson.words.find((word) => word.id === wordId && word.requiredForRelease !== false)
    ?? lesson.words.find((word) => word.id === wordId);
  const comparativeBaseSupport = lesson.routeId === "comparative_superlative_word_lab" &&
    (member?.contentPreview as { degree?: string } | null)?.degree === "base";
  const relationshipApproved = input.approvedSkillKeys.has(lesson.microSkillKey);
  const contentPresent = Boolean(member);
  const contentPreflightReady = member?.ready === true && !member.nativeSelectionCheck;
  const technicalFacts = !member || member.nativeSelectionCheck ? "not_evaluated"
    : member.validationBlockers ? member.validationBlockers.length === 0 ? "complete" : "not_proven"
      : member.ready ? "complete" : "not_proven";
  const editorialApproved = Boolean(member && (member.role === "published route word"
    ? member.editorialApproved === true
    : member.requiredForRelease !== false && (member.editorialApproved ?? Boolean(member.reviewedDraftId
      || (lesson.released && member.role !== "route content candidate")))));
  const blockerDetails: WordRouteBlocker[] = [];
  const add = (code: string, gate: WordRouteBlocker["gate"], message: string) => {
    if (!blockerDetails.some((blocker) => blocker.code === code && blocker.message === message))
      blockerDetails.push({ code, gate, message });
  };
  if (!contractCurrent) add("ROUTE_CONTRACT_UNAVAILABLE", "content", "This route/version has no current content contract");
  if (!input.dictionaryApproved) add("DICTIONARY_NOT_APPROVED", "dictionary", "Dictionary word is not approved");
  if (comparativeBaseSupport) add("SUPPORT_FORM_NOT_TARGET", "relationship", "Reviewed base form supports this family; only its -er and -est forms are independent lesson targets");
  else if (!relationshipApproved) add("RELATIONSHIP_NOT_APPROVED", "relationship", "Word–micro-skill relationship is not approved");
  if (!contentPresent) add("ROUTE_CONTENT_MISSING", "content", "Word is not in the reviewed route content or member group");
  for (const message of member?.blockers ?? []) add("WORD_PREFLIGHT_BLOCKED", "content", message);
  if (contentPresent && !contentPreflightReady && !member?.nativeSelectionCheck && !member?.blockers.length)
    add("WORD_PREFLIGHT_BLOCKED", "content", "Route content preflight is blocked");
  if (contentPresent && !editorialApproved)
    add("CONTENT_REVIEW_PENDING", "editorial", "Route content awaits editorial review");
  for (const message of lesson.blockers ?? []) add("LESSON_PREFLIGHT_BLOCKED", "content", message);
  for (const message of lesson.activationBlockers ?? []) {
    // A child allowlist is checked by the native selector for each child. It
    // does not make the reviewed word technically or editorially blocked.
    if (message.includes("limited release scope")) continue;
    add("ACTIVATION_BLOCKED", "activation", message);
  }
  if (!lesson.released) add("ROUTE_NOT_RELEASED", "release", "Route content is not released");
  if (!lesson.activationEnabled) add("ROUTE_NOT_ACTIVE", "activation", "ADLE route is not activated");
  const blockers = [...new Set(blockerDetails.map((blocker) => blocker.message))];
  return {
    wordId,
    routeId: lesson.routeId,
    routeVersion: lesson.routeVersion,
    microSkillKey: lesson.microSkillKey,
    dictionaryApproved: input.dictionaryApproved,
    relationshipApproved,
    contentRole: comparativeBaseSupport ? "reviewed family base (teaching support)" : member?.role ?? null,
    contentPresent,
    contentPreflightReady,
    technicalFacts,
    editorialApproved,
    routeReleased: lesson.released,
    routeActivated: lesson.activationEnabled,
    childEligibility: "not_evaluated",
    administrativeCandidate: blockers.length === 0,
    contractVersion: contractCurrent ? contract.contractVersion : null,
    blockerDetails,
    blockers,
  };
}
