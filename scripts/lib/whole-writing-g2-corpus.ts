import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  analyseDeterministicContext,
  CONTEXT_FAMILY_MANIFESTS,
  WHOLE_WRITING_CONTEXT_ANALYSER_VERSION,
  WHOLE_WRITING_CONTEXT_CORPUS_VERSION,
  WHOLE_WRITING_CONTEXT_REGISTRY_VERSION,
  type ContextFamilyKey,
  type ContextResultStatus,
} from "../../lib/writing-engine/whole-writing/context";

export const G2_POLICY_VERSION = "WHOLE_WRITING_REMEDIATION_POLICY_V2_2026_09_09" as const;
export const G2_PACKAGE_VERSION = "G2_CONTEXT_FAMILY_CORPUS_PACKAGE_V1_2026_09_08" as const;

export const G2_LIMITS = Object.freeze({
  minimumTotal: 400,
  minimumValid: 150,
  minimumInvalid: 150,
  minimumUncertain: 100,
  minimumPrecision: 0.98,
  minimumWilsonLower95: 0.95,
  minimumSupportedRecall: 0.8,
  maximumProtectedFailures: 0,
});

export const FAMILY_RELEASES: Readonly<Record<ContextFamilyKey, {
  releaseId: string;
  releaseKey: string;
}>> = Object.freeze({
  THERE_THEIR_THEYRE: {
    releaseId: "81000000-0000-4000-8000-000000000001",
    releaseKey: "s8-v1-there-their-theyre",
  },
  TO_TOO_TWO: {
    releaseId: "81000000-0000-4000-8000-000000000002",
    releaseKey: "s8-v1-to-too-two",
  },
  YOUR_YOURE: {
    releaseId: "81000000-0000-4000-8000-000000000003",
    releaseKey: "s8-v1-your-youre",
  },
  ITS_ITS: {
    releaseId: "81000000-0000-4000-8000-000000000004",
    releaseKey: "s8-v1-its-its",
  },
});

export const PROTECTED_TAGS = ["fragment", "quotation", "gerund", "run_on", "task_dependent"] as const;
export type ProtectedTag = typeof PROTECTED_TAGS[number];
export type GoldClassification = "VALID" | "INVALID" | "UNCERTAIN";
export type SupportedConstructionStatus = "SUPPORTED" | "UNSUPPORTED" | "UNCERTAIN";

export type CandidateCase = Readonly<{
  schemaVersion: 1;
  caseId: string;
  family: ContextFamilyKey;
  sourceText: string;
  focusSurface: string;
  startUtf16: number;
  endUtf16: number;
  observedMember: string;
  declaredConstruction: string;
  protectedSetTags: ProtectedTag[];
  dialect: "en-GB";
  languageAssumptions: string[];
  candidateGeneration: {
    method: "deterministic_authored_template";
    generatorVersion: typeof G2_PACKAGE_VERSION;
    templateId: string;
    slotFingerprint: string;
    authoringAuthority: "CORPUS_AUTHOR_PROPOSAL_NOT_GOLD";
  };
  provenance: {
    sourceType: "AUTHORED_EXAMPLE";
    sourceReference: string;
    licence: "PROJECT_AUTHORED";
  };
  evaluationSplit: "release";
  releaseId: string;
  familyManifestFingerprint: string;
  analyserVersion: typeof WHOLE_WRITING_CONTEXT_ANALYSER_VERSION;
  registryVersion: typeof WHOLE_WRITING_CONTEXT_REGISTRY_VERSION;
  corpusVersion: typeof WHOLE_WRITING_CONTEXT_CORPUS_VERSION;
  packageVersion: typeof G2_PACKAGE_VERSION;
  candidateFingerprint: string;
}>;

export type AuthorProposal = Readonly<{
  schemaVersion: 1;
  caseId: string;
  family: ContextFamilyKey;
  proposedClassification: GoldClassification;
  proposedIntendedMember: string | null;
  proposedExpectedAlternative: string | null;
  proposedSupportedConstructionStatus: SupportedConstructionStatus;
  proposedAmbiguityOrExclusionReason: string | null;
  coverageRationale: string;
  candidateFingerprint: string;
  proposalFingerprint: string;
  authority: "CORPUS_AUTHOR_PROPOSAL_NOT_GOLD";
}>;

