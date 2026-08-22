/**
 * Versioned, renderer-independent activity contract consumed by the canonical
 * activity host. Persisted generic snapshots are decoded into this in memory;
 * this type is not a persisted payload version.
 */
export interface CanonicalActivitySpec {
  id: string;
  label: string;
  concept: string;
  mode: string;
  contractVersion: 1;
  payload: Readonly<Record<string, unknown>>;
  source: {
    templateKey: string;
    sectionKey: string;
    compatibility: boolean;
  };
}

export type CanonicalActivityNormalizationBlockerCode =
  | "ADLE_ACTIVITY_UNKNOWN_TEMPLATE"
  | "ADLE_ACTIVITY_UNSUPPORTED_SECTION"
  | "ADLE_ACTIVITY_INVALID_HISTORICAL_PAYLOAD"
  | "ADLE_ACTIVITY_RICH_INTERACTION_UNAVAILABLE";

export interface CanonicalActivityNormalizationBlocker {
  code: CanonicalActivityNormalizationBlockerCode;
  activityId: string;
  templateKey: string;
  sectionKey: string;
  detail: string;
}

export type CanonicalActivityNormalizationResult =
  | { status: "normalized"; spec: CanonicalActivitySpec }
  | { status: "compatibility"; spec: CanonicalActivitySpec }
  | { status: "blocked"; blocker: CanonicalActivityNormalizationBlocker };
