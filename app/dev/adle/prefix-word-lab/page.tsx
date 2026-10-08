import Link from "next/link";
import { notFound } from "next/navigation";

import type { AdleSessionItem } from "@/lib/adle/loaders/daily-plan-surface";
import type { ComposedDailyPlan, DailyPlanFacts } from "@/lib/adle/daily-assignment-composer";
import { canOpenAdleDesignPreview } from "@/lib/adle/design-preview-access";
import { buildDynamicPrefixAssignmentPlan } from "@/lib/adle/morphology/dynamic-prefix-assignment-plan";
import { compileDynamicPrefixWordLabDecision } from "@/lib/adle/morphology/dynamic-prefix-compiler-rollout";
import { dynamicPrefixRuntime } from "@/lib/adle/morphology/dynamic-prefix-runtime";
import type { DynamicPrefixProfile, PrefixChoiceAuditV1, PrefixTeachingCardV1 } from "@/lib/adle/morphology/dynamic-prefix-contracts";
import { loadReviewedPrefixPackageFixturesFromData, selectReviewedPrefixFixture } from "@/scripts/lib/adle-reviewed-prefix-package-fixture";
import reviewed from "@/docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-d4-dynamic-prefix-staging-enrichment/reviewed-staging-package.json";
import rePreCorrection from "@/docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-d4-dynamic-prefix-staging-enrichment/re-pre-staging-correction-package.json";
import subInterSuperCorrection from "@/docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-d4-dynamic-prefix-staging-enrichment/sub-inter-super-child-feedback-correction-package.json";
import unRelease from "@/docs/implementation/seed-data/teaching-dictionary/releases/2026-08-02-dynamic-prefix-un-profile-v1/manifest.json";
import pedagogyManifest from "@/docs/implementation/seed-data/teaching-dictionary/releases/2026-08-03-dynamic-prefix-pedagogy-v1/manifest.json";

import { PrefixWordLabPreview } from "./preview";

export const dynamic = "force-dynamic";

const FAMILIES = [
  { slug: "un", label: "un-", key: "D4_MOR_PREFIXES_UN" },
  { slug: "dis-mis", label: "dis- / mis-", key: "D4_MOR_PREFIXES_DIS_MIS" },
  { slug: "in-family", label: "in- / im- / il- / ir-", key: "D4_MOR_PREFIXES_IN_IM_IL_IR" },
  { slug: "re-pre", label: "re- / pre-", key: "D4_MOR_PREFIXES_RE_PRE" },
  { slug: "sub-inter-super", label: "sub- / inter- / super-", key: "D4_MOR_PREFIXES_SUB_INTER_SUPER" },
] as const;

type PedagogyProfile = {
  microSkillKey: string;
  targetForms: string[];
  choiceForms: string[];
  meaningCheckKind: "meaning" | "prefix_form";
  meaningBins: DynamicPrefixProfile["meaningBins"];
  validChoiceAudit: PrefixChoiceAuditV1[];
};

export default async function PrefixWordLabPreviewPage(props: { searchParams: Promise<{ family?: string }> }) {
  if (!canOpenAdleDesignPreview()) notFound();
  const requested = (await props.searchParams).family;
  const family = FAMILIES.find((candidate) => candidate.slug === requested) ?? FAMILIES[0];
  const reviewedFixtures = loadReviewedPrefixPackageFixturesFromData({
    reviewed,
    corrections: {
      D4_MOR_PREFIXES_RE_PRE: rePreCorrection,
      D4_MOR_PREFIXES_SUB_INTER_SUPER: subInterSuperCorrection,
    },
    unRelease,
  });
  const fixture = reviewedFixtures.find((candidate) => candidate.profile.microSkillKey === family.key);
  const manifestProfile = (pedagogyManifest.profiles as PedagogyProfile[]).find((candidate) => candidate.microSkillKey === family.key);
  const definitions = new Map((pedagogyManifest.prefixDefinitions as PrefixTeachingCardV1[]).map((card) => [card.text, card]));
  if (!fixture || !manifestProfile) throw new Error(`Missing reviewed prefix fixture: ${family.key}`);
  const teachingCards = manifestProfile.targetForms.map((form) => definitions.get(form)!);
  const profile: DynamicPrefixProfile = {
    ...fixture.profile,
    meaningBins: manifestProfile.meaningBins,
    prefixChoices: manifestProfile.choiceForms.map((form, index) => ({
      ...definitions.get(form)!,
      outcome: null,
      status: index === 0 ? "target" as const : "valid_alternative" as const,
      reviewedSource: "dynamic-prefix-pedagogy-v1",
    })),
    pedagogy: {
      version: "dynamic_prefix_pedagogy_v1",
      teachingCards,
      validChoiceAudit: manifestProfile.validChoiceAudit,
      meaningCheckKind: manifestProfile.meaningCheckKind,
      meaningResultsPresentation: "none",
      coverClosePolicy: { kind: "track_ratio", threshold: 0.8 },
    },
  };
  const selection = selectReviewedPrefixFixture(profile, fixture.words[0]);
  const decision = compileDynamicPrefixWordLabDecision(selection, { mode: "shared_authoritative", sourceKind: "reviewed_fixture" });
  if (!decision.ok) throw new Error(`Prefix preview blocked: ${family.key}:${decision.blockerCode}`);
  const runtime = dynamicPrefixRuntime(decision.payload);
  if (!runtime) throw new Error(`Prefix preview runtime blocked: ${family.key}`);
  const assignmentId = `dev-prefix-${family.slug}-full-lesson`;
  const plan = buildDynamicPrefixAssignmentPlan({
    basePlan: {
      childId: "dev-prefix-child",
      planDate: "2026-10-08",
      composerPolicyVersion: "dev",
      schedulePolicyVersion: "dev",
      throttle: {},
      partOne: {},
      partTwo: {},
      budget: { budgetResponses: 0, estimatedResponses: 0, guidedWordCount: 0, introTrimmed: false, trims: [] },
    } as unknown as ComposedDailyPlan,
    facts: {} as DailyPlanFacts,
    selection,
    payload: decision.payload,
  });
  const items: AdleSessionItem[] = plan.partTwo.sections.flatMap((section) =>
    section.items.map((item, index) => ({
      id: `dev-prefix-item-${section.sectionKey}-${index}`,
      sourceEntityId: `dev-prefix-item-${section.sectionKey}-${index}`,
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

  return <main className="brand-shell min-h-screen px-4 py-2 sm:px-6">
    <div className="prefix-preview-stack grid gap-2">
      <nav className="flex flex-wrap items-center gap-2" aria-label="Prefix lesson families">
        <span className="brand-eyebrow mr-2">Prefix Word Lab</span>
        {FAMILIES.map((option) => <Link key={option.slug} href={`/dev/adle/prefix-word-lab?family=${option.slug}`} aria-current={family.slug === option.slug ? "page" : undefined} className="prefix-family-link rounded-full border px-3 py-2 text-sm font-black">{option.label}</Link>)}
      </nav>
      <PrefixWordLabPreview assignmentId={assignmentId} familyLabel={family.label} items={items} payload={runtime} />
    </div>
  </main>;
}
