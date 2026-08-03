import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { compileDynamicPrefixWordLabDecision } from "../lib/adle/morphology/dynamic-prefix-compiler-rollout";
import {
  DYNAMIC_PREFIX_PEDAGOGY_VERSION,
  validateDynamicPrefixWordLabPayload,
  type DynamicPrefixProfile,
  type PrefixChoiceAuditV1,
  type PrefixTeachingCardV1,
} from "../lib/adle/morphology/dynamic-prefix-contracts";
import { dynamicPrefixRuntime } from "../lib/adle/morphology/dynamic-prefix-runtime";
import { morphologyMeaningSortItems } from "../lib/adle/morphology/meaning-sort-items";
import { selectedPrefixFeedbackText } from "../lib/adle/morphology/prefix-teaching-feedback";
import { loadReviewedPrefixPackageFixtures, selectReviewedPrefixFixture } from "./lib/adle-reviewed-prefix-package-fixture";

type PedagogyManifestProfile = {
  microSkillKey: string;
  targetForms: string[];
  choiceForms: string[];
  meaningCheckKind: "meaning" | "prefix_form";
  meaningBins: DynamicPrefixProfile["meaningBins"];
  validChoiceAudit: PrefixChoiceAuditV1[];
};

type PedagogyManifest = {
  prefixDefinitions: PrefixTeachingCardV1[];
  profiles: PedagogyManifestProfile[];
};

const manifest = JSON.parse(
  readFileSync("docs/implementation/seed-data/teaching-dictionary/releases/2026-08-03-dynamic-prefix-pedagogy-v1/manifest.json", "utf8"),
) as PedagogyManifest;
const definitions = new Map<string, PrefixTeachingCardV1>(manifest.prefixDefinitions.map((entry) => [entry.text, entry]));
const expectedCounts = new Map<string, number>([
  ["D4_MOR_PREFIXES_UN", 16],
  ["D4_MOR_PREFIXES_DIS_MIS", 16],
  ["D4_MOR_PREFIXES_IN_IM_IL_IR", 20],
  ["D4_MOR_PREFIXES_RE_PRE", 16],
  ["D4_MOR_PREFIXES_SUB_INTER_SUPER", 18],
]);

