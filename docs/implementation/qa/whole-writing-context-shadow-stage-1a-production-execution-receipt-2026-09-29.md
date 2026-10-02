# Stage 1A Production execution receipt — 2026-09-29

**STAGE_1A_COMPLETE_AI_DISABLED**

The nine approved migrations and exact approved application SHA are installed on normal Production. The authorised disabled-state infrastructure, synthetic browser, guard, lifecycle and locking checks completed. Final readback at 2026-09-29T09:54:28.234Z: enabled=false; ai_mode=disabled. No AI provider call, shadow activation, authentic learner-text transmission or Stage 1B work occurred.

Completion applies to the bounded Stage 1A checks below. Actual provider admission, nonzero capacity retention, active/in-flight kill-switch behavior and natural educational outcomes were not proved or authorised. These limits remain explicit; no educational or research evidence was manufactured to fill them.

## Authority, windows and frozen Git boundary

Katie Sanderson is the migration and recovery owner. The owner accepted the whole application release at 08008de437540311421223f11829b6c7bca594b5, including its scope beyond the previously deployed site, and broad service_role authority as a trusted infrastructure decision.

Branch: experiment/ai-context-benchmark. HEAD, upstream and live origin SHA were verified equal to 08008de437540311421223f11829b6c7bca594b5. Tracked worktree remained unchanged; no frozen migration, prompt, schema, deterministic gate or application file was edited. No merge/change to main, new commit, push, substitute SHA or settings/credential change accompanied this execution. This execution receipt is the only repository addition; committing it separately does not change the approved Production application SHA.

The original 60-minute window was 07:44:13.664–08:44:13.664 UTC (08:44:13–09:44:13 Europe/London); new migrations were prohibited after 08:29:13.664 UTC. All nine migrations completed before that cutoff. Original pauses did not reset the window. The original receipt correctly recorded incomplete postflight when that window ended.

The owner's “Proceed with now” authorised continuation of the outstanding checks with the same stop/timeout rules. The continuation window was 09:22:39–10:22:39 UTC (10:22:39–11:22:39 Europe/London). Fresh preflight passed at 09:26:15 UTC; fixtures were created afterward and fully cleaned at 2026-09-29T09:43:34.719Z. The last Production database verification completed at 2026-09-29T09:54:28.234Z, within this window. No migration or deployment was replayed during continuation.

## Production identities, backup and release

Supabase project: wwohrqtunajrbwxyssjf; name: Scarletts Spells; region: eu-west-1; ACTIVE_HEALTHY. PostgreSQL 17.6.1.104. The configured existing Production pooler connection verified current_user=session_user=postgres and database=postgres. No separate execution host, staging database or staging website was provisioned.

Accepted physical recovery point: backup id 1816997856; inserted_at=2026-09-29T06:27:18.376Z, 07:27:18 Europe/London; COMPLETED. PITR is disabled. The owner explicitly accepted the risk that catastrophic restoration could lose writes after that timestamp. Read-only management refresh at 2026-09-29T09:46:14.002Z confirmed the same project identity, completed backup and PITR state. No backup/settings/plan/cost change or restore occurred.

Vercel project: prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl; team: team_wGEZLHjfYh5juZIXKgZMGNRQ. Normal website: https://scarletts-spells.vercel.app.

Production deployment: dpl_3S3QPx2pShZBdex4QzoJbnSn82s5, READY, target=production, Git SHA=08008de437540311421223f11829b6c7bca594b5. It was rebuilt from Git-attributed deployment dpl_36v6DjEeHd8P799VJTnmP69VtaD8 using Production settings in the existing project:

```text
vercel redeploy dpl_36v6DjEeHd8P799VJTnmP69VtaD8 --target production --scope leesanderson1992-hashs-projects
```

Actual SHA/target and normal aliases were verified after release and again during continuation. Aliases include scarletts-spells.vercel.app, scarletts-spells-leesanderson1992-hashs-projects.vercel.app and scarletts-spells-git-exp-d16487-leesanderson1992-hashs-projects.vercel.app. Preview was not directly promoted or aliased. No concurrent migration runner or Vercel release was observed during refreshed preflight/final checks.

