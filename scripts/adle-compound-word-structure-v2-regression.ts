import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  adaptClosedCompoundWordV1ToV2,
  deriveCompoundWordDisplayClassification,
  reconstructCompoundWordV2,
  validateCompoundWordStructureV2,
  type CompoundWordJoinKind,
  type CompoundWordStructureV2,
} from "../lib/adle/morphology/compound-word-structure-v2";
import type { ClosedCompoundWord } from "../lib/adle/morphology/closed-compound-word-lab";

const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
] as const;

function structure(input: {
  wholeWord: string;
  surfaces: readonly string[];
  joins: readonly CompoundWordJoinKind[];
  microSkillKey?: CompoundWordStructureV2["microSkillKey"];
}): CompoundWordStructureV2 {
  return {
    schemaVersion: 2,
    wholeCanonicalWordId: ids[0],
    microSkillKey:
      input.microSkillKey ?? "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS",
    wholeWord: input.wholeWord,
    components: input.surfaces.map((displaySurface, index) => ({
      ordinal: index + 1,
      canonicalWordId: ids[index + 1] ?? ids[3],
      displaySurface,
      meaning: `reviewed meaning for ${displaySurface}`,
      sense: null,
    })),
    joins: input.joins.map((kind, index) => ({ ordinal: index + 1, kind })),
    childFriendlyMeaning: `reviewed meaning for ${input.wholeWord}`,
    componentToWholeRelationship: "Reviewed relationship between the components and whole.",
    morphologyProvenance: { source: "CW-1 regression" },
    assignmentEligible: false,
    transferEligible: false,
    review: {
      status: "approved_for_first_exposure",
      reviewedBy: "CW-1 regression reviewer",
      reviewedAt: "2026-08-11T00:00:00.000Z",
    },
    source: {
      artifact: "scripts/adle-compound-word-structure-v2-regression.ts",
      sourceRowHash: "reviewed-row-hash",
      sheet: null,
      row: 1,
    },
  };
}

const closed = structure({
  wholeWord: "sunflower",
  surfaces: ["sun", "flower"],
  joins: ["none"],
});
const open = structure({
  wholeWord: "ice cream",
  surfaces: ["ice", "cream"],
  joins: ["space"],
  microSkillKey: "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED",
});
const hyphenated = structure({
  wholeWord: "twenty-one",
  surfaces: ["twenty", "one"],
  joins: ["hyphen"],
  microSkillKey: "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED",
});
const multipart = structure({
  wholeWord: "mother-in-law",
  surfaces: ["mother", "in", "law"],
  joins: ["hyphen", "hyphen"],
  microSkillKey: "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED",
});

for (const candidate of [closed, open, hyphenated, multipart]) {
  assert(validateCompoundWordStructureV2(candidate).ok, `${candidate.wholeWord} is valid v2`);
}
assert.equal(deriveCompoundWordDisplayClassification(closed.joins), "closed");
assert.equal(deriveCompoundWordDisplayClassification(open.joins), "open");
assert.equal(deriveCompoundWordDisplayClassification(hyphenated.joins), "hyphenated");
assert.equal(reconstructCompoundWordV2(closed.components, closed.joins), "sunflower");
assert.equal(reconstructCompoundWordV2(open.components, open.joins), "ice cream");
assert.equal(
  reconstructCompoundWordV2(hyphenated.components, hyphenated.joins),
  "twenty-one",
);
assert.equal(
  reconstructCompoundWordV2(multipart.components, multipart.joins),
  "mother-in-law",
);
assert.deepEqual(
  multipart.components.map((component) => component.displaySurface),
  ["mother", "in", "law"],
  "component ordering remains source order",
);

const badCardinality = validateCompoundWordStructureV2({ ...multipart, joins: [] });
assert(!badCardinality.ok && badCardinality.blockers.includes("join_count_invalid"));
const missingIdentity = validateCompoundWordStructureV2({
  ...closed,
  components: [{ ...closed.components[0], canonicalWordId: "" }, closed.components[1]],
});
assert(
  !missingIdentity.ok &&
    missingIdentity.blockers.includes("component_canonical_word_id_missing"),
  "publication-grade structure refuses a missing component identity",
);
const unstableOrder = validateCompoundWordStructureV2({
  ...closed,
  components: [{ ...closed.components[0], ordinal: 2 }, closed.components[1]],
});
assert(!unstableOrder.ok && unstableOrder.blockers.includes("component_order_invalid"));
const unsupportedJoin = validateCompoundWordStructureV2({
  ...closed,
  joins: [{ ordinal: 1, kind: "slash" }],
});
assert(!unsupportedJoin.ok && unsupportedJoin.blockers.includes("join_kind_invalid"));
const missingSenseField = validateCompoundWordStructureV2({
  ...closed,
  components: [{ ...closed.components[0], sense: undefined }, closed.components[1]],
});
assert(
  !missingSenseField.ok && missingSenseField.blockers.includes("component_sense_invalid"),
  "the unknown-value validator does not cast an incomplete component into v2",
);

