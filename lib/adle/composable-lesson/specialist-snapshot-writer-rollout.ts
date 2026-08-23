export const ADLE_SPECIALIST_SNAPSHOT_V3_WRITER_MODE_ENV =
  "ADLE_SPECIALIST_SNAPSHOT_V3_WRITER_MODE" as const;
export const ADLE_SPECIALIST_SNAPSHOT_V3_CURRENT_LEARNER_CHILD_ID_ENV =
  "ADLE_SPECIALIST_SNAPSHOT_V3_CURRENT_LEARNER_CHILD_ID" as const;

export type SpecialistSnapshotV3WriterAuthorization = Readonly<{
  kind: "compound_word_v2_for_current_learner";
  childId: string;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Missing, malformed, unknown and non-matching configuration is OFF. */
export function selectSpecialistSnapshotV3Writer(input: {
  childId: string;
  mode?: string;
  currentLearnerChildId?: string;
}): SpecialistSnapshotV3WriterAuthorization | null {
  if (input.mode !== "compound_word_v2_for_current_learner") return null;
  const configuredId = input.currentLearnerChildId?.trim();
  if (!configuredId || !UUID.test(configuredId) || !UUID.test(input.childId)) return null;
  if (configuredId.toLowerCase() !== input.childId.toLowerCase()) return null;
  return Object.freeze({ kind: "compound_word_v2_for_current_learner", childId: input.childId });
}

export function configuredSpecialistSnapshotV3Writer(
  childId: string,
): SpecialistSnapshotV3WriterAuthorization | null {
  return selectSpecialistSnapshotV3Writer({
    childId,
    mode: process.env[ADLE_SPECIALIST_SNAPSHOT_V3_WRITER_MODE_ENV],
    currentLearnerChildId: process.env[ADLE_SPECIALIST_SNAPSHOT_V3_CURRENT_LEARNER_CHILD_ID_ENV],
  });
}
