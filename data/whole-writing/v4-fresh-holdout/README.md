# S8 V4 fresh independent holdout administration

Status: **single-author administration/evaluator protocol registered in a private evaluation root; no source corpus, labels, gold or evaluation exists here**. Do not copy V3/G2 prose or V4 engineering fixtures into this directory. The four frozen V4 releases remain development candidates, default-off. The separately versioned [administration/evaluator contract](../../../docs/implementation/whole-writing-s8-v4-fresh-holdout-administration-contract-2026-09-23.md) governs source intake.

The command is `npm run writing:s8-v4-holdout-admin -- <command> --root=<private-evaluation-root> ...`. Keep authentic learner writing and reviewer packets in a suitably private root; do not commit them merely because this README is tracked. Every generated immutable artifact is created with exclusive-write semantics. All IDs are machine-generated from source identity, independent of analyser results.

## 1. Approve and register the protocol

An identified governance owner and separate evaluator-contract reviewer must sign a JSON protocol with these required fields:

```json
{
  "approvalId": "human-issued-approval-reference",
  "approvedBy": "identified-human",
  "evaluatorContractApprovalId": "separate-reviewed-contract-reference",
  "evaluatorContractReviewedBy": "identified-human",
  "adminVersion": "S8_V4_HOLDOUT_ADMIN_V2_SINGLE_AUTHOR_2026_09_23",
  "evaluatorPolicyVersion": "S8_V4_ORDINARY_WRITING_EVALUATOR_V2_SINGLE_AUTHOR_PROTECTED_VALID_SEPARATE",
  "stageAPrimaryPerFamily": 100,
  "stageBPrimaryPerFamily": 300,
  "stageBSourceInstructions": "approved independent ordinary-writing instructions",
  "stageBSelectionRule": "approved source-side selection rule, fixed before Stage A predictions",
  "sourceIndependenceAttestation": "approved source and leakage controls",
  "releaseManifestFingerprints": {
    "THERE_THEIR_THEYRE": "copy exact fingerprint from frozen V4 manifest",
    "TO_TOO_TWO": "copy exact fingerprint from frozen V4 manifest",
    "YOUR_YOURE": "copy exact fingerprint from frozen V4 manifest",
    "ITS_ITS": "copy exact fingerprint from frozen V4 manifest"
  }
}
```

The placeholders above are **not approval** and fail manifest-pin validation. `pins` prints the exact frozen fingerprints without running an analyser. Register only an actually reviewed protocol with `register-protocol --source=<approved.json>`. Its exact bytes and fingerprint are preserved. The V2 evaluator requires one stable source author across all families and both waves. Do not author or intake the qualification corpus before this approval.

## 2. Intake source and resolve similarity

Use human-authored JSONL with one immutable writing passage per line:

```json
{"writingSnapshotId":"human-source-snapshot-id","sourceReference":"source-and-consent-reference","sourceText":"exact human prose","authorId":"pseudonymous-stable-author-id","authoredBy":"identified-or-controlled-author-provenance","consentReference":"consent-record","stage":"A"}
```

`intake --source=<stage-a.jsonl> --reference-root=<repository-root>` copies the raw bytes under their SHA-256 name, generates all governed occurrences with exact zero-based UTF-16 spans, and writes a complete inventory and development-leakage flags. The same command accepts later Stage B intake but refuses new Stage A source after Stage A gold lock. A source passage must contain at least one governed occurrence. The leakage scanner must find the frozen V3/G2/development references; it cannot silently run without them.

All source rows must use one stable pseudonymous `authorId`. Multiple writing snapshots and sessions remain necessary for the primary-case and source-clustering checks. The final evidence speaks to that learner's writing distribution; it does not establish performance across authors.

