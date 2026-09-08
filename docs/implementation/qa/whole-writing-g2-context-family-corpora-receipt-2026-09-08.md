# Whole-writing G2 contextual-family corpus implementation receipt

## Scope

- branch: `codex/g2-context-family-corpora`;
- isolated worktree: `/Users/katiesanderson/Documents/Scarletts Spells/scarletts-spells-g2-corpora`;
- documentation authority baseline:
  `f7865ab9edab410a3a6f5aba6965457705319b5f`;
- package: `G2_CONTEXT_FAMILY_CORPUS_PACKAGE_V1_2026_09_08`;
- policy: `WHOLE_WRITING_REMEDIATION_POLICY_V1_2026_09_08`;
- analyser: `WHOLE_WRITING_CONTEXT_DETERMINISTIC_V1`;
- registry: `WHOLE_WRITING_CONTEXT_REGISTRY_V1`; and
- S8 corpus dependency: `WHOLE_WRITING_CONTEXT_CORPUS_V1`.

The S8 and original dirty worktrees were not edited. The frozen E1/S5 release
candidate, `origin/main`, the unconfirmed Context Resolver proposal, staging,
Production and all databases remained unchanged.

## Produced

Four independently fingerprinted packages each contain 400 project-authored
candidates, separated author proposals, two blinded 400-row labelling packets,
append-only label/adjudication/gold locations, schema and lineage validation,
duplicate/similarity reporting, deterministic S8 evaluation and a bounded
release artifact. Each author-proposal set was constructed with the policy's
required category coverage, but proposals are not gold and do not satisfy the
gate.

The variety report records 400 unique normalized texts for every family, zero
exact duplicates, zero token-trigram near-duplicate pairs at the configured
cutoff, and 60 or more distinct authored-template identities per family.

## Verification record

Local verification produced these outcomes:

| Command | Outcome |
|---|---|
| `npm run writing:g2-corpus-build` | passed; four 400-case candidate sets and eight blinded packets reproduced |
| `npm run writing:g2-corpus-regression` | passed; schema, UTF-16 span/focus, category proposal, duplicate/similarity, protected-set, label provenance, deterministic metric and Wilson tests passed |
| `npm run writing:g2-evaluate` | expected exit 2; all four families emitted deterministic `BLOCKED` artifacts because 0/800 required independent labels and 0/400 locked gold records exist per family |
| `npm run writing:s8-regression` | passed; the existing 30 engineering cases remained separate |
| `WRITING_PROOF_RUNTIME=/tmp/scarlett-writing-proof-runtime npm run writing:s8-db-proof` | passed; 9 disposable PostgreSQL 18 proofs, four releases seeded, exact occurrence lineage, zero Production connections |
| `npm run adle:authority-docs-check` | passed; 20 authority keys, eight canonical target documents and five historical receipts |
| `tsc -p tsconfig.scripts.json --noEmit --incremental false` | passed for the repository scripts and libraries |
| focused ESLint over the five new TypeScript files | passed with zero warnings or errors |
| `git diff --check` | passed |

The evaluator was run repeatedly after the final corpus build and reproduced
byte-identical report and blocked-artifact hashes. The expected release result
before human work is `BLOCKED` for all four families because no genuine
independent labels or adjudications have been supplied. This is a successful
fail-closed result, not G2 operational approval.

No family activation, runtime policy, database, `context_review_enabled`,
family delivery-control, staging or Production change occurred.
