import { notFound } from "next/navigation";
import { canOpenAdleDesignPreview } from "@/lib/adle/design-preview-access";

import type { AdleSessionItem } from "@/lib/adle/loaders/daily-plan-surface";
import { buildDynamicAffixAssignmentPlan } from "@/lib/adle/morphology/dynamic-affix-assignment-plan";
import { compileDynamicAffixWordLabDecision } from "@/lib/adle/morphology/dynamic-affix-compiler-rollout";
import { dynamicAffixRuntime } from "@/lib/adle/morphology/dynamic-affix-runtime";
import type { ComposedDailyPlan } from "@/lib/adle/daily-assignment-composer";
import { loadReviewedAffixPackageFixture } from "@/scripts/lib/adle-reviewed-affix-package-fixture";
import { DynamicAffixV3InteractionFixture } from "./fixture";

const ASSIGNMENT_ID = "dev-dynamic-affix-v3-g7-teaching-pages";

export const dynamic = "force-dynamic";

export function DynamicAffixV3DevFixturePage(props: { packagePath: string; assignmentId: string }) {
  if (!canOpenAdleDesignPreview()) notFound();
  const fixture = loadReviewedAffixPackageFixture(props.packagePath);
  const decision = compileDynamicAffixWordLabDecision(fixture.selection, {
    mode: "shared_authoritative",
    sourceKind: "reviewed_fixture",
  });
  if (!decision.ok) throw new Error(`Dynamic Affix V3 fixture blocked: ${decision.blockerCode}`);
  const runtime = dynamicAffixRuntime(decision.payload);
  if (!runtime) throw new Error("Dynamic Affix V3 fixture runtime reconstruction failed");
  const plan = buildDynamicAffixAssignmentPlan({
    basePlan: {
      childId: "dev-dynamic-affix-v3-child",
      planDate: "2026-08-06",
      composerPolicyVersion: "dev",
      schedulePolicyVersion: "dev",
      throttle: {},
      partOne: {},
      partTwo: {},
      budget: { budgetResponses: 0, estimatedResponses: 0, guidedWordCount: 0, introTrimmed: false, trims: [] },
    } as unknown as ComposedDailyPlan,
    selection: fixture.selection,
    payload: decision.payload,
  });
  const items: AdleSessionItem[] = plan.partTwo.sections.flatMap((section) =>
    section.items.map((item, index) => ({
      id: `dev-affix-item-${section.sectionKey}-${index}`,
      sourceEntityId: `dev-affix-item-${section.sectionKey}-${index}`,
      sectionKey: item.sectionKey,
      templateKey: item.templateKey,
      position: index + 1,
      status: "ready",
      targetWord: item.targetWord,
      canonicalWordId: item.canonicalWordId,
      microSkillKey: decision.payload.microSkillId,
      adleLearningItemRef: item.learningItemId,
      promptData: item.payload,
    })),
  );
  return (
    <DynamicAffixV3InteractionFixture
      assignmentId={props.assignmentId}
      items={items}
      payload={runtime}
    />
  );
}

export default function DynamicAffixV3DevPage() {
  return <DynamicAffixV3DevFixturePage
    assignmentId={ASSIGNMENT_ID}
    packagePath="docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-27-dynamic-suffix-ment/reviewed-staging-package.json"
  />;
}
