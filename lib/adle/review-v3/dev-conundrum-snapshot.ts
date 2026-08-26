import type { CompiledReviewSnapshotV3, ReviewPromptCandidateSnapshotV3 } from "./contracts";
import { reviewWritingChallengeDevSnapshot } from "./dev-snapshot";
import { sealCompiledReviewSnapshotV3 } from "./snapshot-validator";

// Exact approved fixture from reviewed content commit 7e530e0311973a56a3a8a7961f1686b7d02ee608.
// Not a runtime prompt source: development QA/regression only.
export const GOVERNED_CONUNDRUM_FIXTURE: ReviewPromptCandidateSnapshotV3 = {
  "contractVersion": 3,
  "promptVersionId": "f26dfa1c-535c-40b7-9f14-580ec5b4d1b2",
  "stablePromptKey": "CONUNDRUM-_HoaznEUe9E",
  "challengeType": "conundrums",
  "contentVersion": "v2",
  "promptText": "Who should own the Novaroo photos: the photographer, shared ownership, or the Novaroos?",
  "instructionText": "Conundrums are problems that make you think.\n\nWatch the video carefully. There may not be one perfect answer. Decide what you think, then explain your reasoning. A strong answer tells us what you would choose, why you would choose it, and what might make someone else disagree.",
  "configuration": {
    "embed": {
      "provider": "youtube",
      "interactive": true
    },
    "title": "Who Owns the Novaroo Selfies? 📸",
    "locale": "en-GB",
    "top_tip": "Make a decision first. Then give your strongest reason. Finally, test your idea: What would someone who disagrees with me say?",
    "provenance": {
      "source_file": "astra_nova_conundrums_catalogue.xlsx",
      "source_kind": "user_approved_astra_nova_catalogue",
      "video_title": "#27 The Photo Conundrum",
      "youtube_url": "https://www.youtube.com/watch?v=_HoaznEUe9E",
      "source_range": "Catalogue!A31:H31",
      "video_source": "Astra Nova School",
      "source_library": "https://www.youtube.com/@astranovaschool/videos",
      "content_approval": {
        "method": "explicit_user_signoff",
        "approved_by": "user",
        "approved_on": "2026-08-26",
        "review_scope": "Unchanged catalogue title and question, shared introduction and Top Tip template",
        "approval_reference": "user-review-content-signoff-2026-08-26-v2",
        "video_review_basis": "user_signoff_in_context_of_video_review_handoff",
        "deployment_authorised": false,
        "source_queue_fingerprint": "7171ca281f32665f4465514c366a5df34495aab160ee339a03a65384409b1c8f",
        "independent_playback_verification": false,
        "independent_video_watch_verification": false
      },
      "youtube_video_id": "_HoaznEUe9E",
      "youtube_embed_url": "https://www.youtube.com/embed/_HoaznEUe9E",
      "source_file_sha256": "007c02c3d2d2a2af6fedc32431bb6ec0f0fdce33f69bf54f074fd02ee5736ddb",
      "source_queue_fingerprint": "7171ca281f32665f4465514c366a5df34495aab160ee339a03a65384409b1c8f",
      "catalogue_question_fidelity": "Description-derived"
    },
    "video_title": "#27 The Photo Conundrum",
    "youtube_url": "https://www.youtube.com/watch?v=_HoaznEUe9E",
    "video_source": "Astra Nova School",
    "category_label": "Conundrums",
    "category_top_tip": null,
    "content_contract": "adle_review_writing_challenge_content_v1",
    "youtube_video_id": "_HoaznEUe9E",
    "youtube_embed_url": "https://www.youtube.com/embed/_HoaznEUe9E",
    "instruction_reference": "adle-review-writing-challenge-2026-08-26-v2:instruction:conundrums"
  },
  "reusePolicy": "once_per_learner",
  "authority": {
    "releaseReference": "adle-review-writing-challenge-2026-08-26-v2",
    "sourceFingerprint": "7df8b446a9dd0447f131f30c3ef5959ca380b2b24019487a076f7e99ed020a80"
  }
};

export function reviewConundrumDevSnapshot(invalid = false): CompiledReviewSnapshotV3 {
  const original = reviewWritingChallengeDevSnapshot();
  const candidate = structuredClone(GOVERNED_CONUNDRUM_FIXTURE);
  const configuration = { ...candidate.configuration };
  if (invalid) delete configuration.youtube_video_id;
  const { sourceFingerprint: _fingerprint, ...provenance } = original.provenance;
  void _fingerprint;
  return sealCompiledReviewSnapshotV3({
    ...original,
    promptCandidates: original.promptCandidates.map((prompt) => prompt.challengeType === "conundrums"
      ? { ...candidate, configuration } : prompt),
    initialChallengeType: "conundrums",
    provenance,
  });
}
