import { createHash } from "node:crypto";

import {
  selectBaseWordFamilyLesson,
  type BaseWordFamilyFact,
  type BaseWordFamilyMemberFact,
} from "../base-word-family-selection";
import type { LearningItemFact } from "../learning-items";
import type {
  CurriculumEvidence,
  RouteActivationFact,
  RouteContentFact,
  RouteSelectionFact,
} from "./resolver";
import { getCurriculumRouteDefinition } from "./route-registry";

export const BASE_WORD_ROUTE_ID = "base_word_lab";
export const BASE_WORD_ROUTE_VERSION = "v2";
/** Micro-skills supported by the current governed 2+4/18 assignment recipe.
 * Route ownership is broader and derives from the canonical Base Word cluster. */
export const BASE_WORD_RECIPE_MICRO_SKILLS = getCurriculumRouteDefinition("base_word_lab", "v2")
  ?.supportedMicroSkillKeys ?? [];

type RowStatus = "active" | "draft" | "rejected" | "superseded";

export interface BaseWordTeachingContentFact {
  id: string;
  microSkillKey: string;
  contentVersion: string;
  rowStatus: RowStatus;
  versionStatus: string;
  isActive: boolean;
  finalReadinessReviewStatus: string;
  childFriendlyExplanation: string | null;
  ruleExplanation: string | null;
}

export interface BaseWordFamilyDetailFact extends BaseWordFamilyFact {
  familyId: string;
  baseMeaning: string | null;
  etymologyRoute: Record<string, unknown> | null;
}

export interface BaseWordFamilyMemberDetailFact extends BaseWordFamilyMemberFact {
  memberId: string;
  familyId: string;
  wordSum: string | null;
  morphologyParts: unknown;
  morphologyJoins: unknown;
  morphologyTransformations: unknown;
  childFriendlyMeaning: string | null;
}

export interface BaseWordDictionaryWordFact {
  canonicalWordId: string;
  rowStatus: string;
  reviewStatus: string;
}

export interface BaseWordDictationFact {
  id: string;
  canonicalWordId: string;
  rowStatus: string;
  reviewStatus: string;
  dictationSentence: string | null;
  dictationTargetTokenIndex: number | null;
  audioText: string | null;
}

export interface BaseWordReleaseAuthorityFact {
  activationRevisionId: string;
  releaseManifestId: string;
  dependencyFingerprint: string;
  familyAuthorityId: string;
  teachingContentAuthorityId: string;
  dictionaryClosureAuthorityId: string;
  familyAuthoritySchemaVersion?: 1 | 2;
}

export interface BaseWordRouteFactInput {
  canonicalWordId: string;
  microSkillKey: string;
  releaseAuthority: BaseWordReleaseAuthorityFact | null;
  words: readonly BaseWordDictionaryWordFact[];
  teachingContent: readonly BaseWordTeachingContentFact[];
  families: readonly BaseWordFamilyDetailFact[];
  members: readonly BaseWordFamilyMemberDetailFact[];
  dictation: readonly BaseWordDictationFact[];
}

/**
 * Projects the existing pilot gates into an observed activation fact. The
 * caller supplies those observations; this helper neither reads nor changes
 * process state, registry state, or database activation rows.
 */
export function observeBaseWordRouteActivation(params: {
  childId: string;
  microSkillKey: string;
  environmentKey: "local" | "staging" | "production";
  environmentEnabled: boolean;
  releaseAuthorityEnabled: boolean;
  childEnabled: boolean;
}): RouteActivationFact {
  return {
    childId: params.childId,
    microSkillKey: params.microSkillKey,
    routeId: BASE_WORD_ROUTE_ID,
    routeVersion: BASE_WORD_ROUTE_VERSION,
    environmentKey: params.environmentKey,
    environmentEnabled: params.environmentEnabled,
    profileOrFamilyEnabled: params.releaseAuthorityEnabled,
    childEnabled: params.childEnabled,
  };
}

function evidence(source: string, id: string, field?: string, observed?: string | boolean | number | null, required?: string | boolean | number | null): CurriculumEvidence {
  return { source, id, field, observed, required };
}

function approved(rowStatus: string, reviewStatus: string): boolean {
  return rowStatus === "active" && reviewStatus === "approved_for_first_exposure";
}

function supported(microSkillKey: string): boolean {
  return (BASE_WORD_RECIPE_MICRO_SKILLS as readonly string[]).includes(microSkillKey);
}

function canonicalHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function completeMember(member: BaseWordFamilyMemberDetailFact): string[] {
  const missing: string[] = [];
  if (!member.wordSum?.trim()) missing.push("BASE_WORD_WORD_SUM_MISSING");
  if (!Array.isArray(member.morphologyParts) || member.morphologyParts.length === 0) missing.push("BASE_WORD_MORPHOLOGY_PARTS_MISSING");
  if (!Array.isArray(member.morphologyJoins)) missing.push("BASE_WORD_MORPHOLOGY_JOINS_MISSING");
  if (!Array.isArray(member.morphologyTransformations)) missing.push("BASE_WORD_MORPHOLOGY_TRANSFORMATIONS_MISSING");
  if (!member.childFriendlyMeaning?.trim()) missing.push("BASE_WORD_MEANING_MISSING");
  return missing;
}

/**
 * Inspect one exact target's reusable Base Word Lab dependencies. This does
 * not decide whether a child currently has a second authentic target.
 */
export function inspectBaseWordRouteContent(input: BaseWordRouteFactInput): RouteContentFact {
  const blockers: string[] = [];
  const facts: CurriculumEvidence[] = [];
  const dependencyIds: string[] = [];
  if (!supported(input.microSkillKey)) blockers.push("BASE_WORD_MICRO_SKILL_UNSUPPORTED");
  const authority = input.releaseAuthority;
  if (!authority) {
    blockers.push("BASE_WORD_RELEASE_AUTHORITY_MISSING");
  } else {
    dependencyIds.push(
      `activation:${authority.activationRevisionId}`,
      `release:${authority.releaseManifestId}`,
      `family:${authority.familyAuthorityId}`,
      `teaching:${authority.teachingContentAuthorityId}`,
      `closure:${authority.dictionaryClosureAuthorityId}`,
    );
    facts.push(
      evidence("adle_route_activation_revisions", authority.activationRevisionId),
      evidence("adle_curriculum_release_manifests", authority.releaseManifestId),
      evidence("adle_curriculum_dependency_authorities", authority.familyAuthorityId, "authority_type", "family_membership", "family_membership"),
      evidence("adle_curriculum_dependency_authorities", authority.teachingContentAuthorityId, "authority_type", "teaching_content", "teaching_content"),
      evidence("adle_curriculum_dependency_authorities", authority.dictionaryClosureAuthorityId, "authority_type", "teaching_dictionary_closure", "teaching_dictionary_closure"),
    );
  }
  const word = input.words.find((row) => row.canonicalWordId === input.canonicalWordId);
  if (!word || !approved(word.rowStatus, word.reviewStatus)) {
    blockers.push("BASE_WORD_DICTIONARY_CLOSURE_MISSING");
  } else {
    dependencyIds.push(`word:${word.canonicalWordId}`);
    facts.push(evidence("adle_teaching_dictionary_closure_words", word.canonicalWordId));
  }
  const content = input.teachingContent.find((row) =>
    row.microSkillKey === input.microSkillKey &&
    row.rowStatus === "active" &&
    row.versionStatus === "active" &&
    row.isActive &&
    row.finalReadinessReviewStatus === "signed_off" &&
    Boolean(row.childFriendlyExplanation?.trim()) &&
    Boolean(row.ruleExplanation?.trim()),
  );
  if (!content) blockers.push("BASE_WORD_SIGNED_OFF_TEACHING_CONTENT_MISSING");
  else {
    dependencyIds.push(`content:${content.id}:${content.contentVersion}`);
    facts.push(evidence("adle_curriculum_dependency_authorities", content.id, "content_version", content.contentVersion));
  }
  const familyById = new Map(input.families
    .filter((row) => row.microSkillKey === input.microSkillKey && approved(row.rowStatus, row.reviewStatus))
    .map((row) => [row.familyId, row]));
  const targetMembers = input.members.filter((member) =>
    member.canonicalWordId === input.canonicalWordId && familyById.has(member.familyId) && approved(member.rowStatus, member.reviewStatus),
  );
  if (targetMembers.length === 0) blockers.push("BASE_WORD_TARGET_FAMILY_MEMBER_MISSING");
  const eligibleTarget = targetMembers.find((member) => member.assignmentEligible && member.authenticSelectionEligible !== false);
  if (targetMembers.length > 0 && !eligibleTarget) blockers.push("BASE_WORD_TARGET_MEMBER_NOT_ASSIGNMENT_ELIGIBLE");
  if (eligibleTarget) {
    const family = familyById.get(eligibleTarget.familyId)!;
    dependencyIds.push(`family:${family.familyId}`, `member:${eligibleTarget.memberId}`);
    if (authority) {
      facts.push(evidence("adle_curriculum_dependency_authorities", authority.familyAuthorityId, "family_id", family.familyId));
      facts.push(evidence("adle_curriculum_dependency_authorities", authority.familyAuthorityId, "family_relationship", `${eligibleTarget.memberId}:${eligibleTarget.baseFamilyKey}`, `${eligibleTarget.memberId}:${eligibleTarget.baseFamilyKey}`));
    }
    blockers.push(...completeMember(eligibleTarget));
    if (!family.baseMeaning?.trim()) blockers.push("BASE_WORD_FAMILY_MEANING_MISSING");
    if (family.etymologyRoute === null) blockers.push("BASE_WORD_FAMILY_ETYMOLOGY_ROUTE_MISSING");
    const transfers = input.members.filter((member) =>
      member.familyId === family.familyId && approved(member.rowStatus, member.reviewStatus) && member.assignmentEligible &&
      member.lessonContentEligible !== false &&
      (!member.applicableMicroSkillKeys || member.applicableMicroSkillKeys.includes(input.microSkillKey)) &&
      member.canonicalWordId !== input.canonicalWordId,
    );
    if (transfers.length === 0) blockers.push("BASE_WORD_FAMILY_TRANSFER_POOL_EMPTY");
  }
  const sentence = input.dictation.find((row) =>
    row.canonicalWordId === input.canonicalWordId && approved(row.rowStatus, row.reviewStatus),
  );
  if (!sentence || !sentence.dictationSentence?.trim() || sentence.dictationTargetTokenIndex === null || sentence.dictationTargetTokenIndex < 0 || !sentence.audioText?.trim()) {
    blockers.push("BASE_WORD_DICTATION_MISSING");
  } else {
    dependencyIds.push(`dictation:${sentence.id}`);
    facts.push(evidence("adle_teaching_dictionary_closure_words", sentence.id));
  }
  const uniqueBlockers = [...new Set(blockers)].sort();
  return {
    canonicalWordId: input.canonicalWordId,
    microSkillKey: input.microSkillKey,
    routeId: BASE_WORD_ROUTE_ID,
    routeVersion: BASE_WORD_ROUTE_VERSION,
    dependencyFingerprint: authority?.dependencyFingerprint ?? canonicalHash({
      route: `${BASE_WORD_ROUTE_ID}:${BASE_WORD_ROUTE_VERSION}`,
      target: input.canonicalWordId,
      skill: input.microSkillKey,
      dependencyIds: dependencyIds.sort(),
    }),
    ready: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    evidence: facts.sort((left, right) => `${left.source}\u0000${left.id}`.localeCompare(`${right.source}\u0000${right.id}`)),
  };
}

