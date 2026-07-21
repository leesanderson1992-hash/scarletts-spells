# Guarded staging proof rule

For an explicitly authorised, disposable staging proof, treat the named proof
endpoint as one continuous task: reproduce, add a focused regression, repair
one bounded defect slice, test, commit, deploy a Preview, then resume the
fresh proof from its start. Do not stop at a deploy, login, intermediate UI
milestone, or individual smoke assertion.

Browser interruption recovery is part of the proof, not a terminal state:
reclaim or open a tab, re-authenticate the disposable account if necessary,
restore the recorded assignment, and continue from the last verified activity
without asking for permission. A proof may end only after its named Finish
action, reload/retry, and verifier checks pass; or after a documented need for
production/irreversible authority, unrecoverable required staging access, or a
genuine product decision. Never end for deploy readiness, login, tab loss,
individual activity success, or progress reporting.

Preserve the existing safety boundaries: staging only; one defect slice per
commit and Preview; no production, rollout, account changes outside the
disposable fixture, broad migrations, or irreversible action without explicit
approval. Stop only for unavailable required access or a genuine product
decision. Keep credentials and raw authentic spelling evidence private.
