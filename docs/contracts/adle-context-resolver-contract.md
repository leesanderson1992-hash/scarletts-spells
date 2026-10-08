# ADLE Context Resolver Contract — CR.1

## Status and authority

- Authority version: `ADLE_CONTEXT_RESOLVER_CONTRACT_V1`
- Registry version: `ADLE_CONTEXT_REGISTRY_V1_2026-09-02`
- Registry SHA-256: `56c616b46811cba066a14794d16a8c8fda444af864ad48e140650f111b2b94a3`
- Corpus version: `ADLE_CONTEXT_REGRESSION_CORPUS_V1_2026-09-02`
- Corpus SHA-256: `4bd36950f3f33d54b5e1c8daaa6573b7e68cce0133a27d0358745b10bcb71ab0`
- Implementation state: `CR.1_AUTHORITY_ONLY`; no learner-facing runtime consumes this contract.

This contract owns only the `CONTEXT` question: whether an already-resolved
canonical word is appropriate at one exact occurrence. Canonical identity is
owned by the existing resolver/dictionary authorities; provenance is supplied
as a separate description; reward, authentic-use, proficiency, and retirement
authorities own qualification. A contextual result must never imply learner
choice, independence, authenticity, or downstream credit.

## Governed V1 registry and canonical bindings

| Confusion set and version | Existing Domain 4 micro-skill key | Exact canonical word keys |
|---|---|---|
| `THERE_THEIR_THEYRE` / `ADLE_CONTEXT_CONFUSION_SET_THERE_THEIR_THEYRE_V1` | `D4_HOM_FUNCTION_WORD_HOMOPHONES_THERE_THEIR_THEYRE` | `there_en_gb`, `their_en_gb`, `they_re_en_gb` |
| `TO_TOO_TWO` / `ADLE_CONTEXT_CONFUSION_SET_TO_TOO_TWO_V1` | `D4_HOM_FUNCTION_WORD_HOMOPHONES_TO_TOO_TWO` | `to_en_gb`, `too_en_gb`, `two_en_gb` |
| `YOUR_YOURE` / `ADLE_CONTEXT_CONFUSION_SET_YOUR_YOURE_V1` | `D4_HOM_CONTRACTION_POSSESSIVE_YOUR_YOURE` | `your_en_gb`, `you_re_en_gb` |
| `ITS_ITS` / `ADLE_CONTEXT_CONFUSION_SET_ITS_ITS_V1` | `D4_HOM_CONTRACTION_POSSESSIVE_ITS_ITS` | `its_en_gb`, `it_s_en_gb` |

The word key, governed normalized surface, `en-GB` dialect, active row state,
first-exposure approval, stable identity, and exact canonical word ID form one
binding. The repository authority does not hard-code environment-specific UUIDs:
activation must resolve each listed key to exactly one current canonical word ID
and retain that ID in the bound registry. Missing, multiple, inactive,
unapproved, unstable, surface-conflicting, or micro-skill-conflicting facts
block the whole registry. Deferred confusion families are not V1 members.

## Public result contracts

`ContextRequirement` is `REQUIRED | NOT_REQUIRED`.
`ContextualUsageResult` is `VALID | INVALID | UNCERTAIN`.
`ContextDecisionMethod` is `DETERMINISTIC_RULE | CONSTRAINED_CLASSIFIER |
HUMAN_OVERRIDE`.

`NOT_REQUIRED` means only that the canonical identity is not governed by a
context-sensitive family under this exact registry version. It does **not**
mean semantic correctness was verified and it cannot carry a contextual result.

A future classifier decision is contract-admissible only with an approved,
family-specific, versioned calibration-policy reference plus model and prompt
versions. CR.1 fixes no numeric probability, margin, precision, or confidence
threshold; concrete policy and calibration belong to CR.4.

## Occurrence identity and provenance boundary

The occurrence schema is `ADLE_CONTEXT_OCCURRENCE_SCHEMA_V1`. Its deterministic
identity binds:

- learner ID;
- source class, entity type, entity ID, revision, content fingerprint, and field;
- exact canonical word ID, word key, normalized word, and dialect;
- normalized observed surface; and
- zero-based UTF-16 start/end offsets in that source revision.

This permits independent decisions for repeated uses of one word in one piece.
The occurrence identity is stable on replay, changes when the source fingerprint
or span changes, and is independent of validator version so multiple versioned
decisions can coexist through decision/supersession lineage.

Provenance remains a separate input with `sourceClass`, `targetSelection`,
`answerVisibility`, `supportLevel`, and `verificationState`. None is inferred
from `VALID`.

## Governed regression corpus

The synthetic, repository-owned corpus in
`lib/adle/context-resolver/regression-corpus-v1.ts` contains 29 writing cases
and 36 expected occurrence decisions. It covers every V1 candidate, all
required correct functions, wrong choices, conservative gerund and fragment
counterexamples, missing punctuation, run-ons, line breaks, capitalization,
straight/curly/modifier apostrophes, unrelated spelling errors, repeated and
mixed-result occurrences, copied target misuse, Unicode normalization,
policy-relative calibration boundaries, replay, changed-source identity, and
validator-version coexistence. Labels are future CR.2+ expectations; no CR.1
code makes those linguistic decisions.

## Explicitly deferred

CR.1 does not implement occurrence location, deterministic context rules,
classifier calls, storage, migrations, writing/review integration, parent
review, authentic-use emission, rewards/Gold Bar, proficiency, retirement,
Production mutation, or rollout. The smallest next gate is **CR.2 deterministic
validator + all-occurrence locator**.
