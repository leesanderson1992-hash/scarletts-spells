import { createHash } from "node:crypto";

import {
  ADLE_CURRICULUM_ROUTE_REGISTRY,
  type CurriculumRouteDefinition,
} from "../curriculum-readiness/route-registry";
import type {
  ProductionMicroSkillAuditInput,
  ReadinessAuditMode,
} from "./readiness-audit";

function fingerprint(route: CurriculumRouteDefinition, microSkillKey: string) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        routeId: route.routeId,
        routeVersion: route.routeVersion,
        microSkillKey,
        payloadKind: route.payloadKind,
        payloadVersions: route.payloadVersions,
        requiredActivities: route.requiredActivities,
        itemCounts: route.intentionalItemCounts,
        wordCounts: route.wordCounts,
      }),
    )
    .digest("hex");
}

/**
 * Repository mode proves structure only. It deliberately does not substitute
 * checked-in packages for live Teaching Dictionary facts.
 */
export function buildRepositoryReadinessInput(mode: ReadinessAuditMode): {
  mode: ReadinessAuditMode;
  routes: readonly CurriculumRouteDefinition[];
  microSkills: ProductionMicroSkillAuditInput[];
} {
  const productionRoutes = ADLE_CURRICULUM_ROUTE_REGISTRY.filter(
    (route) =>
      route.implementationState === "registered" &&
      route.compatibilityScope.kind === "declared_micro_skills",
  );
  return {
    mode,
    routes: ADLE_CURRICULUM_ROUTE_REGISTRY,
    microSkills: productionRoutes.flatMap((route) =>
      route.supportedMicroSkillKeys.map((microSkillKey) => ({
        microSkillKey,
        route,
        taxonomyActive: true,
        profileDeclared: true,
        profileProductionEnabled: true,
        wordAssessments: null,
        eligibleAuthenticWordCount: null,
        eligibleTransferWordCount: null,
        groupCompositionValid: null,
        assignmentConstructionValid:
          route.intentionalItemCounts.length > 0 ? true : null,
        persistedPayloadValid: route.payloadVersions.length > 0,
        runtimeReconstructionValid: null,
        activityBindingsValid: true,
        dependencyFingerprint: fingerprint(route, microSkillKey),
      })),
    ),
  };
}
