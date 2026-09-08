export const G2_ADJUDICATION_CSV_VERSION = "G2_CONTEXT_FAMILY_ADJUDICATION_CSV_V2_2026_09_09" as const;

export const G2_ADJUDICATION_CSV_HEADERS = [
  "case_id",
  "family",
  "source_text",
  "focus_surface",
  "start_utf16",
  "end_utf16",
  "primary_labeler_id",
  "primary_classification",
  "primary_intended_alternative",
  "primary_supported_construction_status",
  "primary_ambiguity_or_exclusion_reason",
  "primary_confidence",
  "primary_rationale",
  "secondary_review_classification",
  "secondary_review_intended_alternative",
  "secondary_review_supported_construction_status",
  "secondary_review_rationale",
  "classification",
  "intended_alternative",
  "supported_construction_status",
  "ambiguity_or_exclusion_reason",
  "rationale",
] as const;

export const G2_ADJUDICATION_ANSWER_HEADERS = G2_ADJUDICATION_CSV_HEADERS.slice(17);

export const G2_SECONDARY_REVIEW_DISAGREEMENT_HEADERS = [
  "case_id",
  "classification",
  "intended_alternative",
  "supported_construction_status",
  "rationale",
] as const;
