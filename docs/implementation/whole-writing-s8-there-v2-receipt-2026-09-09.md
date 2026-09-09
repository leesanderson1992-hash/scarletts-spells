# S8 there-family V2 — locked-corpus diagnosis and release candidate

Baseline: `41b94edca1aacefb8a05a19ea356b279bd3167fa`.
Branch: `codex/s8-there-family-v2`.
Status: `PASS_REVIEWABLE_NOT_PUBLISHED`.

## Diagnosis and targeted changes

The V1 evaluation of the adjudicated 400-case `THERE_THEIR_THEYRE` corpus
missed all 150 supported misuses. These were construction-coverage gaps rather
than missing human verification. The V2 candidate addresses them as follows:

| Construction | V1 misses | Cause | V2 supported construction |
|---|---:|---|---|
| Existential | 37 | No INVALID path proposes `there` before finite existential `be`. | Clause-initial member + finite `is/are/was/were` + complete determiner-led noun phrase, with an optional bounded prepositional complement. |
| Locative | 37 | No INVALID path proposes `there` in a location slot. | Subject + enumerated placement verb + complete object noun phrase + `over/down/up` + terminal member. |
| Possessive | 38 | V1 only recognizes a short noun list; these noun heads and `looked` predicates fall outside that check. | Clause-initial member + bounded noun phrase + finite copular predicate with adjective and optional complete complement. |
| They-are contraction | 38 | V1 requires every following token to be an adjective; a complement such as `about tomorrow's visit` makes that test fail. | Clause-initial member + bounded adjective predicate; a substitution requires a complete prepositional complement. |

Tokenisation also consistently accepts straight, curly and modifier-letter
apostrophes without changing source offsets or NFC normalization. V1's token
pattern and member normalization had not consistently treated these variants.

V2 evaluates finite family alternatives against complete supported clause
shapes. Its explicit lexical classes are part of the fingerprinted analyser;
unlisted vocabulary and unmatched clauses abstain. It does not use corpus IDs,
gold labels, candidate wrappers or exact corpus sentences as runtime rules.
It does not attempt subject–verb agreement or general grammar correction: a
`VALID` result remains limited to the assessed family choice.

## Protected scope

The candidate abstains on gerund constructions, unsupported embedded clauses,
run-ons, incomplete noun phrases, ellipses, and unresolved punctuation. Quoted
spans remain protected across sentence boundaries. Bare ambiguous phrases such
as `their cold` cannot trigger a substitution from a neighbouring adjective
alone. Supported scope is recorded in the V2 manifest; no gold construction or
recall denominator was removed or relabelled.

The same-sentence structural restrictions are intentionally narrower than a
general contextual analyser. They do not redefine S8's verification,
independence, authenticity, causal mapping or proficiency authorities.

## Locked-corpus results

The complete existing provenance chain was checked under
`WHOLE_WRITING_REMEDIATION_POLICY_V2_2026_09_09`: 400 primary human labels,
400 non-gold reviews, 20 human adjudications and 400 final-gold records.

| Measure | V1 | V2 candidate |
|---|---:|---:|
| Correct misuse suggestions | 0 | 150 |
| Missed or wrong-alternative supported misuses | 150 | 0 |
| False suggestions | 0 | 0 |
| Precision | 0% | 100% |
| 95% Wilson lower bound | 0% | 97.5029755632% |
| Supported-construction recall | 0% | 100% |
| Invalid-alternative accuracy | 0% | 100% |

All 150 valid cases are classified `VALID`; all 100 uncertain cases abstain.
Each protected set contains 20 cases and has zero failures: fragment,
quotation, gerund, run-on and task-dependent. Existential and locative each
have 37 successful corrections; possessive and contraction each have 38.

The corpus was used to diagnose this release. These results are a reproducible
evaluation on that known corpus, not an estimate of accuracy on unseen learner
writing. No additional human labels or release permissions are inferred.

## Release identity and reproducibility

- Release key: `s8-v2-there-their-theyre`.
- Release ID: `81000000-0000-4000-8000-000000000005`.
- Analyser: `WHOLE_WRITING_CONTEXT_THERE_DETERMINISTIC_V2`.
- Registry: `WHOLE_WRITING_CONTEXT_THERE_REGISTRY_V2`.
- Corpus dependency: unchanged `WHOLE_WRITING_CONTEXT_CORPUS_V1`.
- Release fingerprint: `d79aa9dfc32b1c1cc817623852bcf6d35d5f0033b74ec233517dd39f3229b07a`.
- Analyser SHA-256: `9f64796f7eb23b55254ee8dd7e43c9e5d2922d8efb24667bfd1ac87dfc13966b`.
- S8 manifest fingerprint: `e9d41060b69b418d13078f0aa0160b426f4bbc04572e49b67a0d3bf2f3a60022`.
- Evaluation fingerprint: `a72ae593d94352c04f4a8ccb1ed6d806ae6a4bb1282df6a69da86776640b7541`.
- Unchanged gold receipt: `1b65f3e278e7086f40a82000aae65c2b2640e413b89635a56716de37230b07ea`.

The release pin, new report and approval candidate are stored under
`data/whole-writing/g2-context-family-corpora/release-evaluations/s8-v2-there-their-theyre/`.
The pin hashes 16 original input files. All original candidates, labels,
reviews, adjudications, gold records, packets, receipts, package manifest,
V1 reports and V1 blocked artifacts remain byte-for-byte unchanged.

Run:

```sh
npm run writing:g2-evaluate -- --there-v2
node_modules/.bin/tsx scripts/whole-writing-s8-there-v2-regression.ts
```

The V2 evaluation adds a separate release dependency while retaining the
original package's runtime fingerprint checks. It does not replace the frozen
manifest with the current source hash. The evaluation identity includes the
new release and locked corpus fingerprints. Repeat evaluation is byte-identical;
stale analyser pins and altered locked files fail before replacing a report.

## Runtime integration and release boundary

The context worker selects its analyser by the persisted release's exact
family, analyser, registry, corpus and manifest dependencies. The V2 binding
also requires its new release ID. Existing V1 selections still execute the
unchanged V1 implementation; they are never silently upgraded. Unknown or
partially matched dependencies fail closed. Source-reconstruction failures also
retain the selected release's versions.

This work creates no database release, selection or approval event, and no
migration. The V2 release remains unpublished and unselected. Parent delivery
and every learning, reward, Authentic Use, proficiency, Review and retirement
consumer remain unchanged. Publication and family activation are separate
operations; the approval artifact is not an executed approval.

No staging, Production, origin/main, frozen E1/S5 release candidate or
unconfirmed Context Resolver change was made. The original G2 corpus and S8
worktrees remain untouched.

## Local verification

- V2 construction, abstention, quote-span, Unicode, repeated-occurrence,
  exact-release dispatch, replay and tamper regressions: passed.
- Existing S8 engineering regression: 30 cases passed unchanged.
- Existing G2 corpus, human-review provenance and Wilson regressions: passed.
- Existing disposable PostgreSQL S8 proof: nine proofs passed; no Production
  connection. This checks the unchanged storage/claim/approval contract, while
  V2 dispatch is covered by the new pure regression.
- Application and scripts TypeScript checks: passed.
- Focused ESLint and authority-document checks: passed.
- Frozen-source comparison and whitespace check: passed.
