import type {
  CanonicalIntakeRouteReadinessFact,
  CurriculumEvidence,
  IntakeCurriculumReleaseAuthorityV2,
} from "../canonical-intake";
import { canonicalWordSkillPair } from "./keys";

export const COMPOUND_WORD_ROUTE_ID = "compound_word_lab";
export const COMPOUND_WORD_ROUTE_VERSION = "v2";
export const COMPOUND_WORD_ACTIVATION_ROUTE_KEY = "compound_word_lab:v2";
export const COMPOUND_WORD_PAYLOAD_VERSION = 2;
export const COMPOUND_WORD_CLUSTER_KEY = "D4_MOR_COMPOUND_WORDS";
export const COMPOUND_WORD_RELEASE_DEPENDENCY_TYPES = [
  "compound_structure",
  "teaching_content",
  "teaching_dictionary_closure",
] as const;

type DependencyType = (typeof COMPOUND_WORD_RELEASE_DEPENDENCY_TYPES)[number];

export interface CompoundWordReleaseDependencyFact {
  authorityType: string;
  authorityId: string;
  authorityKey: string;
  authoritySchemaVersion: number;
  semanticFingerprint: string;
  authority: {
    id: string;
    authorityType: string;
    authorityKey: string;
    schemaVersion: number;
    semanticFingerprint: string;
    semanticProjection: unknown;
  } | null;
}

export interface CompoundWordPublishedStructureFact {
  canonicalWordId: string;
  microSkillKey: string;
  assignmentEligible: boolean;
  rowStatus: string;
  reviewStatus: string;
  dependencyAuthorityId: string | null;
}

export interface CompoundWordClosureWordFact {
  authorityId: string;
  canonicalWordId: string;
  displayWord: string;
  dictationSentence: string | null;
  dictationTargetStart: number | null;
  dictationTargetEndExclusive: number | null;
  exactGovernedAnswer: string | null;
}

export interface CompoundWordReleaseFact {
  releaseManifestId: string;
  releaseKey: string;
  releaseManifestSha256: string;
  dependencyFingerprint: string;
  routeId: string;
  routeVersion: string;
  activationRouteKey: string;
  payloadVersion: number;
  manifestPayload: unknown;
  microSkillKey: string;
  publishedAt: string;
  dependencies: readonly CompoundWordReleaseDependencyFact[];
}

