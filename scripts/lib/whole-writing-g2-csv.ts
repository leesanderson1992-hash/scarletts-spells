export const G2_CSV_PACKET_EXPORT_VERSION = "G2_CONTEXT_FAMILY_BLINDED_CSV_V1_2026_09_08" as const;

export const G2_CSV_HEADERS = [
  "case_id",
  "family",
  "source_text",
  "focus_surface",
  "start_utf16",
  "end_utf16",
  "classification",
  "intended_alternative",
  "supported_construction_status",
  "ambiguity_or_exclusion_reason",
  "confidence",
  "rationale",
] as const;

export const G2_CSV_ANSWER_HEADERS = G2_CSV_HEADERS.slice(6);
