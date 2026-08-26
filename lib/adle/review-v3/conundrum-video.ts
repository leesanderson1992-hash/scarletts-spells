import type { ReviewPromptCandidateSnapshotV3 } from "./contracts";

export const CONUNDRUM_VIDEO_BLOCKER = "review_conundrum_video_configuration_invalid" as const;

export interface FrozenConundrumVideo {
  readonly videoId: string;
  readonly watchUrl: string;
  readonly embedUrl: string;
  readonly title: string;
}

export type ConundrumVideoResult =
  | { status: "not_required" }
  | { status: "blocked"; code: typeof CONUNDRUM_VIDEO_BLOCKER }
  | { status: "ready"; video: FrozenConundrumVideo };

/** Validate authority, never repair it or discover alternative media. No network I/O. */
export function frozenConundrumVideo(
  prompt: Pick<ReviewPromptCandidateSnapshotV3, "challengeType" | "configuration">,
): ConundrumVideoResult {
  if (prompt.challengeType !== "conundrums") return { status: "not_required" };
  const config = prompt.configuration;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { status: "blocked", code: CONUNDRUM_VIDEO_BLOCKER };
  }
  // The governed content contract requires interactive video for Conundrums.
  // Earlier synthetic/text-only fixtures without a media declaration stay unchanged.
  const required = config.content_contract === "adle_review_writing_challenge_content_v1" ||
    ["embed", "youtube_video_id", "youtube_url", "youtube_embed_url", "video_title"]
      .some((key) => Object.hasOwn(config, key));
  if (!required) return { status: "not_required" };
  const blocked = { status: "blocked", code: CONUNDRUM_VIDEO_BLOCKER } as const;
  const embed = config.embed;
  if (!embed || typeof embed !== "object" || Array.isArray(embed) ||
    !("provider" in embed) || !("interactive" in embed) ||
    embed.provider !== "youtube" || embed.interactive !== true ||
    Object.keys(embed).some((key) => key !== "provider" && key !== "interactive")) return blocked;
  const id = config.youtube_video_id;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(id) ||
    config.youtube_url !== `https://www.youtube.com/watch?v=${id}` ||
    config.youtube_embed_url !== `https://www.youtube.com/embed/${id}` ||
    typeof config.video_title !== "string" || !config.video_title.trim()) return blocked;
  return {
    status: "ready",
    video: {
      videoId: id,
      watchUrl: config.youtube_url,
      embedUrl: config.youtube_embed_url,
      title: config.video_title,
    },
  };
}
