# Bound-root entry audit — 2026-11-03

Read-only Production audit of the latest approved revision for each bound-root
lexical family found **29 families**, of which **27 have no reviewed root
metadata entry**. `veget_bound_root_base_family` is one of the 27. Its approved
revision 1 says “Latin: vegetus or vegetare — ‘lively or growing’,” while the
owner's reviewed pilot specifies the root meaning “To grow or live” and marks
pronunciation not applicable. An immutable new revision is needed to align the
family meaning, the vegetable word parts, and the root entry.

New bound-root approvals now require a root entry with the same lemma and
meaning. A family revision copies pronunciation applicability, including
`not_applicable`, and rejects missing root metadata. Existing revisions stay
immutable and readable; the 27 gaps need reviewed entries and new revisions
where family facts change. Root entries are dictionary family anchors and do
not receive standalone dictation sentences.

The new existing-member revision operation can replace a member's immutable
word-part snapshot and create a reviewed root entry in the next revision. It
accepts a changed root meaning only when every other current member already
uses that meaning; otherwise those members need review first. The rolled-back
staging proof covers a one-member meaning change, a later member replacement,
missing-entry rejection, and preservation of not-applicable pronunciation.

The dictionary family summary now prefers the latest approved lexical family
over a historical registry link. When a newer approved lexical revision removes
a word, the old registry link no longer displays it as a current member.

The 14-word pilot CSV now carries veget's family key, root definition, Latin
origin, and explicit not-applicable pronunciation. Its reviewed root gloss is
“To grow or live”. The import publisher has an atomic bound-root path for an
existing member with no route, learner, suffix, prefix, or legacy Base Word Lab
dependency: it publishes the Overview, creates the next immutable family and
root-entry revision, and reconciles the reviewed skill set in one transaction.
A rolled-back staging proof used an immigrant/migr fixture to verify the whole
path, including a missing-review rejection. The pilot's vegetable row still
needs the full staging and Production release gates before it changes live data.
