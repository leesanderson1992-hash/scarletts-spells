export const BASE_WORD_FAMILY_PILOT_MAX_LESSONS = 5;

function allowlist(value: string | undefined): ReadonlySet<string> {
  return new Set((value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean));
}

/** Deliberately separate from the D4_MOR_PREFIXES_UN gate. Disabled by default. */
export function isBaseWordFamilyPilotEnabledForChild(childId: string): boolean {
  return process.env.ADLE_BASE_WORD_FAMILY_PILOT_ENABLED === "enabled"
    && process.env.ADLE_BASE_WORD_FAMILY_PILOT_EMERGENCY_DISABLED !== "true"
    && allowlist(process.env.ADLE_BASE_WORD_FAMILY_PILOT_CHILD_IDS).has(childId);
}

export function assertBaseWordFamilyPilotEnabledForChild(childId: string): void {
  if (!isBaseWordFamilyPilotEnabledForChild(childId)) {
    throw new Error(`D4_MOR base-word family pilot is not enabled for child ${childId}`);
  }
}
