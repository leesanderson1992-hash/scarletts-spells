# Dynamic Affix Teaching Dictionary transfer selection — production rollout receipt

Recorded at `2026-08-06T23:16:14Z` (`2026-08-07T00:16:14+01:00`).

## Release

- implementation commit: `b6687cd342d53d5c57b9d4da4863c5de9fda1520`;
- staging-receipt release head: `2f1ccbf7882f1cd18782d9eb96b76ddadb7ff768`;
- branch: `codex/dynamic-affix-dictionary-transfer-selection`;
- `main` advanced without force from
  `1bf1092a00ac41de4225e23f9510ce93855c5751` to the release head;
- focused staging acceptance:
  [`DYNAMIC-AFFIX-DICTIONARY-SELECTION-STAGING-CORRECTION-2026-08-06T225427Z.md`](adle-dynamic-affix-v3-shared-compiler-staging-2026-08-06/DYNAMIC-AFFIX-DICTIONARY-SELECTION-STAGING-CORRECTION-2026-08-06T225427Z.md).

The implementation changes selection authority only. Dynamic Affix V3,
assignment planning, bindings, rendering, resume, completion, evidence,
scheduling and rewards retain their accepted contracts.

## Fingerprint and candidate-pool gate

Production and staging independently passed the ten-profile, forty-member and
640 ordered-selection audit. Both environments produced:

- semantic profile fingerprint V2:
  `5860dabc039daa16fb12182d2c6f51b20a4929e54167341a2a1c2efc09408020`;
- ordered selection fingerprint V2:
  `cc6e0a99ae7e65e57437c736323890ea1fe2877ae52f583b05df6c7516937970`;
- 640 exact legacy/shared compiler cases and 640 exact plan/runtime cases.

Environment-integrity identity remains intentionally local:

- staging: `33a8a5684ded14781ea3385e33030970a0de20b50343c82c917b64eae72a61c6`;
- production: `af7e6e247f3f6f043a44bafbb5a6b1f70fd8f58cfd0a882e3406234635c01c6e`.

The raw profile fingerprints remain different and are not a cross-environment
gate. No Teaching Dictionary row was edited to force equality.

## Authority progression

The exact release was deployed and verified through the approved sequence:

| Authority | Ready deployment | QA result |
|---|---|---|
| `legacy_authoritative` | `dpl_8zyRpTncQHPEEv2kssUxHFkE1BAY` | 16 items, public fingerprint `5634ecc487464268bf131e21a3a9258ef835ef1cb202339dbdbcd1fd43bc6b12`, exact plan/binding parity, legacy invoked |
| `shadow` | `dpl_24SorDTDZunYeRdexYjGWHptfFHF` | exact parity, source `1a558677c07d`, lesson `d7ab9aa21ee6`, no shadow-owned lesson write, legacy invoked |
| `enforced_parity` | `dpl_CeiEQdGWaWcEfQWp7UUq3q1p1jHw` | exact parity and the same fingerprints, legacy invoked; zero-write mismatch handling remains regression-covered |
| `shared_authoritative` | `dpl_CnwSY6kKY3kJCzhuUHkRakoF7JYE` | exact parity, legacy invocation false, no fallback |

Each stage used the consolidated normal assignment writer from the exact release
against an authenticated, explicitly tagged disposable production QA learner.
No production curriculum content was changed. The focused staging programme
already completed genuine simple, multi-form and TION learner lifecycles, so
production QA did not duplicate those completed teaching sessions.

## Cleanup and protected systems

All four disposable production QA children, assignments, items, learning
items, treasures and the auth user were deleted. Residue is zero across every
fixture-owned table and protected counts returned exactly to baseline:

```json
{"children":13,"daily_assignments":82,"assignment_items":58,"adle_learning_items":17,"adle_assignment_attempt_events":34,"adle_child_learning_reflections":2,"adle_taught_word_history":10,"adle_review_bundles":3,"adle_review_schedule_words":9,"adle_review_schedule_word_routes":6,"child_word_treasures":16,"child_word_treasure_events":22}
```

Post-cleanup production has zero Dynamic Affix assignments. Dynamic Prefix
remains production-enabled with five profiles and 35 reviewed members; its
compiler variable and observation work were not changed. Canonical intake
remains enabled, with 485 completed reconciliation jobs, zero active jobs, 12
activated candidates and one unchanged `pending_content` candidate. The
natural five-minute scheduler returned `200` on the final shared-authoritative
deployment. The wider backlog was not processed.

Generic Snapshot remains `deferred_absent` (database error code `42703`).
Common Word Lab remains inactive. Closed Compound, Base Word, evidence weights,
review intervals, reward policy and historical assignments were not changed.

## Observation state

The compiler authority rollout is complete and production observation is open.
Acceptance remains pending future natural Dynamic Affix compiler decisions and
learner completions on the final shared-authoritative deployment. Observation
must require zero blockers, zero legacy calls, authentic-only schedules/routes,
all-word evidence and rewards, and no cross-environment semantic drift.

Status: `DYNAMIC_AFFIX_PRODUCTION_OBSERVATION_OPEN`.
