# E1 genuine-source staging pilot — 7 September 2026

**AWAITING HUMAN REVIEW:** one deterministic candidate is packaged in S4. It
has not been reviewed, published or replayed.

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

## Staging state

The disposable staging cohort supplied two synthetic occurrences in one
submission so the ordinary E1 inventory and prioritization route was exercised.
The persisted gap is `missing_governed_relationship`, with two distinct
occurrences and one distinct submission.

- S4 package: `7863735c-306f-4a37-ac41-33aa37165f9b`.
- Review page:
  <https://scarletts-spells-koxo2jt2q-leesanderson1992-hashs-projects.vercel.app/admin/word-skill-review?environment=local&package=7863735c-306f-4a37-ac41-33aa37165f9b>.
- Review deployment: `dpl_6JWPt6KWdWXu1rL2o3HmWZuj3Uw1`, READY, with
  deployment-scoped staging Supabase credentials, the isolated `local`
  authority environment and an explicit staging administrator ID.
- Package candidates: one.
- Review receipts: zero.
- Publication receipts: zero.
- AI calls/tokens/cost: zero.

E1 inventory, generation and replay controls are off. S4 review is enabled;
publication and withdrawal are off. The disposable cohort has no learning item,
coin, gold-bar, Authentic Use or review-schedule consequence.

Authenticated browser verification displayed the exact `certain` candidate,
its governed Production source reference and an `ADMITTED_EXACT_PAIR` Phase B
preview. The review form was enabled. No decision was submitted during
verification.

The next action is an exact-pair human review. If approved, publication remains
a separate action. Publication/replay should be enabled only for the bounded
pilot, followed by runtime verification, withdrawal replay and disposal of the
retained staging lineage.
