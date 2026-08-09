import type { CanonicalIntakeRouteReadinessFact } from "../canonical-intake";
import { canonicalWordSkillPair } from "./keys";
import { getCurriculumRouteDefinition } from "../curriculum-readiness/route-registry";
import type { AdleLessonRouteActivation } from "../loaders/lesson-route-activations";

const BASE_WORD_ROUTE = getCurriculumRouteDefinition("base_word_lab", "v2") ??
  (() => {
    throw new Error("Base Word route is not registered");
  })();

export interface BaseWordIntakeFamilyRow {
  id: string;
  microSkillKey: string;
  importBatchId: string;
  rowStatus: string;
  reviewStatus: string;
}

export interface BaseWordIntakeMemberRow {
  baseWordFamilyId: string;
  canonicalWordId: string;
  importBatchId: string;
  memberRole: string;
  assignmentEligible: boolean;
  rowStatus: string;
  reviewStatus: string;
}

export function selectGovernedBaseWordIntakeActivations(
  activations: readonly AdleLessonRouteActivation[],
): AdleLessonRouteActivation[] {
  return activations.filter(
    (activation) =>
      activation.lessonRouteKey === "base_word_family_v1" &&
      activation.payloadVersion === 1 &&
      activation.activationStatus === "production_enabled" &&
      BASE_WORD_ROUTE.supportedMicroSkillKeys.includes(
        activation.microSkillKey,
      ),
  );
}

export function compileBaseWordCanonicalIntakeRouteFacts(input: {
  activations: readonly AdleLessonRouteActivation[];
  families: readonly BaseWordIntakeFamilyRow[];
  members: readonly BaseWordIntakeMemberRow[];
}): {
  enabledSkills: ReadonlySet<string>;
  readyPairs: ReadonlySet<string>;
  routeReadiness: readonly CanonicalIntakeRouteReadinessFact[];
} {
  const governedActivations = selectGovernedBaseWordIntakeActivations(
    input.activations,
  );
  const activationBySkill = new Map(
    governedActivations.map((activation) => [activation.microSkillKey, activation]),
  );
  const enabledSkills = new Set(activationBySkill.keys());
  const familyById = new Map(
    input.families.flatMap((family) => {
      const activation = activationBySkill.get(family.microSkillKey);
      if (!activation || activation.importBatchId !== family.importBatchId)
        return [];
      return [[family.id, { family, activation }] as const];
    }),
  );
  const readyPairs = new Set<string>();
  const routeReadinessByPair = new Map<
    string,
    CanonicalIntakeRouteReadinessFact
  >();

  for (const member of input.members) {
    const owner = familyById.get(member.baseWordFamilyId);
    if (!owner) continue;
    const pair = canonicalWordSkillPair(
      member.canonicalWordId,
      owner.family.microSkillKey,
    );
    const familyApproved =
      owner.family.rowStatus === "active" &&
      owner.family.reviewStatus === "approved_for_first_exposure";
    const exactAuthenticMember =
      member.importBatchId === owner.activation.importBatchId &&
      member.memberRole === "authentic_target" &&
      member.assignmentEligible &&
      member.rowStatus === "active" &&
      member.reviewStatus === "approved_for_first_exposure";
    const ready = familyApproved && exactAuthenticMember;
    const fact: CanonicalIntakeRouteReadinessFact = {
      canonicalWordId: member.canonicalWordId,
      microSkillKey: owner.family.microSkillKey,
      ready,
      blockers: ready
        ? []
        : familyApproved && member.memberRole !== "authentic_target"
          ? ["profile_membership_missing"]
          : ["profile_member_unapproved"],
      routeActivationId: owner.activation.activationId,
      evidence: [{
        source: "canonical_teaching_dictionary_base_word_family_members",
        status: `${member.reviewStatus}:${member.memberRole}`,
      }],
    };
    const previous = routeReadinessByPair.get(pair);
    if (!previous?.ready || ready) routeReadinessByPair.set(pair, fact);
    if (ready) readyPairs.add(pair);
  }

  return {
    enabledSkills,
    readyPairs,
    routeReadiness: [...routeReadinessByPair.values()],
  };
}
