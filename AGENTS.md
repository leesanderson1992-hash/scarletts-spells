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

# Production writing context AI release gate

The owner granted standing permission on 2026-10-09 for writing-context AI to
remain active across ordinary Production code deployments until she explicitly
revokes it. For a deployment that preserves the approved Production OpenAI
project, model, endpoint, retention/data-sharing terms, configuration and
runtime fingerprints, rate card, and request/spend limits, this standing
permission authorises recording a fresh exact-SHA provider approval and
completing the release without asking for repeated owner consent. Cite the
2026-10-09 standing permission in each new approval's evidence reference.
Revocation or a material change to any of those terms requires renewed owner
authority. This standing permission does not bypass any runtime safety check,
learner authorisation, or the per-deployment SHA binding below.

For every Production release that may run writing context AI, bind provider
approval to the **exact commit SHA of the deployment being promoted**. An
approval for an earlier SHA does not cover a new deployment. Record the new
approval with the matching environment, OpenAI project, model, configuration
fingerprint, runtime fingerprint, owner and evidence reference. Check that
the active policy has the intended rate card and spend limits, and that the
approval and learner authorisations are current and unrevoked.

Keep the database AI control disabled and the recovery scheduler off during
the release. Build a candidate deployment with its exact
`CONTEXT_AI_DEPLOYMENT_SHA` and a per-deployment
`CONTEXT_AI_RELEASE_HOLD=disabled` override. Verify
its authenticated SHA, runtime and hold readback against the new approval
before promotion. After promotion, verify the public alias has the same
readback; only then activate the policy and scheduler for that SHA. Check the
safety monitor, authenticated recovery response, scheduler delivery and send
ledger. If a binding or safety check fails, disable AI control and the
scheduler until corrected.

The project-level Production release hold remains enabled so an automatic
future deployment pauses AI by default. Each release needs its own verified
SHA-bound approval and release steps; never copy an old SHA into a new
deployment to make the checks pass. Production changes still require the
explicit authority stated above.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
