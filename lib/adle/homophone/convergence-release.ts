import approved from "@/data/adle/homophone/convergence-v1/approved-lesson-content.json";
import cheatCodes from "@/data/adle/homophone/convergence-v1/approved-cheat-codes.json";
import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import { validateContextualChoiceContent, type ContextualChoiceContent } from "./contextual-choice-contract";

export type ConvergenceAuthority = {
  authorityKey: string;
  authorityType: "homophone_contextual_content";
  schemaVersion: 1;
  semanticProjection: {
    schemaVersion: 1;
    microSkillKey: string;
    contentVersion: string;
    sourceSha256: string;
    cheatCodeSourceSha256: string;
    content: ContextualChoiceContent;
  };
  semanticFingerprint: string;
};

export type ConvergenceReleasePackage = {
  schemaVersion: 1;
  activation: "inactive";
  manifest: {
    schemaVersion: 2;
    releaseKey: string;
    route: { routeId: "homophone_contextual_choice"; routeVersion: "v1";
      activationRouteKey: "homophone_contextual_choice:v1"; payloadVersion: 1 };
    approvalRefs: string[];
    microSkills: Array<{ microSkillKey: string; dependencies: Array<{
      authorityKey: string; authorityType: "homophone_contextual_content";
      authoritySchemaVersion: 1; semanticFingerprint: string }> }>;
  };
  authorities: ConvergenceAuthority[];
  packageSha256: string;
};

/** Exact 58-skill, inactive release. The publisher must recheck live set revisions. */
export function buildConvergenceReleasePackage(input: {
  releaseKey: string;
  approvalRefs: readonly string[];
  contents: readonly ContextualChoiceContent[];
}): ConvergenceReleasePackage {
  if (!input.releaseKey.trim() || !input.approvalRefs.length || input.approvalRefs.some(ref => !ref.trim())
    || new Set(input.approvalRefs).size !== input.approvalRefs.length
    || cheatCodes.contentVersion !== approved.contentVersion)
    throw new Error("homophone_contextual_release_approval_invalid");
  const byKey = new Map(input.contents.map(content => [content.microSkillKey, content]));
  if (input.contents.length !== 58 || byKey.size !== 58
    || approved.lessons.some(lesson => !byKey.has(lesson.microSkillKey)))
    throw new Error("homophone_contextual_release_scope_invalid");
  const authorities: ConvergenceAuthority[] = approved.lessons.map(lesson => {
    const content = byKey.get(lesson.microSkillKey)!;
    validateContextualChoiceContent(content);
    if (content.contentVersion !== approved.contentVersion
      || content.approvalReference !== approved.approvalReference
      || content.teachingExplanation !== lesson.teachingExplanation
      || content.sets.map(set => set.setKey).join("\u0000") !== lesson.sets.map(set => set.setKey).join("\u0000"))
      throw new Error(`homophone_contextual_release_content_mismatch:${lesson.microSkillKey}`);
    const semanticProjection = { schemaVersion: 1 as const, microSkillKey: lesson.microSkillKey,
      contentVersion: approved.contentVersion, sourceSha256: approved.sourceSha256,
      cheatCodeSourceSha256: cheatCodes.sourceSha256, content };
    return { authorityKey: `${input.releaseKey}:${lesson.microSkillKey}:homophone_contextual_content`,
      authorityType: "homophone_contextual_content" as const, schemaVersion: 1 as const,
      semanticProjection, semanticFingerprint: fingerprintSnapshotValue(semanticProjection) };
  });
  const manifest = { schemaVersion: 2 as const, releaseKey: input.releaseKey,
    route: { routeId: "homophone_contextual_choice" as const, routeVersion: "v1" as const,
      activationRouteKey: "homophone_contextual_choice:v1" as const, payloadVersion: 1 as const },
    approvalRefs: [...input.approvalRefs].sort(),
    microSkills: authorities.map(authority => ({ microSkillKey: authority.semanticProjection.microSkillKey,
      dependencies: [{ authorityKey: authority.authorityKey, authorityType: authority.authorityType,
        authoritySchemaVersion: 1 as const, semanticFingerprint: authority.semanticFingerprint }] }))
      .sort((a, b) => a.microSkillKey.localeCompare(b.microSkillKey)),
  };
  const body = { schemaVersion: 1 as const, activation: "inactive" as const, manifest, authorities };
  return { ...body, packageSha256: fingerprintSnapshotValue(body) };
}
