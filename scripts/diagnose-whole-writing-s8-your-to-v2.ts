/** Review-only audit. Runtime analysers never import cases, gold or this file. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import { CONTEXT_YOUR_TO_CANDIDATES_V2 } from "../lib/writing-engine/whole-writing/context-analyser-release";
import { analyseDeterministicContext } from "../lib/writing-engine/whole-writing/context";
import { contextClauseV2 } from "../lib/writing-engine/whole-writing/context-your-to-syntax-v2";
import { readJsonLines, recordFingerprint, type CandidateCase, type FinalGold } from "./lib/whole-writing-g2-corpus";

const root = resolve(import.meta.dirname, "../data/whole-writing/g2-context-family-corpora");
const constructions: Record<string, { shape: string; extension: string; risk: string; counterexamples: string[] }> = {
  possessive: { shape: "clause-initial family member + noun head + seems + adjective + prepositional complement", extension: "Consume the complete possessed noun phrase, finite copula and bounded adjective predicate; explicit noun/adjective classes.", risk: "Gerunds, nominal predicates and fragments cannot establish possessive intent.", counterexamples: ["You're running seems fast.", "You're teachers.", "Your cold."] },
  you_are_contraction: { shape: "clause-initial family member + adjective + enough + to + transitive verb + determiner object", extension: "Require the adjective/enough/infinitive sequence and a complete permitted verb phrase.", risk: "Missing objects, noun uses and run-ons must abstain.", counterexamples: ["Your ready enough to.", "Your running seems fast.", "Your quiet enough to read a book he went home."] },
  preposition: { shape: "subject + walked + family member + determiner destination + temporal complement", extension: "Admit the motion predicate and complete destination phrase independently of the observed member.", risk: "Distances, additive motion clauses and incomplete destinations.", counterexamples: ["She walked two miles.", "She walked too.", "She walked two the."] },
  infinitive: { shape: "subject + wants + family member + base verb + temporal complement", extension: "Retain the already covered verbs with a complete bounded subject and desire predicate.", risk: "Objects of want and infinitive ellipsis cannot be corrected from the next word alone.", counterexamples: ["He wants two books.", "He wants to."] },
  additive: { shape: "subject + wants + determiner object + terminal family member", extension: "Consume a complete desire clause before the terminal additive slot.", risk: "An infinitive following the member or another independent clause.", counterexamples: ["He wants a turn to read.", "He wants a turn two people are waiting."] },
  degree: { shape: "determiner subject + is + family member + adjective + for-complement", extension: "Finite copular degree clause with explicit adjectives; abstain on fast when to/too compete.", risk: "Scheduled infinitive to fast and lexical-category ambiguity; do not infer gold intent from template slots.", counterexamples: ["The teacher is to fast before lunch.", "The teacher is two fast for the visit.", "The coat is to hand."] },
  numeral: { shape: "subject + has + family member + plural count noun + prepositional complement", extension: "Explicit expanded plural count-noun class inside a complete possession clause.", risk: "Have-to infinitives, mass quantities and incomplete phrases.", counterexamples: ["We have to read.", "We have too much work.", "We have to running."] },
};
const v1Nouns = new Set("answer bag ball book cat coat dog family friend garden home house idea name school tail teacher team toy water way work answers bags balls books cats coats dogs friends houses ideas names teams toys ways".split(" "));
const v1Plurals = new Set("answers bags balls books cats coats dogs friends houses ideas names teams toys ways".split(" "));
const v1Adjectives = new Set("big cold fast fine friendly fun good happy heavy kind late ready right sad small tired very wet wrong".split(" "));
for (const release of CONTEXT_YOUR_TO_CANDIDATES_V2) {
  const family = release.manifest.familyKey;
  const candidates = readJsonLines<CandidateCase>(join(root, "candidates", `${family}.jsonl`));
  const gold = readJsonLines<FinalGold>(join(root, "gold", `${family}.final-gold.jsonl`));
  const goldById = new Map(gold.map((g) => [g.caseId, g]));
  const originalReport = JSON.parse(readFileSync(join(root, "reports", `${family}.evaluation.json`), "utf8"));
  const directory = join(root, "release-evaluations", release.manifest.releaseKey);
  const report = JSON.parse(readFileSync(join(directory, "reports", `${family}.evaluation.json`), "utf8"));
  const diagnosis = candidates.filter((c) => goldById.get(c.caseId)?.classification === "INVALID").map((c) => {
    const g = goldById.get(c.caseId)!;
    const input = { fieldText: c.sourceText, startUtf16: c.startUtf16, endUtf16: c.endUtf16 };
    const v1 = analyseDeterministicContext(input); const v2 = release.analyse(input);
    const clause = contextClauseV2(input); assert.equal(clause.reason, null);
    if (clause.reason !== null) throw new Error("Unexpected corpus source boundary");
    const next = clause.tokens[clause.focus + 1]?.word;
    const causes: string[] = [];
    if (c.declaredConstruction === "possessive") {
      if (!v1Nouns.has(next)) causes.push("NOUN_HEAD_OUTSIDE_V1_CLASS");
      causes.push("FINITE_SEEMS_OUTSIDE_V1_POSSESSIVE_SUBSTITUTION_CHECK");
    }
    if (c.declaredConstruction === "you_are_contraction") {
      if (!v1Adjectives.has(next)) causes.push("ADJECTIVE_OUTSIDE_V1_CLASS");
      causes.push("ENOUGH_INFINITIVE_REJECTED_BY_ALL_ADJECTIVES_TEST");
    }
    if (c.declaredConstruction === "preposition") causes.push("NO_DESTINATION_SUBSTITUTION_PATH");
    if (c.declaredConstruction === "additive") causes.push(v1?.observedMember === "to" ? "NO_TERMINAL_TO_ADDITIVE_SUBSTITUTION" : "TERMINAL_TWO_CHECK_REQUIRES_ADJACENT_WANT_NOT_COMPLETED_OBJECT");
    if (c.declaredConstruction === "degree") causes.push(v1?.observedMember === "two" ? "NO_TWO_DEGREE_SUBSTITUTION_PATH" : "ADJECTIVE_OUTSIDE_V1_CLASS");
    if (c.declaredConstruction === "numeral" && !v1Plurals.has(next)) causes.push("PLURAL_HEAD_OUTSIDE_V1_CLASS");
    if (v1?.reasonCode === "SOURCE_SPAN_MISMATCH") causes.push("MODIFIER_APOSTROPHE_TOKENIZATION_SPAN_MISMATCH");
    const v1Failed = v1?.status !== "INVALID" || v1.alternativeMember !== g.expectedAlternative;
    if (!v1Failed) causes.push("ALREADY_COVERED_V1");
    return {
      caseId: c.caseId, candidateFingerprint: c.candidateFingerprint, goldFingerprint: g.goldFingerprint,
      source: { fieldText: c.sourceText, startUtf16: c.startUtf16, endUtf16: c.endUtf16 },
      construction: c.declaredConstruction, approvedConstructionAlreadyCoversCase: true,
      analysis: constructions[c.declaredConstruction], v1Failed, causes, v1, v2,
      goldAlternative: g.expectedAlternative,
      remainingFailure: v2?.status !== "INVALID" || v2.alternativeMember !== g.expectedAlternative,
      dispositionReason: v2?.reasonCode === "AMBIGUOUS_ADJECTIVE_OR_INFINITIVE"
        ? "Gold retained. Runtime lacks enough intent to rule out a scheduled infinitive; retain abstention and full denominator. Later broader intent-aware deterministic work needs independent counterexamples; do not relabel this corpus."
        : "Bounded complete-clause rule; no corpus identifier or expected answer is consumed by runtime.",
    };
  });
  assert.equal(diagnosis.length, 150);
  assert.equal(diagnosis.filter((d) => d.v1Failed).length, family === "YOUR_YOURE" ? 150 : 103);
  const body = { schemaVersion: 1, family, release: report.release, originalEvaluationFingerprint: originalReport.metrics.evaluationFingerprint, evaluationFingerprint: report.metrics.evaluationFingerprint, constructionComparison: { v1: originalReport.metrics.byConstruction, v2: report.metrics.byConstruction }, diagnosis };
  writeFileSync(join(directory, "reports", `${family}.diagnosis.json`), `${JSON.stringify({ ...body, fingerprint: recordFingerprint(body) }, null, 2)}\n`);
  console.log(`${family}: audited ${diagnosis.length} supported INVALID cases, ${diagnosis.filter((d) => d.v1Failed).length} V1 misses, ${diagnosis.filter((d) => d.remainingFailure).length} remaining.`);
}