Retained application rollback target: dpl_DSMLYXTz4pSxde8jTquPWbqUCbTh, READY, Git SHA=398dbdb1d1084859de04ebe3214cc47bc03ea180. Its historical alias metadata is not evidence that it currently overrides the new deployment. No observed Production regression required rollback.

## Approved timeout mechanism and removal

Pinned Supabase CLI: 2.117.0. The shared native connection code and migration runner RESET ALL behavior were inspected. Pooler startup options did not reliably install the approved lock timeout, so the explicitly authorised role/database defaults were used:

```sql
ALTER ROLE postgres IN DATABASE postgres SET lock_timeout = '5s';
ALTER ROLE postgres IN DATABASE postgres SET statement_timeout = '120s';
```

Before: no matching role/database overrides; effective lock_timeout=0 and statement_timeout=120s. A fresh pooler backend after setting the defaults reported 5000/120000 milliseconds, reset values identical, source=database user. RESET ALL preserved both approved effective values. The pinned CLI native connection executed RESET ALL and asserted the same role/database/settings; migration up uses that shared connection/reset path. Every migration ran while the defaults were installed.

Scope: newly initialised postgres sessions in this database, including any other infrastructure session using that login; this was not CLI-process isolation. Existing sessions, global PostgreSQL settings, database-wide defaults and other login-role defaults were unchanged. Application anon/authenticated/service-role settings were not modified.

A verification pause removed the temporary defaults before diagnosis; resumption re-proved them without restarting the original execution window. Final removal at 08:00:22.565 UTC used:

```sql
ALTER ROLE postgres IN DATABASE postgres RESET lock_timeout;
ALTER ROLE postgres IN DATABASE postgres RESET statement_timeout;
```

