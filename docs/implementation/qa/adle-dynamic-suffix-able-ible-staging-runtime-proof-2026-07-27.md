# Dynamic Suffix `-able/-ible` staging runtime proof — 2026-07-27

## Scope

This proof covers only `D4_MOR_SUFFIXES_ABLE_IBLE` in staging. The profile is
production-disabled and no production database or deployment changed.

## Evidence

- The reviewed four-member profile is active in staging with
  `production_enabled = false`.
- The child-facing introduction displays the standalone-word/bound-root rule
  and a distinct `The suffixes -able and -ible mean can be.` callout.
- A dedicated staging child completed immutable assignment
  `69cbe624-a3c2-4bd5-96db-07d75a21ba96`: all 16 items completed, with six
  guided events, four controlled-spelling events, four full-sentence dictation
  events, and the `able-ible-base-test-v1` reflection.
- The verified authentic target produced one taught-history row and one active
  review-schedule row. Transfers are lesson context and are not independently
  scheduled.
- Child review confirmed the revised opening page is ready.

## Release decision

`D4_MOR_SUFFIXES_ABLE_IBLE` is `staging_approved`. Production promotion still
requires the separately authorised production import, profile activation, gate
verification, and deployment receipt.
