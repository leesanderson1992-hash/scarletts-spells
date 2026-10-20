import "server-only";
import release from "@/content/secret-life-of-vowels/dinner-approved.json";
import { parseDinnerRound } from "./call-it-to-dinner";

/** Only the governed publication step changes this release; the review sheet is never a runtime API. */
export function publishedDinnerRounds() {
  if (release.schemaVersion !== "dinner_release_v1") throw new Error("Invalid Dinner release version");
  const parsed = release.rounds.map((value) => parseDinnerRound(value));
  if (parsed.some((value) => !value)) throw new Error("Dinner release contains an incomplete annotation");
  return parsed.filter((value): value is NonNullable<typeof value> => value !== null);
}