Run `similarity-template`, review **every** flag, and fill `resolution` with `INDEPENDENT_CONFIRMED` or `EXCLUDE`, plus `resolvedBy` and `reason`. `seal-similarity --source=<completed.csv> --out=<resolutions.jsonl>` validates and fingerprints the resolutions. Exclusions preserve raw source and inventory; they remove the entire passage from packets and gold. The completed resolution file must be supplied to `selection-template`, `packets` and `lock` as `--resolutions=<resolutions.jsonl>`.

## 3. Select focus and obtain independent decisions

`selection-template --stage=A --resolutions=<...>` proposes the first occurrence per family and writing snapshot. A human may change the proposed focus using only source-side evidence and the predeclared quota rule, **never analyser output**. Complete `selectedBy`; then `seal-selection --source=<completed-selection.csv> --out=<selection.jsonl>`. Selection validation forbids two primaries from one family in one writing snapshot.

`packets --stage=A --selections=<selection.jsonl> --resolutions=<...>` writes identical blinded source packets for the identified primary human and separately attributable AI non-gold reviewer, in JSONL and CSV. The AI must receive only its blank packet, not human decisions or V4 predictions. For every occurrence both reviewers provide classification, finite-family intended alternative or blank, supported status, construction/subtype or `not_applicable/not_applicable`, and protected tags. An `UNCERTAIN` decision also requires `uncertainReason`: `GENUINE_SEMANTIC_AMBIGUITY`, `UNSUPPORTED_CONSTRUCTION_OR_MEANING`, or `OTHER_UNCERTAIN`; leave it blank otherwise. Machine-owned spans, IDs and source text need no manual re-entry. The AI reviewer ID must identify its model/prompt version. `seal-review --kind=HUMAN|AI --source=<completed.csv> --out=<sealed.jsonl>` checks the packet's exact source and span, generates collision-resistant decision IDs and canonical fingerprints.

Every substantive difference in classification, intended alternative, support status, construction/subtype or protected tags requires an identified second human. `adjudication-template --primary=<sealed.jsonl> --review=<sealed.jsonl> --out=<packet.csv>` generates an exact disagreement queue with both decisions but no analyser output. The second human fills its final decision fields; `seal-adjudications --source=<completed.csv> --out=<sealed.jsonl>` checks source identity and fingerprints it. Use a valid empty JSONL file when no adjudication is needed. The adjudicator must differ from the primary human.

## 4. Lock, stage-stop, and evaluate

`lock --stage=A --selections=<...> --primary=<...> --review=<...> --adjudications=<...> --resolutions=<...> --similarity-raw=<completed.csv> --selection-raw=<completed.csv> --primary-raw=<completed.csv> --review-raw=<completed.csv> --adjudications-raw=<completed.csv>` requires complete decisions and exactly 100 primaries per family. Every sealed JSONL file has a receipt binding its exact raw CSV bytes; lock verifies those receipts and preserves the raw files, sealed files and receipts alongside immutable Stage A candidates, gold and source/similarity evidence. Only then may `evaluate --stage=A` run. Stage A may say STOP or CONTINUE, never PASS.

For families that continue, intake and review Stage B under the already approved rules. Supply **combined A+B** selections and decisions to `lock --stage=FINAL --families=THERE_THEIR_THEYRE,TO_TOO_TWO,YOUR_YOURE,ITS_ITS` (omit stopped families). It verifies complete 400/150/150/100 and construction/subtype/protected coverage independently for each listed family, checks its Stage A continuation report, and proves that **every** Stage A candidate and gold row—including stopped families—remains unchanged. All governed occurrences in shared Stage B passages still need labels and reviews. Only after its receipt exists may `evaluate --stage=FINAL` run the listed exact frozen V4 releases; omitted families remain blocked, not silently passed. Final reports include all-occurrence and primary-only metrics, protected abstention, fallback exercise, safety failures, author/source clustering and fingerprints. No command publishes, selects or activates a release.

Run `npm run writing:s8-v4-holdout-admin-regression` for in-memory engineering fixtures; they are not human evidence and cannot pass the CLI gold lock.
