import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { approvedImportFingerprint, buildApprovedFiles } from "./build-adle-review-approved-content.mjs";

const root = new URL("../", import.meta.url);
const output = new URL("data/adle/review/writing-challenge/v3/", root);
const release = "adle-review-writing-challenge-2026-08-26-v3";
const serialise = value => JSON.stringify(value, null, 2) + "\n";
const hash = value => createHash("sha256").update(value).digest("hex");

export function loadWaterSource() {
  return JSON.parse(readFileSync(new URL("water-question.source.json", output), "utf8"));
}

export function buildCompleteFiles(water = loadWaterSource()) {
  const receipt = JSON.parse(readFileSync(new URL("water-approval.source.json", output), "utf8"));
  assert.equal(hash(serialise(water)), receipt.water_source_sha256, "Water wording changed after user approval");
  assert.equal(water.source_kind, "explicit_user_message");
  assert.equal(water.authorises_database_write, false);
  assert.equal(water.authorises_rollout_activation, false);
  assert.equal(water.prompt_key, "CONUNDRUM-YXMchZeXnXw");
  assert.equal(water.youtube_video_id, "YXMchZeXnXw");
  assert.ok(water.prompt_text.trim());
  assert.doesNotMatch(water.prompt_text, /question not recoverable|\{\{|\$\{/i);

  const prior = buildApprovedFiles();
  assert.equal(hash(serialise(prior["manifest.json"])), receipt.previous_manifest_sha256,
    "Prior approved package changed");
  const rows = structuredClone(prior["adle_review_prompt_versions.import.json"]);
  const prompts = structuredClone(prior["governed-prompts.json"]);
  const instructions = structuredClone(prior["instructions.json"]);
  const register = structuredClone(prior["conundrum-approval-register.json"]);
  const candidate = register.find(row => row.prompt_key === water.prompt_key);
  assert.ok(candidate && !candidate.import_eligible);
  assert.ok(!rows.some(row => row.stable_prompt_key === water.prompt_key));
  const category = prior["teaching-content.source.json"].categories.conundrums;
  const instruction = instructions.find(row => row.category === "conundrums");
  const approval = {
    ...candidate.content_approval,
    prior_set_approval_reference: candidate.content_approval.approval_reference,
    approval_reference: water.approval_reference,
    review_scope: "Existing video, title, introduction and Top Tip sign-off plus the missing question supplied by the user",
    question_source: "water-question.source.json",
    question_source_sha256: receipt.water_source_sha256,
  };
  const youtube = {
    youtube_video_id: candidate.youtube_video_id,
    youtube_url: candidate.youtube_url,
    youtube_embed_url: candidate.youtube_embed_url,
    video_title: candidate.video_title,
    video_source: candidate.video_source,
  };
  const row = {
    stable_prompt_key: water.prompt_key,
    challenge_type: "conundrums",
    content_version: "v3",
    prompt_text: water.prompt_text,
    instruction_text: category.task_intro,
    configuration: {
      content_contract: "adle_review_writing_challenge_content_v1",
      title: candidate.catalogue_child_facing_title,
      top_tip: category.top_tip_template,
      instruction_reference: instruction.instruction_reference,
      category_label: "Conundrums",
      category_top_tip: null,
      locale: "en-GB",
      ...youtube,
      embed: { provider: "youtube", interactive: true },
      provenance: {
        source_kind: "user_supplied_water_question_with_approved_astra_nova_identity",
        source_library: candidate.source_library,
        source_file: candidate.provenance.source_file,
        source_file_sha256: candidate.provenance.source_file_sha256,
        source_range: candidate.provenance.source_range,
        source_queue_fingerprint: candidate.source_fingerprint,
        original_catalogue_question_fidelity: candidate.catalogue_question_fidelity,
        question_source: "water-question.source.json",
        question_source_sha256: receipt.water_source_sha256,
        ...youtube,
        content_approval: approval,
      },
    },
    reuse_policy: "once_per_learner",
    release_reference: release,
    source_fingerprint: "",
    review_status: "approved",
    row_status: "active",
  };
  row.source_fingerprint = approvedImportFingerprint(row);
  rows.push(row);
  prompts.push({
    prompt_key: water.prompt_key,
    category: "conundrums",
    content_version: row.content_version,
    title: row.configuration.title,
    task_intro: row.instruction_text,
    instruction_reference: row.configuration.instruction_reference,
    prompt_text: row.prompt_text,
    top_tip: row.configuration.top_tip,
    category_label: "Conundrums",
    category_top_tip: null,
    reuse_policy: row.reuse_policy,
    status: "reviewed",
    source_fingerprint: row.source_fingerprint,
    release_reference: release,
    locale: "en-GB",
    ...youtube,
    content_approval: approval,
  });
  // Keep the original catalogue placeholder only in provenance, never as task content.
  Object.assign(candidate, {
    import_eligible: true,
    prompt_text: water.prompt_text,
    content_approval: approval,
    review_evidence: approval,
    review_blockers: [],
    resolved_content_blockers: ["learner_question_missing"],
    governed_content_fingerprint: row.source_fingerprint,
  });
  const report = {
    ...prior["validation-report.json"],
    release_reference: release,
    content_approval_references: [prior["manifest.json"].content_approval_reference, water.approval_reference],
    validation_status: "complete_signed_off_content_package",
    import_row_count: rows.length,
    import_counts: { ...prior["validation-report.json"].import_counts, conundrums: 63 },
    content_blocked_keys: [],
    previous_approved_rows_preserved_exactly: true,
    blockers: prior["validation-report.json"].blockers.filter(text => !text.startsWith("Water still contains")),
  };
  delete report.content_approval_reference;
  const files = {
    "adle_review_prompt_versions.import.json": rows,
    "governed-prompts.json": prompts,
    "instructions.json": instructions,
    "conundrum-approval-register.json": register,
    "validation-report.json": report,
  };
  files["manifest.json"] = {
    package_schema_version: "adle_review_writing_challenge_handoff_v3",
    release_reference: release,
    status: "content_complete_signed_off_not_imported_or_activated",
    content_versions: { unchanged_prior_rows: "v2", water_question: "v3" },
    prior_package: "../v2/",
    prior_package_preserved: true,
    previous_approved_rows_preserved_exactly: true,
    content_approval_references: report.content_approval_references,
    database_table: "adle_review_prompt_versions",
    import_file: "adle_review_prompt_versions.import.json",
    import_row_count: rows.length,
    import_review_status: "approved",
    excluded_keys: [],
    sources: ["water-question.source.json", "water-approval.source.json"].map(file => ({
      file, sha256: hash(readFileSync(new URL(file, output))),
    })),
    generated_files: Object.entries(files).map(([file, value]) => ({file, sha256: hash(serialise(value))})),
    fingerprint_algorithm: prior["manifest.json"].fingerprint_algorithm,
    product_rules: prior["manifest.json"].product_rules,
    database_changed: false,
    activation_ready: false,
  };
  return files;
}

function main() {
  assert.ok(process.argv.length === 3 && ["--write", "--check"].includes(process.argv[2]),
    "Usage: node scripts/build-adle-review-complete-content.mjs --write|--check");
  const files = buildCompleteFiles();
  for (const [file, value] of Object.entries(files)) {
    if (process.argv[2] === "--write") writeFileSync(new URL(file, output), serialise(value));
    else assert.equal(readFileSync(new URL(file, output), "utf8"), serialise(value), `Generated file drift: ${file}`);
  }
  console.log(JSON.stringify({rows: files["manifest.json"].import_row_count, conundrums: 63, missing_content: 0, activation_ready: false}));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
