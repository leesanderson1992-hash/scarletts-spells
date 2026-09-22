# S8 V4 persistent-worker semantic differential audit

Status: **resolved**. This is development infrastructure evidence, not approval evidence.

## First divergence

All 18 mismatches first diverged at parser-request validation, after the exact source, focus surface, UTF-16 span, family members, counterfactual strings and request payload had been constructed, but before spaCy ran. The governed adapter canonicalised both U+2019 (`’`) and U+02BC (`ʼ`) to ASCII apostrophe. The worker canonicalised U+2019 only, rejected every U+02BC focus with `SOURCE_SPAN_OR_FAMILY_MISMATCH`, and therefore never reached tokenisation, normalized features, DependencyMatcher, helpers, protection or arbitration.

The fix makes worker validation use the governed normalization. No family rule or decision policy changed.

## Exact mismatch inventory

The source text is retained byte-for-byte in the frozen G2 candidate record named by each case ID. Protection was null in every mismatch.

| Family | Case | Focus/span | Normal path | Pre-fix worker | Normal scope |
|---|---|---:|---|---|---|
| YOUR | g2-your-youre-0018 | `youʼre` 46:52 | VALID | UNCERTAIN | you_are_contraction:adjectival_contraction |
| YOUR | g2-your-youre-0052 | `youʼre` 0:6 | VALID | UNCERTAIN | you_are_contraction:adjectival_contraction |
| YOUR | g2-your-youre-0086 | `youʼre` 37:43 | VALID | UNCERTAIN | you_are_contraction:adjectival_contraction |
| YOUR | g2-your-youre-0120 | `Youʼre` 45:51 | VALID | UNCERTAIN | you_are_contraction:adjectival_contraction |
| YOUR | g2-your-youre-0171 | `youʼre` 40:46 | INVALID→your | UNCERTAIN | possessive:possessive_subject_or_object |
| YOUR | g2-your-youre-0205 | `youʼre` 38:44 | INVALID→your | UNCERTAIN | possessive:possessive_subject_or_object |
| YOUR | g2-your-youre-0239 | `Youʼre` 43:49 | INVALID→your | UNCERTAIN | possessive:possessive_subject_or_object |
| YOUR | g2-your-youre-0273 | `youʼre` 0:6 | INVALID→your | UNCERTAIN | possessive:possessive_subject_or_object |
| YOUR | g2-your-youre-0352 | `youʼre` 70:76 | UNCERTAIN | UNCERTAIN (different reason/trace) | ordinary_writing_spacy_structural_context |
| ITS | g2-its-its-0018 | `itʼs` 46:50 | VALID | UNCERTAIN | it_has_contraction:perfect_contraction |
| ITS | g2-its-its-0035 | `itʼs` 45:49 | VALID | UNCERTAIN | it_is_contraction:adjectival_contraction |
| ITS | g2-its-its-0069 | `itʼs` 44:48 | VALID | UNCERTAIN | it_has_contraction:perfect_contraction |
| ITS | g2-its-its-0086 | `itʼs` 37:41 | VALID | UNCERTAIN | it_is_contraction:adjectival_contraction |
| ITS | g2-its-its-0120 | `Itʼs` 45:49 | VALID | UNCERTAIN | it_has_contraction:perfect_contraction |
| ITS | g2-its-its-0137 | `itʼs` 44:48 | VALID | UNCERTAIN | it_is_contraction:adjectival_contraction |
| ITS | g2-its-its-0154 | `itʼs` 61:65 | INVALID→its | UNCERTAIN | possessive:possessive_subject_or_object |
| ITS | g2-its-its-0205 | `itʼs` 54:58 | INVALID→its | UNCERTAIN | possessive:possessive_subject_or_object |
| ITS | g2-its-its-0256 | `itʼs` 57:61 | INVALID→its | UNCERTAIN | possessive:possessive_subject_or_object |

## Checkpoint invalidation

The V8 checkpoint header binds the evidence/gold fingerprint, case/request identity, manifest and member set, model package/tree and pipeline, spaCy version, adapter schema/version/implementation, DependencyMatcher fingerprint, structural contract, family helper, worker implementation, parser batch configuration and comparison-runner implementation. Earlier namespaces remain preserved locally and cannot be silently reused.

Exact clean/resume proof: a 400-case run was reduced to its header plus 100 completed records, resumed, and compared with the uninterrupted output. Both the canonical comparison artifact and completed checkpoint were byte-identical. A deliberately altered semantic header was rejected with `CHECKPOINT_INCOMPATIBLE`.