export function inspectBaseWordRouteSelection(params: {
  childId: string;
  canonicalWordId: string;
  microSkillKey: string;
  learningItems: readonly LearningItemFact[];
  families: readonly BaseWordFamilyDetailFact[];
  members: readonly BaseWordFamilyMemberDetailFact[];
  payloadCompilable: boolean | null;
  familyAuthoritySchemaVersion?: 1 | 2;
}): RouteSelectionFact {
  const selection = selectBaseWordFamilyLesson(params.childId, params.microSkillKey, {
    familyAuthoritySchemaVersion: params.familyAuthoritySchemaVersion,
    learningItems: params.learningItems,
    families: params.families,
    members: params.members,
  });
  const selected = selection.slots.some((slot) =>
    slot.canonicalWordId === params.canonicalWordId && slot.assignmentRole === "primary_authentic_target",
  );
  const selectorBlockers = selection.skipReasons.length > 0
    ? [...selection.skipReasons]
    : !selected
      ? ["AUTHENTIC_TARGET_DEFERRED_BY_EXISTING_SELECTOR"]
      : params.payloadCompilable === false
        ? ["BASE_WORD_PAYLOAD_NOT_COMPILABLE"]
        : params.payloadCompilable === null
          ? ["BASE_WORD_PAYLOAD_NOT_EVALUATED"]
          : [];
  return {
    childId: params.childId,
    canonicalWordId: params.canonicalWordId,
    microSkillKey: params.microSkillKey,
    routeId: BASE_WORD_ROUTE_ID,
    routeVersion: BASE_WORD_ROUTE_VERSION,
    ready: selectorBlockers.length === 0,
    selectorBlockers,
    evidence: selectorBlockers.map((code) => evidence("base_word_family_selector", params.microSkillKey, "skip_reason", code)),
  };
}
