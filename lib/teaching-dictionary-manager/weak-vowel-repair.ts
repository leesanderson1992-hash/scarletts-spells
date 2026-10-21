import { createHash } from "node:crypto";

/** Content-review scope only. This inventory never activates learner lessons. */
export const WEAK_VOWEL_SKILLS = {
  D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS: "Preserve weak middle vowels in common words",
  D4_SCHWA_MEDIAL_NATURAL_ACTUAL: "Preserve weak vowel in natural/actual type words",
  D4_SCHWA_FINAL_A_FINAL: "Spell final unstressed -a",
  D4_SCHWA_FINAL_AR_FINAL: "Spell final unstressed -ar",
  D4_SCHWA_FINAL_ER_FINAL: "Spell final unstressed -er",
  D4_SCHWA_FINAL_OR_FINAL: "Spell final unstressed -or",
  D4_SCHWA_INITIAL_E_INITIAL: "Spell initial unstressed e-",
  D4_SCHWA_INITIAL_O_INITIAL: "Spell initial unstressed o-",
} as const;
export const WEAK_VOWEL_REPAIR_VERSION = "weak_vowel_repair_v1";
export type SourceRow = Record<string, unknown>;
export type ActivityStatus = "Ready" | "Needs metadata" | "Needs editorial review" | "Unsuitable";
export type RepairIssue = {
  code: string;
  classification: "Confirmed inconsistency" | "Potential inconsistency requiring review" | "Missing annotation or asset" | "Deassigned or excluded";
  fields: string[];
  observed: unknown;
  explanation: string;
  repair: string;
};
export type RepairSource = {
  word: SourceRow;
  microSkillKey: string;
  assignmentStatus: "assigned" | "deassigned" | "excluded" | "legacy_only";
  authority: unknown;
  metadata: SourceRow[];
  dictations: SourceRow[];
  morphology: SourceRow[];
  routes: SourceRow[];
};
export type RepairRow = Record<string, string>;

export const REPAIR_COLUMNS = [
  "word", "micro_skill_name", "assignment_status", "linguistic_review_status", "issue_codes", "required_repairs",
  "proposed_ipa", "proposed_spoken_syllable_count", "proposed_written_breakdown", "proposed_stress_pattern", "proposed_has_schwa",
  "proposed_word_sense", "proposed_assignment_disposition", "proposed_annotation_json", "review_source_references",
  "reviewer_notes", "repair_status", "reviewer", "review_date", "approval_decision",
  "ipa", "spoken_syllable_count", "written_breakdown", "stress_pattern", "has_schwa", "word_sense", "morphology_evidence_json",
  "target_span_json", "missing_letter_span_json", "sound_correspondence_json", "recording_references_json",
  "dictation_sentences_json", "dictation_target_bindings_json", "family_evidence_json", "route_content_json",
  "inconsistency_status", "affected_fields", "observed_inconsistencies_json",
  "required_validation", "blocks_child_presentation", "blocks_spelling_assessment",
  "rhythm_status", "rhythm_reason", "dinner_status", "dinner_reason", "laboratory_status", "laboratory_reason",
  "family_secret_status", "family_secret_reason", "memory_lock_status", "memory_lock_reason", "dictation_status", "dictation_reason",
  "export_version", "exported_at", "canonical_word_id", "micro_skill_key", "pronunciation_id", "authority_reference",
  "source_fingerprint", "metadata_version", "existing_review_status",
] as const;
const EDITABLE_COLUMNS = REPAIR_COLUMNS.filter(column => column.startsWith("proposed_") || [
  "review_source_references", "reviewer_notes", "repair_status", "reviewer", "review_date", "approval_decision",
].includes(column));