export type IndependentLabel = Readonly<{
  schemaVersion: 1;
  labelId: string;
  packetId: string;
  caseId: string;
  family: ContextFamilyKey;
  labelerId: string;
  classification: GoldClassification;
  intendedAlternative: string | null;
  supportedConstructionStatus: SupportedConstructionStatus;
  ambiguityOrExclusionReason: string | null;
  confidence: 1 | 2 | 3 | 4 | 5;
  rationale: string;
  labelledAt: string;
  releaseId: string;
  familyManifestFingerprint: string;
  corpusVersion: typeof WHOLE_WRITING_CONTEXT_CORPUS_VERSION;
  candidateFingerprint: string;
  labelFingerprint: string;
}>;

export type SecondaryReview = Readonly<{
  schemaVersion: 1;
  reviewId: string;
  caseId: string;
  family: ContextFamilyKey;
  reviewerId: string;
  reviewerKind: "AI_NON_GOLD_REVIEW";
  reviewedAt: string;
  primaryLabelFingerprint: string;
  disposition: "AGREE" | "DISAGREE";
  classification: GoldClassification;
  intendedAlternative: string | null;
  supportedConstructionStatus: SupportedConstructionStatus;
  rationale: string;
  releaseId: string;
  familyManifestFingerprint: string;
  corpusVersion: typeof WHOLE_WRITING_CONTEXT_CORPUS_VERSION;
  candidateFingerprint: string;
  reviewFingerprint: string;
}>;

export type Adjudication = Readonly<{
  schemaVersion: 1;
  adjudicationId: string;
  caseId: string;
  family: ContextFamilyKey;
  adjudicatorId: string;
  adjudicatedAt: string;
  sourceLabelFingerprint: string;
  sourceReviewFingerprint: string;
  classification: GoldClassification;
  intendedAlternative: string | null;
  supportedConstructionStatus: SupportedConstructionStatus;
  ambiguityOrExclusionReason: string | null;
  rationale: string;
  releaseId: string;
  familyManifestFingerprint: string;
  corpusVersion: typeof WHOLE_WRITING_CONTEXT_CORPUS_VERSION;
  candidateFingerprint: string;
  adjudicationFingerprint: string;
}>;

export type FinalGold = Readonly<{
  schemaVersion: 1;
  caseId: string;
  family: ContextFamilyKey;
  classification: GoldClassification;
  intendedMember: string | null;
  expectedAlternative: string | null;
  supportedConstructionStatus: SupportedConstructionStatus;
  ambiguityOrExclusionReason: string | null;
  provenance: "PRIMARY_HUMAN_LABEL_REVIEWED" | "ADJUDICATION";
  sourceLabelFingerprints: [string];
  reviewFingerprint: string;
  adjudicationFingerprint: string | null;
  releaseId: string;
  familyManifestFingerprint: string;
  corpusVersion: typeof WHOLE_WRITING_CONTEXT_CORPUS_VERSION;
  candidateFingerprint: string;
  goldFingerprint: string;
}>;

export type ValidationIssue = Readonly<{
  code: string;
  message: string;
  caseId?: string;
}>;

export type EvaluationFailure = Readonly<{
  caseId: string | null;
  reason: string;
  expected?: unknown;
  actual?: unknown;
}>;

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalise(item)]));
  }
  return value;
}

export function recordFingerprint(value: unknown, omittedKey?: string): string {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => key !== omittedKey))
    : value;
  return sha256(JSON.stringify(canonicalise(record)));
}

