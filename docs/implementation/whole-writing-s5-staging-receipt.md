# S5 staging completion receipt — 6 September 2026

**PASS:** immutable submission → whole-writing recovery → indexed Phase C
shadow receipts → exact replay → current/history report → compatibility scan →
reload → database verification → disposable cleanup.

## Build and environment

- Implementation: 27aa9bc — Add S5 whole-writing shadow evidence history.
- Final Preview: <https://scarletts-spells-er5cmcjhm-leesanderson1992-hashs-projects.vercel.app>
- Deployment: dpl_DGYSHvJ2FBkprztqWodi13DDkmDP, READY; compile, TypeScript and static generation passed.
- Supabase staging: jlhotktspjvffslvuyfz.
- Additive migration: 20260906150000_add_whole_writing_shadow_projections.sql.
- Migration SHA-256: 9f8fd4191ff9270fc4d23fe0d72acc57f4ffe03c1799ee13e85100f3f55690a6.

The Preview was built from a detached clean worktree at the implementation
commit. It used the staging database, the isolated local relationship
environment, a one-deployment recovery secret and an allowlist containing only
the disposable administrator. No shared Vercel environment setting, production
deployment or production database was changed. The uncommitted Context Resolver
and authority proposal was absent from the worktree and remained unmodified.

## Executed proof

The setup created one disposable parent, one separate non-admin parent, one
child and one course lesson. The authenticated submission RPC captured the exact
learner text “wash Quazibloom wash”; the task defined no Target Word. The real
Preview recovery endpoint claimed and completed the shadow run.

The first current report contained exactly three occurrence receipts:

- both repeated “wash” occurrences retained distinct UTF-16 anchors;
- each “wash” resolved to the existing canonical identity and governed
  D4_PAT_WA_WOR_WA relationship;
- “Quazibloom” remained stored and queryable as unmapped;
- every decision was BLOCKED / SOURCE_CONTEXT_UNSUPPORTED;
- correctness and independence remained unknown, environment remained null,
  context remained NOT_ASSESSED, and admitted skill evidence stayed empty.

The optional compatibility scan completed against the existing Phase C reader.
All three occurrences reported NO_EXACT_LINEAGE; it did not substitute a
submission-, word-, date- or text-similarity match.

A bounded replay of the same snapshot completed through the same recovery
endpoint. The database verifier and browser reload then established:

- two immutable projection batches and six historical receipts;
- exactly three receipts in the deterministic current view;
- three EXACT_HISTORICAL_MATCH links to the prior receipts;
- four governed skill-candidate rows across both interpretations;
- zero admitted Phase C events and zero skill evidence projections;
- current mode showed one batch/three receipts, while full-history mode showed
  two batches/six receipts;
- repeated occurrences retained separate performance lineage, while each
  re-interpretation retained its original exact lineage.

The non-admin account reached the report URL and received the existing 404
authorization boundary. The allowlisted admin loaded current mode, ran the exact
compatibility scan, reloaded after replay and selected full history. The report
had meaningful content, no framework overlay and no browser console errors.

## Consequence firewall and cleanup

Before setup and after replay, the verifier compared exact counts in
adle_learning_items, both reward ledgers, adle_authentic_use_events and
adle_review_schedule_words. Every count matched. The S5 tables have no learning,
reward, proficiency, Authentic Use, Review or retirement writer.

Cleanup disabled all five controls for the disposable child, deleted both exact
disposable auth accounts through the governed cascade, and verified that the
child, two projection batches and all occurrence receipts were gone. Protected
counts still matched baseline. Reloading the former admin session returned to
login. Private fixture credentials, callback tokens, staging keys, temporary
environment files, the local token server and the clean deployment worktree were
removed.

Proof tooling: scripts/whole-writing-s5-staging-proof.mjs. Local verification
also passed the production build, both TypeScript checks, the Phase B/C evidence
regression and 25 database assertions against a destroyed PostgreSQL 18 cluster.

This completes S5 in shadow. G1 and G3 remain required before S9 qualification,
and nothing in this receipt authorizes historical consequences or any S6–S13
consumer.
