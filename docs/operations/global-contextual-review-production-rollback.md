# Global contextual review: production trial and rollback

Status: implementation instructions only. The global switch is **off** by
default. This document does not approve V4 or authorise enablement.

## Before a production trial

Record the named owner and separate independent advisory-use approval. Apply
and verify the additive migrations, run the disposable database and end-to-end
parent/child proofs, confirm the pinned parser environment, and record the
current deployment identity. Test disablement in a non-production environment
before enabling production. The trial does not publish, select or approve V4.

## Immediate rollback

An operator with the service role calls
`public.disable_writing_context_advisory(<identified-operator-uuid>)` and
verifies `writing_context_advisory_control.enabled = false`. The function is
service-role-only and records the operator through the control's update
trigger. This is the first response to an unsafe or unavailable contextual
path. It stops new contextual source capture, advisory analysis and new parent
decisions while ordinary writing submission and spelling review continue.

```sql
select public.disable_writing_context_advisory('<operator-auth-user-uuid>'::uuid);
select enabled, updated_at, updated_by
from public.writing_context_advisory_control where singleton = true;
```

Do not run an enabling update as part of rollback. Preserve the query result
and deployment identity in the incident record.
Already recorded source, observations, parent decisions, issues and learning
facts remain intact. A parent may finish an already-created child retry; the
switch does not erase its lineage.

If application behaviour itself must be rolled back, restore the previously
verified deployment after the switch is off. Do **not** drop the additive
tables or reverse migrations in production: historical records and foreign
keys may depend on them. Keep the switch off until the defect is understood,
affected decisions are audited and a separately reviewed re-enable decision
is recorded.

Verify after disablement: new writing still submits; the spelling resolver and
existing Review Work still operate; no new contextual observations or parent
decisions appear; existing contextual records remain readable; pending ADLE
handoffs and reward reconciliation remain inspectable. Check unrelated
authentic-use and reward evidence was not suppressed at whole-sample level.
