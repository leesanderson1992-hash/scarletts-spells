/**
 * ADLE Slice 4 (4G): guarded slippage scan — runs the canonical lib/adle
 * slippage logic (detectWritingSlips / respondToSlip, regression-covered)
 * over an extracted facts file and emits a JSON report plus, with
 * --emit-sql, an append-only SQL plan for the documented guarded psql flow.
 *
 * This script never touches a database itself: extraction is a documented
 * read-only psql query (see --help epilogue in the facts-file shape below),
 * and applying the emitted SQL is the operator's guarded step AFTER the
 * owner QA gate. One canonical logic implementation — no Python fork of the
 * as-of-date state arithmetic.
 *
 * Facts file shape (JSON):
 * {
 *   "candidates":            WritingSlipCandidate[],   // from finalised, learning-relevant writing_issues
 *   "wordIdByNormalised":    { [normalisedWord]: canonicalWordId },
 *   "factsByWordId":         { [canonicalWordId]: WordPricingFacts },
 *   "microSkillKeyByWordId": { [canonicalWordId]: microSkillKey },
 *   "activeScheduleWordsByWordId": { [canonicalWordId]: ScheduleWordFact },
 *   "taughtOnByWordId":      { [canonicalWordId]: IsoDate }
 * }
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { EVIDENCE_POLICY_V1 } from "../lib/adle/evidence-policy";
import { REVIEW_POLICY_V1, type ScheduleWordFact } from "../lib/adle/review-scheduler";
import type { WordPricingFacts } from "../lib/adle/evidence-pricing";
import {
  detectWritingSlips,
  respondToSlip,
  type WritingSlipCandidate,
} from "../lib/adle/slippage";

interface FactsFile {
  candidates: WritingSlipCandidate[];
  wordIdByNormalised: Record<string, string>;
  factsByWordId: Record<string, WordPricingFacts>;
  microSkillKeyByWordId: Record<string, string>;
  activeScheduleWordsByWordId: Record<string, ScheduleWordFact>;
  taughtOnByWordId: Record<string, string>;
}

function sqlQuote(value: string | null): string {
  return value === null ? "null" : `'${value.replace(/'/g, "''")}'`;
}

function main(): number {
  const args = process.argv.slice(2);
  const factsIndex = args.indexOf("--facts-json");
  if (factsIndex === -1 || args[factsIndex + 1] === undefined) {
    console.error("usage: adle-slippage-scan --facts-json <file> [--report <file>] [--emit-sql <file>]");
    return 2;
  }
  const reportIndex = args.indexOf("--report");
  const sqlIndex = args.indexOf("--emit-sql");
  const facts: FactsFile = JSON.parse(readFileSync(resolve(args[factsIndex + 1]), "utf8"));

  const detection = detectWritingSlips(
    EVIDENCE_POLICY_V1,
    facts.candidates,
    new Map(Object.entries(facts.wordIdByNormalised)),
    new Map(Object.entries(facts.factsByWordId)),
  );

  const responses = detection.slips.map((slip, index) =>
    respondToSlip(REVIEW_POLICY_V1, EVIDENCE_POLICY_V1, {
      slip,
      microSkillKey: facts.microSkillKeyByWordId[slip.canonicalWordId] ?? null,
      activeScheduleWord: facts.activeScheduleWordsByWordId[slip.canonicalWordId] ?? null,
      taughtOn: facts.taughtOnByWordId[slip.canonicalWordId] ?? slip.occurredOn,
      reentryBundleId: `slippage-reentry-${index + 1}`,
    }),
  );

  const report = {
    evidencePolicyVersion: EVIDENCE_POLICY_V1.evidencePolicyVersion,
    slips: detection.slips,
    responses,
    unmatched: detection.unmatched,
    notSlipEligible: detection.notSlipEligible,
    counts: {
      slips: detection.slips.length,
      reentryBundles: responses.filter((response) => response.reentryBundle !== null).length,
      lessonReentries: responses.filter((response) => response.learningItemIntake !== null).length,
      unmappedReentries: responses.filter((response) => response.unmappedReentry).length,
      unmatched: detection.unmatched.length,
      notSlipEligible: detection.notSlipEligible.length,
    },
  };

  if (sqlIndex !== -1 && args[sqlIndex + 1] !== undefined) {
    const lines: string[] = [
      "-- ADLE Slice 4 slippage scan: append-only SQL plan.",
      "-- Apply ONLY after the owner QA gate, via the documented guarded",
      "-- docker psql flow, inside a transaction you inspect first.",
      "begin;",
      "select pg_advisory_xact_lock(hashtext('adle_slippage_scan'));",
    ];
    for (const slip of detection.slips) {
      lines.push(
        "insert into public.adle_slippage_events " +
          "(child_id, canonical_word_id, occurred_on, context_kind, self_corrected, attempt_text, source_ref, slip_ordinal) values (" +
          [
            sqlQuote(slip.childId) + "::uuid",
            sqlQuote(slip.canonicalWordId) + "::uuid",
            sqlQuote(slip.occurredOn) + "::date",
            sqlQuote(slip.contextKind),
            String(slip.selfCorrected),
            sqlQuote(slip.attemptText),
            sqlQuote(slip.sourceRef),
            String(slip.slipOrdinal),
          ].join(", ") +
          ");",
      );
    }
    lines.push("-- re-entry bundles / learning items are written by the completion", "-- helpers at session time, not by this plan.", "commit;", "");
    const sqlPath = resolve(args[sqlIndex + 1]);
    mkdirSync(dirname(sqlPath), { recursive: true });
    writeFileSync(sqlPath, lines.join("\n"));
  }

  const reportPath = resolve(
    reportIndex !== -1 && args[reportIndex + 1] !== undefined
      ? args[reportIndex + 1]
      : "tmp/adle-slippage-scan-report.json",
  );
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report.counts));
  return 0;
}

process.exit(main());
