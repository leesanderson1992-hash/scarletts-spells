# E1/S5 integration receipt — 7 September 2026

## Integrated revisions

- E1: `56b19b4605d8a926b2284378b51fee450185abb9`.
- S5: `02d2cc281a674be8bb5918b4985c2388be314b1d`.
- Shared baseline: `33532b9`.
- Uncommitted Context Resolver work in the S5 worktree was not included.

## Composed contract

S5 remains the append-only shadow evidence writer and longitudinal report owner.
E1 retains authority-event scheduling and occurrence-scoped replay. The S5 current
report now reads one authority-ordered receipt per occurrence, so an E1 partial
replay cannot hide unaffected occurrences from the same snapshot.

Each E1 replay target stores the immutable interpretation that was current when
its authority event was recorded. Later ordinary shadow runs can append history,
but cannot rewrite publication or withdrawal resolution metrics.

The additive integration migration is
`20260906190000_integrate_e1_s5_current_evidence.sql`. No Production database or
deployment was accessed.

## Disposable PostgreSQL proof

The combined proof applied S5 migration `150000`, E1 migrations `160000` through
`180000`, and the integration migration `190000`. It also verified that E1 did
not replace S5's installed `persist_writing_shadow_result` function.

The mixed-snapshot scenario proved:

1. A full S5 batch stored an affected and an unaffected occurrence.
2. E1 publication replayed only the affected occurrence.
3. The current S5 repository returned both occurrences from two contributing
   batches.
4. A later unscoped S5 replay did not displace the authority-event result or
   change the pinned publication-resolution metric.
5. Withdrawal replayed only the affected occurrence, became current, retained
   the unaffected occurrence, and recorded one relationship withdrawal.
6. All resulting evidence remained shadow-only and legacy processing attempts
   stayed unchanged.

Result: `27` foundation proofs, `8` E1 persistence proofs and `12` S4 review
proofs passed against disposable PostgreSQL 18, with zero application database
connections.

## Merge gate

The following checks passed on the integrated tree:

- application TypeScript check;
- scripts TypeScript check;
- focused ESLint;
- writing baseline regression;
- whole-writing source and identity regression;
- whole-writing evidence and knowledge regression;
- E1 enrichment regression, including 1,001-row pagination and zero AI calls;
- Phase B word–skill relationship regression;
- Phase C learner-evidence regression;
- S4 word–skill review regression;
- combined native PostgreSQL mixed-snapshot proof.

The integration branch is ready to merge as one unit. Migration order must remain
`150000`, `160000`, `170000`, `180000`, `190000`.
