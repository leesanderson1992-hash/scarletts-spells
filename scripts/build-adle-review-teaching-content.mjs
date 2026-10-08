import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const base = new URL("data/adle/review/writing-challenge/v1/", root);
const read = (name) => JSON.parse(readFileSync(new URL(name, base), "utf8"));
const serialise = (value) => JSON.stringify(value, null, 2) + "\n";
// Recursive key ordering, array order preserved, no volatile timestamps.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export const fingerprint = (value) => createHash("sha256").update(canonicalJson(value)).digest("hex");
const sha256File = (name) => createHash("sha256").update(readFileSync(new URL(name, base))).digest("hex");

const expectedCounts = { conundrums: 0, reflection: 8, stories: 10, fortunately_unfortunately: 8, persuasion: 10 };
const minimums = { conundrums: 5, reflection: 2, stories: 5, fortunately_unfortunately: 5, persuasion: 5 };
const count = (rows, field) => Object.fromEntries(Object.keys(expectedCounts).map((type) =>
  [type, rows.filter((row) => row[field] === type).length]));
const requiredText = (value) => typeof value === "string" && value.trim().length > 0;

export function validateSource(source, catalogue) {
  assert.equal(source.prompts.length, 36);
  assert.deepEqual(Object.keys(source.categories).sort(), Object.keys(expectedCounts).sort());
  assert.ok(requiredText(source.release_reference) && requiredText(source.content_version) && requiredText(source.source_reference));
  assert.equal(source.locale, "en-GB");
  assert.deepEqual(count(source.prompts, "category"), expectedCounts);
  assert.equal(new Set(source.prompts.map((p) => p.prompt_key)).size, source.prompts.length);
  for (const [type, category] of Object.entries(source.categories)) {
    assert.ok(requiredText(category.task_intro));
    assert.doesNotMatch([category.label, category.task_intro, category.category_top_tip ?? ""].join(" "),
      /\{\{|\$\{|canonicalSpelling|speechText|model_answer|target_words/i);
    assert.equal(category.reuse_policy, type === "reflection"
      ? "reusable_lru_no_immediate_repeat" : "once_per_learner");
  }
  for (const prompt of source.prompts) {
    assert.ok([prompt.prompt_key, prompt.title, prompt.prompt_text, prompt.top_tip].every(requiredText));
    const prefix = { reflection: "REFLECTION", stories: "STORY", fortunately_unfortunately: "FU", persuasion: "PERSUADE" }[prompt.category];
    assert.match(prompt.prompt_key, new RegExp(`^${prefix}-\\d{2}$`));
    assert.ok(Number(prompt.prompt_key.split("-").at(-1)) >= 1 &&
      Number(prompt.prompt_key.split("-").at(-1)) <= expectedCounts[prompt.category]);
    if (prompt.task_intro !== undefined) assert.ok(requiredText(prompt.task_intro));
    const text = [prompt.title, prompt.prompt_text, prompt.top_tip, prompt.task_intro ?? ""].join(" ");
    assert.doesNotMatch(text, /\{\{|\$\{|canonicalSpelling|speechText|model_answer|target_words/i,
      "Governed content must never interpolate learner spellings or provide model answers");
    if (prompt.category === "fortunately_unfortunately") {
      assert.match(prompt.prompt_text, /\n\nStart with: Fortunately, .+\.\.\.$/);
    }
  }
  assert.equal(catalogue.records.length, 63);
  const videoIds = new Set();
  for (const row of catalogue.records) {
    const id = row["Video ID"];
    assert.match(id, /^[A-Za-z0-9_-]{11}$/);
    assert.ok(!videoIds.has(id), `Duplicate video identity: ${id}`);
    videoIds.add(id);
    assert.equal(row["Watch / Source URL"], `https://www.youtube.com/watch?v=${id}`);
    assert.equal(row["Embeddable URL"], `https://www.youtube.com/embed/${id}`);
    assert.ok(requiredText(row["Original Title"]));
    assert.ok(requiredText(row["Question Fidelity"]));
  }
}

export function buildPackage(source, catalogue) {
  validateSource(source, catalogue);
  const instructions = Object.entries(source.categories).map(([category, entry]) => ({
    instruction_reference: `${source.release_reference}:instruction:${category}`,
    category,
    content_version: source.content_version,
    category_label: entry.label,
    task_intro: entry.task_intro,
    category_top_tip: entry.category_top_tip,
    reuse_policy: entry.reuse_policy,
  }));
  const prompts = source.prompts.map((prompt) => {
    const category = source.categories[prompt.category];
    const taskIntro = prompt.task_intro ?? category.task_intro;
    const instructionReference = `${source.release_reference}:instruction:${
      prompt.task_intro === undefined ? prompt.category : prompt.prompt_key
    }`;
    if (prompt.task_intro !== undefined) instructions.push({
      instruction_reference: instructionReference,
      category: prompt.category,
      content_version: source.content_version,
      category_label: category.label,
      task_intro: taskIntro,
      category_top_tip: category.category_top_tip,
      reuse_policy: category.reuse_policy,
    });
    const record = {
      ...prompt,
      content_version: source.content_version,
      task_intro: taskIntro,
      instruction_reference: instructionReference,
      category_label: category.label,
      category_top_tip: category.category_top_tip,
      reuse_policy: category.reuse_policy,
      locale: source.locale,
      release_reference: source.release_reference,
      source_reference: source.source_reference,
    };
    return {
      ...record,
      status: "reviewed",
      source_fingerprint: fingerprint(record),
      editorial_review: {
        reviewer: "Codex",
        reviewed_on: "2026-08-26",
        scope: "Supplied title, introduction, question and tips reviewed together; wording preserved",
        age_appropriate_language: "reviewed",
        british_english: "reviewed",
        no_model_answers: "reviewed",
        no_target_word_interpolation: "verified",
        daily_target_word_collision_check: "pending_assignment_target_set",
        publication_approval: "pending",
      },
    };
  });
  // Only real table columns go into the import array. No title/top_tip/status columns exist.
  const rows = prompts.map((p) => ({
    stable_prompt_key: p.prompt_key,
    challenge_type: p.category,
    content_version: p.content_version,
    prompt_text: p.prompt_text,
    instruction_text: p.task_intro,
    configuration: {
      content_contract: "adle_review_writing_challenge_content_v1",
      title: p.title,
      top_tip: p.top_tip,
      instruction_reference: p.instruction_reference,
      category_label: p.category_label,
      category_top_tip: p.category_top_tip,
      locale: p.locale,
      ...(p.category === "fortunately_unfortunately" ? {
        sequence: { mode: "alternating_sentence_starters", starters: ["Fortunately", "Unfortunately"], first_starter: "Fortunately" },
      } : {}),
      provenance: { source_kind: "user_teaching_content_handoff", source_reference: p.source_reference },
    },
    reuse_policy: p.reuse_policy,
    release_reference: p.release_reference,
    source_fingerprint: p.source_fingerprint,
    review_status: "in_review",
    row_status: "active",
  }));
  const queue = catalogue.records.map((row) => {
    const identity = {
      source_file: catalogue.source_file,
      source_file_sha256: catalogue.source_file_sha256,
      source_range: row.source_range,
      catalogue_row: row,
    };
    return {
      prompt_key: `CONUNDRUM-${row["Video ID"]}`,
      category: "conundrums",
      status: "draft",
      import_eligible: false,
      reuse_policy: "once_per_learner",
      youtube_video_id: row["Video ID"],
      youtube_url: row["Watch / Source URL"],
      youtube_embed_url: row["Embeddable URL"],
      video_title: row["Original Title"],
      video_source: "Astra Nova School",
      source_library: source.categories.conundrums.video_library,
      source_fingerprint: fingerprint(identity),
      provenance: identity,
      catalogue_child_facing_title: row["Child-Friendly Catchy Title"],
      catalogue_question: row["Question from Description"],
      catalogue_question_fidelity: row["Question Fidelity"],
      review_blockers: ["full_video_review_required", "official_title_and_channel_reverification_required",
        "playback_and_embedding_check_required", "question_and_tip_approval_required",
        ...(/unavailable|truncated/i.test(row["Question Fidelity"]) ? ["incomplete_catalogue_question"] : [])],
      review_evidence: {
        full_video_reviewed: false,
        reviewed_by: null,
        reviewed_at: null,
        availability: "not_checked",
        embedding: "not_checked",
        dilemma_summary: null,
        decision_and_options_checked: false,
        non_leading_question_checked: false,
        child_suitability_checked: false,
        on_screen_spelling_inventory_reviewed: false,
        approved_title: null,
        approved_prompt_text: null,
        approved_top_tip: null,
        approval_reference: null,
      },
    };
  });
  const packageCounts = count(rows, "challenge_type");
  const eligibleCounts = count(rows.filter((row) => row.review_status === "approved" && row.row_status === "active"), "challenge_type");
  const report = {
    release_reference: source.release_reference,
    validation_status: "valid_review_only_package",
    activation_ready: false,
    database_accessed: false,
    database_changed: false,
    imported_rows: 0,
    counts: { packaged: packageCounts, video_review_queue: queue.length, approved_active_in_package: eligibleCounts },
    minimum_initial_runway: minimums,
    projected_count_gate_after_ordinary_approval: Object.fromEntries(Object.keys(minimums).map((type) => [type, packageCounts[type] >= minimums[type]])),
    scoped_learner_unused_capacity: "not_verified_no_database_or_learner_scope",
    runtime_target_word_visibility: "not_verified_requires_daily_targets_and_all_rendered_surfaces",
    reflection_rotation: "existing_shared_LRU_helper; regression_checked_separately",
    blockers: [
      "All 63 Conundrums require actual video review; zero approved Conundrums in this package.",
      "The 36 supplied prompts have editorial review only; publication approval remains pending.",
      "Review UI currently renders prompt and instruction only; configuration title, Top Tip and interactive video rendering must be wired and verified.",
      "Daily Target Word collisions must be excluded across all visible and accessible content without rewriting governed prompts; current generation does not apply that filter.",
      "Actual database inventory, learner completion history and scoped unused capacity have not been queried.",
      "No staging playback, availability, UI or activation proof was performed; rollout gates remain unchanged."
    ],
  };
  return { instructions, prompts, rows, queue, report };
}

export function buildFiles() {
  const source = read("teaching-content.source.json");
  const catalogue = read("catalogue.source.json");
  const result = buildPackage(source, catalogue);
  const files = {
    "instructions.json": result.instructions,
    "governed-prompts.json": result.prompts,
    "adle_review_prompt_versions.import.json": result.rows,
    "conundrum-video-review-queue.json": result.queue,
    "validation-report.json": result.report,
  };
  files["manifest.json"] = {
    package_schema_version: "adle_review_writing_challenge_handoff_v1",
    release_reference: source.release_reference,
    content_version: source.content_version,
    status: "review_only_not_for_activation",
    database_table: "adle_review_prompt_versions",
    import_file: "adle_review_prompt_versions.import.json",
    import_row_count: result.rows.length,
    import_review_status: "in_review",
    publication_approval_reference: null,
    conundrum_import_row_count: 0,
    sources: ["teaching-content.source.json", "catalogue.source.json"].map((name) => ({ file: name, sha256: sha256File(name) })),
    original_catalogue_sha256: catalogue.source_file_sha256,
    generated_files: Object.entries(files).map(([name, value]) => ({
      file: name, sha256: createHash("sha256").update(serialise(value)).digest("hex"),
    })),
    content_fingerprint_algorithm: "SHA-256 of recursive lexicographically sorted JSON keys; array order retained; UTF-8; excludes status, review evidence and source_fingerprint",
    product_rules: {
      learner_term: "Target Words",
      target_words_maximum: 10,
      target_delivery: "separate_audio_only_controls",
      target_spellings_hidden_during_creative_writing: true,
      dynamic_prompt_rewriting: false,
      review_outcome_authority: "per_word_retrieval_evidence",
      ten_of_ten_role: "challenge_achievement_not_review_completion",
      incorrect_target_flow: "governed_word_reflection_and_repair",
      shared_review_engine: true,
      ordinary_reuse_policy: "once_per_learner",
      reflection_reuse_policy: "reusable_lru_no_immediate_repeat",
      unavailable_video_policy: "block_and_review_never_silently_replace",
      transcript_storage: "no_full_transcripts",
    },
  };
  return files;
}

function main() {
  assert.ok(process.argv.length === 3 && ["--write", "--check"].includes(process.argv[2]),
    "Usage: node scripts/build-adle-review-teaching-content.mjs --write|--check");
  const files = buildFiles();
  for (const [name, value] of Object.entries(files)) {
    const output = serialise(value);
    if (process.argv[2] === "--write") writeFileSync(new URL(name, base), output);
    else assert.equal(readFileSync(new URL(name, base), "utf8"), output, `Generated file drift: ${name}`);
  }
  console.log(JSON.stringify({ result: "valid_review_only_package", rows: 36, queued_videos: 63, approved_conundrums: 0, activation_ready: false }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
