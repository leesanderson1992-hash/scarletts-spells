import "server-only";

import type {
  CanonicalWordIdentityFact,
  MicroSkillIdentityFact,
  RawWordSkillRelationshipFact,
} from "./contracts";

export const PHASE_B_FIXTURE_SKILLS = {
  suffixFulLess: "D4_MOR_SUFFIXES_FUL_LESS",
  preserveBase: "D4_MOR_BASE_WORDS_PRESERVE_BASE",
  identifyBase: "D4_MOR_BASE_WORDS_IDENTIFY_BASE",
  disMis: "D4_MOR_PREFIXES_DIS_MIS",
  silentH: "D4_ORTH_SILENT_H",
  inactive: "D4_INACTIVE_FIXTURE",
} as const;

export const PHASE_B_FIXTURE_WORDS = {
  careful: "word-careful",
  playing: "word-playing",
  dishonest: "word-dishonest",
  hopeful: "word-hopeful",
  contrast: "word-contrast",
  conflict: "word-conflict",
} as const;

export const phaseBFixtureWords: CanonicalWordIdentityFact[] = Object.entries(PHASE_B_FIXTURE_WORDS).map(([normalisedWord, canonicalWordId]) => ({
  canonicalWordId,
  normalisedWord,
  state: "active",
  identityStable: true,
}));

export const phaseBFixtureSkills: MicroSkillIdentityFact[] = [
  PHASE_B_FIXTURE_SKILLS.suffixFulLess,
  PHASE_B_FIXTURE_SKILLS.preserveBase,
  PHASE_B_FIXTURE_SKILLS.identifyBase,
  PHASE_B_FIXTURE_SKILLS.disMis,
  PHASE_B_FIXTURE_SKILLS.silentH,
].map((microSkillKey) => ({ microSkillKey, state: "active", identityStable: true }));
phaseBFixtureSkills.push({ microSkillKey: PHASE_B_FIXTURE_SKILLS.inactive, state: "inactive", identityStable: true });

function fact(overrides: Partial<RawWordSkillRelationshipFact> & Pick<RawWordSkillRelationshipFact, "sourceAuthority" | "provenanceId" | "canonicalWordId" | "microSkillKey">): RawWordSkillRelationshipFact {
  return {
    sourceAuthorityVersion: "fixture-authority-v1",
    relationshipRole: "demonstrates",
    sourceState: "active",
    exactPairApproval: "approved",
    reviewState: "approved",
    releaseState: "not_applicable",
    provenanceMetadata: {},
    ...overrides,
  };
}

