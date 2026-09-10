import { fingerprint } from "../baseline/source";
import {
  CONTEXT_V4_STRUCTURE_SOURCE, analyseFamilyContextsV4, manifestFingerprintV4,
  type ContextInputV4,
} from "./context-family-v4";
import { CONTEXT_V4_SOURCE_PINS } from "./context-source-pins-v4";

export const TO_V4_MANIFEST = Object.freeze({
  releaseId: "81000000-0000-4000-8000-000000000014",
  releaseKey: "s8-v4-to-too-two",
  familyKey: "TO_TOO_TWO" as const,
  analyserVersion: "WHOLE_WRITING_CONTEXT_TO_SPACY_STRUCTURAL_V4",
  registryVersion: "WHOLE_WRITING_CONTEXT_TO_REGISTRY_V4",
  corpusVersion: "WHOLE_WRITING_CONTEXT_V4_DEVELOPMENT_REGRESSION_EXPOSED_ONLY",
  members: ["to", "too", "two"],
  supportedConstructions: ["preposition", "infinitive", "additive", "degree", "numeral"],
  supportedSubtypes: ["destination_or_recipient_preposition", "governed_infinitive", "clause_additive", "adjective_or_manner_degree", "ordinary_count_numeral"],
  exclusions: ["fragment", "quotation", "gerund", "run_on", "task_dependent", "genuine_semantic_ambiguity", "unsupported_construction", "parser_alignment", "resource_limit"],
  adapterSchemaVersion: CONTEXT_V4_STRUCTURE_SOURCE.schema,
  adapterVersion: CONTEXT_V4_STRUCTURE_SOURCE.adapter,
  runtimeIdentity: CONTEXT_V4_STRUCTURE_SOURCE.runtime,
  resourceLimits: CONTEXT_V4_STRUCTURE_SOURCE.limits,
  deploymentState: "DEVELOPMENT_CANDIDATE_DEFAULT_OFF" as const,
  sourceFingerprints: { ...CONTEXT_V4_SOURCE_PINS.shared, ...CONTEXT_V4_SOURCE_PINS.TO_TOO_TWO },
});
export const TO_V4_MANIFEST_FINGERPRINT = manifestFingerprintV4(TO_V4_MANIFEST);
export const TO_V4_SOURCE_FINGERPRINT = fingerprint(CONTEXT_V4_STRUCTURE_SOURCE);

export function analyseToContextsV4Detailed(inputs: readonly ContextInputV4[]) {
  return analyseFamilyContextsV4(TO_V4_MANIFEST, inputs);
}
export function analyseToContextV4Detailed(input: ContextInputV4) {
  return analyseToContextsV4Detailed([input])[0];
}
export function analyseToContextV4(input: ContextInputV4) {
  return analyseToContextV4Detailed(input).decision;
}
