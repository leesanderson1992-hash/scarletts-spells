import { fingerprint } from "../baseline/source";
import {
  CONTEXT_V4_STRUCTURE_SOURCE, analyseFamilyContextsV4, manifestFingerprintV4,
  type ContextInputV4,
} from "./context-family-v4";
import { CONTEXT_V4_SOURCE_PINS } from "./context-source-pins-v4";

export const THERE_V4_MANIFEST = Object.freeze({
  releaseId: "81000000-0000-4000-8000-000000000013",
  releaseKey: "s8-v4-there-their-theyre",
  familyKey: "THERE_THEIR_THEYRE" as const,
  analyserVersion: "WHOLE_WRITING_CONTEXT_THERE_SPACY_STRUCTURAL_V4",
  registryVersion: "WHOLE_WRITING_CONTEXT_THERE_REGISTRY_V4",
  corpusVersion: "WHOLE_WRITING_CONTEXT_V4_DEVELOPMENT_REGRESSION_EXPOSED_ONLY",
  members: ["there", "their", "they're"],
  supportedConstructions: ["existential", "locative", "possessive", "they_are_contraction"],
  supportedSubtypes: ["embedded_existential", "adverbial_locative", "possessive_subject_or_object", "progressive_contraction", "adjectival_contraction", "passive_contraction"],
  exclusions: ["fragment", "quotation", "gerund", "run_on", "task_dependent", "genuine_semantic_ambiguity", "unsupported_construction", "parser_alignment", "resource_limit"],
  adapterSchemaVersion: CONTEXT_V4_STRUCTURE_SOURCE.schema,
  adapterVersion: CONTEXT_V4_STRUCTURE_SOURCE.adapter,
  runtimeIdentity: CONTEXT_V4_STRUCTURE_SOURCE.runtime,
  resourceLimits: CONTEXT_V4_STRUCTURE_SOURCE.limits,
  deploymentState: "DEVELOPMENT_CANDIDATE_DEFAULT_OFF" as const,
  sourceFingerprints: { ...CONTEXT_V4_SOURCE_PINS.shared, ...CONTEXT_V4_SOURCE_PINS.THERE_THEIR_THEYRE },
});
export const THERE_V4_MANIFEST_FINGERPRINT = manifestFingerprintV4(THERE_V4_MANIFEST);
export const THERE_V4_SOURCE_FINGERPRINT = fingerprint(CONTEXT_V4_STRUCTURE_SOURCE);

export function analyseThereContextsV4Detailed(inputs: readonly ContextInputV4[]) {
  return analyseFamilyContextsV4(THERE_V4_MANIFEST, inputs);
}
export function analyseThereContextV4Detailed(input: ContextInputV4) {
  return analyseThereContextsV4Detailed([input])[0];
}
export function analyseThereContextV4(input: ContextInputV4) {
  return analyseThereContextV4Detailed(input).decision;
}