export function stableJson(value: unknown): string {
  if (value == null) return "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function repairFingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
/** Route publication must not invalidate the source it was reviewed against.
 * The immutable route version has its own content hash; this fingerprint binds
 * the canonical word, assignment authority and shared dictionary facts. */
export function repairSourceFingerprint(source: RepairSource): string {
  return repairFingerprint({ ...source, routes: [] });
}
function text(value: unknown): string { return value == null ? "" : String(value); }
function object(value: unknown): SourceRow { return value && typeof value === "object" && !Array.isArray(value) ? value as SourceRow : {}; }
function cell(value: unknown): string { return value == null ? "" : typeof value === "string" ? value : stableJson(value); }
function partCount(value: string): number | null {
  return /^[\p{L}]+(?:[-·‧][\p{L}]+)+$/u.test(value) ? value.split(/[-·‧]/u).length : null;
}
function tokens(value: string): string[] { return (value.match(/[\p{L}]+(?:['’ʼ-][\p{L}]+)*/gu) ?? []).map(word => word.toLocaleLowerCase("en-GB")); }

export function buildWeakVowelRepairRows(sources: readonly RepairSource[], exportedAt: string): RepairRow[] {
  const rows: RepairRow[] = [];
  for (const source of sources) {
    if (!(source.microSkillKey in WEAK_VOWEL_SKILLS)) throw new Error("REPAIR_SKILL_OUT_OF_SCOPE");
    const metadata = source.metadata[0] ?? {};
    const route = source.routes[0] ?? {};
    const routeWrapper = object(route.content);
    const content = object(routeWrapper.content ?? routeWrapper);
    const weak = object(content.weakVowel);
    const routePublished = route.weak_vowel_published === true && weak.schemaVersion === "weak_vowel_route_facts_v1";
    // Pronunciations are only read from the explicit proposed route contract.
    // An arbitrary source_metadata object or IPA alternative is never a reviewed variant.
    const variants = weak.pronunciationId && routePublished
      ? [{ id: weak.pronunciationId, reviewStatus: "approved", audio: weak.wordRecording, sense: weak.wordSense,
          syllableCount: weak.spokenSyllableCount }]
      : Array.isArray(content.pronunciations) && content.pronunciations.length
        ? content.pronunciations.map(object) : [{}];
    for (const variant of variants) {
      const issues: RepairIssue[] = [];
      const add = (issue: RepairIssue) => issues.push(issue);
      const word = text(source.word.display_word || source.word.normalised_word);
      const ipa = text(variant.ipa ?? metadata.phoneme_hint);
      const stress = text(variant.stressPattern ?? metadata.stress_pattern);
      const count = text(variant.syllableCount ?? metadata.syllables);
      const written = text(metadata.written_syllable_breakdown);
      const annotation = routePublished ? { span: weak.target, missingLetterSpan: weak.selectionTarget,
        correspondence: { pronunciationId: weak.pronunciationId, soundType: object(weak.target).soundType } }
        : object(content.target);
      const assigned = source.assignmentStatus === "assigned";
      if (!assigned) add({ code: "ASSIGNMENT_NOT_CURRENT", classification: "Deassigned or excluded", fields: ["assignment_status"], observed: source.assignmentStatus,
        explanation: "A historical source is not permission to select this pair.", repair: "Keep excluded from child selection. Reassignment, if justified, needs a separate governed assignment decision." });
      if (source.metadata.length !== 1) add({ code: "ACTIVE_METADATA_NOT_SINGULAR", classification: "Confirmed inconsistency", fields: ["metadata_version"], observed: source.metadata.map(row => row.id),
        explanation: "The active metadata source must be unambiguous.", repair: "Resolve missing or duplicate active metadata through the dictionary review workflow." });
      if (!ipa) add({ code: "PRONUNCIATION_MISSING", classification: "Missing annotation or asset", fields: ["ipa"], observed: ipa,
        explanation: "No pronunciation transcription is available.", repair: "Supply a sourced British pronunciation and approve its word sense and variant." });
      else if (!/^\/?[^/]+\/?$/u.test(ipa) || /[A-Z]{2}[012]?/.test(ipa)) add({ code: "PRONUNCIATION_FORMAT_REVIEW", classification: "Potential inconsistency requiring review", fields: ["ipa"], observed: ipa,
        explanation: "The hint may contain alternative pronunciations or a non-IPA transcription.", repair: "Separate and verify pronunciation variants; do not automatically convert or choose one." });
      const stressParts = stress.split("-");
      if (/^(primary|secondary|unstressed)(-(primary|secondary|unstressed))*$/.test(stress)) {
        if (/^\d+$/.test(count) && Number(count) !== stressParts.length) add({ code: "SPOKEN_COUNT_STRESS_MISMATCH", classification: "Confirmed inconsistency", fields: ["spoken_syllable_count", "stress_pattern"], observed: { count, stress },
          explanation: "The numeric spoken count and number of structured stress positions disagree.", repair: "Listen to the intended British recording; approve matching spoken syllables and stress for that variant. Preserve written divisions separately." });
      } else add({ code: "STRESS_ANNOTATION_REVIEW", classification: "Potential inconsistency requiring review", fields: ["stress_pattern"], observed: stress,
        explanation: "The stress hint is missing or is not a complete primary/secondary/unstressed sequence.", repair: "Review a complete stress sequence against the chosen recording; do not expand shorthand mechanically." });
      if (partCount(written) !== null && /^\d+$/.test(count) && partCount(written) !== Number(count)) add({ code: "WRITTEN_SPOKEN_DIVISION_REVIEW", classification: "Potential inconsistency requiring review", fields: ["written_breakdown", "spoken_syllable_count"], observed: { written, count },
        explanation: "Written parts and spoken syllables differ. Compression may make this legitimate.", repair: "Verify the pronunciation-specific mapping. Retain a distinct written-inspection mode where a written vowel is compressed." });
      if (written && written.replace(/[^\p{L}]/gu, "").toLocaleLowerCase("en-GB") !== word.replace(/[^\p{L}]/gu, "").toLocaleLowerCase("en-GB")) add({ code: "WRITTEN_LETTERS_MISMATCH", classification: "Confirmed inconsistency", fields: ["written_breakdown"], observed: { written, word },
        explanation: "The written parts do not reconstruct the spelling.", repair: "Repair the reviewed written division without changing the canonical spelling." });
      const monophthongHint = ipa.replace(/əʊ|ɪə|eə|ʊə/g, "");
      if (metadata.has_schwa === true && ipa && !/[əɐɚ]/u.test(monophthongHint)) add({ code: "SCHWA_FLAG_NOT_LOCATED", classification: "Potential inconsistency requiring review", fields: ["ipa", "has_schwa"], observed: { ipa, hasSchwa: metadata.has_schwa },
        explanation: "The stored schwa flag is not explained by an identifiable schwa in this hint; a phonetic variant or source mismatch needs review.", repair: "Verify the flag and pronunciation variant together. Do not relabel another weak vowel as schwa." });
      if (source.microSkillKey.includes("INITIAL") && /^(primary|secondary)(-|$)/.test(stress)) add({ code: "INITIAL_VOWEL_STRESSED", classification: "Potential inconsistency requiring review", fields: ["stress_pattern", "assignment_status"], observed: stress,
        explanation: "The stored first syllable is stressed although the micro-skill requires an unstressed beginning.", repair: "Verify a suitable variant and sense or propose excluding this exact word–skill pair." });
      if (source.microSkillKey.includes("MEDIAL_COMMON") && /(?:er|ar|or)$/i.test(word) && Number(count) === 2) add({ code: "MEDIAL_FINAL_ENDING_OVERLAP", classification: "Potential inconsistency requiring review", fields: ["target_span_json", "assignment_status"], observed: { word, count },
        explanation: "This two-syllable word may demonstrate a final weak ending rather than the intended medial-vowel objective.", repair: "Identify a distinct medial target and curriculum rationale, or propose excluding this pair from this lesson. Do not change assignments automatically." });
      if (!text(variant.id) || variant.reviewStatus !== "approved") add({ code: "REVIEWED_PRONUNCIATION_VARIANT_MISSING", classification: "Missing annotation or asset", fields: ["pronunciation_id"], observed: variant,
        explanation: "A dictionary hint is not a reviewed recording-specific pronunciation variant.", repair: "Approve a stable pronunciation ID, British word sense, spoken syllables, stress and recording reference." });
      if (!annotation.span || !annotation.missingLetterSpan || !annotation.correspondence) add({ code: "TARGET_ALIGNMENT_MISSING", classification: "Missing annotation or asset", fields: ["target_span_json", "missing_letter_span_json", "sound_correspondence_json"], observed: annotation,
        explanation: "No complete reviewed assignment-specific written target and sound correspondence exists.", repair: "Mark exact zero-based, end-exclusive written spans and verify their correspondence to the chosen sound sequence, other weak vowel or absent/compressed realisation." });
      if (!variant.audio) add({ code: "REVIEWED_WORD_AUDIO_MISSING", classification: "Missing annotation or asset", fields: ["recording_references_json"], observed: variant.audio ?? null,
        explanation: "Device speech synthesis does not bind a sound task to a fixed reviewed variant.", repair: "Provide a fixed reviewed British word recording with version/hash and replay reference." });
      // Robot Rhythm was retired from the eight lessons; sentence rhythm is
      // neither an activity gate nor a missing weak-vowel route requirement.
      const dictationValid = source.dictations.some(sentence => {
        const start = Number(sentence.dictation_target_token_index);
        const end = sentence.dictation_target_end_exclusive == null ? start + tokens(word).length : Number(sentence.dictation_target_end_exclusive);
        return sentence.review_status === "approved_for_first_exposure" && Number.isInteger(start) && start >= 0 && Number.isInteger(end) && end > start
          && tokens(text(sentence.dictation_sentence)).slice(start, end).join(" ") === tokens(word).join(" ");
      });
      if (!dictationValid) add({ code: "DICTATION_TARGET_REVIEW", classification: "Potential inconsistency requiring review", fields: ["dictation_sentences_json", "dictation_target_bindings_json"], observed: source.dictations,
        explanation: "No approved sentence with an exact matching target binding was found.", repair: "Review a meaningful sentence containing this exact target and correct its token/span binding." });
      if (!content.dictationAudio && !(routePublished && weak.sentenceRecording)) add({ code: "REVIEWED_DICTATION_AUDIO_MISSING", classification: "Missing annotation or asset", fields: ["recording_references_json"], observed: null,
        explanation: "Approved sentence text does not establish fixed British audio.", repair: "Record and approve the chosen dictation sentence; bind its audio hash and target occurrence." });
      const status = (activity: string, normal: ActivityStatus, reason: string): Record<string, string> => ({
        [`${activity}_status`]: assigned ? normal : "Unsuitable",
        [`${activity}_reason`]: assigned ? reason : "Pair is not currently assigned; historical records cannot restore it.",
      });
      const row: RepairRow = Object.fromEntries(REPAIR_COLUMNS.map(column => [column, ""]));
      Object.assign(row, {
        export_version: WEAK_VOWEL_REPAIR_VERSION, exported_at: exportedAt, canonical_word_id: text(source.word.id), word,
        micro_skill_key: source.microSkillKey, micro_skill_name: WEAK_VOWEL_SKILLS[source.microSkillKey as keyof typeof WEAK_VOWEL_SKILLS],
        pronunciation_id: text(variant.id), assignment_status: source.assignmentStatus, authority_reference: stableJson(source.authority),
        source_fingerprint: repairSourceFingerprint(source), metadata_version: source.metadata.map(row => text(row.id)).join("; "),
        existing_review_status: `${text(metadata.review_status)}${routePublished ? "; weak-vowel route published" : ""}`, ipa, spoken_syllable_count: count, written_breakdown: written,
        stress_pattern: stress, has_schwa: cell(metadata.has_schwa), word_sense: text(variant.sense),
        morphology_evidence_json: cell(source.morphology), target_span_json: cell(annotation.span), missing_letter_span_json: cell(annotation.missingLetterSpan),
        sound_correspondence_json: cell(annotation.correspondence), recording_references_json: variant.audio || content.dictationAudio || weak.sentenceRecording ? cell({ word: variant.audio, dictation: routePublished ? weak.sentenceRecording : content.dictationAudio }) : "",
        dictation_sentences_json: cell(source.dictations.map(row => ({ id: row.id, sentence: row.dictation_sentence, audioText: row.audio_text, reviewStatus: row.review_status }))),
        dictation_target_bindings_json: cell(source.dictations.map(row => ({ id: row.id, start: row.dictation_target_token_index, end: row.dictation_target_end_exclusive, exactAnswer: row.exact_governed_answer }))),
        family_evidence_json: cell(routePublished ? { decision: weak.familyDecision, authorityId: weak.familyAuthorityId } : content.familyEvidence), route_content_json: source.routes.length ? stableJson(source.routes) : "",
        linguistic_review_status: [...new Set(issues.filter(issue => issue.classification === "Confirmed inconsistency" || issue.classification === "Potential inconsistency requiring review").map(issue => issue.classification))].join("; ") || "No inconsistency detected",
        inconsistency_status: [...new Set(issues.map(issue => issue.classification))].join("; ") || "No inconsistency detected",
        issue_codes: issues.map(issue => issue.code).join("; "), affected_fields: [...new Set(issues.flatMap(issue => issue.fields))].join("; "),
        observed_inconsistencies_json: stableJson(issues), required_repairs: issues.map(issue => `${issue.code}: ${issue.repair}`).join("\n"),
        required_validation: "Human curriculum review of lesson fit, pronunciation, target correspondence and recording; structural validation alone is not approval.",
        blocks_child_presentation: "true", blocks_spelling_assessment: "true",
        ...status("rhythm", "Unsuitable", "Robot Rhythm is retired from these lessons."),
        ...status("dinner", "Needs editorial review", "Verify spoken syllables and target vowel; use distinct written inspection for compression."),
        ...status("laboratory", source.microSkillKey.includes("MEDIAL") ? "Needs editorial review" : "Needs metadata", "Approve this assignment's exact written target and missing vowel span; do not derive it from has_schwa."),
        ...status("family_secret", "Needs editorial review", "Optional: verify matching written spans and sound change, use spelling-preservation copy, or omit. Absence does not block the lesson."),
        ...status("memory_lock", source.word.review_status === "approved_for_first_exposure" ? "Ready" : "Needs editorial review", "Canonical spelling capability only; lesson fit and the route release still require review."),
        ...status("dictation", dictationValid ? "Needs metadata" : "Needs editorial review", dictationValid ? "Approved target sentence exists; fixed reviewed British recording and route evidence binding are still required." : "Repair the approved sentence and exact target binding before adding reviewed audio."),
        ...(routePublished && assigned ? {
          dinner_status: object(object(weak.activityEligibility).dinner).status === "ready" ? "Ready" : "Needs editorial review",
          dinner_reason: "Reviewed cuts, chosen word recording and vowel-only target are published.",
          laboratory_status: object(object(weak.activityEligibility).detective).status === "ready" ? "Ready" : "Needs editorial review",
          laboratory_reason: "Reviewed missing-vowel occurrence and word recording are published for Vowel Detective.",
          family_secret_status: object(object(weak.activityEligibility).family).status === "ready" ? "Ready" : "Unsuitable",
          family_secret_reason: object(object(weak.activityEligibility).family).status === "ready" ? "Approved family authority is recorded; exploration still needs its runtime member binding." : "Optional family exploration is unavailable for this pair.",
          memory_lock_status: object(object(weak.activityEligibility).memoryLock).status === "ready" ? "Ready" : "Needs editorial review",
          memory_lock_reason: "Canonical whole-word spelling is approved.",
          dictation_status: object(object(weak.activityEligibility).dictation).status === "ready" ? "Ready" : "Needs editorial review",
          dictation_reason: "Complete target-bearing sentence and its reviewed British recording are published.",
          blocks_child_presentation: "true", blocks_spelling_assessment: "true",
          required_validation: "Published route facts are approved for their activities. Child presentation and assessment still require an active route release and verified assignment writer. Investigate shared-metadata issue codes separately.",
        } : {}),
        repair_status: "awaiting_review", approval_decision: "pending",
      });
      rows.push(row);
    }
  }
  return rows.sort((a, b) => a.micro_skill_key.localeCompare(b.micro_skill_key) || a.word.localeCompare(b.word, "en-GB") || a.pronunciation_id.localeCompare(b.pronunciation_id));
}

export function renderWeakVowelRepairCsv(rows: readonly RepairRow[]): string {
  const quote = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
  return `\uFEFF${REPAIR_COLUMNS.map(quote).join(",")}\r\n${rows.map(row => REPAIR_COLUMNS.map(column => quote(row[column] ?? "")).join(",")).join("\r\n")}\r\n`;
}

/** Strict CSV parsing: preserve whitespace in editable explanations, reject malformed shapes. */
export function parseWeakVowelRepairCsv(input: string): RepairRow[] {
  if (input.length > 20_000_000) throw new Error("REPAIR_CSV_TOO_LARGE");
  const records: string[][] = [];
  let record: string[] = [], field = "", quoted = false, closed = false;
  const source = input.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === '"' && !field && !closed) quoted = true;
    else if (char === "," || char === "\n" || char === "\r") {
      record.push(field); field = ""; closed = false;
      if (char !== ",") { if (record.some(cell => cell !== "")) records.push(record); record = []; if (char === "\r" && source[index + 1] === "\n") index++; }
    } else { if (closed || char === '"') throw new Error("REPAIR_CSV_MALFORMED_QUOTE"); field += char; }
  }
  if (quoted) throw new Error("REPAIR_CSV_UNCLOSED_QUOTE");
  if (field || record.length || closed) { record.push(field); records.push(record); }
  const [headers, ...data] = records;
  if (!headers || headers.length !== REPAIR_COLUMNS.length || new Set(headers).size !== headers.length || headers.some(header => !REPAIR_COLUMNS.includes(header as typeof REPAIR_COLUMNS[number]))) throw new Error("REPAIR_CSV_HEADERS_INVALID");
  if (data.length > 20_000) throw new Error("REPAIR_CSV_ROW_LIMIT");
  return data.map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`REPAIR_CSV_COLUMN_COUNT: row ${index + 2}`);
    return Object.fromEntries(headers.map((header, column) => [header, cells[column].replace(/^'(?=[=+@\-\t\r])/, "")]));
  });
}

export function repairRowKey(row: RepairRow): string { return stableJson([row.canonical_word_id || `unresolved-word:${row.word}`, row.micro_skill_key, row.pronunciation_id]); }

/** Read-only review gate. Accepted means ready for governed draft preparation, never published. */
export function validateWeakVowelRepairs(edited: readonly RepairRow[], baseline: readonly RepairRow[], current: readonly RepairRow[]) {
  const errors: { row: number; code: string; message: string }[] = [];
  const baselineByKey = new Map(baseline.map(row => [repairRowKey(row), row]));
  const currentByKey = new Map(current.map(row => [repairRowKey(row), row]));
  const seen = new Set<string>();
  let reviewed = 0;
  for (const [index, row] of edited.entries()) {
    const rowNumber = index + 2, key = repairRowKey(row), original = baselineByKey.get(key), live = currentByKey.get(key);
    const error = (code: string, message: string) => errors.push({ row: rowNumber, code, message });
    if (seen.has(key)) error("DUPLICATE_REPAIR_ROW", "Each word–skill–variant may occur once.");
    seen.add(key);
    if (!original) { error("UNKNOWN_REPAIR_ROW", "Identity is absent from the baseline; export new assignments first."); continue; }
    if (!live || original.source_fingerprint !== live.source_fingerprint) error("STALE_SOURCE", "Dictionary or assignment facts changed; re-export and reconcile this row.");
    for (const column of REPAIR_COLUMNS.filter(column => !EDITABLE_COLUMNS.includes(column))) {
      if (row[column] !== original[column]) error("SOURCE_COLUMN_EDITED", `Keep ${column} unchanged; enter repairs in proposed fields.`);
      if (live && column !== "exported_at" && original[column] !== live[column]) error("BASELINE_NO_LONGER_CURRENT", `The baseline ${column} differs from the current audit; re-export before review.`);
    }
    if (!["awaiting_review", "in_progress", "reviewed"].includes(row.repair_status)) error("REPAIR_STATUS_INVALID", "Use awaiting_review, in_progress or reviewed.");
    if (!["pending", "approve_changes", "approve_existing", "exclude"].includes(row.approval_decision)) error("APPROVAL_DECISION_INVALID", "Use pending, approve_changes, approve_existing or exclude.");
    if (row.approval_decision === "pending") continue;
    reviewed++;
    const parsedDate = new Date(`${row.review_date}T00:00:00Z`);
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(row.review_date) && !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === row.review_date;
    if (row.repair_status !== "reviewed" || !row.reviewer.trim() || !validDate || !row.review_source_references.trim()) error("HUMAN_REVIEW_INCOMPLETE", "Supply reviewed status, reviewer, YYYY-MM-DD review date and source references.");
    if (row.approval_decision === "exclude") {
      if (row.proposed_assignment_disposition !== "exclude" || !row.reviewer_notes.trim()) error("EXCLUSION_REASON_MISSING", "Mark proposed disposition exclude and explain why. This does not itself deassign the pair.");
      continue;
    }
    if (row.assignment_status !== "assigned") error("ASSIGNMENT_NOT_CURRENT", "Approval cannot restore an excluded, deassigned or legacy pair.");
    if (row.proposed_assignment_disposition && row.proposed_assignment_disposition !== "retain") error("ASSIGNMENT_DISPOSITION_INVALID", "Use retain for an approved current pair, or the exclude decision.");
    if (row.approval_decision === "approve_existing" && REPAIR_COLUMNS.some(column => column.startsWith("proposed_") && column !== "proposed_assignment_disposition" && row[column])) error("EXISTING_APPROVAL_HAS_CHANGES", "Use approve_changes when proposing corrected facts.");
    const ipa = row.proposed_ipa || row.ipa, stress = row.proposed_stress_pattern || row.stress_pattern;
    const count = row.proposed_spoken_syllable_count || row.spoken_syllable_count;
    const written = row.proposed_written_breakdown || row.written_breakdown;
    if (!ipa.trim() || !/^[1-9]\d?$/.test(count) || !/^(primary|secondary|unstressed)(-(primary|secondary|unstressed))*$/.test(stress) || stress.split("-").length !== Number(count)) error("PRONUNCIATION_FACTS_INVALID", "Approve a non-empty pronunciation and matching complete spoken count/stress sequence.");
    if (written.replace(/[^\p{L}]/gu, "").toLocaleLowerCase("en-GB") !== row.word.replace(/[^\p{L}]/gu, "").toLocaleLowerCase("en-GB")) error("WRITTEN_BREAKDOWN_INVALID", "Written parts must preserve every letter of the canonical word.");
    if (!["true", "false"].includes(row.proposed_has_schwa || row.has_schwa)) error("SCHWA_REVIEW_MISSING", "Explicitly review the word's schwa flag; false is valid.");
    let annotation: SourceRow = {};
    try { annotation = object(JSON.parse(row.proposed_annotation_json || "{}")); }
    catch { error("ANNOTATION_JSON_INVALID", "Proposed annotation must be valid JSON."); }
    // No rows are publishable while phonological facts remain absent. Detailed
    // recording/target schema validation belongs to the eventual route compiler.
    if (!Object.keys(annotation).length) error("ANNOTATION_REVIEW_REQUIRED", "Provide the reviewed target/pronunciation/recording annotation package before lesson approval.");
    else error("ANNOTATION_COMPILER_NOT_RELEASED", "Annotation proposals are retained for human review. The lesson annotation compiler is not implemented or released; this validator cannot certify them.");
  }
  for (const key of baselineByKey.keys()) if (!seen.has(key)) errors.push({ row: 0, code: "BASELINE_ROW_OMITTED", message: `Restore the omitted review row ${key}.` });
  for (const key of currentByKey.keys()) if (!baselineByKey.has(key)) errors.push({ row: 0, code: "INVENTORY_CHANGED", message: `A new assignment/variant needs an export: ${key}.` });
  const writtenProposals = new Map<string, string>();
  for (const [index, row] of edited.entries()) {
    if (!row.canonical_word_id || !row.proposed_written_breakdown || row.approval_decision === "pending" || row.approval_decision === "exclude") continue;
    const previous = writtenProposals.get(row.canonical_word_id);
    if (previous && previous !== row.proposed_written_breakdown) errors.push({ row: index + 2, code: "SHARED_WORD_REPAIR_CONFLICT", message: "This canonical word has conflicting proposed written divisions across its review rows." });
    writtenProposals.set(row.canonical_word_id, row.proposed_written_breakdown);
  }
  return { status: errors.length ? "blocked" : reviewed ? "reviewed_exclusions_only" : "awaiting_human_review", rows: edited.length, reviewedRows: reviewed, errors, databaseWrites: 0, publicationReady: false };
}