export const phaseBFixtureFacts: RawWordSkillRelationshipFact[] = [
  // careful: two genuinely governed skills and a deliberately unreviewed exact suffix row.
  fact({ sourceAuthority: "approved_generic_support", provenanceId: "support-careful-base", canonicalWordId: PHASE_B_FIXTURE_WORDS.careful, microSkillKey: PHASE_B_FIXTURE_SKILLS.preserveBase }),
  fact({ sourceAuthority: "released_route_content", provenanceId: "base-route-careful", canonicalWordId: PHASE_B_FIXTURE_WORDS.careful, microSkillKey: PHASE_B_FIXTURE_SKILLS.preserveBase, releaseState: "released" }),
  fact({ sourceAuthority: "approved_generic_support", provenanceId: "support-careful-suffix-in-review", canonicalWordId: PHASE_B_FIXTURE_WORDS.careful, microSkillKey: PHASE_B_FIXTURE_SKILLS.suffixFulLess, exactPairApproval: "unapproved", reviewState: "unreviewed" }),
  fact({ sourceAuthority: "released_specialist_membership", provenanceId: "suffix-member-careful", canonicalWordId: PHASE_B_FIXTURE_WORDS.careful, microSkillKey: PHASE_B_FIXTURE_SKILLS.suffixFulLess, releaseState: "released", provenanceMetadata: { profile: "ful-less" } }),
  // playing: resolver authority independently admits both exact word/skill pairs.
  fact({ sourceAuthority: "approved_resolver_mapping", provenanceId: "mapping-plaiing", canonicalWordId: PHASE_B_FIXTURE_WORDS.playing, microSkillKey: PHASE_B_FIXTURE_SKILLS.preserveBase, provenanceMetadata: { misspelling: "plaiing" } }),
  fact({ sourceAuthority: "approved_resolver_mapping", provenanceId: "mapping-plaing", canonicalWordId: PHASE_B_FIXTURE_WORDS.playing, microSkillKey: PHASE_B_FIXTURE_SKILLS.identifyBase, provenanceMetadata: { misspelling: "plaing" } }),
  // dishonest: the same exact pair has resolver + specialist authority and duplicate specialist provenance.
  fact({ sourceAuthority: "approved_resolver_mapping", provenanceId: "mapping-disshonest", canonicalWordId: PHASE_B_FIXTURE_WORDS.dishonest, microSkillKey: PHASE_B_FIXTURE_SKILLS.disMis, provenanceMetadata: { misspelling: "disshonest" } }),
  fact({ sourceAuthority: "released_specialist_membership", provenanceId: "prefix-member-dishonest", canonicalWordId: PHASE_B_FIXTURE_WORDS.dishonest, microSkillKey: PHASE_B_FIXTURE_SKILLS.disMis, releaseState: "released", provenanceMetadata: { profile: "dis-mis" } }),
  fact({ sourceAuthority: "released_specialist_membership", provenanceId: "prefix-member-dishonest", canonicalWordId: PHASE_B_FIXTURE_WORDS.dishonest, microSkillKey: PHASE_B_FIXTURE_SKILLS.disMis, releaseState: "released", provenanceMetadata: { profile: "dis-mis" } }),
  // The plausible Silent-H relationship is not approved for this exact pair.
  fact({ sourceAuthority: "explicit_reviewed_association", provenanceId: "wrong-pair-dishonest-silent-h", canonicalWordId: PHASE_B_FIXTURE_WORDS.dishonest, microSkillKey: PHASE_B_FIXTURE_SKILLS.silentH, exactPairApproval: "unapproved", reviewState: "unreviewed" }),
  // hopeful is specialist-only: no generic duplicate is required.
  fact({ sourceAuthority: "released_specialist_membership", provenanceId: "suffix-member-hopeful", canonicalWordId: PHASE_B_FIXTURE_WORDS.hopeful, microSkillKey: PHASE_B_FIXTURE_SKILLS.suffixFulLess, releaseState: "released" }),
  fact({ sourceAuthority: "explicit_reviewed_association", provenanceId: "association-hopeful-base", canonicalWordId: PHASE_B_FIXTURE_WORDS.hopeful, microSkillKey: PHASE_B_FIXTURE_SKILLS.preserveBase }),
  // Non-positive and invalid facts.
  fact({ sourceAuthority: "approved_generic_support", provenanceId: "contrast-only", canonicalWordId: PHASE_B_FIXTURE_WORDS.contrast, microSkillKey: PHASE_B_FIXTURE_SKILLS.disMis, relationshipRole: "contrast_only" }),
  fact({ sourceAuthority: "explicit_reviewed_association", provenanceId: "diagnostic-only", canonicalWordId: PHASE_B_FIXTURE_WORDS.contrast, microSkillKey: PHASE_B_FIXTURE_SKILLS.identifyBase, relationshipRole: "diagnostic_only" }),
  fact({ sourceAuthority: "explicit_reviewed_association", provenanceId: "negative-only", canonicalWordId: PHASE_B_FIXTURE_WORDS.contrast, microSkillKey: PHASE_B_FIXTURE_SKILLS.suffixFulLess, relationshipRole: "negative_only" }),
  fact({ sourceAuthority: "approved_resolver_mapping", provenanceId: "unknown-word", canonicalWordId: "word-unknown", microSkillKey: PHASE_B_FIXTURE_SKILLS.disMis }),
  fact({ sourceAuthority: "approved_generic_support", provenanceId: "inactive-skill", canonicalWordId: PHASE_B_FIXTURE_WORDS.hopeful, microSkillKey: PHASE_B_FIXTURE_SKILLS.inactive }),
  fact({ sourceAuthority: "explicit_reviewed_association", provenanceId: "unknown-skill", canonicalWordId: PHASE_B_FIXTURE_WORDS.hopeful, microSkillKey: "D4_UNKNOWN" }),
  fact({ sourceAuthority: "explicit_reviewed_association", provenanceId: "unreviewed-association", canonicalWordId: PHASE_B_FIXTURE_WORDS.hopeful, microSkillKey: PHASE_B_FIXTURE_SKILLS.preserveBase, exactPairApproval: "unapproved", reviewState: "unreviewed" }),
  fact({ sourceAuthority: "released_specialist_membership", provenanceId: "unreleased-specialist", canonicalWordId: PHASE_B_FIXTURE_WORDS.playing, microSkillKey: PHASE_B_FIXTURE_SKILLS.suffixFulLess, releaseState: "unreleased" }),
  // Same provenance identity with conflicting metadata makes the pair ambiguous.
  fact({ sourceAuthority: "explicit_reviewed_association", provenanceId: "conflicting-provenance", canonicalWordId: PHASE_B_FIXTURE_WORDS.conflict, microSkillKey: PHASE_B_FIXTURE_SKILLS.preserveBase, provenanceMetadata: { reviewer: "A" } }),
  fact({ sourceAuthority: "explicit_reviewed_association", provenanceId: "conflicting-provenance", canonicalWordId: PHASE_B_FIXTURE_WORDS.conflict, microSkillKey: PHASE_B_FIXTURE_SKILLS.preserveBase, provenanceMetadata: { reviewer: "B" } }),
];