for (const profileManifest of manifest.profiles) {
  const fixture = loadReviewedPrefixPackageFixtures().find((entry) => entry.profile.microSkillKey === profileManifest.microSkillKey)!;
  const teachingCards = profileManifest.targetForms.map((form) => definitions.get(form)!);
  const prefixChoices = profileManifest.choiceForms.map((form, index) => ({
    ...definitions.get(form)!,
    outcome: null,
    status: index === 0 ? "target" as const : "valid_alternative" as const,
    reviewedSource: "dynamic-prefix-pedagogy-v1",
  }));
  const profile: DynamicPrefixProfile = {
    ...fixture.profile,
    meaningBins: profileManifest.meaningBins,
    prefixChoices,
    pedagogy: {
      version: DYNAMIC_PREFIX_PEDAGOGY_VERSION,
      teachingCards,
      validChoiceAudit: profileManifest.validChoiceAudit,
      meaningCheckKind: profileManifest.meaningCheckKind,
      meaningResultsPresentation: "none",
      coverClosePolicy: { kind: "track_ratio", threshold: 0.8 },
    },
  };
  assert.equal(profile.pedagogy!.teachingCards.length, profileManifest.targetForms.length);
  assert.deepEqual(profile.pedagogy!.teachingCards.map((card) => card.text), profileManifest.targetForms);
  for (const card of profile.pedagogy!.teachingCards) {
    assert(card.label && card.meaning && card.rules.length, `${profile.microSkillKey}:${card.text}: complete teaching card`);
  }
  assert.equal(profileManifest.validChoiceAudit.length, 7);
  for (const word of fixture.words) {
    const audit = profileManifest.validChoiceAudit.find((entry) => entry.word === word.displayWord);
    assert(audit, `${profile.microSkillKey}:${word.displayWord}: reviewed choice audit`);
    assert.deepEqual(Object.keys(audit.choiceVerdicts), profileManifest.choiceForms);
    assert.deepEqual(Object.entries(audit.choiceVerdicts).filter(([, valid]) => valid).map(([form]) => form), [word.prefixText], `${profile.microSkillKey}:${word.displayWord}: exactly one reviewed valid choice`);
  }

  const selection = selectReviewedPrefixFixture(profile, fixture.words[0]!);
  const decision = compileDynamicPrefixWordLabDecision(selection, { mode: "shared_authoritative", sourceKind: "reviewed_fixture" });
  assert(decision.ok, `${profile.microSkillKey}: shared-authoritative pedagogy compilation ${decision.ok ? "" : `${decision.blockerCode}:${decision.sharedBlockerCodes?.join(",")}`}`);
  assert.equal(decision.metrics.legacyInvoked, false);
  assert.equal(decision.payload.presentationPolicyVersion, DYNAMIC_PREFIX_PEDAGOGY_VERSION);
  assert.equal(decision.sharedLesson?.assignmentBindings.length, expectedCounts.get(profile.microSkillKey));
  assert(validateDynamicPrefixWordLabPayload(decision.payload));
  const guided = decision.payload.activities.guided!;
  assert(guided.includeMeaningSort);
  assert.equal(guided.meaningCheckKind, profileManifest.meaningCheckKind);
  assert.equal(guided.meaningResultsPresentation, "none");
  if (profileManifest.meaningCheckKind === "prefix_form") {
    assert.equal(guided.splitCanonicalWordIds.length, 2);
    assert.equal(guided.builds.length, 4);
    assert.deepEqual(decision.payload.activities.meaningBins.map((bin) => bin.id), ["in", "im", "il", "ir"]);
  }
  for (const build of guided.builds) {
    assert(build.choices.length >= 3);
    assert.equal(new Set(build.choices.map((choice) => choice.text)).size, build.choices.length);
    assert.equal(build.choices.filter((choice) => choice.status === "target").length, 1);
    assert(profileManifest.targetForms.every((form) => build.choices.some((choice) => choice.text === form)));
    const target = build.choices.find((choice) => choice.status === "target")!;
    for (const selected of build.choices.filter((choice) => choice.status !== "target")) {
      const text = selectedPrefixFeedbackText({ label: selected.label, meaning: selected.meaning!, rules: selected.rules! });
      assert(text.endsWith("Try again."));
      assert.equal(text.split("\n")[0], `${selected.label} means “${selected.meaning}”.`);
      assert(!text.split("\n").some((line) => line.startsWith(`${target.label} means`)), `${profile.microSkillKey}: feedback must not describe target ${target.label}`);
      assert(!/The answer|Choose [a-z]+-/i.test(text));
      assert(!/null|undefined/.test(text));
    }
  }
  const runtime = dynamicPrefixRuntime(decision.payload)!;
  const introduction = runtime.activities.find((activity) => activity.type === "introduction")!;
  assert.equal(introduction.introScreens?.length, 3);
  assert.equal(introduction.introScreens?.[1]?.id, "teaching-cards");
  assert.deepEqual(introduction.introScreens?.[1]?.teachingCards?.map((card) => card.text), profileManifest.targetForms);
  const meaning = runtime.activities.find((activity) => activity.type === "meaning_sort")!;
  assert.equal(meaning.meaningResultsPresentation, "none");
  const sortItems = morphologyMeaningSortItems(runtime, meaning.meaningCheckKind ?? "meaning");
  if (meaning.meaningCheckKind === "prefix_form") {
    assert.deepEqual(sortItems.map((item) => item.text), runtime.words.lesson.map((word) => word.baseWord));
    assert.deepEqual(sortItems.map((item) => item.destination), runtime.words.lesson.map((word) => word.prefixText));
    assert(sortItems.every((item) => !profileManifest.targetForms.some((form) => item.text.startsWith(form))), "Prefix Form Sort tiles do not disclose the selected prefix");
  } else {
    assert.deepEqual(sortItems.map((item) => item.text), runtime.words.lesson.map((word) => word.displayWord));
    assert.deepEqual(sortItems.map((item) => item.destination), runtime.words.lesson.map((word) => word.effect));
  }
  assert.equal(runtime.activities.find((activity) => activity.type === "look_cover_write_check")?.coverClosePolicy?.threshold, 0.8);
  assert.deepEqual(runtime.activities.find((activity) => activity.type === "reflection")?.teachingCards, introduction.teachingCards);

  const jsonbNormalisedProfile: DynamicPrefixProfile = {
    ...profile,
    pedagogy: {
      ...profile.pedagogy!,
      validChoiceAudit: profile.pedagogy!.validChoiceAudit.map((audit) => ({
        ...audit,
        choiceVerdicts: Object.fromEntries(
          Object.entries(audit.choiceVerdicts).sort(([left], [right]) => left.localeCompare(right)),
        ),
      })),
    },
  };
  const jsonbDecision = compileDynamicPrefixWordLabDecision(
    selectReviewedPrefixFixture(jsonbNormalisedProfile, fixture.words[0]!),
    { mode: "shared_authoritative", sourceKind: "reviewed_fixture" },
  );
  assert(jsonbDecision.ok, `${profile.microSkillKey}: JSONB-normalised audit key order remains valid`);

  const expectBlocked = (candidate: DynamicPrefixProfile, label: string) => {
    const blocked = compileDynamicPrefixWordLabDecision(
      selectReviewedPrefixFixture(candidate, fixture.words[0]!),
      { mode: "shared_authoritative", sourceKind: "reviewed_fixture" },
    );
    assert.equal(blocked.ok, false, `${profile.microSkillKey}:${label} fails closed`);
  };
  expectBlocked({
    ...profile,
    prefixChoices: profile.prefixChoices.map((choice, index) => index === 0 ? { ...choice, meaning: null } : choice),
  }, "missing selectable meaning");
  expectBlocked({
    ...profile,
    prefixChoices: profile.prefixChoices.map((choice, index) => index === 0 ? { ...choice, reviewedSource: "" } : choice),
  }, "missing reviewed choice source");
  expectBlocked({
    ...profile,
    meaningBins: profile.meaningBins.map((bin, index) => index === 0 ? { id: bin.id, label: bin.label, description: bin.description } : bin),
  }, "missing selected-category mapping");
  expectBlocked({
    ...profile,
    pedagogy: {
      ...profile.pedagogy!,
      teachingCards: profile.pedagogy!.teachingCards.map((card, index) => index === 0 ? { ...card, rules: [] as unknown as [string, ...string[]] } : card),
    },
  }, "missing teaching rule");
  const selectedAudit = profile.pedagogy!.validChoiceAudit.find((audit) => audit.word === fixture.words[0]!.displayWord)!;
  const secondChoice = profileManifest.choiceForms.find((form) => form !== fixture.words[0]!.prefixText)!;
  expectBlocked({
    ...profile,
    pedagogy: {
      ...profile.pedagogy!,
      validChoiceAudit: profile.pedagogy!.validChoiceAudit.map((audit) => audit === selectedAudit
        ? { ...audit, choiceVerdicts: { ...audit.choiceVerdicts, [secondChoice]: true } }
        : audit),
    },
  }, "second valid answer");
}