export function readJsonLines<T>(path: string): T[] {
  const raw = readFileSync(path, "utf8");
  return raw.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
    try {
      return JSON.parse(line) as T;
    } catch (error) {
      throw new Error(`${path}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

export function manifestFor(family: ContextFamilyKey) {
  const manifest = CONTEXT_FAMILY_MANIFESTS.find((item) => item.familyKey === family);
  if (!manifest) throw new Error(`Missing runtime manifest for ${family}`);
  return manifest;
}

export function validateCandidate(candidate: CandidateCase): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const manifest = manifestFor(candidate.family);
  const fail = (code: string, message: string) => issues.push({ code, message, caseId: candidate.caseId });
  if (candidate.schemaVersion !== 1) fail("CANDIDATE_SCHEMA_VERSION", "schemaVersion must be 1");
  if (candidate.corpusVersion !== WHOLE_WRITING_CONTEXT_CORPUS_VERSION) fail("CORPUS_VERSION_MISMATCH", "candidate corpus version differs from S8");
  if (candidate.releaseId !== FAMILY_RELEASES[candidate.family].releaseId || candidate.familyManifestFingerprint !== manifest.fingerprint) fail("FAMILY_RELEASE_FINGERPRINT_MISMATCH", "candidate family release identity differs from S8");
  if (candidate.analyserVersion !== WHOLE_WRITING_CONTEXT_ANALYSER_VERSION || candidate.registryVersion !== WHOLE_WRITING_CONTEXT_REGISTRY_VERSION) fail("ANALYSER_OR_REGISTRY_VERSION_MISMATCH", "candidate analyser or registry version differs from S8");
  if (candidate.packageVersion !== G2_PACKAGE_VERSION) fail("PACKAGE_VERSION_MISMATCH", "candidate package version differs");
  if (!manifest.members.includes(candidate.observedMember)) fail("OBSERVED_MEMBER_OUTSIDE_FAMILY", "observed member is not enumerated");
  if (!Number.isInteger(candidate.startUtf16) || !Number.isInteger(candidate.endUtf16) || candidate.endUtf16 <= candidate.startUtf16) {
    fail("INVALID_UTF16_SPAN", "focus span must be positive, integral and end-exclusive");
  } else if (candidate.sourceText.slice(candidate.startUtf16, candidate.endUtf16) !== candidate.focusSurface) {
    fail("FOCUS_SURFACE_MISMATCH", "UTF-16 span does not reproduce focus surface");
  }
  if (candidate.observedMember !== candidate.focusSurface.normalize("NFC").toLowerCase().replace(/[’ʼ]/g, "'")) {
    fail("OBSERVED_NORMALISATION_MISMATCH", "observed member does not match normalised focus surface");
  }
  if (!manifest.supportedConstructions.includes(candidate.declaredConstruction) && !manifest.exclusions.includes(candidate.declaredConstruction) && candidate.declaredConstruction !== "unsupported_or_ambiguous") {
    fail("UNKNOWN_DECLARED_CONSTRUCTION", "declared construction is neither supported nor an S8 exclusion");
  }
  if (recordFingerprint(candidate, "candidateFingerprint") !== candidate.candidateFingerprint) {
    fail("CANDIDATE_FINGERPRINT_MISMATCH", "candidate fingerprint is stale or invalid");
  }
  return issues;
}

function substantiveLabelKey(label: Pick<IndependentLabel, "classification" | "intendedAlternative" | "supportedConstructionStatus">): string {
  return JSON.stringify(canonicalise({
    classification: label.classification,
    intendedAlternative: label.intendedAlternative,
    supportedConstructionStatus: label.supportedConstructionStatus,
  }));
}

export function labelsDisagree(left: IndependentLabel, right: IndependentLabel): boolean {
  return substantiveLabelKey(left) !== substantiveLabelKey(right);
}

export function validatePrimaryLabels(
  candidates: CandidateCase[],
  labels: IndependentLabel[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const candidatesById = new Map(candidates.map((item) => [item.caseId, item]));
  const byCase = new Map<string, IndependentLabel[]>();
  const seenLabelIds = new Map<string, string>();
  const seenIdentity = new Map<string, string>();
  const labelersByPacket = new Map<string, Set<string>>();
  for (const label of labels) {
    const candidate = candidatesById.get(label.caseId);
    const issue = (code: string, message: string) => issues.push({ code, message, caseId: label.caseId });
    if (!candidate) issue("LABEL_UNKNOWN_CASE", "label references an unknown case");
    else if (candidate.family !== label.family || candidate.candidateFingerprint !== label.candidateFingerprint) issue("LABEL_CANDIDATE_MISMATCH", "label family or candidate fingerprint does not match");
    else if (candidate.releaseId !== label.releaseId || candidate.familyManifestFingerprint !== label.familyManifestFingerprint) issue("LABEL_FAMILY_RELEASE_MISMATCH", "label family release identity or fingerprint does not match");
    if (label.corpusVersion !== WHOLE_WRITING_CONTEXT_CORPUS_VERSION) issue("LABEL_CORPUS_VERSION_MISMATCH", "label corpus version differs from S8");
    if (!label.labelerId.trim()) issue("LABELER_ID_MISSING", "labeler identity is required");
    if (!label.rationale.trim()) issue("LABEL_RATIONALE_MISSING", "brief rationale is required");
    if (![1, 2, 3, 4, 5].includes(label.confidence)) issue("LABEL_CONFIDENCE_INVALID", "confidence must be 1 through 5");
    if (label.classification === "INVALID" && !label.intendedAlternative) issue("INVALID_ALTERNATIVE_MISSING", "INVALID requires one intended alternative");
    if (label.classification !== "INVALID" && label.intendedAlternative) issue("NONINVALID_ALTERNATIVE_PRESENT", "only INVALID may carry an intended alternative");
    if (candidate && label.classification === "INVALID" && (!manifestFor(candidate.family).members.includes(label.intendedAlternative!) || label.intendedAlternative === candidate.observedMember)) issue("INVALID_ALTERNATIVE_NOT_UNIQUE_FAMILY_MEMBER", "INVALID alternative must be one different enumerated family member");
    if (label.classification === "INVALID" && label.supportedConstructionStatus !== "SUPPORTED") issue("INVALID_NOT_DECLARED_SUPPORTED", "INVALID labels must identify a supported construction");
    const calculated = recordFingerprint(label, "labelFingerprint");
    if (calculated !== label.labelFingerprint) issue("LABEL_FINGERPRINT_MISMATCH", "label fingerprint is stale or invalid");
    const priorId = seenLabelIds.get(label.labelId);
    if (priorId && priorId !== calculated) issue("POST_HOC_LABEL_MUTATION", "one labelId has multiple record fingerprints");
    seenLabelIds.set(label.labelId, calculated);
    const identityKey = `${label.caseId}\0${label.labelerId}`;
    const priorIdentity = seenIdentity.get(identityKey);
    if (priorIdentity) issue(priorIdentity === calculated ? "DUPLICATE_LABEL" : "POST_HOC_LABEL_MUTATION", "labeler/case identity appears more than once");
    seenIdentity.set(identityKey, calculated);
    byCase.set(label.caseId, [...(byCase.get(label.caseId) ?? []), label]);
    const packetLabelers = labelersByPacket.get(label.packetId) ?? new Set<string>();
    packetLabelers.add(label.labelerId);
    labelersByPacket.set(label.packetId, packetLabelers);
  }
  for (const candidate of candidates) {
    const caseLabels = byCase.get(candidate.caseId) ?? [];
    if (caseLabels.length !== 1) issues.push({ code: "PRIMARY_LABEL_COUNT", message: `expected exactly one primary human label, found ${caseLabels.length}`, caseId: candidate.caseId });
  }
  if (candidates.length) {
    const family = candidates[0].family;
    const expectedPackets = [`${G2_PACKAGE_VERSION}:${family}:LABEL_PACKET_A`, `${G2_PACKAGE_VERSION}:${family}:LABEL_PACKET_B`];
    const completedPackets = expectedPackets.filter((packetId) => labels.filter((label) => label.packetId === packetId).length === candidates.length);
    if (completedPackets.length !== 1) issues.push({ code: "PRIMARY_PACKET_COUNT", message: `expected exactly one complete governed packet, found ${completedPackets.length}` });
    for (const packetId of completedPackets) {
      const packetLabelers = labelersByPacket.get(packetId) ?? new Set<string>();
      if (packetLabelers.size !== 1) issues.push({ code: "PACKET_LABELER_IDENTITY", message: `${packetId} must be completed by exactly one human labeler identity` });
    }
    for (const label of labels) if (!expectedPackets.includes(label.packetId)) issues.push({ code: "UNEXPECTED_LABEL_PACKET", message: `label references ungoverned packet ${label.packetId}`, caseId: label.caseId });
  }
  return issues;
}

export function validateSecondaryReviews(
  candidates: CandidateCase[],
  labels: IndependentLabel[],
  reviews: SecondaryReview[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const candidatesById = new Map(candidates.map((item) => [item.caseId, item]));
  const labelsByCase = new Map(labels.map((item) => [item.caseId, item]));
  const reviewsByCase = new Map<string, SecondaryReview[]>();
  for (const review of reviews) {
    const candidate = candidatesById.get(review.caseId);
    const label = labelsByCase.get(review.caseId);
    const issue = (code: string, message: string) => issues.push({ code, message, caseId: review.caseId });
    if (!candidate || !label) issue("REVIEW_DEPENDENCY_MISSING", "review requires the exact candidate and primary human label");
    else {
      if (review.family !== candidate.family || review.candidateFingerprint !== candidate.candidateFingerprint) issue("REVIEW_CANDIDATE_MISMATCH", "review family or candidate fingerprint differs");
      if (review.primaryLabelFingerprint !== label.labelFingerprint) issue("REVIEW_LABEL_FINGERPRINT_MISMATCH", "review does not reference the exact primary label");
      if (review.releaseId !== candidate.releaseId || review.familyManifestFingerprint !== candidate.familyManifestFingerprint || review.corpusVersion !== candidate.corpusVersion) issue("REVIEW_RELEASE_MISMATCH", "review family release or corpus dependency differs");
      const differs = substantiveLabelKey(review) !== substantiveLabelKey(label);
      if ((review.disposition === "DISAGREE") !== differs) issue("REVIEW_DISPOSITION_MISMATCH", "review disposition must match the substantive decision comparison");
      if (review.classification === "INVALID" && (!review.intendedAlternative || !manifestFor(candidate.family).members.includes(review.intendedAlternative) || review.intendedAlternative === candidate.observedMember)) issue("REVIEW_INVALID_ALTERNATIVE", "reviewed INVALID requires one different enumerated family member");
      if (review.classification === "INVALID" && review.supportedConstructionStatus !== "SUPPORTED") issue("REVIEW_INVALID_NOT_SUPPORTED", "reviewed INVALID must identify a supported construction");
    }
    if (review.reviewerKind !== "AI_NON_GOLD_REVIEW" || !review.reviewerId.trim() || !review.reviewedAt.trim()) issue("REVIEW_ATTRIBUTION_MISSING", "non-gold reviewer identity, kind and timestamp are required");
    if (!review.rationale.trim()) issue("REVIEW_RATIONALE_MISSING", "review rationale is required");
    if (recordFingerprint(review, "reviewFingerprint") !== review.reviewFingerprint) issue("REVIEW_FINGERPRINT_MISMATCH", "review fingerprint is stale or invalid");
    reviewsByCase.set(review.caseId, [...(reviewsByCase.get(review.caseId) ?? []), review]);
  }
  for (const candidate of candidates) {
    const caseReviews = reviewsByCase.get(candidate.caseId) ?? [];
    if (caseReviews.length !== 1) issues.push({ code: "SECONDARY_REVIEW_COUNT", message: `expected exactly one non-gold review, found ${caseReviews.length}`, caseId: candidate.caseId });
  }
  return issues;
}

export function buildFinalGold(
  candidates: CandidateCase[],
  labels: IndependentLabel[],
  reviews: SecondaryReview[],
  adjudications: Adjudication[],
): { gold: FinalGold[]; issues: ValidationIssue[] } {
  const issues = [...validatePrimaryLabels(candidates, labels), ...validateSecondaryReviews(candidates, labels, reviews)];
  const labelsByCase = new Map(labels.map((item) => [item.caseId, item]));
  const reviewsByCase = new Map(reviews.map((item) => [item.caseId, item]));
  const adjudicationsByCase = new Map<string, Adjudication[]>();
  for (const adjudication of adjudications) {
    adjudicationsByCase.set(adjudication.caseId, [...(adjudicationsByCase.get(adjudication.caseId) ?? []), adjudication]);
  }
  const gold: FinalGold[] = [];
  for (const candidate of candidates) {
    const label = labelsByCase.get(candidate.caseId);
    const review = reviewsByCase.get(candidate.caseId);
    if (!label || !review) continue;
    const disagreements = review.disposition === "DISAGREE";
    const caseAdjudications = adjudicationsByCase.get(candidate.caseId) ?? [];
    if (disagreements && caseAdjudications.length !== 1) {
      issues.push({ code: "ADJUDICATION_REQUIRED", message: `disagreement requires exactly one adjudication, found ${caseAdjudications.length}`, caseId: candidate.caseId });
      continue;
    }
    if (!disagreements && caseAdjudications.length > 0) {
      issues.push({ code: "UNNECESSARY_ADJUDICATION", message: "adjudication is accepted only for a substantive disagreement", caseId: candidate.caseId });
      continue;
    }
    let final: Pick<IndependentLabel, "classification" | "intendedAlternative" | "supportedConstructionStatus" | "ambiguityOrExclusionReason">;
    let provenance: FinalGold["provenance"];
    let adjudicationFingerprint: string | null = null;
    if (disagreements) {
      const adjudication = caseAdjudications[0];
      const issue = (code: string, message: string) => issues.push({ code, message, caseId: candidate.caseId });
      if (!adjudication.adjudicatorId.trim() || !adjudication.adjudicatedAt.trim()) issue("ADJUDICATOR_IDENTITY_OR_TIME_MISSING", "adjudicator identity and timestamp are required");
      if (adjudication.adjudicatorId === label.labelerId) issue("ADJUDICATOR_NOT_INDEPENDENT", "adjudicator must differ from the primary human labeler");
      if (adjudication.family !== candidate.family || adjudication.candidateFingerprint !== candidate.candidateFingerprint || adjudication.corpusVersion !== candidate.corpusVersion || adjudication.releaseId !== candidate.releaseId || adjudication.familyManifestFingerprint !== candidate.familyManifestFingerprint) issue("ADJUDICATION_DEPENDENCY_MISMATCH", "adjudication family, release, corpus or candidate fingerprint differs");
      if (adjudication.sourceLabelFingerprint !== label.labelFingerprint || adjudication.sourceReviewFingerprint !== review.reviewFingerprint) issue("ADJUDICATION_SOURCE_FINGERPRINT_MISMATCH", "adjudication does not reference the exact primary label and non-gold review");
      if (recordFingerprint(adjudication, "adjudicationFingerprint") !== adjudication.adjudicationFingerprint) issue("ADJUDICATION_FINGERPRINT_MISMATCH", "adjudication fingerprint is stale or invalid");
      if (adjudication.classification === "INVALID" && !adjudication.intendedAlternative) issue("INVALID_ALTERNATIVE_MISSING", "adjudicated INVALID requires one alternative");
      if (adjudication.classification === "INVALID" && (!manifestFor(candidate.family).members.includes(adjudication.intendedAlternative!) || adjudication.intendedAlternative === candidate.observedMember)) issue("INVALID_ALTERNATIVE_NOT_UNIQUE_FAMILY_MEMBER", "adjudicated INVALID alternative must be one different enumerated family member");
      if (adjudication.classification === "INVALID" && adjudication.supportedConstructionStatus !== "SUPPORTED") issue("INVALID_NOT_DECLARED_SUPPORTED", "adjudicated INVALID must identify a supported construction");
      final = adjudication;
      provenance = "ADJUDICATION";
      adjudicationFingerprint = adjudication.adjudicationFingerprint;
    } else {
      final = label;
      provenance = "PRIMARY_HUMAN_LABEL_REVIEWED";
    }
    const withoutFingerprint = {
      schemaVersion: 1 as const,
      caseId: candidate.caseId,
      family: candidate.family,
      classification: final.classification,
      intendedMember: final.classification === "INVALID" ? final.intendedAlternative : candidate.observedMember,
      expectedAlternative: final.classification === "INVALID" ? final.intendedAlternative : null,
      supportedConstructionStatus: final.supportedConstructionStatus,
      ambiguityOrExclusionReason: final.ambiguityOrExclusionReason,
      provenance,
      sourceLabelFingerprints: [label.labelFingerprint] as [string],
      reviewFingerprint: review.reviewFingerprint,
      adjudicationFingerprint,
      releaseId: candidate.releaseId,
      familyManifestFingerprint: candidate.familyManifestFingerprint,
      corpusVersion: candidate.corpusVersion,
      candidateFingerprint: candidate.candidateFingerprint,
    };
    gold.push({ ...withoutFingerprint, goldFingerprint: recordFingerprint(withoutFingerprint) });
  }
  for (const adjudication of adjudications) {
    if (!new Set(candidates.map((item) => item.caseId)).has(adjudication.caseId)) issues.push({ code: "ADJUDICATION_UNKNOWN_CASE", message: "adjudication references an unknown case", caseId: adjudication.caseId });
  }
  return { gold, issues };
}

export function wilsonLowerBound(successes: number, total: number, z = 1.959963984540054): number {
  if (!Number.isInteger(successes) || !Number.isInteger(total) || successes < 0 || total <= 0 || successes > total) return 0;
  const proportion = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const centre = proportion + z2 / (2 * total);
  const margin = z * Math.sqrt((proportion * (1 - proportion) + z2 / (4 * total)) / total);
  return (centre - margin) / denominator;
}

function ngrams(value: string, size = 3): Set<string> {
  const tokens = value.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}']+/gu) ?? [];
  if (tokens.length < size) return new Set([tokens.join(" ")]);
  return new Set(Array.from({ length: tokens.length - size + 1 }, (_, index) => tokens.slice(index, index + size).join(" ")));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection || 1);
}

export function corpusVariety(candidates: CandidateCase[]) {
  const normalized = candidates.map((item) => item.sourceText.toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim());
  const exactDuplicates: Array<[string, string]> = [];
  const nearDuplicates: Array<{ left: string; right: string; similarity: number }> = [];
  const firstByText = new Map<string, string>();
  const grams = candidates.map((item) => ngrams(item.sourceText));
  for (let index = 0; index < candidates.length; index += 1) {
    const prior = firstByText.get(normalized[index]);
    if (prior) exactDuplicates.push([prior, candidates[index].caseId]);
    else firstByText.set(normalized[index], candidates[index].caseId);
    for (let comparison = 0; comparison < index; comparison += 1) {
      const similarity = jaccard(grams[index], grams[comparison]);
      if (similarity >= 0.85) nearDuplicates.push({ left: candidates[comparison].caseId, right: candidates[index].caseId, similarity });
    }
  }
  return {
    total: candidates.length,
    uniqueNormalizedTexts: firstByText.size,
    distinctTemplateIds: new Set(candidates.map((item) => item.candidateGeneration.templateId)).size,
    exactDuplicates,
    nearDuplicates,
    effectiveVarietyRatio: firstByText.size / Math.max(1, candidates.length),
  };
}

export function runtimeFingerprints(repositoryRoot: string) {
  const analyserPath = resolve(repositoryRoot, "lib/writing-engine/whole-writing/context.ts");
  const migrationPath = resolve(repositoryRoot, "supabase/migrations/20260907120000_add_whole_writing_context_validation.sql");
  const analyserSourceSha256 = sha256(readFileSync(analyserPath));
  return {
    analyserVersion: WHOLE_WRITING_CONTEXT_ANALYSER_VERSION,
    analyserSourceSha256,
    registryVersion: WHOLE_WRITING_CONTEXT_REGISTRY_VERSION,
    registryFingerprint: recordFingerprint(CONTEXT_FAMILY_MANIFESTS),
    corpusVersion: WHOLE_WRITING_CONTEXT_CORPUS_VERSION,
    releaseMigrationSha256: sha256(readFileSync(migrationPath)),
    familyManifestFingerprints: Object.fromEntries(CONTEXT_FAMILY_MANIFESTS.map((item) => [item.familyKey, item.fingerprint])),
    familyRuleFingerprints: Object.fromEntries(CONTEXT_FAMILY_MANIFESTS.map((item) => [item.familyKey, recordFingerprint({
      analyserVersion: WHOLE_WRITING_CONTEXT_ANALYSER_VERSION,
      analyserSourceSha256,
      familyKey: item.familyKey,
      manifestFingerprint: item.fingerprint,
      supportedConstructions: item.supportedConstructions,
      exclusions: item.exclusions,
    })])),
  };
}

export function evaluateFamily(input: {
  candidates: CandidateCase[];
  gold: FinalGold[];
  prerequisiteIssues: ValidationIssue[];
  expectedRuntimeFingerprints: ReturnType<typeof runtimeFingerprints>;
  actualRuntimeFingerprints: ReturnType<typeof runtimeFingerprints>;
  releaseEvidence?: { releaseFingerprint: string; corpusFingerprint: string };
  // A separately pinned release can reuse the locked corpus's original
  // provenance without relabelling or rewriting any V1 dependencies.
  analyser?: (input: Parameters<typeof analyseDeterministicContext>[0]) => {
    status: ContextResultStatus; alternativeMember: string | null;
  } | null;
}) {
  const failures: EvaluationFailure[] = input.prerequisiteIssues.map((item) => ({ caseId: item.caseId ?? null, reason: item.code, actual: item.message }));
  if (JSON.stringify(input.expectedRuntimeFingerprints) !== JSON.stringify(input.actualRuntimeFingerprints)) {
    failures.push({ caseId: null, reason: "RUNTIME_FINGERPRINT_MISMATCH", expected: input.expectedRuntimeFingerprints, actual: input.actualRuntimeFingerprints });
  }
  const goldById = new Map(input.gold.map((item) => [item.caseId, item]));
  if (input.gold.length !== input.candidates.length) failures.push({ caseId: null, reason: "FINAL_GOLD_INCOMPLETE", expected: input.candidates.length, actual: input.gold.length });
  const counts = { total: input.gold.length, valid: 0, invalid: 0, uncertain: 0 };
  const confusion = { truePositives: 0, falsePositives: 0, trueNegatives: 0, falseNegatives: 0, abstentions: 0 };
  const byConstruction: Record<string, { total: number; failures: number; invalidSuggestions: number }> = {};
  const byProtectedSet = Object.fromEntries(PROTECTED_TAGS.map((tag) => [tag, { total: 0, failures: 0 }])) as Record<ProtectedTag, { total: number; failures: number }>;
  let supportedInvalid = 0;
  let supportedTruePositive = 0;
  let invalidAlternativeCorrect = 0;
  let invalidSuggestionsOnGoldInvalid = 0;
  for (const candidate of input.candidates) {
    const gold = goldById.get(candidate.caseId);
    if (!gold) continue;
    counts[gold.classification === "VALID" ? "valid" : gold.classification === "INVALID" ? "invalid" : "uncertain"] += 1;
    const result = (input.analyser ?? analyseDeterministicContext)({ fieldText: candidate.sourceText, startUtf16: candidate.startUtf16, endUtf16: candidate.endUtf16 });
    const prediction: ContextResultStatus = result?.status ?? "NOT_ASSESSED";
    if (prediction === "UNCERTAIN" || prediction === "NOT_ASSESSED") confusion.abstentions += 1;
    const construction = byConstruction[candidate.declaredConstruction] ?? { total: 0, failures: 0, invalidSuggestions: 0 };
    construction.total += 1;
    if (prediction === "INVALID") construction.invalidSuggestions += 1;
    byConstruction[candidate.declaredConstruction] = construction;
    let failed = false;
    if (gold.classification === "INVALID") {
      if (!gold.expectedAlternative || gold.supportedConstructionStatus !== "SUPPORTED") {
        failures.push({ caseId: candidate.caseId, reason: "INVALID_GOLD_NOT_UNIQUELY_SUPPORTED", expected: "one alternative and SUPPORTED", actual: gold });
        failed = true;
      } else {
        supportedInvalid += 1;
        if (prediction === "INVALID" && result?.alternativeMember === gold.expectedAlternative) {
          confusion.truePositives += 1;
          supportedTruePositive += 1;
          invalidAlternativeCorrect += 1;
        } else {
          confusion.falseNegatives += 1;
          if (prediction === "INVALID") confusion.falsePositives += 1;
          failures.push({ caseId: candidate.caseId, reason: "SUPPORTED_INVALID_MISSED_OR_WRONG_ALTERNATIVE", expected: gold.expectedAlternative, actual: result });
          failed = true;
        }
        if (prediction === "INVALID") invalidSuggestionsOnGoldInvalid += 1;
      }
    } else if (prediction === "INVALID") {
      confusion.falsePositives += 1;
      failures.push({ caseId: candidate.caseId, reason: "FALSE_POSITIVE_SUGGESTION", expected: gold.classification, actual: result });
      failed = true;
    } else {
      confusion.trueNegatives += 1;
    }
    if (failed) construction.failures += 1;
    for (const tag of candidate.protectedSetTags) {
      byProtectedSet[tag].total += 1;
      if (gold.classification !== "INVALID" && prediction === "INVALID") {
        byProtectedSet[tag].failures += 1;
      }
    }
  }
  const proposedSuggestions = confusion.truePositives + confusion.falsePositives;
  const precision = proposedSuggestions ? confusion.truePositives / proposedSuggestions : 0;
  const wilsonLower95 = wilsonLowerBound(confusion.truePositives, proposedSuggestions);
  const supportedRecall = supportedInvalid ? supportedTruePositive / supportedInvalid : 0;
  const invalidAlternativeAccuracy = invalidSuggestionsOnGoldInvalid ? invalidAlternativeCorrect / invalidSuggestionsOnGoldInvalid : 0;
  const countChecks = [
    ["MINIMUM_TOTAL_NOT_MET", counts.total, G2_LIMITS.minimumTotal],
    ["MINIMUM_VALID_NOT_MET", counts.valid, G2_LIMITS.minimumValid],
    ["MINIMUM_INVALID_NOT_MET", counts.invalid, G2_LIMITS.minimumInvalid],
    ["MINIMUM_UNCERTAIN_NOT_MET", counts.uncertain, G2_LIMITS.minimumUncertain],
  ] as const;
  for (const [reason, actual, expected] of countChecks) if (actual < expected) failures.push({ caseId: null, reason, expected, actual });
  if (precision < G2_LIMITS.minimumPrecision) failures.push({ caseId: null, reason: "PRECISION_BELOW_POLICY", expected: G2_LIMITS.minimumPrecision, actual: precision });
  if (wilsonLower95 < G2_LIMITS.minimumWilsonLower95) failures.push({ caseId: null, reason: "WILSON_LOWER_BOUND_BELOW_POLICY", expected: G2_LIMITS.minimumWilsonLower95, actual: wilsonLower95 });
  if (supportedRecall < G2_LIMITS.minimumSupportedRecall) failures.push({ caseId: null, reason: "SUPPORTED_RECALL_BELOW_POLICY", expected: G2_LIMITS.minimumSupportedRecall, actual: supportedRecall });
  for (const tag of PROTECTED_TAGS) if (byProtectedSet[tag].failures > G2_LIMITS.maximumProtectedFailures) failures.push({ caseId: null, reason: `PROTECTED_${tag.toUpperCase()}_FAILURE`, expected: 0, actual: byProtectedSet[tag].failures });
  const result = {
    ...(input.releaseEvidence ? { releaseEvidence: input.releaseEvidence } : {}),
    disposition: failures.length === 0 ? "PASS" as const : "BLOCKED" as const,
    counts,
    confusion,
    precision,
    wilsonLower95,
    supportedRecall,
    invalidAlternativeAccuracy,
    byConstruction,
    byProtectedSet,
    failures,
  };
  return { ...result, evaluationFingerprint: recordFingerprint(result) };
}
