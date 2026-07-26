import assert from "node:assert/strict";
import { selectTransferWords } from "../lib/adle/transfer-selector-profile";

const active = { rowStatus: "active" as const, reviewStatus: "approved_for_first_exposure" };
const profile = { microSkillKey: "D4_INF_ING_ENDINGS_REGULAR", selectorKind: "affix" as const, featureType: "suffix" as const, featureKey: "ing", permittedTransformations: ["double_final_consonant"], requiredTransferWords: 2, allowedAgeBands: ["upper_primary"], ...active };
const result = selectTransferWords({ profile, childAgeBand: "upper_primary", take: 2, excludedCanonicalWordIds: new Set(["authentic"]), morphology: [
  { canonicalWordId: "running", featureKeys: ["suffix:ing"], transformations: ["double_final_consonant"], analysisStatus: "approved" as const, ...active },
  { canonicalWordId: "swimming", featureKeys: ["suffix:ing"], transformations: ["double_final_consonant"], analysisStatus: "approved" as const, ...active },
  { canonicalWordId: "hoping", featureKeys: ["suffix:ing"], transformations: ["drop_final_e"], analysisStatus: "approved" as const, ...active },
] });
assert.deepEqual(result, { ok: true, canonicalWordIds: ["running", "swimming"] });
const unavailable = selectTransferWords({ profile: undefined, childAgeBand: "upper_primary", take: 1, excludedCanonicalWordIds: new Set(), morphology: [] });
assert.equal(unavailable.ok, false); if (!unavailable.ok) assert.equal(unavailable.reason, "transfer_profile_unavailable");
const insufficient = selectTransferWords({ profile, childAgeBand: "upper_primary", take: 2, excludedCanonicalWordIds: new Set(), morphology: [{ canonicalWordId: "visible", featureKeys: ["base:vis"], transformations: [], analysisStatus: "approved", ...active }] });
assert.equal(insufficient.ok, false); if (!insufficient.ok) assert.equal(insufficient.reason, "insufficient_transfer_words");
console.log("ADLE transfer selector profile regression passed");
