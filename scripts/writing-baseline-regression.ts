import assert from "node:assert/strict";
import { runBaseline } from "../lib/writing-engine/baseline/analyse";
import { adaptBaselineSource, anchorOccurrence, sourceInputFromRecords } from "../lib/writing-engine/baseline/source";
import { writingBaselineCases } from "./fixtures/writing-baseline-cases";

const before = JSON.stringify(writingBaselineCases);
const reports = runBaseline(writingBaselineCases);
assert.equal(JSON.stringify(writingBaselineCases), before, "input remains unchanged");
const byId = (id: string) => reports.find((report) => report.caseId === id)!;

assert.equal(byId("missed-runing").labelled[0].outcome, "MISSED_MISSPELLING");
assert.equal(byId("missed-recieve").labelled[0].outcome, "MISSED_MISSPELLING");
assert.equal(byId("detected-becuase").labelled[0].outcome, "DETECTED");
assert.ok(!byId("detected-becuase").legacyAuthenticUseTokens.includes("becuase"));
assert.equal(byId("valid-control").labelled[0].outcome, "NO_FALSE_POSITIVE");
const mixed = byId("mixed-context");
assert.equal(mixed.labelled[0].outcome, "NOT_ASSESSED");
assert.equal(mixed.fields[0].occurrences.filter((item) => item.observedText === "too").length, 2);
assert.equal(mixed.legacyAuthenticUseTokens.filter((word) => word === "too").length, 1);

const unicode = byId("unicode-and-contractions");
assert.equal(unicode.fields[0].rawText, "  🐕 They’re ready. They're at the café. Cafe\u0301 is open.  \n");
assert.equal(unicode.fields[0].occurrences[0].start, 5, "UTF-16 offset after emoji");
assert.ok(unicode.fields[0].occurrences.some((item) => item.observedText === "Cafe\u0301"));
assert.ok(unicode.fields[0].tokenisationDifferences.some((item) => item.observedText === "They’re" && item.authenticUseTokens.join("|") === "they|re"));
assert.throws(() => anchorOccurrence(unicode.source, "sample_text", 2, 3), /surrogate/);

const fields = byId("field-provenance");
assert.equal(fields.source.promptText, "Use the word running.");
assert.equal(fields.fields.find((field) => field.key === "answer")!.rawText, "  runing\n");
assert.equal(fields.fields.find((field) => field.key === "prompt")!.selectedForBaseline, false);
assert.equal(fields.fields.find((field) => field.key === "choice")!.selectedForBaseline, false);
assert.equal(fields.fields.find((field) => field.key === "empty")!.rawText, "  ");
assert.ok(!fields.legacyAuthenticUseTokens.includes("copy"));
assert.equal(fields.summary.selectedFields, 2);
assert.equal(fields.labelled[0].start, 2);
assert.ok(Object.isFrozen(fields.source));
assert.ok(Object.isFrozen(fields.source.fields));
assert.ok(Object.isFrozen(fields.source.fields[0]));

for (const report of reports) {
  assert.equal(report.qualification, "NOT_QUALIFIED");
  assert.equal(report.summary.contextNotAssessed, report.summary.occurrences);
  assert.equal(report.summary.aiCalls, 0);
  assert.ok(Number.isFinite(report.summary.processingMs));
  for (const field of report.fields) {
    for (const occurrence of field.occurrences) {
      assert.equal(field.rawText.slice(occurrence.start, occurrence.end), occurrence.observedText);
      assert.equal(occurrence.contextStatus, "NOT_ASSESSED");
    }
  }
}
const stable = (values: typeof reports) => values.map((report) => ({ ...report, summary: { ...report.summary, processingMs: 0 } }));
assert.deepEqual(stable(runBaseline(writingBaselineCases)), stable(reports), "replay differs only by timing");
const repeated = byId("repeated-occurrences").fields[0].occurrences;
assert.equal(new Set(repeated.map((item) => item.id)).size, 3);

const original = writingBaselineCases[0];
const reinterpreted = runBaseline([{ ...original, expectations: [{ ...original.expectations![0], intendedWord: "ruining" }] }])[0];
assert.equal(reinterpreted.labelled[0].occurrenceId, byId("missed-runing").labelled[0].occurrenceId);
const changedPrompt = runBaseline([{ ...original, source: { ...original.source, promptText: "Another prompt" } }])[0];
assert.equal(changedPrompt.fields[0].occurrences[0].id, byId("missed-runing").fields[0].occurrences[0].id);
const revised = runBaseline([{ ...original, source: { ...original.source, revision: "2" } }])[0];
assert.notEqual(revised.fields[0].occurrences[0].id, byId("missed-runing").fields[0].occurrences[0].id);
const changedText = runBaseline([{ id: "changed", source: { kind: "writing_sample", sourceId: original.source.sourceId, revision: "1", sampleText: "I was running home." } }])[0];
assert.notEqual(changedText.fields[0].occurrences[0].id, byId("missed-runing").fields[0].occurrences[0].id, "content hash protects against reused revisions");
const unlabelled = runBaseline([{ ...original, expectations: [] }])[0];
assert.equal(unlabelled.summary.labelledMisses, 0, "unlabelled occurrences are not guessed evaluation truth");
assert.equal(unlabelled.summary.contextNotAssessed, 4);
assert.throws(() => runBaseline([original, original]), /Duplicate case/);
assert.throws(() => runBaseline([{ ...original, expectations: [...original.expectations!, ...original.expectations!] }]), /Duplicate labels/);
assert.throws(() => runBaseline([{ ...original, expectations: [{ ...original.expectations![0], observedText: "wrong" }] }]), /does not match/);
assert.throws(() => anchorOccurrence(unicode.source, "sample_text", -1, 1), /Invalid source span/);
assert.throws(() => anchorOccurrence(unicode.source, "missing", 0, 1), /Invalid source span/);

const submission = { id: "submission-1", childId: "synthetic-child", submissionText: "  original  " };
const sample = { id: "sample-1", taskSubmissionId: submission.id, sampleText: "  sample  " };
assert.equal(adaptBaselineSource(sourceInputFromRecords({ taskSubmission: submission, revision: "1" })).fields[0].rawText, "  original  ");
assert.equal(adaptBaselineSource(sourceInputFromRecords({ taskSubmission: submission, writingSample: sample, revision: "1" })).fields[0].rawText, "  sample  ");
const excluded = adaptBaselineSource(sourceInputFromRecords({ taskSubmission: submission, draftPayload: { prompt: "copied" }, revision: "1" }));
assert.equal(excluded.fields.filter((field) => field.selectedForBaseline).length, 0, "no flattened fallback after exclusion");
assert.throws(() => sourceInputFromRecords({ taskSubmission: submission, writingSample: { ...sample, taskSubmissionId: "other" }, revision: "1" }), /does not belong/);
assert.throws(() => adaptBaselineSource({ kind: "writing_sample", sourceId: "", revision: "1", sampleText: "word" }), /identity/);
assert.throws(() => anchorOccurrence(unicode.source, "sample_text", 0, 9999), /Invalid source span/);
assert.throws(() => anchorOccurrence(unicode.source, "sample_text", 4, 4), /Invalid source span/);

console.log(`Writing baseline regression passed: ${reports.length} synthetic cases; source identity, Unicode, field selection, detector gaps, tokenisation and replay verified.`);
