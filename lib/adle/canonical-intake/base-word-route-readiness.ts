import type { CanonicalIntakeRouteReadinessFact } from "../canonical-intake";
import { canonicalWordSkillPair } from "./keys";
import { getCurriculumRouteDefinition } from "../curriculum-readiness/route-registry";
import type { ActivatedBaseWordReleaseAuthority } from "../curriculum-release-activation";
import { persistedReleaseAuthority } from "../curriculum-release-activation";

const BASE_WORD_ROUTE = getCurriculumRouteDefinition("base_word_lab", "v2") ??
  (() => {
    throw new Error("Base Word route is not registered");
  })();

export function compileBaseWordCanonicalIntakeRouteFacts(input: {
  activations: readonly ActivatedBaseWordReleaseAuthority[];
}): {
  enabledSkills: ReadonlySet<string>;
  readyPairs: ReadonlySet<string>;
  routeReadiness: readonly CanonicalIntakeRouteReadinessFact[];
} {
  // supportedMicroSkillKeys is the current released recipe boundary. Route
  // ownership itself is cluster-derived in canonical-intake/route-readiness.
  const activations = input.activations.filter((activation) =>
    BASE_WORD_ROUTE.supportedMicroSkillKeys.includes(activation.microSkillKey) &&
    activation.family.microSkillKey === activation.microSkillKey &&
    activation.teachingContent.microSkillKey === activation.microSkillKey,
  );
  const enabledSkills = new Set(activations.map((activation) => activation.microSkillKey));
  const readyPairs = new Set<string>();
  const routeReadinessByPair = new Map<string, CanonicalIntakeRouteReadinessFact>();

  for (const activation of activations) {
    const closureWordIds = new Set(activation.dictionaryWords.map((word) => word.canonicalWordId));
    for (const family of activation.family.families) {
      for (const member of family.members) {
        const pair = canonicalWordSkillPair(member.canonicalWordId, activation.microSkillKey);
        const exactAuthenticMember =
          member.memberRole === "authentic_target" &&
          member.assignmentEligible &&
          closureWordIds.has(member.canonicalWordId);
        const fact: CanonicalIntakeRouteReadinessFact = {
          canonicalWordId: member.canonicalWordId,
          microSkillKey: activation.microSkillKey,
          ready: exactAuthenticMember,
          blockers: exactAuthenticMember
            ? []
            : member.memberRole !== "authentic_target"
              ? ["profile_membership_missing"]
              : ["payload_not_compilable"],
          routeActivationId: activation.activationRevisionId,
          curriculumRelease: persistedReleaseAuthority(activation),
          evidence: [
            {
              source: "adle_curriculum_dependency_authorities",
              sourceId: activation.familyAuthorityId,
              status: `${member.memberRole}:${member.assignmentEligible ? "assignment_eligible" : "not_assignment_eligible"}`,
            },
            {
              source: "adle_teaching_dictionary_closure_words",
              sourceId: activation.dictionaryClosureAuthorityId,
              status: closureWordIds.has(member.canonicalWordId) ? "exact_word_bound" : "word_missing",
            },
          ],
        };
        const previous = routeReadinessByPair.get(pair);
        if (!previous?.ready || exactAuthenticMember) routeReadinessByPair.set(pair, fact);
        if (exactAuthenticMember) readyPairs.add(pair);
      }
    }
  }

  return { enabledSkills, readyPairs, routeReadiness: [...routeReadinessByPair.values()] };
}
