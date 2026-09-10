import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import type { ContextFamilyKey } from "./context";

export const CONTEXT_V4_STRUCTURE_SCHEMA = "ADLE_S8_STRUCTURAL_FEATURES_V1" as const;
export const CONTEXT_V4_ADAPTER_VERSION = "ADLE_S8_SPACY_ADAPTER_V1" as const;
export const CONTEXT_V4_RUNTIME_IDENTITY = Object.freeze({
  pythonVersion: "3.12.14", spacyVersion: "3.8.16", modelName: "en_core_web_sm",
  modelVersion: "3.8.0", modelTreeSha256: "a07424822a13ad5bd9cb7a021e219c77279a907c58171c52846448b832107ed4",
  cpuOnly: true,
});
export const CONTEXT_V4_RESOURCE_LIMITS = Object.freeze({
  maxBatch: 2_000, maxSourceUtf16: 16_384, maxTokens: 512,
  timeoutMs: 120_000, maxBufferBytes: 128 * 1024 * 1024, restartRetries: 0,
});

export type AdleDependencyV4 =
  | "ROOT" | "EXPLETIVE" | "ADVERBIAL_MODIFIER" | "POSSESSIVE_MODIFIER"
  | "SUBJECT" | "PASSIVE_SUBJECT" | "AUXILIARY" | "PASSIVE_AUXILIARY"
  | "COPULA" | "PREPOSITIONAL_MODIFIER" | "PREPOSITIONAL_COMPLEMENT"
  | "PREPOSITIONAL_OBJECT" | "RECIPIENT" | "NUMERIC_MODIFIER" | "MARKER"
  | "OBJECT" | "INDIRECT_OBJECT"
  | "ADJECTIVAL_MODIFIER" | "ATTRIBUTE" | "ADJECTIVAL_COMPLEMENT"
  | "OBJECT_PREDICATE" | "OPEN_CLAUSAL_COMPLEMENT" | "CLAUSAL_COMPLEMENT"
  | "COORDINATE" | "PARATAXIS" | `OTHER:${string}`;

export type StructuralTokenV4 = Readonly<{
  index: number; surface: string; normalized: string; startUtf16: number; endUtf16: number;
  lemma: string; coarsePos: string; fineTag: string; morphology: readonly string[];
  headIndex: number; headStartUtf16: number; headEndUtf16: number;
  dependency: AdleDependencyV4; sourceDependency: string;
}>;
type BoundedRelationV4 = Readonly<Pick<StructuralTokenV4,
  "index" | "surface" | "lemma" | "coarsePos" | "fineTag" | "startUtf16" | "endUtf16" | "dependency" | "sourceDependency">>;

export type StructuralVariantV4 = Readonly<{
  status: "ready"; variantTextUtf16Length: number; focusStartUtf16: number; focusEndUtf16: number;
  focusTokenIndices: readonly number[]; sentenceStartUtf16: number; sentenceEndUtf16: number;
  tokens: readonly StructuralTokenV4[]; ancestors: readonly BoundedRelationV4[]; children: readonly BoundedRelationV4[];
  facts: Readonly<{
    nominalHead: BoundedRelationV4 | null; subjectRelations: readonly BoundedRelationV4[];
    possessiveRelations: readonly BoundedRelationV4[]; auxiliaryRelations: readonly BoundedRelationV4[];
    copularRelations: readonly BoundedRelationV4[]; passiveRelations: readonly BoundedRelationV4[];
    verbalForms: readonly BoundedRelationV4[]; numeralRelations: readonly BoundedRelationV4[];
    modifierRelations: readonly BoundedRelationV4[]; prepositionMarkerRelations: readonly BoundedRelationV4[];
  }>;
}> | Readonly<{ status: "blocked"; reason: string }>;

export type StructuralRequestV4 = Readonly<{
  requestId: string;
  family: Extract<ContextFamilyKey, "THERE_THEIR_THEYRE" | "TO_TOO_TWO">;
  sourceText: string; startUtf16: number; endUtf16: number; familyMembers: readonly string[];
}>;
export type StructuralResultV4 = Readonly<{
  requestId: string; status: "ready"; variants: Readonly<Record<string, StructuralVariantV4>>;
}> | Readonly<{ requestId: string; status: "blocked"; reason: string; variants: Readonly<Record<string, never>> }>;

