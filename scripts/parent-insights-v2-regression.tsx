import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { V2InsightsWorkspace } from "../app/(authenticated)/insights/v2-workspace";
import { calculateProficiencyV2 } from "../lib/adle/proficiency/v2";

const result = calculateProficiencyV2({ learnerId: "child-a", skillKey: "D4_PAT_EXAMPLE", familyKey: "D4_PAT",
  asOf: "2026-10-23", requiredGroupKeys: ["family-a"], evidence: [], unscoredCount: 0,
  unresolvedGroupCount: 0, relationshipFingerprint: "relationship", evidenceFingerprint: "evidence", groupFingerprint: "groups" });
const html = renderToStaticMarkup(<V2InsightsWorkspace skills={[{ key: "D4_PAT_EXAMPLE", label: "Example pattern",
  familyKey: "D4_PAT", familyLabel: "Patterns", clusterKey: "cluster-a", clusterLabel: "Example cluster",
  evidenceWords: [], result }]} words={[{ id: "word-a", word: "example", state: "review_retired",
  slipped: false, productions: 4, distinctDays: 3, verifiedAuthenticUses: 0,
  reviewStatus: "Exited Review", nextReview: "No Review action due" }]} reviewSlot={null} />);
assert.match(html, /Micro-skill proficiency/);
assert.match(html, /Example cluster/);
assert.match(html, /Select L1–L5/);
assert.match(html, /Example pattern, Level 5: not yet achieved/);
assert.match(html, /Word mastery/);
assert.match(html, /Ready to discover/);
assert.match(html, /Exited Review/);
assert.doesNotMatch(html, /Level 1\/5/);
console.log("Parent Insights V2 regression passed");
