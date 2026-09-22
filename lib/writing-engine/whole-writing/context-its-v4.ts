import { fingerprint } from "../baseline/source";
import {
  CONTEXT_V4_STRUCTURE_SOURCE, analyseFamilyContextsV4, manifestFingerprintV4,
  type ContextInputV4,
} from "./context-family-v4";
import { CONTEXT_V4_SOURCE_PINS } from "./context-source-pins-v4";

/** Development-only structural candidate. Persisted dispatch never imports V4. */
export const ITS_V4_MANIFEST = Object.freeze({
  releaseId: "81000000-0000-4000-8000-000000000016",
  releaseKey: "s8-v4-its-its",
  familyKey: "ITS_ITS" as const,
  analyserVersion: "WHOLE_WRITING_CONTEXT_ITS_SPACY_STRUCTURAL_V4",
  registryVersion: "WHOLE_WRITING_CONTEXT_ITS_REGISTRY_V4",
  corpusVersion: "WHOLE_WRITING_CONTEXT_V4_DEVELOPMENT_REGRESSION_G2_ONLY",
  members: ["its", "it's"],
  supportedConstructions: ["possessive", "it_is_contraction", "it_has_contraction"],
  supportedSubtypes: ["possessive_subject_or_object", "progressive_contraction", "adjectival_contraction", "passive_contraction", "perfect_contraction"],
  exclusions: ["fragment", "quotation", "gerund", "run_on", "task_dependent", "genuine_semantic_ambiguity", "unsupported_construction", "parser_alignment", "resource_limit"],
  adapterSchemaVersion: CONTEXT_V4_STRUCTURE_SOURCE.schema,
  adapterVersion: CONTEXT_V4_STRUCTURE_SOURCE.adapter,
  runtimeIdentity: CONTEXT_V4_STRUCTURE_SOURCE.runtime,
  fallbackPolicyVersion: CONTEXT_V4_STRUCTURE_SOURCE.fallback.policyVersion,
  fallbackRuntimeIdentity: null,
  fallbackResourceLimits: null,
  fallbackEligibleReasons: [],
  resourceLimits: CONTEXT_V4_STRUCTURE_SOURCE.limits,
  deploymentState: "DEVELOPMENT_CANDIDATE_DEFAULT_OFF" as const,
  sourceFingerprints: { ...CONTEXT_V4_SOURCE_PINS.shared, ...CONTEXT_V4_SOURCE_PINS.ITS_ITS },
});
export const ITS_V4_MANIFEST_FINGERPRINT = manifestFingerprintV4(ITS_V4_MANIFEST);
export const ITS_V4_SOURCE_FINGERPRINT = fingerprint(CONTEXT_V4_STRUCTURE_SOURCE);

export function analyseItsContextsV4Detailed(inputs: readonly ContextInputV4[]) {
  return analyseFamilyContextsV4(ITS_V4_MANIFEST, inputs);
}
export function analyseItsContextV4Detailed(input: ContextInputV4) {
  return analyseItsContextsV4Detailed([input])[0];
}
export function analyseItsContextV4(input: ContextInputV4) {
  return analyseItsContextV4Detailed(input).decision;
}
