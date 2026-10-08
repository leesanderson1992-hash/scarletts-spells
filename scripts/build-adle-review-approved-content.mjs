import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPackage, fingerprint } from "./build-adle-review-teaching-content.mjs";

const root = new URL("../", import.meta.url);
const previous = new URL("data/adle/review/writing-challenge/v1/", root);
const current = new URL("data/adle/review/writing-challenge/v2/", root);
const releaseReference = "adle-review-writing-challenge-2026-08-26-v2";
const serialise = value => JSON.stringify(value, null, 2) + "\n";
const hash = value => createHash("sha256").update(value).digest("hex");
const read = (directory, file) => JSON.parse(readFileSync(new URL(file, directory), "utf8"));
const fileHash = (directory, file) => hash(readFileSync(new URL(file, directory)));

export function approvedImportFingerprint(row) {
  const { source_fingerprint, review_status, row_status, ...content } = row;
  return fingerprint(content);
}

export function loadApprovedInputs() {
  const approval = read(current, "approval.source.json");
  for (const [directory, file, field] of [
    [current, "writing-prompts.signed-off.csv", "writing_csv_sha256"],
    [current, "writing-review.source.json", "writing_review_json_sha256"],
    [previous, "governed-prompts.json", "previous_governed_prompts_sha256"],
    [previous, "conundrum-video-review-queue.json", "conundrum_queue_sha256"],
    [previous, "teaching-content.source.json", "original_teaching_source_sha256"],
    [previous, "catalogue.source.json", "catalogue_source_sha256"],
  ]) assert.equal(fileHash(directory, file), approval[field], `Signed source drift: ${file}`);
  return {
    approval,
    reviewed: read(current, "writing-review.source.json"),
    baseSource: read(previous, "teaching-content.source.json"),
    catalogue: read(previous, "catalogue.source.json"),
    originalPrompts: read(previous, "governed-prompts.json"),
    originalQueue: read(previous, "conundrum-video-review-queue.json"),
  };
}

