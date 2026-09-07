# E1 genuine-source staging pilot — 7 September 2026

**PASS:** governed Production source receipt → observed staging gap →
deterministic candidate → human review → separate publication → authoritative
runtime reuse → occurrence-only replay → automatic withdrawal replay → retry →
cleanup.

## Source selection

A read-only Production audit applied E1's existing deterministic-source rules.
It found no uncovered approved morphology or generic-support pair and one
uncovered governed mapping pair. The selected assertion is:

- canonical word `certain` (`1aa39cae-dd31-525c-af9e-bc0e949ff812`, `en-GB`);
- micro-skill `D4_PG_S_SOUND_CHOICES_C_SOFT`;
- source kind `existing_confusion_mapping`;
- Production mapping `5ae6806b-30be-43b0-9a1c-70c03b606aee`;
- redacted source-receipt SHA-256
  `4b0a76d3dec3f0c78cb815957f96b911f40720dbc61b967e52c515deeb1e3934`.

The Production mapping is active, has matching case/decision lineage and is
resolver-hidden. The staging candidate preserves that boundary: S4 review can
authorize only the exact word–skill relationship. It does not enable the
mapping, create an alias or change resolver visibility.

Only a hashed authority receipt and opaque source references were copied into
the E1 attempt. Production learner writing, accounts and review-case content
were not copied. The Production project was read only and no Production row was
modified.

## Staging execution

The disposable staging cohort supplied two synthetic occurrences in one
submission so the ordinary E1 inventory and prioritization route was exercised.
The persisted gap is `missing_governed_relationship`, with two distinct
occurrences and one distinct submission.

- S4 package: `7863735c-306f-4a37-ac41-33aa37165f9b`.
- S4 release: `15938b9a-3b8d-4c9b-9c2a-0e9bccd6850d`.
- Review deployment: `dpl_6JWPt6KWdWXu1rL2o3HmWZuj3Uw1`, READY, with
  deployment-scoped staging Supabase credentials, the isolated `local`
  authority environment and an explicit staging administrator ID.
- Package candidates: one.
- Human decisions: one approval.
- Publication receipts: one, subsequently withdrawn.
- AI calls/tokens/cost: zero.

Authenticated browser verification displayed the exact `certain` candidate,
its governed Production source reference and an `ADMITTED_EXACT_PAIR` Phase B
preview. After human approval, a separate browser action published the one
approved pair. The existing worker claimed one bounded run and appended new
interpretations for exactly two stored occurrences. Both current
interpretations then contained the published relationship.

Browser withdrawal created a distinct authority event automatically. The worker
claimed one bounded run and both current interpretations no longer contained
the relationship. A repeat recovery claimed zero runs and created no duplicate
authority event.

Learning items, coin and gold-bar ledgers, Authentic Use events and review
schedules stayed unchanged throughout.

## Cleanup

Verification completed before cleanup. The disposable package, review,
publication, withdrawal, release, event, replay, inventory, occurrence and
account lineage was removed. The verifier found zero fixture residue. E1 and S4
review/publication/withdrawal controls are off, and the final authenticated UI
shows no remaining candidate package. Production remained unchanged.
