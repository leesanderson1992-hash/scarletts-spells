# Governed Conundrum video presentation

This is a bounded Gate C presentation correction. It grants no prompt release,
learner activation, assignment creation, R7 or Phase E authority.

## Frozen authority and presentation

`adle_review_prompt_versions.configuration` is copied unchanged by
`r6-generation.ts` into prompt facts, frozen unchanged by
`r6-snapshot-compiler.ts`, and returned unchanged by the R6 Today read model.
Previously `ReviewFreeWritingActivity` read only `title` and `top_tip`; it ignored
the already-frozen video fields. It now renders `ConundrumVideoPlayer` between
the Conundrum title and the Prompt / Question panel. Top Tip, audio controls and
creative response follow, in the same single Review activity.

The approved v2 candidate `CONUNDRUM-_HoaznEUe9E` illustrates the authority:

- Video ID: `_HoaznEUe9E`.
- Watch URL: `https://www.youtube.com/watch?v=_HoaznEUe9E`.
- Embed URL: `https://www.youtube.com/embed/_HoaznEUe9E`.
- Accessible player title: `#27 The Photo Conundrum`.
- `embed`: `{ "provider": "youtube", "interactive": true }`.
- Content title: `Who Owns the Novaroo Selfies? 📸`.
- Source: Astra Nova School; reviewed source commit
  `7e530e0311973a56a3a8a7961f1686b7d02ee608`.

The player uses the frozen embed URL. It adds only API transport/control
parameters (`enablejsapi=1`, same-page `origin`, `playsinline=1`, `autoplay=0`).
There is no runtime media search, replacement, curriculum fetch or content edit.
The player is 16:9 where space permits, with YouTube's minimum 200px player
height on narrow screens. It is keyboard accessible and permits full screen.

## Failure boundary

`frozenConundrumVideo` is shared by snapshot validation and presentation. For
Conundrums, `adle_review_writing_challenge_content_v1` declares a required
interactive video. Any explicit video configuration also invokes validation.
Missing required fields, unsupported provider/embed options, malformed ID,
noncanonical or mismatched URLs and blank player title fail closed with
`review_conundrum_video_configuration_invalid`. Earlier synthetic text-only
fixtures with no media declaration are not reinterpreted as video content.

Compilation and the R6 read model block invalid governed configuration; the
activity also has a bounded content blocker before Start writing. Valid existing
snapshots keep their exact canonical JSON and fingerprint: no shape, version,
selection, timer or schedule-provenance changes are made.

The [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference)
reports player errors. API/network startup failures and readiness timeout show
an unavailable state, never a curriculum-corruption blocker. Retry remounts the
same frozen URL and title. It cannot change the snapshot, response, timer,
schedule or persisted state. A retry control also remains available for playback
problems the cross-origin player does not report to its host.

## Settled Target Word secrecy scope

Audio buttons, progress indicators and intentional retrieval hints must not
reveal hidden spellings. Incidental Target Word occurrences in ordinary labels,
instructions or approved prompts are not activation blockers. No global page
collision check, prompt filtering or wording changes are introduced here.

## Verification

- `npm run adle:review-conundrum-video-regression`: exact prompt-to-compiler-to-R6
  read-model-to-renderer authority, input preservation, deterministic compilation,
  invalid required fields and unsupported/mismatched configurations.
- `tests/adle/review-conundrum-video.spec.ts`: exact player URL/title, unchanged
  prompt and Top Tip, desktop/mobile geometry, retry preserving content/response,
  invalid-config blocker, non-Conundrum behavior and numbered audio controls.
- `/dev/adle/review-conundrum` is a development-only, gateway-free fixture; it
  returns not-found in production. It never accesses Production learner data.

R1–R6, specialist adapters, TypeScript, ESLint, production build and existing
Review browser regressions remain release requirements. Gate C1 and C2 remain
separate future owner-approved operations.