type ProjectionStructure = {
  wholeCanonicalWordId: string;
  displayForm: string;
  microSkillKey: string;
  assignmentEligible: boolean;
  components: Array<{ ordinal: number; canonicalWordId: string; displaySurface: string }>;
  joins: Array<"none" | "space" | "hyphen">;
  dictation: {
    sentence: string;
    targetStart: number;
    targetEndExclusive: number;
    exactGovernedAnswer: string;
  };
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validStructure(value: unknown): value is ProjectionStructure {
  if (!record(value) || !Array.isArray(value.components) || !Array.isArray(value.joins) || !record(value.dictation)) return false;
  if (typeof value.wholeCanonicalWordId !== "string" || typeof value.displayForm !== "string" ||
      typeof value.microSkillKey !== "string" || value.assignmentEligible !== true || value.components.length < 2 ||
      value.joins.length !== value.components.length - 1) return false;
  if (!value.components.every((component, index) => record(component) && component.ordinal === index + 1 &&
      typeof component.canonicalWordId === "string" && component.canonicalWordId.length > 0 &&
      typeof component.displaySurface === "string" && component.displaySurface.length > 0)) return false;
  if (!value.joins.every((join) => join === "none" || join === "space" || join === "hyphen")) return false;
  return typeof value.dictation.sentence === "string" &&
    Number.isInteger(value.dictation.targetStart) && Number.isInteger(value.dictation.targetEndExclusive) &&
    Number(value.dictation.targetEndExclusive) > Number(value.dictation.targetStart) &&
    typeof value.dictation.exactGovernedAnswer === "string";
}

function reconstruct(structure: ProjectionStructure): string {
  return structure.components.map((component, index) => {
    if (index === 0) return component.displaySurface;
    const separator = structure.joins[index - 1] === "space" ? " " : structure.joins[index - 1] === "hyphen" ? "-" : "";
    return `${separator}${component.displaySurface}`;
  }).join("");
}

export function compileCompoundWordCanonicalIntakeRouteFacts(input: {
  releases: readonly CompoundWordReleaseFact[];
  publishedStructures: readonly CompoundWordPublishedStructureFact[];
  closureWords: readonly CompoundWordClosureWordFact[];
}): {
  enabledSkills: Set<string>;
  readyPairs: Set<string>;
  routeReadiness: CanonicalIntakeRouteReadinessFact[];
} {
  const enabledSkills = new Set<string>();
  const readyPairs = new Set<string>();
  const routeReadiness: CanonicalIntakeRouteReadinessFact[] = [];
  const releases = [...input.releases]
    .filter((release) => !Number.isNaN(Date.parse(release.publishedAt)))
    .sort((left, right) => {
      const byDate = Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
      return byDate || right.releaseManifestId.localeCompare(left.releaseManifestId);
    })
    .filter((release, index, all) =>
      all.findIndex((candidate) => candidate.microSkillKey === release.microSkillKey) === index,
    );
  const releaseCountBySkill = new Map<string, number>();
  for (const release of releases) {
    releaseCountBySkill.set(
      release.microSkillKey,
      (releaseCountBySkill.get(release.microSkillKey) ?? 0) + 1,
    );
  }
  for (const release of releases) {
    const releaseIdentity: IntakeCurriculumReleaseAuthorityV2 = {
      releaseManifestId: release.releaseManifestId,
      releaseKey: release.releaseKey,
      releaseManifestSha256: release.releaseManifestSha256,
      dependencyFingerprint: release.dependencyFingerprint,
    };
    const dependency = (kind: DependencyType) => release.dependencies.filter((item) => item.authorityType === kind);
    const exactDependencySet = release.dependencies.length === 3 &&
      COMPOUND_WORD_RELEASE_DEPENDENCY_TYPES.every((kind) => dependency(kind).length === 1) &&
      dependency("compound_structure")[0]?.authoritySchemaVersion === 1 &&
      dependency("teaching_content")[0]?.authoritySchemaVersion === 1 &&
      dependency("teaching_dictionary_closure")[0]?.authoritySchemaVersion === 2 &&
      release.dependencies.every((binding) => binding.authority && binding.authority.id === binding.authorityId &&
        binding.authority.authorityType === binding.authorityType && binding.authority.authorityKey === binding.authorityKey &&
        binding.authority.schemaVersion === binding.authoritySchemaVersion &&
        binding.authority.semanticFingerprint === binding.semanticFingerprint);
    const manifest = record(release.manifestPayload) ? release.manifestPayload : null;
    const manifestSkills = manifest && Array.isArray(manifest.microSkills) ? manifest.microSkills : [];
    const routeExact = releaseCountBySkill.get(release.microSkillKey) === 1 &&
      /^[a-f0-9]{64}$/u.test(release.releaseManifestSha256) &&
      /^[a-f0-9]{64}$/u.test(release.dependencyFingerprint) &&
      release.routeId === COMPOUND_WORD_ROUTE_ID && release.routeVersion === COMPOUND_WORD_ROUTE_VERSION &&
      release.activationRouteKey === COMPOUND_WORD_ACTIVATION_ROUTE_KEY && release.payloadVersion === COMPOUND_WORD_PAYLOAD_VERSION &&
      manifestSkills.length === 1 && record(manifestSkills[0]) && manifestSkills[0].microSkillKey === release.microSkillKey;
    const structureAuthority = dependency("compound_structure")[0]?.authority;
    const teachingAuthority = dependency("teaching_content")[0]?.authority;
    const closureAuthority = dependency("teaching_dictionary_closure")[0]?.authority;
    const teachingExact = teachingAuthority && record(teachingAuthority.semanticProjection) &&
      teachingAuthority.semanticProjection.microSkillKey === release.microSkillKey;
    const projection = structureAuthority && record(structureAuthority.semanticProjection) &&
      Array.isArray(structureAuthority.semanticProjection.structures)
      ? structureAuthority.semanticProjection.structures.filter(validStructure)
      : [];
    const releaseReady = routeExact && exactDependencySet && teachingExact && projection.length > 0;
    if (releaseReady) enabledSkills.add(release.microSkillKey);
    for (const structure of projection.filter((entry) => entry.microSkillKey === release.microSkillKey)) {
      const physical = input.publishedStructures.filter((row) => row.canonicalWordId === structure.wholeCanonicalWordId &&
        row.microSkillKey === release.microSkillKey && row.dependencyAuthorityId === structureAuthority?.id);
      const closure = input.closureWords.filter((row) => row.authorityId === closureAuthority?.id &&
        row.canonicalWordId === structure.wholeCanonicalWordId);
      const exactClosure = closure.length === 1 && closure[0].displayWord === structure.displayForm &&
        closure[0].dictationSentence === structure.dictation.sentence &&
        closure[0].dictationTargetStart === structure.dictation.targetStart &&
        closure[0].dictationTargetEndExclusive === structure.dictation.targetEndExclusive &&
        closure[0].exactGovernedAnswer === structure.dictation.exactGovernedAnswer;
      const structureReady = physical.length === 1 && physical[0].assignmentEligible && physical[0].rowStatus === "active" &&
        physical[0].reviewStatus === "approved_for_first_exposure" && reconstruct(structure) === structure.displayForm &&
        structure.dictation.exactGovernedAnswer === structure.displayForm && exactClosure;
      const ready = Boolean(releaseReady && structureReady);
      const pair = canonicalWordSkillPair(structure.wholeCanonicalWordId, release.microSkillKey);
      if (ready) readyPairs.add(pair);
      const evidence: CurriculumEvidence[] = [
        { source: "adle_curriculum_release_manifests", sourceId: release.releaseManifestId, status: routeExact ? "exact" : "invalid" },
        { source: "canonical_teaching_dictionary_compound_structures_v2", sourceId: structure.wholeCanonicalWordId, status: structureReady ? "approved_assignment_eligible" : "invalid" },
        { source: "adle_teaching_dictionary_closure_words", sourceId: closureAuthority?.id, status: exactClosure ? "exact" : "missing_or_mismatched" },
      ];
      routeReadiness.push({
        canonicalWordId: structure.wholeCanonicalWordId,
        microSkillKey: release.microSkillKey,
        ready,
        blockers: ready ? [] : ["payload_not_compilable"],
        evidence,
        curriculumRelease: releaseIdentity,
      });
    }
  }
  return { enabledSkills, readyPairs, routeReadiness };
}
