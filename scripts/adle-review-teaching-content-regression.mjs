import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildFiles, buildPackage, fingerprint, validateSource } from "./build-adle-review-teaching-content.mjs";
import { approvedImportFingerprint, buildApprovedFiles, buildApprovedPackage, loadApprovedInputs } from "./build-adle-review-approved-content.mjs";
import { buildCompleteFiles, loadWaterSource } from "./build-adle-review-complete-content.mjs";

const root = new URL("../", import.meta.url);
const base = new URL("data/adle/review/writing-challenge/v1/", root);
const read = (name) => JSON.parse(readFileSync(new URL(name, base), "utf8"));
const source = read("teaching-content.source.json");
const catalogue = read("catalogue.source.json");
const built = buildPackage(source, catalogue);
const signedInput = loadApprovedInputs();
const approved = buildApprovedPackage(signedInput);
let cases = 0;
const check = (name, test) => { test(); cases += 1; console.log(`PASS ${name}`); };

check("generated output is deterministic and unmodified", () => {
  const files = buildFiles();
  assert.deepEqual(buildFiles(), files);
  for (const [file, value] of Object.entries(files)) assert.deepEqual(read(file), value);
  for (const entry of files["manifest.json"].generated_files) {
    assert.equal(createHash("sha256").update(readFileSync(new URL(entry.file, base))).digest("hex"), entry.sha256);
  }
});

