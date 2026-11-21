import { createHash } from "node:crypto";
import manifest from "./reviewed-audio-manifest.json";
import { isDeviceSpeechSource } from "./audio-source";

type Recording = { src: string; sha256: string };

/** Build-time hashes refer to the actual static assets in this immutable deployment. */
export function reviewedAudioBlockers(
  facts: { wordRecording?: Recording; sentenceRecording?: Recording },
  assets: Readonly<Record<string, string>> = manifest,
): string[] {
  return ([['word', facts.wordRecording], ['sentence', facts.sentenceRecording]] as const).flatMap(([label, clip]) => {
    if (!clip || typeof clip.src !== "string" || !/^[a-f0-9]{64}$/i.test(clip.sha256 ?? ""))
      return [`Review the ${label} audio: a source and SHA-256 are required.`];
    const device = isDeviceSpeechSource(clip.src);
    if (!device && !/^\/audio\/[a-z0-9/_-]+\.(?:mp3|wav)$/i.test(clip.src))
      return [`Review the ${label} audio: the recording path is invalid.`];
    const actual = device ? createHash("sha256").update(clip.src).digest("hex") : assets[clip.src];
    if (!actual) return [`Review the ${label} audio: the recording is missing or is not a valid audio asset in this release.`];
    if (actual !== clip.sha256.toLowerCase()) return [`Review the ${label} audio: the recording changed since it was approved.`];
    return [];
  });
}