export function buildApprovedPackage(input) {
  const { approval, reviewed, baseSource, catalogue, originalPrompts, originalQueue } = input;
  assert.equal(approval.approval_source, "explicit_user_message");
  assert.equal(approval.authorises_database_write, false);
  assert.equal(approval.authorises_rollout_activation, false);
  // Bind approval to exact supplied sources; altered text cannot reuse this receipt.
  for (const [value, field] of [
    [reviewed, "writing_review_json_sha256"], [originalPrompts, "previous_governed_prompts_sha256"],
    [originalQueue, "conundrum_queue_sha256"], [baseSource, "original_teaching_source_sha256"],
    [catalogue, "catalogue_source_sha256"],
  ]) assert.equal(hash(serialise(value)), approval[field], `Signed content drift: ${field}`);
  assert.equal(reviewed.length, 36);
  assert.equal(new Set(reviewed.map(r => r.prompt_key)).size, 36);
  const originalByKey = new Map(originalPrompts.map(p => [p.prompt_key, p]));
  const source = structuredClone(baseSource);
  source.release_reference = releaseReference;
  source.content_version = "v2";
  source.source_reference = `${approval.approval_reference}:writing_csv:${approval.writing_csv_sha256}`;
  source.prompts = reviewed.map(row => {
    const original = originalByKey.get(row.prompt_key);
    assert.ok(original, `Unknown stable key: ${row.prompt_key}`);
    assert.equal(row.original_source_fingerprint, original.source_fingerprint);
    assert.equal(row.category, original.category_label);
    assert.equal(row.reuse_policy, original.reuse_policy);
    assert.equal(row.category_top_tip, original.category_top_tip ?? "");
    return {
      prompt_key: row.prompt_key,
      category: original.category,
      title: row.title,
      prompt_text: row.prompt_text,
      top_tip: row.top_tip,
      ...(row.task_intro !== source.categories[original.category].task_intro ? { task_intro: row.task_intro } : {}),
    };
  });
  const base = buildPackage(source, catalogue);
  const makeApproval = () => ({
    approval_reference: approval.approval_reference,
    approved_by: approval.approved_by,
    approved_on: approval.approved_on,
    method: "explicit_user_signoff",
    deployment_authorised: false,
  });
  const rows = base.rows.map(row => {
    const approved = {
      ...row,
      configuration: {
        ...row.configuration,
        provenance: {
          ...row.configuration.provenance,
          signed_source_file: "writing-prompts.signed-off.csv",
          signed_source_sha256: approval.writing_csv_sha256,
          original_source_fingerprint: originalByKey.get(row.stable_prompt_key).source_fingerprint,
          content_approval: makeApproval(),
        },
      },
      review_status: "approved",
    };
    approved.source_fingerprint = approvedImportFingerprint(approved);
    return approved;
  });
  const prompts = base.prompts.map((p, i) => ({
    ...p,
    source_fingerprint: rows[i].source_fingerprint,
    status: "reviewed",
    content_approval: makeApproval(),
    editorial_review: {
      reviewer: "user",
      reviewed_on: approval.approved_on,
      scope: "Exact amended CSV, approved by the user's explicit message",
      publication_approval: "content_approved_not_deployed",
      daily_target_word_collision_check: "pending_assignment_target_set",
    },
  }));
  const conundrumCategory = source.categories.conundrums;
  const register = originalQueue.map(candidate => {
    const missingQuestion = !candidate.catalogue_question?.trim() ||
      /question not recoverable|unavailable.*not invented/i.test(candidate.catalogue_question);
    const evidence = {
      ...makeApproval(),
      source_queue_fingerprint: candidate.source_fingerprint,
      review_scope: "Unchanged catalogue title and question, shared introduction and Top Tip template",
      video_review_basis: "user_signoff_in_context_of_video_review_handoff",
      independent_video_watch_verification: false,
      independent_playback_verification: false,
    };
    const entry = {
      ...candidate,
      status: "reviewed",
      content_approval: evidence,
      import_eligible: !missingQuestion,
      // The old flags are retained only as historical source evidence, not live review state.
      prior_review_blockers: candidate.review_blockers,
      review_blockers: missingQuestion ? ["learner_question_missing"] : [],
      review_evidence: evidence,
      runtime_checks_pending: ["video_playback_and_embedding", "official_identity_reconciliation", "daily_target_word_visibility"],
    };
    if (missingQuestion) return entry;
    const youtube = {
      youtube_video_id: candidate.youtube_video_id,
      youtube_url: candidate.youtube_url,
      youtube_embed_url: candidate.youtube_embed_url,
      video_title: candidate.video_title,
      video_source: candidate.video_source,
    };
    const row = {
      stable_prompt_key: candidate.prompt_key,
      challenge_type: "conundrums",
      content_version: "v2",
      prompt_text: candidate.catalogue_question,
      instruction_text: conundrumCategory.task_intro,
      configuration: {
        content_contract: "adle_review_writing_challenge_content_v1",
        title: candidate.catalogue_child_facing_title,
        top_tip: conundrumCategory.top_tip_template,
        instruction_reference: `${releaseReference}:instruction:conundrums`,
        category_label: "Conundrums",
        category_top_tip: null,
        locale: "en-GB",
        ...youtube,
        embed: { provider: "youtube", interactive: true },
        provenance: {
          source_kind: "user_approved_astra_nova_catalogue",
          source_library: candidate.source_library,
          source_file: candidate.provenance.source_file,
          source_file_sha256: candidate.provenance.source_file_sha256,
          source_range: candidate.provenance.source_range,
          source_queue_fingerprint: candidate.source_fingerprint,
          catalogue_question_fidelity: candidate.catalogue_question_fidelity,
          ...youtube,
          content_approval: evidence,
        },
      },
      reuse_policy: "once_per_learner",
      release_reference: releaseReference,
      source_fingerprint: "",
      review_status: "approved",
      row_status: "active",
    };
    row.source_fingerprint = approvedImportFingerprint(row);
    rows.push(row);
    prompts.push({
      prompt_key: row.stable_prompt_key,
      category: row.challenge_type,
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
      release_reference: releaseReference,
      locale: "en-GB",
      ...youtube,
      content_approval: evidence,
    });
    return entry;
  });
  assert.equal(new Set(rows.map(r => r.stable_prompt_key)).size, rows.length);
  const counts = Object.fromEntries(Object.keys(source.categories).map(type => [type, rows.filter(r => r.challenge_type === type).length]));
  const report = {
    release_reference: releaseReference,
    content_approval_reference: approval.approval_reference,
    validation_status: "signed_off_package_with_one_missing_question",
    signed_off_writing_prompts: 36,
    changed_writing_prompts: reviewed.filter(r => ["title", "task_intro", "prompt_text", "top_tip"].some(field => r[field] !== originalByKey.get(r.prompt_key)[field])).length,
    signed_off_conundrum_candidates: 63,
    import_row_count: rows.length,
    import_counts: counts,
    content_blocked_keys: register.filter(r => !r.import_eligible).map(r => r.prompt_key),
    all_import_rows_content_approved: rows.every(r => r.review_status === "approved"),
    initial_inventory_count_gate: Object.fromEntries(Object.entries(counts).map(([type, total]) => [type, total >= (type === "reflection" ? 2 : 5)])),
    database_accessed: false,
    database_changed: false,
    imported_rows: 0,
    activation_ready: false,
    learner_scoped_unused_capacity: "not_verified",
    blockers: [
      "Water still contains a research placeholder, not a learner question; excluded from import pending exact wording.",
      "Independent playback, embed availability and historic video-identity reconciliation remain unverified.",
      "The existing shared Review UI still needs governed title, Top Tip and interactive video rendering.",
      "Daily Target Word visibility filtering and learner-scoped unused capacity need verification.",
      "No database population, deployment or rollout activation has been authorised by this content sign-off."
    ],
  };
  return { source, instructions: base.instructions, prompts, rows, register, report };
}

