/** Fixed immutable input set; an edited release pin cannot omit gold provenance. */
export function lockedItsFilesV2(): string[] {
  return [
    "manifest.json",
    "candidates/ITS_ITS.jsonl",
    "labels/ITS_ITS.katherine-sanderson.jsonl",
    "labels/ITS_ITS.katherine-sanderson.jsonl.receipt.json",
    "reviews/ITS_ITS.codex-non-gold.jsonl",
    "reviews/ITS_ITS.codex-non-gold.jsonl.receipt.json",
    "adjudications/ITS_ITS.lee-sanderson.jsonl",
    "adjudications/ITS_ITS.lee-sanderson.jsonl.receipt.json",
    "gold/ITS_ITS.final-gold.jsonl",
    "gold/ITS_ITS.final-gold.jsonl.receipt.json",
    "packets/ITS_ITS.label-packet-a.jsonl",
    "packets/ITS_ITS.label-packet-b.jsonl",
    "packets-csv/ITS_ITS.second-person-adjudication.completed.csv",
    "reports/ITS_ITS.evaluation.json",
    "release-artifacts/ITS_ITS.blocked.json",
  ].sort();
}