Catalog overrides were absent; fresh connection and RESET ALL restored lock_timeout=0 and statement_timeout=120s. Other-role defaults matched the baseline. Continuation used transaction-local 5s/120s for its actual SQL connections, checked immediately after BEGIN; no new role-default override was installed. Final fresh/reset readback again showed 0 and 2min (PostgreSQL's equivalent display for 120 seconds). No temporary role settings remain.

## Exact migration manifest and history agreement

Before: 131 ledger entries, latest 20260924130000. After: 140 entries, latest 20260929150000. Only these nine files under supabase/migrations were applied, in order, one file per pinned native migration invocation, without seeds:

| Order | File | SHA-256 | Verified UTC | Ledger entries |
|---|---|---|---|---|
| 1 | 20260927120000_add_contextual_ai_advisory_boundary.sql | 1a8dae1fa62634aff5beacaed5e5c329c9d787324415dc70c39b4d00c289cc42 | 2026-09-29T07:48:32.614Z | 132 |
| 2 | 20260927130000_add_context_feedback_evidence.sql | 293de455eddd5d138c0ed49edc7619a77752af0518ca813962433adacde73fd0 | 2026-09-29T07:48:47.403Z | 133 |
| 3 | 20260928120000_correct_context_feedback_evidence.sql | 7a9c440089c98aafa6bc97e412cd58053a0c7e1339a676fb6a3906a3d2957601 | 2026-09-29T07:49:11.997Z | 134 |
| 4 | 20260929100000_harden_context_shadow_lifecycle.sql | 25cdec1aef450ddd80259fd095f5ba3cb8c4165f4a3575ac7ae0644a105732a2 | 2026-09-29T07:49:34.590Z | 135 |
| 5 | 20260929110000_add_context_shadow_governance_and_dispatch.sql | 9cbd8473352b9063b8e6970f51f6517ab2cc3ad3dc6afe2641baa7346afd26d2 | 2026-09-29T07:50:10.989Z | 136 |
| 6 | 20260929120000_add_context_ai_cost_provenance.sql | 10d8111509b425b4de1af7362e76ec01342a7834fc4d7882d407f42d2d8fecaa | 2026-09-29T07:56:57.319Z | 137 |
| 7 | 20260929130000_add_context_shadow_operations.sql | 082901dcc6a9c54984d7a1be9acb3e4454cc59a60f6ffce535a18eefdf88123e | 2026-09-29T07:57:20.290Z | 138 |
| 8 | 20260929140000_isolate_production_context_provider_proofs.sql | 8633514082fe6a4fb4d335f6af65d12e65ea8827f5cbafcad4b2f6a02b1eb3d5 | 2026-09-29T07:57:55.512Z | 139 |
| 9 | 20260929150000_fix_context_digest_schema_qualification.sql | afc35118fbc868fd0fe0e4d89a1307a25d9eb1ff3251e804ef4b1f2dfff37a10 | 2026-09-29T07:58:42.951Z | 140 |

Already-applied prerequisites 20260906100000, 20260906110000, 20260924120000 and 20260924130000 were verified and not replayed. Frozen file checksums matched. Parser-aware native statement arrays/names were checked after each file and all nine were compared again at 2026-09-29T09:47:50.557Z. The official v2.117.0 SQL parser was pinned by SHA-256 1964c8e87f13389ef1f77146d6d19e40e2ac86897de51cc2cd60d75ab98f0666. Retained before/after history includes metadata-only version/name/statement-array hashes.

Applicable expected function bodies/security/search paths, tables, valid indexes, enabled triggers and constraints were read back after each migration. The first three files used the runner's transaction; the remaining files used their authored BEGIN/COMMIT. Native history recording after authored commit was independently checked. No timeout, uncertain commit, partial/unledgered schema, invented ledger entry, automatic migration retry or unrelated migration was observed. Applying additive schema did not activate AI; enabled remained false and ai_mode was installed/defaulted disabled and stayed disabled after every file.

The digest correction preserved OIDs, owners, ACLs, signatures, SECURITY DEFINER/INVOKER status, fixed search paths and final frozen function definitions except the intended extensions.digest qualification. pgcrypto remains in extensions. A final service-role query under public,pg_temp resolved extensions.digest and matched a known SHA-256 value. No extension move or search-path broadening occurred.

## Hosted verification and authority/security model

The unchanged approved scripts/verify-context-shadow-hosted.mjs passed after migration and again after fixture cleanup. Secret injection remained private. TLS used verify-full with Supabase's public Production CA; an initial trust-chain error before queries was resolved by supplying the official CA, with no TLS validation or database SSL enforcement reduction.

The verifier establishes selected installed catalog/control assertions: 13 required migration versions; singleton controls/defaults; validated Stage 1 shadow-only constraint; private-table RLS and ordinary client table/RPC grants; owner-approved service privileges; qualified digest definitions/access; proof classification/ownership triggers and full applicable educational guard coverage; diagnostic cascades; and frozen non-personal consumption restrictions. Companion checks established complete nine-file statement/hash agreement and the hosted behavioral evidence below.

service_role is a fully trusted server/infrastructure identity with broad database authority. Least-privilege database grants do not contain a compromised or misused service-role credential. No service-role privilege-narrowing migration was introduced. Approved application/RPC paths and immutable/ownership/authority guards remain required. Direct registration deletion to relabel a surviving learner is not an approved pathway; cleanup used canonical learner deletion.

Normal authenticated owner-parent, non-owner parent-claim, child-mode parent-session, anonymous and trusted-service SQL role probes ran with explicit request claims. Owner/child-mode sessions saw only their owned fixture scope; non-owner claims saw no fixture child. All ordinary roles were denied private attempt reads and classification RPC execution; trusted service reads succeeded. Child mode shares the parent's authenticated database session and is not a separate database login role.

Actual anonymous Production PostgREST calls using the site's published public anonymous configuration denied private table reads and classification RPC calls with HTTP 401 / SQLSTATE 42501. The internal recovery API returned 401 without its server-only authorisation. No recovery worker was invoked by that negative API check.

The service client/proof processing imports retain server-only boundaries. Twelve observed parent-review browser chunks contained no service-role JWT or secret-key pattern, no private diagnostic marker, and no matching privately held local service-key reference. Production secret values were not fetched or logged. These are scoped client-asset checks, not an exhaustive historical log audit or a defence against compromised service authority.

An optional API probe rejected the local default browser configuration before sending any request because it points elsewhere. The configured Production pooler identity and the actual Production application's persisted fixture submission remained correct. The successful anonymous probe used the public configuration served by the normal Production site, verified against the approved project. Local settings were not changed. Future operator tools must explicitly bind verified Production access.

## Synthetic browser, classification and authority proofs

Only fresh, operator-owned disposable synthetic fixtures were mutated: two registered proof learners and their course/module/task scaffolding, plus one empty cleanup anchor. Registration preceded all writing. No account credential was created/changed, and no authentic learner/parent record was mutated.

The normal Production child lesson flow saved one synthetic response, reloaded successfully and displayed waiting-for-review status. Its normal processing job completed through the proof exclusion path. Parent review showed the same synthetic writing pending review. No approval, decision, repair, missed-word promotion or reward action was clicked. A second synthetic submission was created only for the separate database lifecycle fixture.

Two explicitly uncalled NOT_ASSESSED diagnostic rows and private lifecycle jobs were inserted for these fixtures. provider_called=false; transport_attempted=false; no response body, linguistic decision, alternative, usage, price or known cost was fabricated. Provenance was clearly marked synthetic infrastructure data. NOT_ASSESSED remained operational, never linguistic UNCERTAIN.

Snapshot inserts deliberately claimed REAL_LEARNER and shadow capture; the database stamped DISPOSABLE_PROVIDER_PROOF and false/disabled capture settings from trusted registration/control state. Snapshot purpose and proof registration updates were rejected as immutable. Used-task and wrong-owner registration probes, and another learner submitting to a registered proof task, were rejected.

The negative package completed 65 rollback-only probes. 42 educational table probes explicitly raised AI_PROOF_EDUCATIONAL_WRITE_DENIED. Three incomplete educational row probes were rejected by earlier existing lineage/validation authorities; those were not counted as executions of the proof guard. Three indirect route tables were checked for installed guard coverage, with their source education blocked. All 48 applicable guard tables remained installed; no educational source facts were manufactured for indirect/research tests. The Stage 1 constraint rejected enabled=true and parent-advisory mode.

A populated-fixture check found zero educational rows across 44 applicable child/learner authorities. Normal real-learner operations counted zero AI attempts; separately labelled proof operations counted two, with zero provider calls. Research/diagnostic promotion source facts could not be created for the proof learners through the guarded paths.

Parent and child full-reload HTML, DOM and embedded RSC payloads excluded the private diagnostic marker and attempt IDs while showing the legitimate synthetic response. ADLE's read-only empty-plan surface and the synthetic insights/Gold surface loaded without new assignments or educational evidence. Normal dashboard loaded after cleanup, no fixture scaffolding was visible, and no captured browser console/application error was observed.

Natural ADLE learning, parent educational approvals, Gold/authentic-use, proficiency/mastery and retirement outcomes remain explicitly deferred by owner decision. Their evidence was not manufactured; the empty read surfaces and negative guards are not positive learning-outcome proofs. No independent other-parent browser login or exhaustive API/log audit is claimed; SQL role probes and actual anonymous/client/read-model checks are recorded precisely.

## Admission locking, durable shape and lifecycle cleanup

Two connections using approved session-local timeouts tested both reservation and admission while controls were already disabled. Connection A held the singleton control row FOR UPDATE; B called the service RPC and was observed blocked by A. A invoked the kill switch, read back false/disabled and committed; B then returned AI_CONTROL_DISABLED for reservation and false for admission. The admission probe used a deliberately absent dispatch ID because creating a successful approved reservation is outside Stage 1A. Both tests consumed no request/exposure capacity. No timeout occurred.

Durable consumption has exactly the expected non-personal environment/day/policy-revision coordinates, currency/counters/sequence/timestamp columns and only a policy-history FK. Monotonic/delete-denial and settlement triggers are enabled; the settlement marker default is false. Combined Production consumption remains separate from source/learner retention. No budget policy, approval, authorisation, pricing or thresholds were seeded.

Cleanup completed at 2026-09-29T09:43:34.719Z:

1. The registered proof task's RESTRICT FK rejected premature task deletion in a rollback-only probe.
2. The designated snapshot was deleted, cascading its attempt, detector run/members, occurrence and private job. Scoped enqueue/claim returned null afterward.
3. Only fixture-owned courses were retained on the empty synthetic anchor so proof tasks outlived their registered learners. Parent/task ownership remained unchanged; no classification was relabelled.
4. The registered learners were deleted canonically, cascading registration, submissions, processing jobs, sources and private diagnostics/jobs.
5. Proof tasks were deleted after their learners, then the remaining owned task/course/module scaffolding and empty anchor were removed.
6. All eleven checked fixture relation scopes read back zero; scoped enqueue/claim remained null, with no orphan/recreated private work. Existing governed learning's two relevant ON DELETE RESTRICT boundaries stayed installed. No constraint was removed or authentic evidence deleted.

Research-candidate source FKs and diagnostic-promotion FKs were verified as six installed CASCADE edges. Populated research/diagnostic promotion deletion was not manufactured because its prerequisite educational facts are forbidden for registered proof learners. Populated uncalled AI diagnostic/source/job cascades were proved separately.

Consumption was zero before and after disabled admission and cleanup. Zero consumption is not proof that nonzero capacity survives deletion. Successful admission/deletion/no-refund, settlement replay, final-slot contention, active/in-flight completion and nonzero capacity retention remain separately authorised Stage 1B hosted gates, supported meanwhile by frozen local regressions.

## Final state, recovery and stop handling

Final database readback at 2026-09-29T09:54:28.234Z:

```ini
enabled=false
ai_mode=disabled
dispatch_scope=DENY
```

Exactly one control row. Provider approvals=0; learner authorisations=0; rate cards=0; attempts=0; dispatches=0; private jobs=0; durable consumption rows=0; proof registrations=0. All disposable fixture relations were empty. Temporary postgres/database timeout overrides were absent and original effective defaults restored. Provider configuration was absent in Production preflight; no credential, approval, capability or activation was introduced. No provider API was called by this execution; zero dispatch/admission records corroborate this, without claiming an exhaustive independent network audit.

Production remained on the exact approved READY deployment; no concurrent release/migration was observed. No actual schema drift, client leak, timeout, partial/unledgered migration, unexpected educational mutation or site regression occurred.

Private verification construction issues were diagnosed before continuation: native DO command-tag parsing, a digit-truncating function-name regex after migration six, a local evidence variable, accessibility diff interpretation, PostgreSQL name-array substring matching in a negative probe, an assumed local parser-source path, and the optional local anonymous client configuration. They caused stopped checks and read-only/savepoint diagnosis; they were not treated as Production passes. The corrected checks passed, migration six was never replayed, and no uncertain migration was automatically retried. Three earlier educational validation denials remain separately identified rather than suppressed.

If a subsequent incident occurs, preserve false/disabled controls and provider unavailability, stop and inspect actual ledger/schema before any retry. Do not increase timeouts, manually mark migrations applied, repair the ledger without bounded authority or down-migrate destructively. Retained additive schema can remain disabled with the previous application deployment restored through the existing Vercel rollback mechanism. Catastrophic database restore requires incident authority and acceptance of the recovery-point data-loss implications. No rollback or restore was required here.

No material Production code/configuration gap was uncovered within these scoped Stage 1A checks. Local default browser/client configuration was excluded as described above, and positive natural educational/provider/research behaviors remain outside this receipt's proof claims.

## Retained evidence and subsequent gates

Restricted metadata-only evidence directory: /private/var/folders/wn/7j7qr_8n0j9_j3fdw7n167nm0000gn/T/scarletts-stage1a-s7aicgti. It holds before/after ledger version/name/statement hashes, per-file readbacks, backup/project metadata, role-default before/set/fresh/RESET/cleanup proof, hosted verifier outputs, synthetic ownership identities, sanitized assertions, locking transaction order, cleanup and final counters. No database URL, password, service key, JWT, learner prose, parent note or provider response body is retained in this receipt or those evidence JSON files. Public client credentials used by the anonymous probe were memory-only. Synthetic writing is intentionally omitted from the receipt/evidence JSON; the private helper's deliberately synthetic test text is not authentic evidence.

Evidence SHA-256 values:

| File | SHA-256 |
|---|---|
| cycle-1-preflight.json | d7d135656696046cc71771d95d73842d66ddf3a99ada6713638d3c1eb1de76a4 |
| accepted-backup.json | 0de77b881e275011c61ee88491b88980e47c7900f1b194aa5185fa2dbd4a85a8 |
| execution-window.json | 854de605af22aa24068e361488b6c437ee0409d2cedc052c98f03dc413612098 |
| timeout-role-before.json | 6334734bd98868a18af5dedf3313d44e03c545f0b5ba1a02d0c2e0daddfeaf92 |
| timeout-role-set.json | e10c7bd19b5cac3b22f30713edf8b1863c27d3f7f5974a0757b799d26e594b03 |
| timeout-role-proof.json | 4b4aa39d70b5070db5748ca41b22b05d99839e87e53367c6c7bcc20a56e8d194 |
| timeout-role-cleanup.json | bfd73579451b86feae42ebd21263890300c0e225bdf6e39d21d25daa2f31e103 |
| migration-1.json | 696022aa860c4489104042385cffc1ea8b487606e7d84a9434e3d91264cc85cc |
| migration-2.json | 7dd1d9026e7cb16224472ba7598108973df253e681554e992b321c30e0c1abb9 |
| migration-3.json | 8d3939a8395ed78d9a8176ae3c166fb39bcab9be1e5636dfe72ed48f102f24d5 |
| migration-4.json | 305ea0725d76d0fe6741cc168b3aec730181541ba0a50c012c32958799458d82 |
| migration-5.json | 485b696b74f282aa75052de8f34464983ca55bf7378c59fec9f12656598524be |
| migration-6.json | 342ff343f365d4d32b2ce52a12967068044f830964ae9d7a82ecd60144f97a7b |
| migration-7.json | 0f11d82fbd74701a547c58b7d3780d6d929f552c70740ed7b6c256e27a3c728a |
| migration-8.json | 4394fb4f0a52c116f50079baf9cf217982ee99897395442d0a2771395672679a |
| migration-9.json | 3635b71e3c44b00790e3ad247e2ec31cdbc78285d634347bd83792da0d2f0afa |
| continuation-window.json | ff1dc6dcf246393cba37653cb19b01fd0c9ba5bfd9a658a61607cb12a80cf958 |
| continuation-preflight.json | 3f655b95d3079b2ce2ffa45d9158811d53cc704c831a0d0991964697839fedce |
| postflight-management.json | d7557a1c7d55ae9805a994655632506f19669023b928eaca01c4d3eb3909ecc4 |
| hosted-verifier-continuation.txt | f5f031d73a51e4e9479c7ede492ac28e17a239a167e3d1f82f01e0d8dce50646 |
| postflight-diagnostics.json | d11382a9845cddda08c28a179c6313db8b296929ba2b43f681aa7a7fe21fefae |
| postflight-negative.json | f9ccc7e1fe69c98eb8811058d3982e505e6fddad356e671451bb6ba6950124fb |
| postflight-locking.json | 2234250b67cad68f6b73291ad21fb7e08999897416310180476fe5a9792a2825 |
| postflight-public-api.json | 6721f3f560c22a83e6c32f4215c603670ad835c1c710b0053f17c1298a266294 |
| postflight-anonymous-rest.json | 3148db0dbdc5899cc24bd0a45cb87448b92949353bc40cf6281483106c728107 |
| postflight-browser.json | f6231e0632181397f966ddb1984b2d8a1bf737953a7e9549332fc7b157103079 |
| postflight-cleanup.json | 5df1e388e2250256bc5e0d126bf3f36b9e146322e0fed53ae73733a13f665fb4 |
| postflight-final.json | 38402a124211d5acb1aa587fadd22901e6e68b6569b4bd608f76f670e7772550 |
| postflight-durable-shape.json | 5ac8157c93dfcdb6be9c437757d555c2fb9e63a48e680d11e437ed0d8651f492 |

Operational rate, latency, sample, queue and cost thresholds still require later signed evidence; none were invented. Four governed families and unknown-family exclusions, independent dispatch, duplicate-send prevention, conservative ambiguous exposure, no provider retry and shared durable Production consumption remain frozen.

- Stage 1B: separate approval for actual project/key ZDR/privacy configuration and an operator-owned disposable synthetic provider proof in normal Production, then restore disabled state and complete cleanup.
- Stage 1C: separate explicit approval before any eligible authentic learner writing is transmitted.
- Stage 2/3: no authority follows from Stage 1A.

**STAGE_1A_COMPLETE_AI_DISABLED** — stop after this receipt. No Stage 1B work is authorised.
