import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import lesson from "../data/adle/pilots/d4-mor-prefixes-un/v1/lesson.json";

type Kind = "guide" | "dictation";
const outputDir = resolve("public/audio/narration");
const clips = [
  ...lesson.beats.flatMap((beat) => [beat.say, beat.narration].filter((line): line is string => Boolean(line)).map((text) => ({ text, kind: "guide" as Kind }))),
  ...Object.values(lesson.dictation).map((entry) => ({ text: entry.sentence, kind: "dictation" as Kind })),
].filter((clip, index, all) => all.findIndex((candidate) => candidate.text === clip.text && candidate.kind === clip.kind) === index);

function key(text: string, kind: Kind): string {
  let value = 2166136261;
  for (const character of `${kind}:${text}`) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return `${kind}-${(value >>> 0).toString(16)}`;
}

mkdirSync(outputDir, { recursive: true });
const manifest = clips.map((clip) => {
  const id = key(clip.text, clip.kind);
  const path = `${id}.m4a`;
  const temporaryAiff = resolve(outputDir, `${id}.aiff`);
  const rate = clip.kind === "dictation" ? "126" : "153";
  // Flo is a built-in UK female macOS voice. Static, reviewed audio avoids
  // both a recurring vendor cost and sending learner-specific text away.
  execFileSync("say", ["-v", "Flo", "-r", rate, "-o", temporaryAiff, clip.text], { stdio: "inherit" });
  execFileSync("afconvert", ["-f", "m4af", "-d", "aac", "-b", "64000", temporaryAiff, resolve(outputDir, path)], { stdio: "inherit" });
  rmSync(temporaryAiff, { force: true });
  return { id, text: clip.text, kind: clip.kind, path: `/audio/narration/${path}` };
});
writeFileSync(resolve(outputDir, "manifest.json"), `${JSON.stringify({ version: 1, voice: "Flo", locale: "en-GB", clips: manifest }, null, 2)}\n`);
console.log(`Generated ${manifest.length} reviewed candidate narration clips.`);
