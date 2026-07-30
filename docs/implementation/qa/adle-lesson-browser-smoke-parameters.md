# ADLE browser smoke-test parameters

Run every new or changed ADLE lesson against a fresh disposable child in the deployed staging build. A completion screen alone is not a pass.

## Deployment and fixture preflight

- Record the deployed build's Supabase project URL and verify that its exact
  project reference is `jlhotktspjvffslvuyfz` before reading credentials,
  creating a client, or creating the disposable child. Reject production
  project `wwohrqtunajrbwxyssjf`, unknown projects and missing identity.
- Query the route gate and assignment snapshot before opening the lesson. The profile must be active for staging, the selected profile must match the lesson under test, and the snapshot must contain the approved immutable item count.
- Stop the smoke test as **not run** if the deployment points to a different database, the profile is absent, or no valid assignment can be composed. Do not substitute a hand-built or production fixture.

## Required visual and interaction checks

- Capture a screenshot of every new activity before and after a correct interaction.
- For drag activities, use a real pointer drag; verify the draggable item moves, only its approved target accepts it, and it visibly snaps/locks after release.
- For paired visual pieces, inspect both silhouettes at normal zoom: paired tabs and sockets must be complementary rather than identical.
- For connection activities, select one left-column item, move the pointer through the board, and verify the temporary arrow follows the pointer. Then complete every connection and verify the final arrows persist.
- For each reused activity, inspect the page for exactly one instance of its feedback/reveal region. In particular, Cover Check must show one comparison panel only.
- For dictation, verify a labelled, visible, enabled sentence textarea is present before typing; type a sentence, press its explicit check button, inspect the sentence comparison, then advance.
- Complete reload/resume at one guided stage and one independent stage; verify the same assignment snapshot and current state remain usable.

## Required persistence checks

- Confirm the expected item count, independent attempt count, reflection, taught-word history and review-schedule rows.
- Record the deployment URL, screenshots, test child/assignment IDs and assertions in the profile proof receipt.
- Delete every disposable child, assignment, evidence, reflection and schedule row after verification, then restore temporary Preview access changes.
