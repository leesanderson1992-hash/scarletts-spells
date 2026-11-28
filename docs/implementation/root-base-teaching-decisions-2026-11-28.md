# Root and base teaching decisions — 28 November 2026

The owner retained affect and effect as whole free bases and explicitly excluded
them from the Common Latin roots importer. Their existing reviewed meanings,
word parts and Base families remain intact. Latin-specific exclusions and
reviewed deassignment events record this decision without withdrawing their
homophone or other lesson relationships.

Combust is reviewed as a verb meaning “To burn.” Its British pronunciation and
ordinary verb use were checked against [Cambridge](https://dictionary.cambridge.org/dictionary/english/combust).
Combustion uses the free base combust plus ion. The approved successor family
is `combust_verb_root_base_family`, displayed as “combust (base) — To burn”. The
internal sense ID is preserved. The former bound-root family remains immutable
history; an explicitly reasoned succession removes it from current Latin-root
classification. Combustion is deassigned and excluded from Common Latin roots.
The existing seven-word published Latin lesson pool and activation are unchanged.

Migration `20261128073000_reviewed_root_to_base_reclassification.sql` permits a
root-to-base correction only with an explicit review reason, matching approved
word/sense identity and a reviewed whole free-base analysis. A succession
without that reason remains rejected. The correction script is dry-run by
default. Staging dry-run, application and retry passed before Production dry-run
and application. No learner assignments or evidence were modified.

Future nested base/root analyses and explicit lesson word-sum display are
tracked in [development issue #101](https://github.com/leesanderson1992-hash/scarletts-spells/issues/101).
That future work does not change these current editorial decisions.

The invisible editor logged `TEACHING_LESSON_REVIEW_REQUEST_READ_FAILED` during
both load and post-save render. Its existing saved draft was recovered. Query
compilation added substantial overhead to the nested lesson-review lookup:
one Production comparison measured 1,090 ms with JIT and 183 ms without it,
with identical results. Migration
`20261128072000_dictionary_review_queue_latency.sql` disables JIT only inside
that function. Staging comparisons for invisible, visible and portable returned
identical editorial results before and after the setting. Both migrations are
applied and recorded in staging and Production; no application deployment or
writing-context approval terms changed.

An authenticated Production browser saved invisible as a draft and reloaded
successfully. The live reviewed dictionary facts were not approved or changed.
The editor normalised auxiliary metadata on the no-op save, so a new recoverable
draft preserves the exact original saved payload. The original source draft
remains intact. Machine receipts and the revised workbook are under
`outputs/root-teaching-decisions-20261128/`.
