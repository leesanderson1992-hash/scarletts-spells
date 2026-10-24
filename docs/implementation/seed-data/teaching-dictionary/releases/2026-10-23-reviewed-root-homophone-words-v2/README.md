# Reviewed root-dependency and homophone words v2

This is the package to stage and promote. It contains **194 distinct en-GB
canonical words**: 157 complete canonical/auxiliary rows from the owner-approved
root-dependency workbook, plus 37 additional words from the approved homophone
intake. `ill` appears in both sources and uses the complete full-dictionary row
as one identity.

`had` is included as an irregular form of `have`, assigned to the proposed
`have_verb_base_family`. Its canonical pronunciation hint is the UK strong
form `/hæd/`; the workbook records weak `/həd/` and `/əd/` as contextual forms,
checked against the Cambridge Dictionary UK pronunciation entry. The
`precede` dictation target index is corrected from 4 to 3.

The approved source CSV retains definitions and proposed family tags. The
canonical-word package schema imports word identity, bands, pronunciation,
morphology and dictation. Definition publication and lexical-family approval
are separate Teaching Dictionary operations. The 128 root rows are reviewed
family decisions, not canonical spoken words. `essence` still lacks a complete
free-noun canonical row and is excluded from this package.

`prepare-approved-csv` validated this package on 23 October 2026. The exact
package hash (`7a6bbffd6b989309746cb238dc056836bd42f064abdcd9ca0d7ed7fe2e06cb25`)
was released and independently verified in schema-only staging
`jqdbqjvzdzccakmmpbbw`, then in Production `wwohrqtunajrbwxyssjf`. See
`receipts/staging.json` and `receipts/production.json`. Production active words
rose from 1,993 to 2,187. The canonical package changed only its owned tables.
The approved definitions were subsequently published through the governed
definition-only function and verified for all 194 words; see
`receipts/definitions-staging.json` and `receipts/definitions-production.json`.
Lexical-family relationships, root-family authority and ADLE lesson routes
remain separate releases.

To conserve Free-plan capacity, staging contains no Production learner data.
The schema-only copy transferred about 2.7 MB from Production. After this
package release, Production database size was 400,444,563 bytes and staging was
34,084,531 bytes. After the definition release, the respective sizes were
400,534,675 and 34,444,979 bytes. The disposable staging project was deleted
after both independent verifications; its receipts remain in this folder.
