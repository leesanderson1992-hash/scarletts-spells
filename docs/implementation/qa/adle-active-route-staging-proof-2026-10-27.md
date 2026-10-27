# Active ADLE route readiness: disposable staging proof — 27 October 2026

## Identity and scope

- Code proved: `c282251` on `proof/adle-suffix-readiness-20261027`, built as Preview `dpl_EDgzaR4ywRSyRBeuaMKgCEtyKuwq` at `https://scarletts-spells-adle-staging-20261025-helmi0wf2.vercel.app`.
- Database: disposable Supabase project `qkpjbajicacbrphthibk`. Migration `20261027080000_scope_inflection_relationship_release_members.sql` was applied here and verified here only.
- Production database and release settings were not changed. The Preview and synthetic learners were isolated from Production.
- This is a representative end-to-end proof for suffix, Base Word, `-ing`, and comparative/superlative route families, plus release-preflight checks for all four active skills in each inflectional family. It is not a claim that every active route received a child journey.

## Decisions proved

| Route and fixture | Administrative/selection decision | Child and durable result |
| --- | --- | --- |
| Suffix `D4_MOR_SUFFIXES_FUL_LESS` | Five profile members were present; the admin page showed five approved relationships and four technically complete/eligible words. `helpful` remained blocked by its explicit draft morphology provenance. The native selector compiled `careful`, `hopeful`, `careless`, `hopeless`. | Assignment `c3c3611f-a91e-4202-8a13-e7e9aca35e0d` completed: 18/18 immutable items, 16 attempts, one reflection, four taught words, two reviews, two source items awaiting review outcome, snapshot v3. |
| Base Word `D4_MOR_BASE_WORDS_PRESERVE_BASE` | Historical release preflight accepted compiler witnesses for authentic target members while a nonselectable support member retained its word-level blocker. The admin page showed ten associated/approved relationships and nine technically complete/eligible words. Current v2 family coverage still uses its stricter rule. | Assignment `502cad32-9391-482e-9496-ac3c785519c7` completed: 18/18 items, 18 attempts, one reflection, two taught words, two reviews, two source items awaiting review outcome, completed pilot run, snapshot v3. |
| `-ing` Regular `D4_INF_ING_ENDINGS_REGULAR` | Reviewed derived words gained positive canonical word–skill relationships. All four active `-ing` skills passed released-authority preflight. The Regular skill displayed 29 associated, approved, technically ready and administrative candidates in the staging fixture. | Assignment `b1dc1fc0-61e7-4a89-be83-5750f935d71a` completed: 21/21 items, 20 attempts, one reflection, two reviews, two source items awaiting review outcome, snapshot v3. Fresh login and reload preserved the completed lesson and ledger. |
| Comparative Regular `D4_INF_COMPARATIVE_SUPERLATIVE_REGULAR` | Reviewed derived forms gained positive relationships; six base forms remained support-only for this route. All four active comparative skills passed released-authority preflight. Regular displayed 18 associated forms, 12 approved target relationships, 18 technically complete forms and 12 administrative candidates. | Assignment `75b9aea5-486c-40ab-8aad-f40cb2d90e0c` completed: 22/22 items, 21 attempts, one reflection, two reviews, two source items awaiting review outcome, snapshot v3. Fresh login and reload preserved the completed lesson and ledger. |

The staging activation revisions for the two Regular inflectional skills were scoped to their synthetic child fixtures. That limited scope is an advisory on the admin route page, not a per-word content blocker. No Production activation or editorial approval was changed.

## Verification and performance evidence

- Re-ran the suffix and Base Word database completion verifiers, and the `-ing`/comparative fresh-login, reload and database verifier against the exact Preview above: all passed on 27 October.
- `adle-inflection-relationship-regression`, `adle:word-skill-scoped-read-regression`, `adle-ing-regression` (450 checks), `word-route-status-regression`, TypeScript, and the Vercel build passed. The first local invocation omitted the repository's `react-server` condition and failed at the `server-only` import; it was rerun with the required condition and passed. That runner error was not a product failure.
- The relationship regression checks manager deassignment and disabled route suppression. The scoped read regression checks that reusing a loaded support source preserves the same decisions while avoiding a repeat support-table read.
- The new Postgres read-only RPC returned 156 compact reviewed inflection membership rows when unscoped, 111,315 serialized JSON bytes in this staging sample. A single-word request returned one row, 680 serialized JSON bytes. The former authority JSON was approximately 135 KB for this sample. These are response-body measurements, **not billed Supabase egress** or a measured savings claim.
- No Production egress baseline was inferred from the sample. The separate usage comparison must use completed like-for-like windows with activity volume recorded.

## Remaining release gate

Integrate the isolated proof branch without overwriting the existing uncommitted main checkout. Apply the new migration to the intended release environment before serving the new RPC reader, then stage and verify the exact Production code SHA under the repository's writing-context AI release procedure. Promote only after the candidate readback and operational checks pass. The Production site is still on its previous release at the time of this receipt.

This proof establishes the repaired decisions and durable child flow for the representative route families. It does not create or approve new curriculum content, activate new routes in Production, or validate the ordinary parent-review path for the synthetic fixtures.
