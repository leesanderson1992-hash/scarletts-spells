import type { CompiledReviewSnapshotV3, ReviewSnapshotJsonValue } from "./contracts";
import { reviewWritingChallengeDevSnapshot } from "./dev-snapshot";
import prompts from "./dev-r6-prompts.json";
import type { ReviewR6QaScenario } from "./dev-r6-scenarios";
import { sealCompiledReviewSnapshotV3 } from "./snapshot-validator";

export function reviewR6QaSnapshot(scenario: ReviewR6QaScenario, run: string): CompiledReviewSnapshotV3 {
  const base = reviewWritingChallengeDevSnapshot();
  const words = ["necessary", "Wednesday", "business", "because", "friend", "beautiful", "different", "remember", "bicycle", "imagine"];
  const count = scenario === "ten-targets" ? 10 : scenario === "five-targets" ? 5 : scenario === "one-target" ? 1 : 3;
  return sealCompiledReviewSnapshotV3({
    ...base,
    assignment: { ...base.assignment, assignmentId: `dev-r6-${run}`, reviewItemId: `dev-r6-item-${run}` },
    targets: words.slice(0, count).map((spelling, index) => ({
      ...base.targets[index % base.targets.length],
      encounterId: `dev-r6-${run}-encounter-${index + 1}`,
      canonicalWordId: `dev-r6-word-${index + 1}`,
      canonicalSpelling: spelling,
      order: index + 1,
      answerAuthority: { ...base.targets[0].answerAuthority, referenceId: `dev-r6-answer-${index + 1}` },
      audioAuthority: { ...base.targets[0].audioAuthority, referenceId: `dev-r6-audio-${index + 1}`, speechText: spelling },
      schedule: { ...base.targets[0].schedule, scheduleWordId: `dev-r6-schedule-${run}-${index + 1}` },
    })),
    promptCandidates: base.promptCandidates.map((candidate) => {
      const prompt = prompts.find((row) => row.challenge_type === candidate.challengeType)!;
      return {
        ...candidate,
        promptVersionId: `dev-r6-${prompt.stable_prompt_key}`,
        stablePromptKey: prompt.stable_prompt_key,
        contentVersion: prompt.content_version,
        promptText: prompt.prompt_text,
        instructionText: prompt.instruction_text,
        configuration: prompt.configuration as unknown as Record<string, ReviewSnapshotJsonValue>,
        authority: { releaseReference: `qa-local-copy:${prompt.release_reference}`, sourceFingerprint: prompt.source_fingerprint },
      };
    }),
  });
}