export function buildApprovedFiles() {
  const input = loadApprovedInputs();
  const result = buildApprovedPackage(input);
  const files = {
    "teaching-content.source.json": result.source,
    "instructions.json": result.instructions,
    "governed-prompts.json": result.prompts,
    "adle_review_prompt_versions.import.json": result.rows,
    "conundrum-approval-register.json": result.register,
    "validation-report.json": result.report,
  };
  files["manifest.json"] = {
    package_schema_version: "adle_review_writing_challenge_handoff_v2",
    release_reference: releaseReference,
    content_version: "v2",
    status: "content_signed_off_not_imported_or_activated",
    content_approval_reference: input.approval.approval_reference,
    replaces_review_package: "../v1/",
    prior_package_preserved: true,
    import_file: "adle_review_prompt_versions.import.json",
    import_row_count: result.rows.length,
    import_review_status: "approved",
    database_table: "adle_review_prompt_versions",
    approval_scope: { writing_prompts: 36, conundrum_candidates: 63 },
    excluded_keys: result.report.content_blocked_keys,
    sources: ["writing-prompts.signed-off.csv", "writing-review.source.json", "approval.source.json", "amendments.json"].map(file => ({file, sha256: fileHash(current, file)})),
    generated_files: Object.entries(files).map(([file, value]) => ({file, sha256: hash(serialise(value))})),
    fingerprint_algorithm: "SHA-256 of recursively key-sorted import row excluding source_fingerprint, review_status and row_status; includes exact content, configuration, provenance and approval reference",
    product_rules: read(previous, "manifest.json").product_rules,
    database_changed: false,
    activation_ready: false,
  };
  return files;
}

function main() {
  assert.ok(process.argv.length === 3 && ["--write", "--check"].includes(process.argv[2]),
    "Usage: node scripts/build-adle-review-approved-content.mjs --write|--check");
  const files = buildApprovedFiles();
  for (const [file, value] of Object.entries(files)) {
    if (process.argv[2] === "--write") writeFileSync(new URL(file, current), serialise(value));
    else assert.equal(readFileSync(new URL(file, current), "utf8"), serialise(value), `Generated file drift: ${file}`);
  }
  console.log(JSON.stringify(files["validation-report.json"]));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
