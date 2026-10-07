import assert from "node:assert/strict";

import { isBulkResolutionEligible } from "../app/(authenticated)/admin/canonical-mappings/bulk-resolution";
import { parseResolutionFilters, resolutionHref } from "../app/(authenticated)/admin/canonical-mappings/resolution-read-model";

const base = {
  status: "pending", resolverEnabled: false, mappingId: null,
  mappingStatus: null, visibilityStatus: null, skillReady: true,
};

assert.equal(parseResolutionFilters({}).size, 25);
assert.equal(parseResolutionFilters({ size: "50" }).size, 50);
assert.equal(parseResolutionFilters({ size: "500" }).size, 25);
assert.equal(resolutionHref(parseResolutionFilters({ q: "receive", size: "50", page: "2" })),
  "/admin/canonical-mappings?q=receive&size=50&page=2");

assert.equal(isBulkResolutionEligible("confirm", base), true);
assert.equal(isBulkResolutionEligible("confirm", { ...base, skillReady: false }), false);
assert.equal(isBulkResolutionEligible("confirm", { ...base, status: "confirmed" }), false);
assert.equal(isBulkResolutionEligible("noSkill", base), true);
assert.equal(isBulkResolutionEligible("noSkill", { ...base, mappingId: "mapping", mappingStatus: "active" }), false);
assert.equal(isBulkResolutionEligible("noSkill", { ...base, mappingId: "mapping", mappingStatus: "disabled",
  visibilityStatus: "disabled" }), true);
assert.equal(isBulkResolutionEligible("activate", { ...base, status: "confirmed", mappingId: "mapping",
  mappingStatus: "active", visibilityStatus: "hidden" }), true);
assert.equal(isBulkResolutionEligible("activate", { ...base, status: "confirmed", mappingId: "mapping",
  mappingStatus: "active", visibilityStatus: "visible", resolverEnabled: true }), false);

console.log("canonical-resolver-bulk-regression: ok");
