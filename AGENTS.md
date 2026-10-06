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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