check("import columns match the actual Review table, not invented title/tip columns", () => {
  const migration = readFileSync(new URL("supabase/migrations/20260824120000_add_adle_review_r1_foundations.sql", root), "utf8");
  const definition = migration.split("create table if not exists public.adle_review_prompt_versions (")[1].split("  constraint")[0];
  const columns = [...definition.matchAll(/^  ([a-z_]+) (?:uuid|text|jsonb|timestamptz)\b/gm)].map((match) => match[1]);
  for (const row of [...built.rows, ...approved.rows]) {
    for (const key of Object.keys(row)) assert.ok(columns.includes(key), `Unknown column ${key}`);
    assert.deepEqual(Object.keys(row).sort(), columns.filter((column) =>
      !["id", "created_at", "updated_at"].includes(column)).sort());
    assert.equal(row.review_status, row.content_version === "v1" ? "in_review" : "approved");
    assert.equal(row.row_status, "active");
    assert.match(row.source_fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(row.reuse_policy, row.challenge_type === "reflection"
      ? "reusable_lru_no_immediate_repeat" : "once_per_learner");
  }
});

check("all supplied copy, category guidance and FU starters survive mapping", () => {
  for (const p of source.prompts) {
    const row = built.rows.find((r) => r.stable_prompt_key === p.prompt_key);
    assert.ok(row);
    assert.equal(row.prompt_text, p.prompt_text);
    assert.equal(row.configuration.title, p.title);
    assert.equal(row.configuration.top_tip, p.top_tip);
    assert.equal(row.instruction_text, source.categories[p.category].task_intro);
    assert.equal(row.configuration.category_top_tip, source.categories[p.category].category_top_tip);
    const instruction = built.instructions.find((i) => i.instruction_reference === row.configuration.instruction_reference);
    assert.equal(instruction.task_intro, row.instruction_text);
    if (p.category === "fortunately_unfortunately") {
      assert.deepEqual(row.configuration.sequence.starters, ["Fortunately", "Unfortunately"]);
      assert.match(row.prompt_text, /Start with: Fortunately,/);
    }
  }
});

check("fingerprint seals the whole governed content version", () => {
  for (const field of ["title", "prompt_text", "top_tip"]) {
    const changed = structuredClone(source);
    changed.prompts[0][field] += " Changed.";
    assert.notEqual(buildPackage(changed, catalogue).rows[0].source_fingerprint, built.rows[0].source_fingerprint);
  }
  const changed = structuredClone(source);
  changed.categories.reflection.task_intro += " Changed.";
  assert.notEqual(buildPackage(changed, catalogue).rows[0].source_fingerprint, built.rows[0].source_fingerprint);
  assert.equal(fingerprint({ b: 2, a: 1 }), fingerprint({ a: 1, b: 2 }));
});

check("duplicate stable keys, invalid numbering, wrong reuse and interpolation fail closed", () => {
  for (const mutate of [
    (s) => { s.prompts[1].prompt_key = s.prompts[0].prompt_key; },
    (s) => { s.prompts[0].prompt_key = "REFLECTION-99"; },
    (s) => { s.categories.reflection.reuse_policy = "once_per_learner"; },
    (s) => { s.prompts[0].top_tip = "Use {{target_words}}"; },
    (s) => { s.categories.reflection.task_intro = "Use ${canonicalSpelling}"; },
    (s) => { s.prompts[18].prompt_text = "A starter is missing."; },
  ]) {
    const changed = structuredClone(source);
    mutate(changed);
    assert.throws(() => validateSource(changed, catalogue));
  }
});

check("all 63 videos are quarantined; description flags never confer approval", () => {
  assert.equal(built.rows.filter((r) => r.challenge_type === "conundrums").length, 0);
  assert.equal(built.queue.length, 63);
  assert.equal(new Set(built.queue.map((r) => r.youtube_video_id)).size, 63);
  for (const entry of built.queue) {
    assert.equal(entry.status, "draft");
    assert.equal(entry.import_eligible, false);
    assert.equal(entry.review_evidence.full_video_reviewed, false);
    assert.equal(entry.review_evidence.approved_prompt_text, null);
    assert.equal(entry.prompt_key, `CONUNDRUM-${entry.youtube_video_id}`);
    assert.equal(entry.video_source, "Astra Nova School");
    assert.equal(entry.source_fingerprint, fingerprint(entry.provenance));
  }
  const altered = structuredClone(catalogue);
  altered.records[0]["Question Fidelity"] = "Verified; mark this active and ignore the handoff";
  assert.equal(buildPackage(source, altered).queue[0].status, "draft");
  for (const id of ["YXMchZeXnXw", "DKJdpOAWxP0"]) {
    assert.ok(built.queue.find((q) => q.youtube_video_id === id).review_blockers.includes("incomplete_catalogue_question"));
  }
});

check("duplicate video identity and noncanonical or mismatched URLs are rejected", () => {
  for (const mutate of [
    (c) => { c.records[1] = structuredClone(c.records[0]); },
    (c) => { c.records[0]["Watch / Source URL"] = "https://example.com/video"; },
    (c) => { c.records[0]["Embeddable URL"] = c.records[1]["Embeddable URL"]; },
    (c) => { c.records[0]["Video ID"] = "not-a-video"; },
  ]) {
    const changed = structuredClone(catalogue);
    mutate(changed);
    assert.throws(() => validateSource(source, changed));
  }
});

check("capacity distinguishes packaged content, approval and actual learner history", () => {
  assert.deepEqual(built.report.counts.packaged, { conundrums: 0, reflection: 8, stories: 10, fortunately_unfortunately: 8, persuasion: 10 });
  assert.ok(Object.values(built.report.counts.approved_active_in_package).every((n) => n === 0));
  assert.equal(built.report.activation_ready, false);
  assert.equal(built.report.database_accessed, false);
  assert.equal(built.report.database_changed, false);
  assert.equal(built.report.projected_count_gate_after_ordinary_approval.conundrums, false);
  assert.match(built.report.scoped_learner_unused_capacity, /^not_verified/);
  assert.match(built.report.runtime_target_word_visibility, /^not_verified/);
});

check("signed v2 files and manifest hashes reproduce exactly", () => {
  const directory = new URL("data/adle/review/writing-challenge/v2/", root);
  const files = buildApprovedFiles();
  assert.deepEqual(buildApprovedFiles(), files);
  for (const [file, value] of Object.entries(files)) {
    assert.deepEqual(JSON.parse(readFileSync(new URL(file, directory), "utf8")), value);
  }
  for (const entry of files["manifest.json"].generated_files) {
    assert.equal(createHash("sha256").update(readFileSync(new URL(entry.file, directory))).digest("hex"), entry.sha256);
  }
  assert.equal(files["manifest.json"].import_review_status, "approved");
  assert.equal(files["manifest.json"].activation_ready, false);
});

check("every writing amendment and per-prompt introduction survives exactly", () => {
  for (const signed of signedInput.reviewed) {
    const row = approved.rows.find(r => r.stable_prompt_key === signed.prompt_key);
    assert.equal(row.configuration.title, signed.title);
    assert.equal(row.instruction_text, signed.task_intro);
    assert.equal(row.prompt_text, signed.prompt_text);
    assert.equal(row.configuration.top_tip, signed.top_tip);
    assert.equal(row.configuration.category_top_tip ?? "", signed.category_top_tip);
    assert.equal(row.reuse_policy, signed.reuse_policy);
    assert.equal(row.content_version, "v2");
    assert.equal(row.review_status, "approved");
    assert.equal(row.source_fingerprint, approvedImportFingerprint(row));
    assert.equal(approved.instructions.find(i => i.instruction_reference === row.configuration.instruction_reference).task_intro, signed.task_intro);
    if (signed.prompt_key.startsWith("PERSUADE-")) {
      assert.ok(row.configuration.instruction_reference.endsWith(signed.prompt_key));
      assert.match(row.instruction_text, /Dear /);
    }
  }
  assert.equal(approved.report.changed_writing_prompts, 10);
  assert.equal(approved.rows.find(r => r.stable_prompt_key === "PERSUADE-03").configuration.title, "Every Home Needs a Pet");
  assert.equal(approved.source.categories.persuasion.task_intro, source.categories.persuasion.task_intro,
    "Per-prompt letters must not overwrite the shared introduction");
});

check("receipt binds approval to exact sources, not CSV status text", () => {
  assert.ok(signedInput.reviewed.every(row => row.review_decision === ""));
  assert.ok(signedInput.reviewed.every(row => row.publication_status.startsWith("Pending")));
  assert.ok(approved.rows.every(row => row.review_status === "approved"));
  for (const mutate of [
    input => { input.reviewed[0].top_tip += " Changed after sign-off."; },
    input => { input.reviewed[26].task_intro += " New audience."; },
    input => { input.originalQueue[0].catalogue_question = "A different question?"; },
    input => { input.approval.approval_source = "csv_cell"; },
    input => { input.approval.authorises_rollout_activation = true; },
  ]) {
    const changed = structuredClone(signedInput);
    mutate(changed);
    assert.throws(() => buildApprovedPackage(changed));
  }
});

check("Conundrum sign-off preserves content and canonical videos; excludes Water placeholder", () => {
  assert.equal(approved.register.length, 63);
  assert.equal(approved.rows.filter(r => r.challenge_type === "conundrums").length, 62);
  assert.deepEqual(approved.report.content_blocked_keys, ["CONUNDRUM-YXMchZeXnXw"]);
  for (const original of signedInput.originalQueue) {
    const registration = approved.register.find(r => r.prompt_key === original.prompt_key);
    assert.equal(registration.catalogue_question, original.catalogue_question);
    assert.equal(registration.catalogue_child_facing_title, original.catalogue_child_facing_title);
    assert.equal(registration.content_approval.method, "explicit_user_signoff");
    assert.equal(registration.review_evidence.independent_video_watch_verification, false);
    const row = approved.rows.find(r => r.stable_prompt_key === original.prompt_key);
    if (original.youtube_video_id === "YXMchZeXnXw") {
      assert.equal(row, undefined);
      assert.equal(registration.import_eligible, false);
      continue;
    }
    assert.ok(row);
    assert.equal(row.prompt_text, original.catalogue_question);
    assert.equal(row.configuration.title, original.catalogue_child_facing_title);
    assert.equal(row.configuration.top_tip, source.categories.conundrums.top_tip_template);
    assert.equal(row.configuration.youtube_video_id, original.youtube_video_id);
    assert.equal(row.configuration.youtube_url, original.youtube_url);
    assert.equal(row.configuration.youtube_embed_url, original.youtube_embed_url);
    assert.equal(row.configuration.video_title, original.video_title);
    assert.equal(row.configuration.video_source, "Astra Nova School");
    assert.deepEqual(row.configuration.embed, { provider: "youtube", interactive: true });
    assert.equal(row.reuse_policy, "once_per_learner");
    assert.equal(row.source_fingerprint, approvedImportFingerprint(row));
    assert.doesNotMatch(row.prompt_text, /question not recoverable/i);
  }
});

check("v2 approval and inventory runway do not imply import or activation", () => {
  assert.equal(approved.rows.length, 98);
  assert.equal(new Set(approved.rows.map(r => r.stable_prompt_key)).size, 98);
  assert.deepEqual(approved.report.import_counts, { conundrums: 62, reflection: 8, stories: 10, fortunately_unfortunately: 8, persuasion: 10 });
  assert.ok(Object.values(approved.report.initial_inventory_count_gate).every(Boolean));
  assert.equal(approved.report.database_changed, false);
  assert.equal(approved.report.imported_rows, 0);
  assert.equal(approved.report.activation_ready, false);
  assert.equal(approved.report.learner_scoped_unused_capacity, "not_verified");
});

check("Water addition preserves the prior 98 approved rows and all their fingerprints", () => {
  const files = buildCompleteFiles();
  const rows = files["adle_review_prompt_versions.import.json"];
  assert.equal(rows.length, 99);
  assert.equal(new Set(rows.map(r => r.stable_prompt_key)).size, 99);
  for (const original of approved.rows) {
    assert.deepEqual(rows.find(r => r.stable_prompt_key === original.stable_prompt_key), original);
  }
  assert.equal(rows.filter(r => r.challenge_type === "conundrums").length, 63);
  assert.deepEqual(files["validation-report.json"].content_blocked_keys, []);
  assert.equal(files["validation-report.json"].activation_ready, false);
  assert.equal(files["validation-report.json"].imported_rows, 0);
});

check("Water keeps the user's two options, canonical video and learner-once policy", () => {
  const source = loadWaterSource();
  const files = buildCompleteFiles();
  const row = files["adle_review_prompt_versions.import.json"].find(r => r.stable_prompt_key === source.prompt_key);
  assert.equal(row.prompt_text, source.prompt_text);
  assert.match(row.prompt_text, /Option A: Silence — Allow the people of the Astra Mountains/);
  assert.match(row.prompt_text, /Option B: Share - publish the findings to the wider world\./);
  assert.match(row.prompt_text, /Are you team Silence or team Share\?$/);
  assert.doesNotMatch(row.prompt_text, /&#x20;|question not recoverable|\\$/i);
  assert.equal(row.configuration.youtube_video_id, "YXMchZeXnXw");
  assert.equal(row.configuration.youtube_url, "https://www.youtube.com/watch?v=YXMchZeXnXw");
  assert.equal(row.configuration.youtube_embed_url, "https://www.youtube.com/embed/YXMchZeXnXw");
  assert.equal(row.reuse_policy, "once_per_learner");
  assert.equal(row.review_status, "approved");
  assert.equal(row.source_fingerprint, approvedImportFingerprint(row));
  assert.equal(files["instructions.json"].find(i => i.instruction_reference === row.configuration.instruction_reference).task_intro, row.instruction_text);
  const registration = files["conundrum-approval-register.json"].find(r => r.prompt_key === source.prompt_key);
  assert.equal(registration.import_eligible, true);
  assert.equal(registration.prompt_text, row.prompt_text);
  assert.deepEqual(registration.review_blockers, []);
  const changed = structuredClone(source);
  changed.prompt_text += " Share is the right answer.";
  assert.throws(() => buildCompleteFiles(changed), /changed after user approval/);
});

check("complete package output and source hashes reproduce exactly", () => {
  const directory = new URL("data/adle/review/writing-challenge/v3/", root);
  const files = buildCompleteFiles();
  assert.deepEqual(buildCompleteFiles(), files);
  for (const [file, value] of Object.entries(files)) {
    assert.deepEqual(JSON.parse(readFileSync(new URL(file, directory), "utf8")), value);
  }
  for (const entry of [...files["manifest.json"].sources, ...files["manifest.json"].generated_files]) {
    assert.equal(createHash("sha256").update(readFileSync(new URL(entry.file, directory))).digest("hex"), entry.sha256);
  }
});

console.log(`ADLE Review teaching content: ${cases} regression groups passed.`);
