# S8 V4 fresh holdout administration and evaluator contract

Status: **implementation proposal awaiting separate human governance review**. This document and its tooling do not approve a release or author a holdout. The four V4 analysers, parser identities, fallback gates, manifests and persisted dispatch remain frozen and default-off.

## Authority and independence

The [writing evidence contract](../contracts/writing-engine-mastery-and-evidence-contract.md) remains the minimum release authority: 400 primary cases per family, 150 VALID, 150 supported INVALID, 100 uncertain/unsupported, full human primary labels, complete separate non-gold review, human adjudication of substantive disagreements, precision and Wilson gates, supported-construction recall and zero protected failures. A shared passage may provide one primary per different family, but no writing snapshot provides two primaries for the same family. All incidental governed occurrences remain inventoried, labelled, reviewed and evaluated for safety.

Only fresh, consented, independent human prose may enter the qualification corpus. Exposed V3 ordinary writing, frozen G2, V4 engineering fixtures, parser investigations and comparison cases are development references for leakage screening, not eligible sources. Source text and UTF-16 spans are immutable. Selection and human review must be blind to analyser predictions. No analyser may run before the relevant wave's gold lock.

## Versioned V4 evaluator correction requiring approval

`S8_V4_ORDINARY_WRITING_EVALUATOR_V1_PROTECTED_VALID_SEPARATE` leaves the V3 evaluator and historic reports unchanged. It implements the bounded correction described in the [TO evaluator-defect report](whole-writing-s8-v4-to-protected-valid-evaluator-contract-defect-2026-09-10.md): a protected occurrence still **must** yield `UNCERTAIN`, but protected human-VALID occurrences are removed from the ordinary valid-recognition numerator and denominator and reported as `protectedValid` and `protectedAbstention`. Historic V3-style valid recognition remains a labelled diagnostic. Supported INVALID recall and its existing denominator are not relaxed.

The new evaluator additionally checks every declared construction and subtype even if absent from the sample, applies the published 30/20 minimum quotas and the predeclared source-side strata, and requires the same precision/Wilson/recall/valid-recognition gates on primary cases alone as well as all annotated occurrences. An incidental cannot rescue a failing primary-only result. All three zero-tolerance safety gates remain absolute. At least 10 actual typed fallback invocations are required in each gated family; YOUR and ITS must have none. Fewer than 10 block the fallback exercise claim, not invite case selection from predictions.

This evaluator-policy version **must receive a separately attributable human contract approval** before source intake begins. The administration CLI requires an immutable approved protocol containing the approval ID, reviewer, exact frozen release fingerprints, Stage B writing instructions and the predeclared selection rule. Tooling does not self-approve that document.

## Prespecified coverage and staged stop

Each family ends with at least 400 primaries: 150 VALID, 150 supported INVALID and 100 genuinely UNCERTAIN/unsupported. Within UNCERTAIN primaries, independently identify at least 10 genuine semantic ambiguities and 10 unsupported constructions/meanings; the reviewed reason is preserved with the decision evidence and counted in the lock receipt. The full subtype allocations are encoded in `HOLDOUT_V4_PRIMARY_STRATA`; each class has the same allocation. Each family also requires 10 occurrences in each of fragment, quotation, gerund, run-on and task-dependent sets, from at least 50 distinct protected occurrences. Protected classifications are never rewritten to satisfy a balance count. Honest coverage may require more than 400 primaries.

Stage A is exactly 100 primaries per family, with at least 40 VALID, 40 INVALID and 20 UNCERTAIN (including two genuine semantic ambiguities and two unsupported meanings), at least five of each class per declared subtype, and at least two occurrences per protected category drawn from 10 distinct protected occurrences. Stage B contributes the remaining 300 or more under prompts and selection rules fixed in the approved protocol. Stage A can only stop a family for a zero-tolerance safety failure or a mathematically impossible final quota; it cannot pass one. Its locked candidates and gold must be byte-equivalent in the final corpus. A stopped wave becomes regression evidence, and any amended candidate requires a new independent qualification corpus.

Source and sentence duplicates, near-duplicate lexical shingles and function-word shells are *flags*, never automatic deletion. Every flag requires an identified human resolution and reason. Excluded passages remain in preserved raw intake and inventory, but cannot enter packets or gold. Cross-family reuse is reported by source snapshot. At least 20 contributors per family and no more than 10% primaries from one author are qualification-review gates; author- and snapshot-leave-one-out sensitivity is reported separately.

## Freeze boundary

The administration package is offline-only. It does not change family rules, model dependencies, release manifests, approvals, selections, activation, staging, Production or the operational database. Its evaluator can execute the frozen V4 candidates only after a verifiable gold-lock receipt exists. A PASS means `PASS_REVIEWABLE_NOT_PUBLISHED`, never publication or activation.
