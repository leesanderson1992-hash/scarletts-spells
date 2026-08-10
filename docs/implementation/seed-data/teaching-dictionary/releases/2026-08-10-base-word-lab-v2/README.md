# Base Word Lab v2 immutable route release

This reviewed BW-2B package binds the existing immutable Base Word family
authorities, the two signed-off teaching-content projections, and one shared
225-word Teaching Dictionary semantic closure into a single environment-neutral
`base_word_lab:v2` curriculum release.

The package does not activate the route, change environment variables, create
learning items or assignments, or modify learner state. Operational activation
is a separate CAS-protected revision and must remain behind the Base Word
allowlist and emergency-disable gate.

The Teaching Dictionary inputs are explicitly classified as
`legacy_pre_release_ledger_projection`: their exact semantic values and source
row IDs are captured here because the applied source batches predate the
release-ledger cutoff. Newer data must use normal release-ledger provenance.

The governed publisher is
`scripts/adle-base-word-route-production-release.ts`. It requires exact
`origin/main`, a clean worktree, a reviewed plan digest, and an operation-specific
confirmation token. Publication is transactionally idempotent and snapshots all
protected learner and assignment tables. Activation, pause, and safety revocation
are independent commands; no command widens access to `all_eligible`.