function validIdentity(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return row.adapterSchemaVersion === CONTEXT_V4_STRUCTURE_SCHEMA && row.adapterVersion === CONTEXT_V4_ADAPTER_VERSION &&
    Object.entries(CONTEXT_V4_RUNTIME_IDENTITY).every(([key, expected]) => row[key] === expected);
}
function blocked(request: StructuralRequestV4, reason: string): StructuralResultV4 {
  return { requestId: request.requestId, status: "blocked", reason, variants: {} };
}
function validVariant(value: unknown, start: number, end: number): value is StructuralVariantV4 {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (row.status === "blocked") return typeof row.reason === "string";
  if (row.status !== "ready" || row.focusStartUtf16 !== start || row.focusEndUtf16 !== end ||
      !Array.isArray(row.focusTokenIndices) || !Array.isArray(row.tokens) || !Array.isArray(row.ancestors) ||
      !Array.isArray(row.children) || !row.facts || typeof row.facts !== "object") return false;
  return (row.tokens as unknown[]).every((token) => {
    if (!token || typeof token !== "object") return false;
    const item = token as Record<string, unknown>;
    return Number.isInteger(item.index) && typeof item.surface === "string" && typeof item.normalized === "string" &&
      Number.isInteger(item.startUtf16) && Number.isInteger(item.endUtf16) && typeof item.lemma === "string" &&
      typeof item.coarsePos === "string" && typeof item.fineTag === "string" && Array.isArray(item.morphology) &&
      Number.isInteger(item.headIndex) && typeof item.dependency === "string" && typeof item.sourceDependency === "string";
  });
}

/** Development candidate only. Persisted release dispatch never imports V4. */
export function parseStructuralFeaturesV4(requests: readonly StructuralRequestV4[]): StructuralResultV4[] {
  if (requests.length > CONTEXT_V4_RESOURCE_LIMITS.maxBatch) return requests.map((request) => blocked(request, "RESOURCE_LIMIT"));
  const malformed = requests.some((request) =>
    !request.requestId || request.sourceText.length > CONTEXT_V4_RESOURCE_LIMITS.maxSourceUtf16 ||
    !Number.isInteger(request.startUtf16) || !Number.isInteger(request.endUtf16) || request.startUtf16 < 0 ||
    request.endUtf16 <= request.startUtf16 || request.endUtf16 > request.sourceText.length ||
    !request.familyMembers.includes(request.sourceText.slice(request.startUtf16, request.endUtf16).normalize("NFC").toLowerCase().replace(/[’ʼ]/g, "'")),
  );
  if (malformed) return requests.map((request) => blocked(request, "SOURCE_SPAN_OR_REQUEST_INVALID"));
  const python = process.env.S8_V4_PYTHON;
  if (!python) return requests.map((request) => blocked(request, "STRUCTURAL_ADAPTER_UNAVAILABLE"));
  const child = spawnSync(python, [resolve(process.cwd(), "python/s8-v4-spacy/adapter.py")], {
    input: JSON.stringify({ schemaVersion: CONTEXT_V4_STRUCTURE_SCHEMA, requests }), encoding: "utf8",
    timeout: CONTEXT_V4_RESOURCE_LIMITS.timeoutMs, maxBuffer: CONTEXT_V4_RESOURCE_LIMITS.maxBufferBytes,
    env: { ...process.env, PYTHONHASHSEED: "0", CUDA_VISIBLE_DEVICES: "" },
  });
  if (child.error || child.status !== 0) {
    const timedOut = child.error && "code" in child.error && child.error.code === "ETIMEDOUT";
    return requests.map((request) => blocked(request, timedOut ? "STRUCTURAL_ADAPTER_TIMEOUT" : "STRUCTURAL_ADAPTER_FAILURE"));
  }
  try {
    const response = JSON.parse(child.stdout) as { schemaVersion?: unknown; identity?: unknown; results?: unknown };
    if (response.schemaVersion !== CONTEXT_V4_STRUCTURE_SCHEMA || !validIdentity(response.identity) || !Array.isArray(response.results) || response.results.length !== requests.length) {
      return requests.map((request) => blocked(request, "STRUCTURAL_ADAPTER_IDENTITY_OR_SCHEMA_MISMATCH"));
    }
    const results = response.results as unknown[];
    return requests.map((request, index) => {
      const result = results[index] as StructuralResultV4;
      if (!result || result.requestId !== request.requestId || !["ready", "blocked"].includes(result.status) || !result.variants || typeof result.variants !== "object") {
        return blocked(request, "MALFORMED_STRUCTURAL_RESPONSE");
      }
      if (result.status === "ready" && request.familyMembers.some((member) => !(member in result.variants))) {
        return blocked(request, "INCOMPLETE_COUNTERFACTUAL_RESPONSE");
      }
      if (result.status === "ready" && request.familyMembers.some((member) => !validVariant(result.variants[member], request.startUtf16, request.startUtf16 + member.length))) {
        return blocked(request, "MALFORMED_OR_MISALIGNED_COUNTERFACTUAL_RESPONSE");
      }
      return result;
    });
  } catch {
    return requests.map((request) => blocked(request, "MALFORMED_STRUCTURAL_RESPONSE"));
  }
}
