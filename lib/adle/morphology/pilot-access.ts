import "server-only";

function parseAllowlist(value: string | undefined): Set<string> {
  return new Set((value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean));
}

export function isMorphologyUnPilotEnabledForChild(childId: string): boolean {
  return process.env.ADLE_MORPHOLOGY_UN_PILOT_ENABLED === "enabled" && parseAllowlist(process.env.ADLE_MORPHOLOGY_UN_PILOT_CHILD_IDS).has(childId);
}

export function assertMorphologyUnPilotEnabledForChild(childId: string): void {
  if (!isMorphologyUnPilotEnabledForChild(childId)) {
    throw new Error(`D4_MOR un- pilot is not enabled for child ${childId}`);
  }
}
