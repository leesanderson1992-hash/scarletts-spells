export const ADLE_SPECIALIST_SNAPSHOT_V3_WRITER_MODE_ENV =
  "ADLE_SPECIALIST_SNAPSHOT_V3_WRITER_MODE" as const;
export const ADLE_SPECIALIST_SNAPSHOT_V3_CURRENT_LEARNER_CHILD_ID_ENV =
  "ADLE_SPECIALIST_SNAPSHOT_V3_CURRENT_LEARNER_CHILD_ID" as const;

export type SpecialistSnapshotV3WriterAuthorization = Readonly<{
  kind: "compound_word_v2_for_current_learner" | "dynamic_affix_v3_for_current_learner" | "dynamic_prefix_v2_for_current_learner" | "base_word_v2_for_current_learner";
  childId: string;
}>;

export type SpecialistSnapshotV3RouteKey = "compound_word_lab:v2" | "dynamic_affix_word_lab:v3" | "dynamic_prefix_word_lab:v2" | "base_word_lab:v2";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Missing, malformed, unknown and non-matching configuration is OFF. */
export function selectSpecialistSnapshotV3Writer(input: {
  childId: string;
  routeKey?: SpecialistSnapshotV3RouteKey;
  mode?: string;
  currentLearnerChildId?: string;
}): SpecialistSnapshotV3WriterAuthorization | null {
  const expectedMode = input.routeKey === "dynamic_affix_word_lab:v3" ? "dynamic_affix_v3_for_current_learner"
    : input.routeKey === "dynamic_prefix_word_lab:v2" ? "dynamic_prefix_v2_for_current_learner"
      : input.routeKey === "base_word_lab:v2" ? "base_word_v2_for_current_learner"
        : "compound_word_v2_for_current_learner";
  if (input.mode !== expectedMode) return null;
  const configuredId = input.currentLearnerChildId?.trim();
  if (!configuredId || !UUID.test(configuredId) || !UUID.test(input.childId)) return null;
  if (configuredId.toLowerCase() !== input.childId.toLowerCase()) return null;
  return Object.freeze({ kind: expectedMode, childId: input.childId });
}

export function configuredSpecialistSnapshotV3Writer(
  childId: string,
  routeKey: SpecialistSnapshotV3RouteKey = "compound_word_lab:v2",
): SpecialistSnapshotV3WriterAuthorization | null {
  return selectSpecialistSnapshotV3Writer({
    childId,
    routeKey,
    mode: process.env[ADLE_SPECIALIST_SNAPSHOT_V3_WRITER_MODE_ENV],
    currentLearnerChildId: process.env[ADLE_SPECIALIST_SNAPSHOT_V3_CURRENT_LEARNER_CHILD_ID_ENV],
  });
}
