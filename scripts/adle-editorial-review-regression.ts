import assert from "node:assert/strict";
import { hasCurrentEditorialReview } from "../lib/teaching-dictionary-manager/editorial-review";

assert.equal(hasCurrentEditorialReview(undefined, undefined), false, "missing review and fingerprint cannot imply sign-off");
assert.equal(hasCurrentEditorialReview(undefined, "current"), false, "unreviewed content is blocked");
assert.equal(hasCurrentEditorialReview({ dictionary_fingerprint: "old" }, "current"), false, "edited dictionary facts invalidate sign-off");
assert.equal(hasCurrentEditorialReview({ dictionary_fingerprint: "current" }, "current"), true, "the exact current review remains valid");
console.log("ADLE editorial review regression passed");
