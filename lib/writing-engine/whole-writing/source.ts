import { extractOccurrences, fingerprint, type BaselineSource, type SourceField } from "../baseline/source";

export const EXTRACTION_VERSION = "WHOLE_WRITING_EXTRACTION_V1";
export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export type SourceSnapshot = {
  id: string; submission_id: string; child_id: string; parent_user_id: string;
  source_revision: string; occurred_at: string; envelope: Record<string, unknown>;
};
export type WholeWritingField = SourceField & {
  provenance: "learner_response" | "excluded" | "unknown";
  reason: string;
  aliases: string[];
};

const pointer = (value: string) => value.replace(/~/g, "~0").replace(/\//g, "~1");

/** No text-based deduplication: only known structured/flat representations of
 * the same answer block are aliases. Nested authored leaves keep their paths. */
export function extractWholeWriting(snapshot: SourceSnapshot) {
  const envelope = snapshot.envelope;
  const draft = object(envelope.draftPayload);
  const blocks = object(object(envelope.taskContext).lessonSchema).blocks;
  const blockRows = Array.isArray(blocks) ? blocks.map(object) : [];
  const embedded = object(draft.__structured_lesson_response);
  const savedPayloads = Array.isArray(envelope.structuredPayloads) ? envelope.structuredPayloads.map(object) : [];
  const savedResponses = savedPayloads.filter((p) => p.type === "structured_lesson_response" || p.type === "structured_test_response");
  const savedIndex = savedResponses.length === 1 ? savedPayloads.indexOf(savedResponses[0]) : -1;
  const hasEmbedded = Array.isArray(embedded.answers);
  const response = hasEmbedded ? embedded : savedIndex >= 0 ? object(savedPayloads[savedIndex].value) : {};
  const responsePath = hasEmbedded ? "/draftPayload/__structured_lesson_response" : `/structuredPayloads/${savedIndex}/value`;
  const answers = Array.isArray(response.answers) ? response.answers.map(object) : [];
  const fields: WholeWritingField[] = [];
  const diagnostics: string[] = [];
  const used = new Set<string>();
  function add(path: string, value: string, provenance: WholeWritingField["provenance"], reason: string, aliases: string[] = []) {
    fields.push({ key: path, rawText: value, textHash: fingerprint(value), selectedForBaseline: provenance !== "excluded", provenance, reason, aliases });
  }
  function leaves(value: unknown, path: string, visit: (text: string, path: string, key: string) => void, key = "") {
    if (typeof value === "string") visit(value, path, key);
    else if (Array.isArray(value)) value.forEach((entry, index) => leaves(entry, `${path}/${index}`, visit, key));
    else for (const [childKey, entry] of Object.entries(object(value))) leaves(entry, `${path}/${pointer(childKey)}`, visit, childKey);
  }
  function classify(block: Record<string, unknown>, key: string): [WholeWritingField["provenance"], string] {
    if (block.exclude_from_spelling === true) return ["excluded", "SCHEMA_EXCLUSION"];
    const type = block.block_type;
    if (type === "question_text" || type === "question_textarea") return ["learner_response", "SCHEMA_TEXT_FIELD"];
    const collection = type === "question_table" ? block.columns : type === "question_repeatable_interview" ? block.questions : null;
    if (Array.isArray(collection)) {
      const entries = collection.map(object).filter((entry) => (entry.column_id ?? entry.question_id) === key);
      if (entries.length !== 1) return ["unknown", "NESTED_FIELD_UNRESOLVED"];
      const entry = entries[0];
      if (entry.exclude_from_spelling === true || entry.input_type === "select") return ["excluded", "SCHEMA_NESTED_EXCLUSION"];
      return type === "question_repeatable_interview" || entry.input_type === "text" || entry.input_type === "textarea"
        ? ["learner_response", "SCHEMA_NESTED_FIELD"] : ["unknown", "UNSUPPORTED_INPUT_TYPE"];
    }
    const nonWriting = ["heading", "section_intro", "rich_text", "callout", "action_link", "info_cards", "question_choice_single", "question_choice_multi", "comprehension_quiz_group", "carry_forward_reference", "titled_divider", "divider"];
    return typeof type === "string" && nonWriting.includes(type) ? ["excluded", "NON_WRITING_BLOCK"] : ["unknown", "UNSUPPORTED_BLOCK"];
  }
  answers.forEach((answer, index) => {
    const id = typeof answer.block_id === "string" ? answer.block_id : "";
    const matching = blockRows.filter((block) => block.block_id === id);
    const block = matching.length === 1 ? matching[0] : {};
    const duplicate = answers.filter((entry) => entry.block_id === id).length !== 1;
    const path = `${responsePath}/answers/${index}/value`;
    const flatPath = `/draftPayload/${pointer(id)}`;
    const type = block.block_type;
    const simple = type === "question_text" || type === "question_textarea";
    used.add(id);
    if (!hasEmbedded && answers.length === 1 && simple && matching.length === 1
      && object(envelope.captureMetadata).structuredResponseOrigin === "derived_from_flat"
      && typeof envelope.rawSubmissionText === "string") {
      add("/rawSubmissionText", envelope.rawSubmissionText, ...classify(block, ""), [path]);
      return;
    }
    if (simple && typeof draft[id] === "string" && typeof answer.value === "string" && !duplicate) {
      // Conflicting mirrors are retained, not quietly merged.
      if (draft[id] === answer.value) {
        add(flatPath, draft[id], ...classify(block, ""), [path]);
        return;
      }
      add(flatPath, draft[id], "unknown", "CONFLICTING_REPRESENTATIONS");
      diagnostics.push("CONFLICTING_REPRESENTATIONS");
    }
    // Structured tables/interviews have a JSON-string mirror in current drafts.
    // Only the schema-known representation of this exact block is suppressed.
    if (!simple && typeof draft[id] === "string") {
      const flattened = Array.isArray(answer.value) && answer.value.every((v) => typeof v === "string")
        ? answer.value.join(", ") : JSON.stringify(answer.value);
      if (draft[id] !== flattened) {
        add(flatPath, draft[id], "unknown", "CONFLICTING_REPRESENTATIONS");
        diagnostics.push("CONFLICTING_REPRESENTATIONS");
      } else diagnostics.push("STRUCTURED_MIRROR_EXCLUDED");
    }
    leaves(answer.value, path, (text, leafPath, key) => {
      if (duplicate || matching.length !== 1) return add(leafPath, text, "unknown", "BLOCK_IDENTITY_UNRESOLVED");
      if (simple && typeof draft[id] === "string" && draft[id] !== answer.value) return add(leafPath, text, "unknown", "CONFLICTING_REPRESENTATIONS");
      add(leafPath, text, ...classify(block, key));
    });
  });
  for (const [key, value] of Object.entries(draft)) {
    if (key.startsWith("__") || used.has(key)) continue;
    const matching = blockRows.filter((block) => block.block_id === key);
    const block = matching.length === 1 ? matching[0] : {};
    leaves(value, `/draftPayload/${pointer(key)}`, (text, path, leafKey) => {
      add(path, text, ...classify(block, leafKey));
    });
  }
  if (fields.length === 0) {
    if (typeof envelope.rawSubmissionText === "string") add("/rawSubmissionText", envelope.rawSubmissionText, "unknown", "UNSEGMENTED_AUTHORSHIP_UNKNOWN");
    else if (typeof envelope.legacySubmissionText === "string") add("/legacySubmissionText", envelope.legacySubmissionText, "unknown", "LEGACY_CAPTURE");
  }
  // Metadata may be unsupported, but raw snapshots always retain it for replay.
  if (!fields.length) diagnostics.push("NO_SUPPORTED_WRITING_FIELDS");
  const source: BaselineSource = {
    kind: "course_draft", sourceId: snapshot.submission_id, revision: snapshot.source_revision,
    promptText: null, fields, provenance: "field_metadata_selection",
  };
  const occurrences = fields.filter((field) => field.provenance !== "excluded").flatMap((field) =>
    extractOccurrences(source, field).map((occurrence) => ({ ...occurrence, textHash: field.textHash, provenance: field.provenance })));
  return { version: EXTRACTION_VERSION, fields, occurrences, diagnostics };
}
