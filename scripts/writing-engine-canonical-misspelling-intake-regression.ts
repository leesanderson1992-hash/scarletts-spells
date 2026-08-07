import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { DetectedMisspelling } from "../lib/spelling/detectMisspellings";
import { tokenizeText } from "../lib/spelling/tokenize";
import {
  mergeHeuristicAndCanonicalMisspellings,
  type ResolverVisibleCanonicalMisspellingMapping,
} from "../lib/writing-engine/spelling/canonical-misspelling-intake";

function mapping(input: {
  id: string;
  misspelling: string;
  correction: string;
  microSkillKey?: string;
}): ResolverVisibleCanonicalMisspellingMapping {
  return {
    mappingId: input.id,
    misspellingNormalized: input.misspelling,
    correctSpellingNormalized: input.correction,
    microSkillKey: input.microSkillKey ?? "D4_TEST",
    dialectCode: "en-GB",
    normalizationVersion: "spelling_normalize_v1",
    authorityReference: `canonical_mapping:${input.id}`,
  };
}

function heuristic(
  text: string,
  correction: string,
): DetectedMisspelling {
  const token = tokenizeText(text)[0]!;
  return {
    token,
    misspelling: token.normalized,
    correction,
    confidence: 0.75,
    errorPattern: null,
    category: "Irregular/tricky memory word",
    secondaryCategory: null,
    wordFamilyId: null,
  };
}

{
  const text = "I want to wosh at the jym wen";
  const tokens = tokenizeText(text);
  const result = mergeHeuristicAndCanonicalMisspellings({
    tokens,
    heuristicMisspellings: [],
    canonicalMappings: [
      mapping({ id: "wosh-map", misspelling: "wosh", correction: "wash" }),
      mapping({ id: "jym-map", misspelling: "jym", correction: "gym" }),
      mapping({ id: "wen-map", misspelling: "wen", correction: "when" }),
    ],
  });

  assert.deepEqual(
    result.map((row) => [row.misspelling, row.correction, row.token.start, row.token.end]),
    [
      ["wosh", "wash", 10, 14],
      ["jym", "gym", 22, 25],
      ["wen", "when", 26, 29],
    ],
  );
  assert(result.every((row) => row.detectionSource === "resolver_visible_canonical"));
  assert.deepEqual(result[0]?.canonicalProvenance?.canonicalMappingIds, ["wosh-map"]);
}

{
  const text = "wosh wosh";
  const tokens = tokenizeText(text);
  const result = mergeHeuristicAndCanonicalMisspellings({
    tokens,
    heuristicMisspellings: [],
    canonicalMappings: [
      mapping({ id: "wosh-map", misspelling: "wosh", correction: "wash" }),
    ],
  });

  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((row) => [row.token.start, row.token.end]),
    [
      [0, 4],
      [5, 9],
    ],
  );
}

{
  const tokens = tokenizeText("wurd");
  const result = mergeHeuristicAndCanonicalMisspellings({
    tokens,
    heuristicMisspellings: [heuristic("wurd", "word")],
    canonicalMappings: [
      mapping({ id: "canonical-wurd", misspelling: "wurd", correction: "weird" }),
    ],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.correction, "weird");
  assert.equal(result[0]?.detectionSource, "resolver_visible_canonical");
}

{
  const tokens = tokenizeText("speling");
  const result = mergeHeuristicAndCanonicalMisspellings({
    tokens,
    heuristicMisspellings: [heuristic("speling", "spelling")],
    canonicalMappings: [],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.correction, "spelling");
  assert.equal(result[0]?.detectionSource, "heuristic");
}

{
  const tokens = tokenizeText("wurd");
  const result = mergeHeuristicAndCanonicalMisspellings({
    tokens,
    heuristicMisspellings: [heuristic("wurd", "word")],
    canonicalMappings: [
      mapping({ id: "word-map", misspelling: "wurd", correction: "word" }),
      mapping({ id: "weird-map", misspelling: "wurd", correction: "weird" }),
    ],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.correction, "word");
  assert.equal(result[0]?.detectionSource, "heuristic");
}

{
  const tokens = tokenizeText("wosh");
  const result = mergeHeuristicAndCanonicalMisspellings({
    tokens,
    heuristicMisspellings: [],
    canonicalMappings: [
      mapping({
        id: "route-1",
        misspelling: "wosh",
        correction: "wash",
        microSkillKey: "D4_ROUTE_1",
      }),
      mapping({
        id: "route-2",
        misspelling: "wosh",
        correction: "wash",
        microSkillKey: "D4_ROUTE_2",
      }),
    ],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.correction, "wash");
  assert.equal(result[0]?.canonicalProvenance?.microSkillKey, null);
  assert.deepEqual(result[0]?.canonicalProvenance?.microSkillKeys, [
    "D4_ROUTE_1",
    "D4_ROUTE_2",
  ]);
}

{
  const tokens = tokenizeText("your");
  const result = mergeHeuristicAndCanonicalMisspellings({
    tokens,
    heuristicMisspellings: [],
    canonicalMappings: [
      mapping({ id: "context-map", misspelling: "your", correction: "youre" }),
    ],
  });

  assert.deepEqual(result, []);
}

const migration = readFileSync(
  "supabase/migrations/20260807130000_add_canonical_misspelling_intake.sql",
  "utf8",
);
const legacyAnalysis = readFileSync(
  "lib/writing-engine/spelling/legacy-analysis.ts",
  "utf8",
);

assert.match(migration, /automatic_detection_eligibility[\s\S]*token_safe/);
assert.match(migration, /mapping_status = 'active'/);
assert.match(migration, /resolver_visibility_status = 'visible'/);
assert.match(migration, /event_type = 'resolver_visibility_enabled'/);
assert.match(migration, /mastery_domain_key = 'D4'/);
assert.match(migration, /is_active = true/);
assert.match(migration, /is_assignable = true/);
assert.match(migration, /replace_misspelling_analysis_atomic/);
assert.match(migration, /for update/);
assert.match(migration, /on conflict \(id\) do update/);
assert.doesNotMatch(legacyAnalysis, /\.delete\(\)[\s\S]*misspelling_instances/);
assert.match(legacyAnalysis, /tokenizeText\(analysisText\)/);
assert.match(legacyAnalysis, /mergeHeuristicAndCanonicalMisspellings/);
assert.match(legacyAnalysis, /replace_misspelling_analysis_atomic/);

console.log("Canonical misspelling intake regression passed.");
