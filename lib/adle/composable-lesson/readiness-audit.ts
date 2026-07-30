import { createHash } from "node:crypto";

import {
  COMPATIBILITY_BLOCKER_CODES,
  type CompatibilityAssessment,
  type CompatibilityBlockerCode,
} from "./compatibility";
import {
  ADLE_ACTIVITY_REQUIREMENT_REGISTRY,
  validateActivityRequirementRegistry,
} from "./activity-requirements";
import {
  validateCurriculumRouteRegistry,
  type CurriculumRouteDefinition,
} from "../curriculum-readiness/route-registry";

export const ADLE_READINESS_AUDIT_VERSION = "adle_readiness_audit_v1" as const;

export type ReadinessAuditMode =
  | "repository/report"
  | "live/report"
  | "live/strict";

export type ReadinessStageKey =
  | "taxonomy_and_route"
  | "canonical_word_facts"
  | "word_microskill_support"
  | "authentic_target_eligibility"
  | "transfer_eligibility"
  | "activity_requirements"
  | "group_composition"
  | "assignment_construction"
  | "persisted_payload_validation"
  | "runtime_reconstruction"
  | "activity_binding_resolution";

export interface ReadinessStageResult {
  stage: ReadinessStageKey;
  status: "ready" | "blocked" | "not_assessed";
  blockers: readonly CompatibilityBlockerCode[];
  evidence: readonly string[];
}

export interface ProductionMicroSkillAuditInput {
  microSkillKey: string;
  route: CurriculumRouteDefinition;
  taxonomyActive: boolean;
  profileDeclared: boolean;
  profileProductionEnabled: boolean;
  wordAssessments: readonly CompatibilityAssessment[] | null;
  eligibleAuthenticWordCount: number | null;
  eligibleTransferWordCount: number | null;
  groupCompositionValid: boolean | null;
  assignmentConstructionValid: boolean | null;
  persistedPayloadValid: boolean | null;
  runtimeReconstructionValid: boolean | null;
  activityBindingsValid: boolean | null;
  dependencyFingerprint: string;
}

export interface ProductionMicroSkillAudit {
  microSkillKey: string;
  routeId: string;
  routeVersion: string;
  status: "ready" | "blocked" | "not_assessed";
  stages: readonly ReadinessStageResult[];
  wordAssessments: readonly CompatibilityAssessment[];
  dependencyFingerprint: string;
}

export interface ProductionReadinessAudit {
  auditVersion: typeof ADLE_READINESS_AUDIT_VERSION;
  mode: ReadinessAuditMode;
  inputFingerprint: string;
  summary: {
    productionMicroSkillCount: number;
    structurallyDeclaredCount: number;
    readyCount: number;
    blockedCount: number;
    notAssessedCount: number;
  };
  microSkills: readonly ProductionMicroSkillAudit[];
  knownReportOnlyFindings: readonly {
    routeId: string;
    code: CompatibilityBlockerCode;
    description: string;
  }[];
  containsLearnerIdentity: false;
  containsRawAttempts: false;
  mutationPerformed: false;
}

const stages: readonly ReadinessStageKey[] = [
  "taxonomy_and_route",
  "canonical_word_facts",
  "word_microskill_support",
  "authentic_target_eligibility",
  "transfer_eligibility",
  "activity_requirements",
  "group_composition",
  "assignment_construction",
  "persisted_payload_validation",
  "runtime_reconstruction",
  "activity_binding_resolution",
];

function result(
  stage: ReadinessStageKey,
  value: boolean | null,
  blocker: CompatibilityBlockerCode,
  evidence: readonly string[],
): ReadinessStageResult {
  return {
    stage,
    status: value === null ? "not_assessed" : value ? "ready" : "blocked",
    blockers: value === false ? [blocker] : [],
    evidence: [...evidence].sort(),
  };
}

function wordOutcome(
  assessments: readonly CompatibilityAssessment[] | null,
  select: (assessment: CompatibilityAssessment) => boolean,
  blockers: readonly CompatibilityBlockerCode[],
): { value: boolean | null; codes: CompatibilityBlockerCode[] } {
  if (assessments === null) return { value: null, codes: [] };
  const relevant = assessments.filter(select);
  if (relevant.length === 0) return { value: false, codes: [...blockers] };
  const codes = [
    ...new Set(
      relevant.flatMap((assessment) =>
        assessment.blockers.map((blocker) => blocker.code),
      ),
    ),
  ].sort();
  return { value: codes.length === 0, codes };
}

