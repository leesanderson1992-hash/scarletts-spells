import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { canOpenAdleDesignPreview } from "@/lib/adle/design-preview-access";
import dinnerCandidates from "@/content/secret-life-of-vowels/dinner-preview-candidates.json";
import { parseDinnerActivityConfig } from "@/lib/adle/word-lab/call-it-to-dinner";
import {
  DETECTIVE_ACTIVITY_VERSION, DETECTIVE_ROUND_VERSION, parseDetectiveActivityConfig,
  type DetectiveFamilyV1,
} from "@/lib/adle/word-lab/family-tree-detective";
import { DetectivePreview } from "./preview";

export const dynamic = "force-dynamic";

function candidateFamily(word: string, id: string, recording: { src: string; sha256: string; reviewStatus: "approved" }): DetectiveFamilyV1 | null {
  const relative = word === "player" ? "play" : null;
  if (!relative) return null;
  return {
    authorityId: `candidate-preview-${relative}`,
    sourceFingerprint: createHash("sha256").update(`candidate-preview:${word}:${relative}`).digest("hex"),
    reviewStatus: "candidate", relationKind: "base_to_derived", name: relative,
    members: [
      { canonicalWordId: id, spelling: word, recording, morphologyNote: null, alignedVowelSpan: null },
      { canonicalWordId: `candidate-preview-${relative}`, spelling: relative, recording: null,
        morphologyNote: "play + -er → player", alignedVowelSpan: null },
    ],
    explanation: "play + -er → player",
  };
}

export default function DetectivePreviewPage() {
  if (!canOpenAdleDesignPreview()) notFound();
  const dinner = parseDinnerActivityConfig(dinnerCandidates, true);
  if (!dinner) throw new Error("Detective preview needs the existing reviewed-audio fixture.");
  const config = parseDetectiveActivityConfig({
    schemaVersion: DETECTIVE_ACTIVITY_VERSION,
    rounds: dinner.rounds.map((round) => ({
      schemaVersion: DETECTIVE_ROUND_VERSION,
      contentVersion: "family_tree_detective_preview_candidate_v1",
      reviewStatus: "candidate",
      canonicalWordId: round.canonicalWordId,
      spelling: round.spelling,
      microSkillKey: round.microSkillKey,
      wordSense: round.wordSense,
      pronunciationId: round.pronunciationId,
      sourceFingerprint: round.sourceFingerprint,
      recording: round.recording,
      target: { start: round.target.start, end: round.target.end, text: round.target.text, soundType: round.target.soundType },
      reviewedVowelIndex: null,
      family: candidateFamily(round.spelling, round.canonicalWordId, round.recording),
    })),
  }, true);
  if (!config) throw new Error("Detective preview candidate failed contract validation.");
  return <DetectivePreview config={config} />;
}
