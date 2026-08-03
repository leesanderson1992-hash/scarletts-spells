# Dynamic Prefix pedagogy production release regression matrix

Date: 2026-08-03

This matrix documents the guarded production-envelope regression. It does not
record a production release.

| Boundary | Evidence |
|---|---|
| Exact accepted bytes | Package drift changes the SHA and fails validation. |
| Environment identity | Production URL passes; staging, unknown and missing identities fail. |
| Read-only commands | `validate` and `plan` require the read-only flag and no mutation token. |
| Mutation authority | `release` and `deactivate` require the mutation flag and distinct exact tokens. |
| Plan immutability | Plan starts `repeatable read read only`, ends with rollback, and issues no write statement. |
| Profile scope | Mutable fields are exactly `meaning_bins`, `prefix_choices`, `intro_content`. |
| Activation/member safety | `production_enabled` is unchanged and the tool has no member update statement. |
| Rollback | Five profile projections and per-profile rollback hashes are mandatory. |
| Schema drift | Missing or unexpected production profile columns fail closed. |
| Protected state | Presence, count, or content-hash drift fails. |
| Vercel identity | Wrong project, non-Ready deployment, source-SHA drift, or premature compiler-mode configuration fails. |
| Migration ordering | Content publication fails until the ledger and live function both contain the reviewed 20-item guard. |

Primary command:

```text
npm run adle:dynamic-prefix-pedagogy-production-regression
```

The required broader matrix remains the matrix in the
[production publication handoff](../dynamic-prefix-pedagogy-production-publication-handoff-2026-08-03.md).