export function auditProductionReadiness(input: {
  mode: ReadinessAuditMode;
  routes: readonly CurriculumRouteDefinition[];
  microSkills: readonly ProductionMicroSkillAuditInput[];
}): ProductionReadinessAudit {
  const routeErrors = validateCurriculumRouteRegistry(input.routes);
  const activityErrors = validateActivityRequirementRegistry();
  if (routeErrors.length || activityErrors.length) {
    throw new Error(
      `invalid registries: ${[...routeErrors, ...activityErrors].join(",")}`,
    );
  }
  const knownCodes = new Set<string>(COMPATIBILITY_BLOCKER_CODES);
  const audits = [...input.microSkills]
    .sort((left, right) => left.microSkillKey.localeCompare(right.microSkillKey))
    .map((entry): ProductionMicroSkillAudit => {
      const supported = wordOutcome(
        entry.wordAssessments,
        () => true,
        ["canonical_identity_missing"],
      );
      const authentic = wordOutcome(
        entry.wordAssessments,
        (assessment) =>
          assessment.outcomes.authenticTarget === "compatible",
        ["insufficient_authentic_targets"],
      );
      const transfer = wordOutcome(
        entry.wordAssessments,
        (assessment) => assessment.outcomes.transfer === "compatible",
        ["insufficient_transfer_words"],
      );
      const activityRegistryValid = entry.route.requiredActivities.every(
        (kind) =>
          ADLE_ACTIVITY_REQUIREMENT_REGISTRY.some(
            (definition) => definition.kind === kind,
          ),
      );
      const stageResults: ReadinessStageResult[] = [
        result(
          "taxonomy_and_route",
          entry.taxonomyActive &&
            entry.profileDeclared &&
            entry.profileProductionEnabled &&
            entry.route.implementationState === "registered",
          "route_or_profile_unavailable",
          [
            `route=${entry.route.routeId}:${entry.route.routeVersion}`,
            `taxonomyActive=${entry.taxonomyActive}`,
            `profileDeclared=${entry.profileDeclared}`,
            `profileProductionEnabled=${entry.profileProductionEnabled}`,
          ],
        ),
        {
          ...result(
            "canonical_word_facts",
            supported.value,
            "canonical_identity_missing",
            [`wordAssessmentCount=${entry.wordAssessments?.length ?? 0}`],
          ),
          blockers: supported.value === false ? supported.codes : [],
        },
        {
          ...result(
            "word_microskill_support",
            entry.wordAssessments === null
              ? null
              : !entry.wordAssessments.some((assessment) =>
                  assessment.blockers.some(
                    (blocker) =>
                      blocker.code === "word_microskill_support_missing",
                  ),
                ),
            "word_microskill_support_missing",
            [],
          ),
        },
        {
          ...result(
            "authentic_target_eligibility",
            entry.eligibleAuthenticWordCount === null
              ? null
              : authentic.value === true &&
                  entry.eligibleAuthenticWordCount >=
                    entry.route.wordCounts.authentic[0],
            "insufficient_authentic_targets",
            [
              `eligibleAuthenticWordCount=${entry.eligibleAuthenticWordCount ?? "not_assessed"}`,
            ],
          ),
          blockers:
            entry.eligibleAuthenticWordCount !== null &&
            (authentic.value !== true ||
              entry.eligibleAuthenticWordCount <
                entry.route.wordCounts.authentic[0])
              ? [
                  ...new Set([
                    "insufficient_authentic_targets" as const,
                    ...authentic.codes,
                  ]),
                ].sort()
              : [],
        },
        {
          ...result(
            "transfer_eligibility",
            entry.eligibleTransferWordCount === null
              ? null
              : transfer.value === true &&
                  entry.eligibleTransferWordCount >=
                    entry.route.wordCounts.transfer[0],
            "insufficient_transfer_words",
            [
              `eligibleTransferWordCount=${entry.eligibleTransferWordCount ?? "not_assessed"}`,
            ],
          ),
          blockers:
            entry.eligibleTransferWordCount !== null &&
            (transfer.value !== true ||
              entry.eligibleTransferWordCount <
                entry.route.wordCounts.transfer[0])
              ? [
                  ...new Set([
                    "insufficient_transfer_words" as const,
                    ...transfer.codes,
                  ]),
                ].sort()
              : [],
        },
        result(
          "activity_requirements",
          activityRegistryValid,
          "activity_requirement_unmet",
          entry.route.requiredActivities.map((kind) => `activity=${kind}`),
        ),
        result(
          "group_composition",
          entry.groupCompositionValid,
          "group_composition_failure",
          [],
        ),
        result(
          "assignment_construction",
          entry.assignmentConstructionValid,
          "recipe_count_failure",
          entry.route.intentionalItemCounts.map((count) => `itemCount=${count}`),
        ),
        result(
          "persisted_payload_validation",
          entry.persistedPayloadValid,
          "persisted_payload_invalid",
          entry.route.payloadVersions.map((version) => `payloadVersion=${version}`),
        ),
        result(
          "runtime_reconstruction",
          entry.runtimeReconstructionValid,
          "runtime_reconstruction_failure",
          [],
        ),
        result(
          "activity_binding_resolution",
          entry.activityBindingsValid,
          "activity_binding_unresolved",
          [],
        ),
      ];
      for (const blocker of stageResults.flatMap((stage) => stage.blockers)) {
        if (!knownCodes.has(blocker)) {
          throw new Error(`unknown blocker code: ${blocker}`);
        }
      }
      const status = stageResults.some((stage) => stage.status === "blocked")
        ? "blocked"
        : stageResults.some((stage) => stage.status === "not_assessed")
          ? "not_assessed"
          : "ready";
      return {
        microSkillKey: entry.microSkillKey,
        routeId: entry.route.routeId,
        routeVersion: entry.route.routeVersion,
        status,
        stages: stageResults,
        wordAssessments: [...(entry.wordAssessments ?? [])].sort((left, right) =>
          (left.canonicalWordId ?? "").localeCompare(
            right.canonicalWordId ?? "",
          ),
        ),
        dependencyFingerprint: entry.dependencyFingerprint,
      };
    });
  const canonicalInput = JSON.stringify(
    audits.map((audit) => ({
      microSkillKey: audit.microSkillKey,
      routeId: audit.routeId,
      routeVersion: audit.routeVersion,
      dependencyFingerprint: audit.dependencyFingerprint,
      stages: audit.stages,
    })),
  );
  return {
    auditVersion: ADLE_READINESS_AUDIT_VERSION,
    mode: input.mode,
    inputFingerprint: createHash("sha256").update(canonicalInput).digest("hex"),
    summary: {
      productionMicroSkillCount: audits.length,
      structurallyDeclaredCount: audits.filter(
        (audit) =>
          audit.stages.find((stage) => stage.stage === "taxonomy_and_route")
            ?.status === "ready",
      ).length,
      readyCount: audits.filter((audit) => audit.status === "ready").length,
      blockedCount: audits.filter((audit) => audit.status === "blocked").length,
      notAssessedCount: audits.filter(
        (audit) => audit.status === "not_assessed",
      ).length,
    },
    microSkills: audits,
    knownReportOnlyFindings: [
      {
        routeId: "closed_compound_word_lab",
        code: "transfer_not_approved",
        description:
          "Current production compilation couples authentic targets to transfer eligibility.",
      },
      {
        routeId: "closed_compound_word_lab",
        code: "answer_comparator_mismatch",
        description:
          "Current child and server separator comparison policies are not identical.",
      },
    ],
    containsLearnerIdentity: false,
    containsRawAttempts: false,
    mutationPerformed: false,
  };
}

