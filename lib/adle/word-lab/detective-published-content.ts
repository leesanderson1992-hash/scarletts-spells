import "server-only";
import release from "@/content/secret-life-of-vowels/detective-approved.json";
import { parseDetectiveRound } from "./family-tree-detective";

/** The review sheet is not a runtime source. Only governed publication changes this release. */
export function publishedDetectiveRounds() {
  if (release.schemaVersion !== "detective_release_v1") throw new Error("Invalid Detective release version");
  const parsed = release.rounds.map((value) => parseDetectiveRound(value));
  if (parsed.some((value) => !value)) throw new Error("Detective release contains an incomplete annotation");
  return parsed.filter((value): value is NonNullable<typeof value> => value !== null);
}