const renderer = readFileSync("components/adle/morphology/morphology-guided-lesson.tsx", "utf8");
const teachingCardsRenderer = readFileSync("components/adle/morphology/prefix-teaching-cards.tsx", "utf8");
const loader = readFileSync("lib/adle/morphology/dynamic-prefix-profile-loader.ts", "utf8");
const release = readFileSync("scripts/adle-dynamic-prefix-pedagogy-release.ts", "utf8");
assert(renderer.includes('meaningResultsPresentation !== "none"'));
assert(renderer.includes('stage: "build" as const'));
assert(renderer.includes("Today we studied:"));
assert(renderer.includes("How does this prefix change a word’s meaning?"));
assert(renderer.includes("How do these prefixes change the words’ meanings?"));
assert(renderer.includes("Take a moment to think of one rule to remember next time."));
assert(teachingCardsRenderer.includes('props.cards.length === 3'));
assert(teachingCardsRenderer.includes('md:grid-cols-2 lg:grid-cols-3'), "three-card Prefix teaching sets remain visible in one desktop row");
assert(loader.includes("usesTeachingCardIntroduction"), "teaching-card packages supersede legacy blended-example counts");
assert(release.includes("service_role_atomic_upsert"));
assert(release.includes("if (profilesChanged) await atomicServiceProfileUpsert(client, beforeRows)"), "service-role release restores all five rows after a failed release");
assert(release.includes("if (insertedBatch)"), "service-role release removes a newly inserted batch after a failed release");
assert.equal((release.match(/Release batch identity already exists with different immutable content\./g) ?? []).length, 2, "both database access paths reject a reused batch identity with a different package hash");

console.log("PASS: Dynamic Prefix pedagogy cards, reviewed choices, selected feedback, form sort, result suppression, reflection, and shared-authoritative counts");