export function readinessAuditMarkdown(audit: ProductionReadinessAudit): string {
  const lines = [
    "# ADLE Production Readiness",
    "",
    `Mode: \`${audit.mode}\``,
    "",
    `Input fingerprint: \`${audit.inputFingerprint}\``,
    "",
    `Production morphology micro-skills: ${audit.summary.productionMicroSkillCount}`,
    `Structurally declared: ${audit.summary.structurallyDeclaredCount}`,
    `Ready: ${audit.summary.readyCount}`,
    `Blocked: ${audit.summary.blockedCount}`,
    `Not assessed: ${audit.summary.notAssessedCount}`,
    "",
    "| Micro-skill | Route | Status | Blockers |",
    "|---|---|---|---|",
    ...audit.microSkills.map((entry) => {
      const blockers = [
        ...new Set(entry.stages.flatMap((stage) => stage.blockers)),
      ].join(", ");
      return `| ${entry.microSkillKey} | ${entry.routeId}:${entry.routeVersion} | ${entry.status} | ${blockers || "none"} |`;
    }),
    "",
    "## Report-only known findings",
    "",
    ...audit.knownReportOnlyFindings.map(
      (finding) =>
        `- \`${finding.code}\` (${finding.routeId}): ${finding.description}`,
    ),
    "",
  ];
  return lines.join("\n");
}

export const READINESS_AUDIT_STAGES = stages;
