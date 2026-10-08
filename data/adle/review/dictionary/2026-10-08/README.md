# ADLE dictionary intake: 12 approved words

The 13-word readiness export was enriched on 2026-10-08. The content owner then instructed us to delete `malteasers` and approved the other 12 words for import. The two top-level CSVs record the approved 12-word set; `approved-csv/` contains the five canonical package tables required by the governed release tool.

The excluded spelling `malteasers` is absent from every import table. No spelling-resolution or learner evidence rows are part of this package.

Pronunciation is for en-GB. Cambridge Dictionary pages were consulted for base pronunciations. Inflected pronunciations and morphology are editorial analyses approved for this import by Katie Sanderson in the Codex conversation on 2026-10-08. `means` is used as a verb in its dictation sentence; `loads` is used as a plural noun. The `ingredients` link to a base-plus-prefix micro-skill remains a separate routing issue; this package imports its canonical plural word and does not activate that link.

Release requires the repository's immutable package preparation, identical staging release and verification, then production promotion and verification. Production writing-context AI configuration must stay tied to its existing deployment SHA; this content-only release must not trigger a new app deployment.
