import { createHash } from "node:crypto";
import type { BaseWordFamilyAuthorityFamily, BaseWordFamilyAuthorityMemberV2, BaseWordFamilyAuthorityProjectionV2 } from "./curriculum-release-activation";
import { regularityReviewedRelease, reviewedBaseWordRegularity } from "./base-word-regularity";

export interface ApprovedLexicalFamily {
  familyKey: string;
  revision: number;
  baseLemma: string;
  baseKind: "free_base" | "bound_root";
  baseWordId: string | null;
  baseMeaning: string;
  semanticFingerprint: string;
  members: readonly {
    canonicalWordId: string;
    wordPartOfSpeech: string;
    relationshipKind: string;
    canonicalMorphologyId: string;
    wordSum: string;
    morphologyParts: unknown[];
    morphologyJoins: unknown[];
    morphologyTransformations: unknown[];
    intendedMeaning: string;
    complexityLevel: number | null;
    /** A reviewed, unwithdrawn demonstrates relationship in this environment. */
    demonstratesSkill: boolean;
    /** Route content has been signed off against these dictionary facts. */
    routeContentReviewed: boolean;
  }[];
}

function stableId(source: string): string {
  const hex = createHash("md5").update(source).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function lexicalFamilyId(familyKey: string, revision: number): string {
  return stableId(`lexical-family:${familyKey}:${revision}`);
}

/** Approved lexical membership supplies the family. Only a reviewed
 * demonstrates relationship and current route-content approval make a derived
 * member an authentic target; the free base is guided structural support. */
export function appendReviewedLexicalFamilies(input: {
  parent: BaseWordFamilyAuthorityProjectionV2;
  microSkillKey: string;
  environment: "local" | "staging" | "production";
  families: readonly ApprovedLexicalFamily[];
}): BaseWordFamilyAuthorityProjectionV2 {
  const families = [...input.parent.families];
  const sources = [...input.parent.sourceAuthorities];
  for (const family of input.families) {
    if (family.baseKind !== "free_base" || !family.baseWordId) continue;
    if (!/^[a-f0-9]{64}$/.test(family.semanticFingerprint) || !Number.isInteger(family.revision) || family.revision < 1)
      throw new Error(`Invalid approved lexical source: ${family.familyKey}`);
    const existing = families.find((entry) => entry.baseFamilyKey === family.familyKey);
    if (existing) {
      if (existing.sourceFingerprint !== family.semanticFingerprint)
        throw new Error(`Lexical family ${family.familyKey} has a newer approved revision; stage a replacement release`);
      continue;
    }
    const eligible = family.members.filter((member) => member.canonicalWordId === family.baseWordId ||
      (member.demonstratesSkill && member.routeContentReviewed));
    if (!eligible.some((member) => member.canonicalWordId !== family.baseWordId)) continue;
    if (eligible.filter((member) => member.canonicalWordId === family.baseWordId).length !== 1)
      throw new Error(`Lexical family ${family.familyKey} needs one approved free base`);
    const sourceKey = `lexical-family:${input.environment}:${family.familyKey}:${family.revision}`;
    const members: BaseWordFamilyAuthorityMemberV2[] = eligible.map((member) => {
      const base = member.canonicalWordId === family.baseWordId;
      const lessonRegularity = reviewedBaseWordRegularity({ relationshipKind: member.relationshipKind,
        transformations: member.morphologyTransformations, reviewed: true });
      return {
        memberId: stableId(`${sourceKey}:${member.canonicalWordId}:${member.wordPartOfSpeech}`),
        canonicalWordId: member.canonicalWordId,
        structuralRole: base ? "base" : "family_member",
        authenticTargetEligible: !base,
        applicableMicroSkillKeys: [input.microSkillKey],
        assignmentEligible: true,
        lessonRegularity,
        complexityLevel: member.complexityLevel,
        wordSum: member.wordSum,
        morphologyParts: member.morphologyParts,
        morphologyJoins: member.morphologyJoins,
        morphologyTransformations: member.morphologyTransformations,
        transformationNotes: "",
        childFriendlyMeaning: member.intendedMeaning,
        morphologySource: {
          sourceKind: "approved_lexical_family_member",
          sourceId: `${family.familyKey}:${family.revision}:${member.canonicalWordId}:${member.wordPartOfSpeech}`,
          sourceFingerprint: family.semanticFingerprint,
          sourceAuthorityKey: sourceKey,
        },
      };
    });
    const released: BaseWordFamilyAuthorityFamily = {
      familyId: lexicalFamilyId(family.familyKey, family.revision),
      baseFamilyKey: family.familyKey,
      baseWordId: family.baseWordId,
      baseMeaning: family.baseMeaning,
      etymologyRoute: { relation_type: "visible_free_base", child_facing_meaning: family.baseMeaning,
        semantic_connection: `Words share the base ${family.baseLemma}.`,
        evidence: { source_name: "Approved lexical family", family_key: family.familyKey,
          revision: family.revision } },
      sourceFingerprint: family.semanticFingerprint,
      members: members.sort((a, b) => a.canonicalWordId.localeCompare(b.canonicalWordId)),
    };
    families.push(released);
    sources.push({ authorityKey: sourceKey, sourceKind: "approved_repository_artifact",
      sourceId: sourceKey, sourceFingerprint: family.semanticFingerprint });
  }
  return regularityReviewedRelease({ ...input.parent, sourceAuthorities: sources.sort((a, b) => a.authorityKey.localeCompare(b.authorityKey)),
    families: families.sort((a, b) => a.baseFamilyKey.localeCompare(b.baseFamilyKey) || a.familyId.localeCompare(b.familyId)) });
}