const v1: ClosedCompoundWord = {
  canonicalWordId: ids[0],
  displayWord: "sunflower",
  firstWord: "sun",
  secondWord: "flower",
  firstWordMeaning: "the bright star in the sky",
  secondWordMeaning: "the part of a plant that blooms",
  childFriendlyDefinition: "a tall plant with a large yellow flower",
  audioText: "A sunflower grew in the garden.",
  dictationSentence: "A sunflower grew in the garden.",
  dictationTargetTokenIndex: 1,
  parts: [
    { id: "part_1", text: "sun", sourceText: "sun", role: "base", start: 0, end: 3 },
    {
      id: "part_2",
      text: "flower",
      sourceText: "flower",
      role: "base",
      start: 3,
      end: 9,
    },
  ],
  joins: [{ afterPartId: "part_1", beforePartId: "part_2", joinType: "none" }],
  trueMorphology: {
    parts: [
      { id: "part_1", text: "sun", sourceText: "sun", role: "base", start: 0, end: 3 },
      {
        id: "part_2",
        text: "flower",
        sourceText: "flower",
        role: "base",
        start: 3,
        end: 9,
      },
    ],
    joins: [{ afterPartId: "part_1", beforePartId: "part_2", joinType: "none" }],
    transformations: [],
    notes: "Historical closed v1 fixture.",
    provenance: { source: "closed-v1" },
  },
  approvedTransfer: true,
};
const adapted = adaptClosedCompoundWordV1ToV2(v1, {
  componentCanonicalWordIds: [ids[1], ids[2]],
  componentToWholeRelationship:
    "The whole names a flower associated with the sun by its shape and appearance.",
  review: closed.review,
  source: closed.source,
});
assert(adapted.ok, "closed v1 remains readable through the governed v2 adapter");
assert.equal(adapted.ok ? adapted.structure.wholeWord : null, "sunflower");
const incompleteAdaptation = adaptClosedCompoundWordV1ToV2(v1, {
  componentCanonicalWordIds: [ids[1], ""],
  componentToWholeRelationship: "",
  review: closed.review,
  source: closed.source,
});
assert(!incompleteAdaptation.ok, "the v1 adapter never invents missing v2 authority");

const artifact = JSON.parse(
  readFileSync(
    "data/adle/review/d4-mor/v2/compound-word-v2-readiness-review.json",
    "utf8",
  ),
) as {
  summary: Record<string, number>;
  rows: Array<{
    whole_word: string;
    component_count: number;
    publication_ready: boolean;
    component_to_whole_relationship: string | null;
  }>;
};
assert.equal(artifact.summary.reviewed_words, 14);
assert.equal(artifact.summary.complete_canonical_component_identity, 6);
assert.equal(artifact.summary.publication_ready, 0);
assert.equal(artifact.summary.human_review_required, 14);
assert(artifact.rows.every((row) => !row.publication_ready));
assert(artifact.rows.every((row) => row.component_to_whole_relationship === null));
assert.equal(
  artifact.rows.find((row) => row.whole_word === "mother-in-law")?.component_count,
  3,
);

const migration = readFileSync(
  "supabase/migrations/20260811130000_add_general_compound_word_structure_v2.sql",
  "utf8",
);
assert(migration.includes("canonical_teaching_dictionary_compound_structures_v2"));
assert(migration.includes("canonical_teaching_dictionary_compound_components_v2"));
assert(migration.includes("canonical_teaching_dictionary_compound_joins_v2"));
assert(migration.includes("deferrable initially deferred"));
assert(!migration.includes("insert into"), "CW-1 migration publishes no curriculum rows");
assert(
  !migration.includes("alter table public.canonical_teaching_dictionary_compound_facts"),
  "historical closed v1 authority remains untouched",
);
const routeRegistry = readFileSync("lib/adle/curriculum-readiness/route-registry.ts", "utf8");
assert(routeRegistry.includes('routeId: "closed_compound_word_lab"'));
assert(routeRegistry.includes('routeId: "compound_word_lab"'));
assert(routeRegistry.includes('skillClusterKeys: ["D4_MOR_COMPOUND_WORDS"]'));
assert(routeRegistry.match(/routeId: "compound_word_lab"[\s\S]*?newAssignmentCapable: true/));

console.log("general Compound Word structure v2 regression passed");
