# Guarded staging proof rule

For an explicitly authorised, disposable staging proof, treat the named proof
endpoint as one continuous task: reproduce, add a focused regression, repair
one bounded defect slice, test, commit, deploy a Preview, then resume the
fresh proof from its start. Do not stop at a deploy, login, intermediate UI
milestone, or individual smoke assertion.

Preserve the existing safety boundaries: staging only; one defect slice per
commit and Preview; no production, rollout, account changes outside the
disposable fixture, broad migrations, or irreversible action without explicit
approval. Stop only for unavailable required access or a genuine product
decision. Keep credentials and raw authentic spelling evidence private.
