# ADLE 7-UI Change Control

## Purpose

This document defines which records must be updated when 7-UI facts change.

## Required Updates By Change Type

| Change type | Required updates |
|---|---|
| New template or template contract change | Template development contract, template catalog, decision register if policy changed, affected matrix rows |
| New template version | Template contract, activity platform architecture, decision register, affected payload/schema tests, matrix template sequence fields |
| Category starts active work | 7-UI roadmap, global matrix category rows, category design pack, source-artifact register |
| Category contract freezes | Category pack, global matrix, category matrix, decision register closed decisions, proof register links |
| Micro-skill content authored | Global matrix `content_authored_status`, category matrix, source-artifact register if new source |
| Micro-skill content reviewed | Global matrix `content_reviewed_status`, category matrix, proof/review record link |
| Micro-skill content activated | Global matrix `content_activated_status`, content version field, source/provenance record |
| Runtime implemented | Global matrix `runtime_implemented_status`, affected architecture/template docs if contract changed |
| Runtime enabled | Global matrix `runtime_enabled_status`, proof register link, rollout status in 7-UI roadmap |
| Proof recorded | Proof register, affected global matrix `proof_record_ref` and validation fields |
| Evidence semantics change | Evidence blueprint contract first; 7-UI docs may only link to the approved change |
| Scheduler or reward boundary change | Owning scheduler/reward contract first; 7-UI docs may only link to the approved change |

## Decision Logging

Costly or hard-to-reverse choices stay in:

- `docs/implementation/seed-data/adle-7-ui/control-matrix/adle-7-ui-decision-register.csv`

Unresolved matters remain `open`; documentation must not silently choose them during unrelated work.

## Source Artifact Retention

Source artifacts that inform category design or teaching content must be retained under:

- `docs/implementation/seed-data/adle-7-ui/source-artifacts/`

The source-artifact register must record checksum, source, intake date, status, retention path, transformations, validation artifacts, and supersession.
