/** Disposable end-to-end S8 proof. Fixed staging project and Preview only. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { chromium, expect } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

import { processTaskSubmission } from "../lib/courses/submission-processing";
import { recoverWritingContextJobs } from "../lib/writing-engine/whole-writing/context-worker";
import { recoverWritingShadowRuns } from "../lib/writing-engine/whole-writing/worker";

const STAGING_REF = "jlhotktspjvffslvuyfz";
const previewHost = process.env.WRITING_S8_PREVIEW_HOST;
const firstConfigured = (...values) => values.find((value) => typeof value === "string" && value.length > 0);
const stagingUrl = firstConfigured(process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL);
const serviceKey = firstConfigured(process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SB_SERVICE_ROLE_KEY);
const anonKey = firstConfigured(process.env.SUPABASE_ANON_KEY, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
assert.ok(stagingUrl?.includes(STAGING_REF), "Configured Supabase project is not fixed staging");
assert.ok(serviceKey && anonKey, "Staging Supabase keys are required");
assert.ok(previewHost?.startsWith("scarletts-spells-staged-") && previewHost.endsWith(".vercel.app"), "A staging Preview host is required");
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
process.env.NEXT_PUBLIC_SUPABASE_URL = stagingUrl;
process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT = "staging";

const service = createClient(stagingUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const parent = createClient(stagingUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const check = (result) => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
const protectedTables = [
  "adle_learning_items", "child_gold_coin_ledger_events", "child_gold_bar_ledger_events",
  "adle_authentic_use_events", "adle_review_schedule_words",
];
async function protectedCounts() {
  return Object.fromEntries(await Promise.all(protectedTables.map(async (table) => {
    const result = await service.from(table).select("id", { count: "exact", head: true });
    if (result.error) throw new Error(result.error.message);
    return [table, result.count];
  })));
}

const tag = randomUUID();
const email = `s8-proof-${tag}@example.test`;
const password = `S8-proof-${randomUUID()}!`;
let parentId = null;
let childId = null;
let mappingId = null;
let approvalAuthority = null;
let browser = null;
const screenshots = resolve(".tmp", "s8-staging-proof");

try {
  await mkdir(screenshots, { recursive: true });
  const preview = await fetch(`https://${previewHost}/login`, { redirect: "manual" });
  assert.ok(preview.status >= 200 && preview.status < 400, `Preview did not answer: HTTP ${preview.status}`);
  const before = await protectedCounts();

  parentId = check(await service.auth.admin.createUser({ email, password, email_confirm: true })).user.id;
  childId = check(await service.from("children").insert({
    parent_user_id: parentId, first_name: "S8 Proof", notes: `disposable-s8:${tag}`,
  }).select("id").single()).id;
  const courseId = check(await service.from("courses").insert({
    parent_user_id: parentId, child_id: childId, title: "S8 context proof",
    description: `disposable:${tag}`, structure_type: "timed",
  }).select("id").single()).id;
  const moduleId = check(await service.from("course_modules").insert({
    parent_user_id: parentId, course_id: courseId, title: "Context choices", position: 0,
  }).select("id").single()).id;
  const lessonSchema = { version: 1, theme: "scarlett-default", title: "Context choices", blocks: [
    { block_id: "story", block_type: "question_textarea", label: "Story", rows: 3 },
  ] };
  const taskId = check(await service.from("course_tasks").insert({
    parent_user_id: parentId, course_id: courseId, module_id: moduleId, title: "S8 proof",
    task_type: "lesson", position: 0, is_active: true, coin_reward_trigger: "none",
    gold_bar_rule: "none", lesson_schema: lessonSchema,
  }).select("id").single()).id;
  check(await service.from("writing_shadow_controls").insert({
    child_id: childId, parent_user_id: parentId, capture_enabled: true, processing_enabled: true,
    extraction_enabled: true, resolution_enabled: true, evidence_shadow_enabled: true,
    known_error_detection_enabled: false, known_error_review_enabled: false,
    context_processing_enabled: true, context_retrospective_enabled: true, context_review_enabled: true,
  }));

  const skill = check(await service.from("micro_skill_catalog")
    .select("micro_skill_key")
    .eq("micro_skill_key", "D4_HOM_FUNCTION_WORD_HOMOPHONES_THERE_THEIR_THEYRE")
    .eq("is_active", true).eq("is_assignable", true).single());
  mappingId = randomUUID();
  check(await service.from("spelling_canonical_mappings").insert({
    id: mappingId, misspelling_normalized: "their", correct_spelling_normalized: "they're",
    micro_skill_key: skill.micro_skill_key, mapping_status: "active", dialect_code: "en-GB",
    normalization_version: "spelling_normalize_v1", resolver_visibility_status: "visible",
    created_by_admin_user_id: parentId, created_by_admin_email: email,
    decision_note: "Disposable S8 staging proof", metadata: {
      automatic_detection_eligibility: "context_required", proof_tag: tag,
    },
  }));
  check(await service.from("spelling_canonical_mapping_events").insert({
    mapping_id: mappingId, event_type: "resolver_visibility_enabled", new_status: "active",
    previous_resolver_visibility_status: "hidden", new_resolver_visibility_status: "visible",
    admin_user_id: parentId, admin_email: email, note: "Disposable S8 staging proof",
    metadata: { proof_tag: tag },
  }));
  const release = check(await service.from("writing_context_family_releases")
    .select("id,corpus_version").eq("family_key", "THERE_THEIR_THEYRE")
    .eq("release_key", "s8-v1-there-their-theyre").single());
  approvalAuthority = `disposable-s8-proof-approved:${tag}`;
  check(await service.from("writing_context_family_approval_events").insert({
    environment_key: "staging", family_key: "THERE_THEIR_THEYRE", release_id: release.id,
    action: "approved", corpus_version: release.corpus_version,
    evaluation_fingerprint: `disposable:${tag}`,
    quality_limits: { disposable_proof_only: true }, evaluation_metrics: { disposable_proof_only: true },
    authority_reference: approvalAuthority, approved_by: parentId,
  }));

  check(await parent.auth.signInWithPassword({ email, password }));
  const text = "Their going to the park.";
  const structured = { answers: [{ block_id: "story", value: text }] };
  const draft = { story: text, __structured_lesson_response: structured };
  const submittedAt = new Date().toISOString();
  const submitted = check(await parent.rpc("submit_course_task_response_once", {
    p_parent_user_id: parentId, p_child_id: childId, p_course_id: courseId, p_task_id: taskId,
    p_submission_request_id: randomUUID(), p_submission_text: text, p_submitted_at: submittedAt,
    p_completion_date: submittedAt.slice(0, 10), p_structured_payload_type: "structured_lesson_response",
    p_structured_payload: structured, p_processing_payload: {
      writingSourceCapture: { rawSubmissionText: text, draftPayload: draft }, draftPayload: draft,
      taskType: "lesson", completionDate: submittedAt.slice(0, 10),
    },
  }));
  const processed = await processTaskSubmission(submitted.submissionId);
  assert.ok(["completed", "not_claimed"].includes(processed.status));
  const shadow = await recoverWritingShadowRuns(service);
  assert.equal(shadow.failed, 0);
  const sample = check(await service.from("writing_samples")
    .select("id").eq("task_submission_id", submitted.submissionId).maybeSingle()) ??
    check(await service.from("writing_samples").insert({
      child_id: childId, parent_user_id: parentId, title: "S8 proof submission", sample_text: text,
      written_at: submittedAt.slice(0, 10), source: "Course task submission", task_submission_id: submitted.submissionId,
    }).select("id").single());
  assert.ok(sample.id);
  const context = await recoverWritingContextJobs(service);
  assert.equal(context.failed, 0);
  assert.ok(context.completed >= 1);
  const delivery = check(await service.from("writing_context_current_review_deliveries")
    .select("id,result_id,occurrence_id").eq("task_submission_id", submitted.submissionId).single());

  browser = await chromium.launch({ headless: true });
  const projectResponse = await promisify(execFile)("vercel", [
    "api", "/v9/projects/prj_oJkffstOtacc4juYloXajHpjJUha",
  ], { maxBuffer: 4 * 1024 * 1024 });
  const project = JSON.parse(projectResponse.stdout);
  const protectionBypass = Object.keys(project.protectionBypass ?? {})[0];
  assert.ok(protectionBypass, "The staged project has no configured automation protection bypass");
  const authCookies = new Map();
  const browserAuth = createServerClient(stagingUrl, anonKey, {
    cookies: {
      getAll: () => [],
      setAll: (rows) => rows.forEach((row) => authCookies.set(row.name, row.value)),
    },
  });
  check(await browserAuth.auth.signInWithPassword({ email, password }));
  const browserContext = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    extraHTTPHeaders: { "x-vercel-protection-bypass": protectionBypass },
  });
  await browserContext.addCookies([...authCookies].map(([name, value]) => ({
    name, value, url: `https://${previewHost}`,
  })));
  const page = await browserContext.newPage();

  const reviewUrl = `https://${previewHost}/courses/review/${submitted.submissionId}?child=${childId}`;
  await page.goto(reviewUrl, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Correctly spelled; possibly the wrong word here" })).toBeVisible();
  await expect(page.getByText("Their going to the park.", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `${screenshots}/parent-suggestion.png`, fullPage: true });
  const contextPanel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Correctly spelled; possibly the wrong word here" }) });
  await contextPanel.getByRole("button", { name: "Confirm" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Context suggestion confirmed. Choose the learning reason below before sending the work back.")).toBeVisible();
  await page.screenshot({ path: `${screenshots}/parent-confirmed.png`, fullPage: true });
  await page.getByRole("button", { name: "Send back to child" }).click();
  await expect(page.getByText("Sent back to child.")).toBeVisible({ timeout: 30_000 });
  const returned = check(await service.from("task_submissions")
    .select("parent_review_status").eq("id", submitted.submissionId).single());
  if (returned.parent_review_status !== "returned") {
    await page.screenshot({ path: `${screenshots}/send-back-failure.png`, fullPage: true });
    throw new Error(`SEND_BACK_FAILED:${page.url()}:${(await page.locator("body").innerText()).slice(-500)}`);
  }

  const learnerUrl = `https://${previewHost}/learn/modules/${moduleId}/tasks/${taskId}?child=${childId}&mode=child`;
  await page.goto(learnerUrl, { waitUntil: "networkidle" });
  await expect(page.getByLabel("New Try")).toBeVisible();
  await page.getByLabel("New Try").fill("They're");
  await page.getByRole("textbox", { name: "Story" }).fill("They're going to the park.");
  await page.screenshot({ path: `${screenshots}/child-retry.png`, fullPage: true });
  await page.getByRole("button", { name: "Save lesson work" }).click();
  await expect(page.getByText("Submitted! Your work is saved.")).toBeVisible({ timeout: 30_000 });
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("Submitted! Your work is saved.")).toBeVisible();
  await page.screenshot({ path: `${screenshots}/child-complete.png`, fullPage: true });

  const decision = check(await service.from("writing_context_review_decisions")
    .select("decision,writing_issue_id").eq("delivery_id", delivery.id).single());
  assert.equal(decision.decision, "accepted");
  const attempt = check(await service.from("writing_issue_correction_attempts")
    .select("correction_outcome,assistance_state,answer_visibility,source_writing_occurrence_id")
    .eq("writing_issue_id", decision.writing_issue_id).single());
  assert.deepEqual({
    correctionOutcome: attempt.correction_outcome,
    assistance: attempt.assistance_state,
    answerVisibility: attempt.answer_visibility,
    occurrence: attempt.source_writing_occurrence_id,
  }, {
    correctionOutcome: "correct", assistance: "unknown", answerVisibility: "unknown",
    occurrence: delivery.occurrence_id,
  });
  const after = await protectedCounts();
  assert.deepEqual(after, before);
  console.log(JSON.stringify({
    status: "passed", project: STAGING_REF, preview: previewHost,
    parentConfirmedExactOccurrence: true, childRetryCompleted: true,
    separateRepairFact: true, protectedConsequenceChanges: 0,
    screenshots: ["parent-suggestion.png", "parent-confirmed.png", "child-retry.png", "child-complete.png"],
  }));
} finally {
  if (browser) await browser.close();
  if (parentId) {
    if (approvalAuthority) {
      const release = check(await service.from("writing_context_family_releases")
        .select("id,corpus_version").eq("release_key", "s8-v1-there-their-theyre").single());
      await service.from("writing_context_family_approval_events").insert({
        environment_key: "staging", family_key: "THERE_THEIR_THEYRE", release_id: release.id,
        action: "withdrawn", corpus_version: release.corpus_version,
        evaluation_fingerprint: `disposable-withdrawal:${tag}`,
        quality_limits: { disposable_proof_only: true }, evaluation_metrics: { disposable_proof_only: true },
        authority_reference: `disposable-s8-proof-withdrawn:${tag}`, approved_by: parentId,
      });
    }
    if (childId) await service.from("writing_shadow_controls").update({
      context_processing_enabled: false, context_retrospective_enabled: false, context_review_enabled: false,
    }).eq("child_id", childId).eq("parent_user_id", parentId);
    if (mappingId) {
      await service.from("spelling_canonical_mappings").update({
        mapping_status: "disabled", resolver_visibility_status: "disabled",
        deactivated_at: new Date().toISOString(), deactivated_by_admin_user_id: parentId,
        deactivated_by_admin_email: email, deactivation_note: "Disposable S8 staging proof cleanup",
      }).eq("id", mappingId);
      await service.from("spelling_canonical_mapping_events").insert({
        mapping_id: mappingId, event_type: "resolver_visibility_disabled", previous_status: "active",
        new_status: "disabled", previous_resolver_visibility_status: "visible",
        new_resolver_visibility_status: "disabled", admin_user_id: parentId, admin_email: email,
        note: "Disposable S8 staging proof cleanup", metadata: { proof_tag: tag },
      });
    }
    const deliveries = check(await service.from("writing_context_review_deliveries")
      .select("id").eq("parent_user_id", parentId));
    const deliveryIds = deliveries.map((row) => row.id);
    if (deliveryIds.length) check(await service.from("writing_context_review_decisions").delete().in("delivery_id", deliveryIds));
    check(await service.from("writing_context_review_deliveries").delete().eq("parent_user_id", parentId));
    check(await service.from("writing_context_family_approval_events").delete().eq("approved_by", parentId));
    if (mappingId) {
      check(await service.from("spelling_canonical_mapping_events").delete().eq("mapping_id", mappingId));
      check(await service.from("spelling_canonical_mappings").delete().eq("id", mappingId));
    }
    check(await service.auth.admin.deleteUser(parentId));
    const residue = await service.from("children").select("id", { count: "exact", head: true }).eq("parent_user_id", parentId);
    if (residue.error) throw new Error(residue.error.message);
    assert.equal(residue.count, 0);
  }
}
