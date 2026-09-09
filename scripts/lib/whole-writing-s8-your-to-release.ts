/** Fixed immutable input set; an edited pin cannot silently omit a gold dependency. */
export function lockedYourToFilesV2(family: "YOUR_YOURE" | "TO_TOO_TWO"): string[] {
  return [
    "manifest.json", `candidates/${family}.jsonl`,
    `labels/${family}.katherine-sanderson.jsonl`, `labels/${family}.katherine-sanderson.jsonl.receipt.json`,
    `reviews/${family}.codex-non-gold.jsonl`, `reviews/${family}.codex-non-gold.jsonl.receipt.json`,
    `adjudications/${family}.lee-sanderson.jsonl`, `adjudications/${family}.lee-sanderson.jsonl.receipt.json`,
    `gold/${family}.final-gold.jsonl`, `gold/${family}.final-gold.jsonl.receipt.json`,
    `packets/${family}.label-packet-a.jsonl`, `packets/${family}.label-packet-b.jsonl`,
    `packets-csv/${family}.second-person-adjudication.completed.csv`,
    `reports/${family}.evaluation.json`, `release-artifacts/${family}.blocked.json`,
  ].sort();
}
