# S8 V4 Stage A UNCERTAIN threshold amendment — 2026-09-24

This is a versioned holdout-administration and evaluator-contract amendment. It does not change any S8 analyser, parser, fallback policy, release manifest, dispatch or operational release state.

The original registered protocol required exactly 100 Stage A primaries per family with at least 40 VALID, 40 INVALID and 20 UNCERTAIN. After all primary decisions, blinded non-gold reviews and second-human adjudications were complete—but before any V4 analyser evaluation—the final human decisions produced fewer than 20 UNCERTAIN primaries in every family. Katie Sanderson authorised reducing the Stage A UNCERTAIN minimum to 10, and Lee Sanderson separately approved that change.

The amended Stage A gate is therefore:

- exactly 100 primary cases per family;
- at least 40 VALID;
- at least 40 supported INVALID;
- at least 10 UNCERTAIN or unsupported;
- at least five VALID and five supported INVALID cases in every declared subtype;
- at least two occurrences in every protected category, drawn from at least 10 distinct protected occurrences;
- at least two genuine-semantic-ambiguity and two unsupported-meaning cases.

The amendment is deliberately disclosed as post-adjudication. It must not be represented as the original pre-registered threshold, and it does not permit selecting cases using analyser predictions. A superseding selection may use only the already completed human decisions, the predeclared source-side quota ledger and sealed similarity evidence. All cases remain prediction-blind until the amended gold lock succeeds.

The final qualification standard is unchanged: at least 400 primaries per continuing family, including 150 VALID, 150 supported INVALID and 100 UNCERTAIN or unsupported, plus every construction, subtype, protected-set and performance gate. Stage A still cannot pass a family; it can only stop or continue it.

The registered amendment must bind the exact original protocol SHA-256, the four frozen V4 manifest fingerprints, the original and superseding administration/evaluator versions, the two human approval identifiers and the timing disclosure above.
