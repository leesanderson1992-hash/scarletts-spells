import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { gatePassageFindings, passageRequestBody, planPassageWindows } from
  "../lib/writing-engine/whole-writing/context-passage-scan";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const text = "A fox crossed the moor. It went threw the gate. 🦊";
const fieldHash = hash(JSON.stringify(text));
const windows = planPassageWindows({ fields: [{ path: "/rawSubmissionText", hash: fieldHash, text }] });
assert(windows && windows.length === 1);
const window = windows[0];
const start = text.indexOf("threw"), end = start + "threw".length;
const occurrence = { id: "occurrence-1", fieldKey: "/rawSubmissionText", textHash: fieldHash,
  start, end, observedText: "threw", provenance: "learner_response" };
const valid = gatePassageFindings({ case_id: window.caseId, findings: [{ start_utf16: start,
  end_utf16: end, observed: "threw", correction: "through" }] }, window, [occurrence]);
assert.deepEqual(valid.findings?.map((finding) => [finding.occurrenceId, finding.startUtf16,
  finding.endUtf16, finding.correction]), [["occurrence-1", start, end, "through"]]);
assert.equal(gatePassageFindings({ case_id: window.caseId, findings: [{ start_utf16: start + 1,
  end_utf16: end, observed: "hrew", correction: "through" }] }, window, [occurrence]).findings, null);
assert.equal(gatePassageFindings({ case_id: window.caseId, findings: [{ start_utf16: start,
  end_utf16: end, observed: "threw", correction: "through" }, { start_utf16: start,
  end_utf16: end, observed: "threw", correction: "through" }] }, window, [occurrence]).findings, null);
assert.equal(planPassageWindows({ fields: [{ path: "/rawSubmissionText", hash: "0".repeat(64), text }] }), null);
assert.equal(planPassageWindows({ fields: [{ path: "/rawSubmissionText", hash: hash(JSON.stringify("x ".repeat(4000))),
  text: "x ".repeat(4000) }] }), null, "overlong work fails closed without a partial scan");
const body = JSON.parse(passageRequestBody(window));
assert.equal(body.store, false);
assert.equal(body.service_tier, "default");
assert.deepEqual(body.prompt_cache_options, { mode: "explicit" });
assert.equal(JSON.stringify(body).includes("parent_user_id"), false);
assert.equal(JSON.stringify(body).includes("child_id"), false);
console.log("PASS: bounded passage scan, exact UTF-16 occurrence gate, no partial long scan and minimal request");
