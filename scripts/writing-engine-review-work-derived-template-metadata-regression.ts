import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const reviewDetailPagePath = path.join(
  workspaceRoot,
  "app/courses/review/[submissionId]/page.tsx",
);
const suggestedIssuesPanelPath = path.join(
  workspaceRoot,
  "app/courses/review/suggested-issues-panel.tsx",
);
const reviewActionsPath = path.join(
  workspaceRoot,
  "app/courses/review/actions/parent-verification-actions.ts",
);
const reviewUtilsPath = path.join(
  workspaceRoot,
  "app/courses/review/review-utils.ts",
);
const learningItemsPath = path.join(
  workspaceRoot,
  "lib/writing-engine/persistence/learning-items.ts",
);
const derivedTemplateMetadataPath = path.join(
  workspaceRoot,
  "lib/writing-engine/persistence/review-work-derived-template-metadata.ts",
);

function testDerivedTemplateMetadataSourceGuardrails() {
  const pageSource = readFileSync(reviewDetailPagePath, "utf8");
  const suggestedIssuesPanelSource = readFileSync(suggestedIssuesPanelPath, "utf8");
  const actionsSource = readFileSync(reviewActionsPath, "utf8");
  const utilsSource = readFileSync(reviewUtilsPath, "utf8");
  const learningItemsSource = readFileSync(learningItemsPath, "utf8");
  const derivedTemplateMetadataSource = readFileSync(
    derivedTemplateMetadataPath,
    "utf8",
  );

  assert.match(
    learningItemsSource,
    /getReviewWorkDerivedTemplateMetadataByMicroSkillKeys/,
  );
  assert.match(
    derivedTemplateMetadataSource,
    /export async function getReviewWorkDerivedTemplateMetadataByMicroSkillKeys/,
  );
  assert.match(
    derivedTemplateMetadataSource,
    /resolveStage2dLessonTemplateKey\(\{[\s\S]*catalogEntry,[\s\S]*practiceRoute: catalogEntry\.practiceRoute,[\s\S]*preferredTemplateKeys: catalogEntry\.allowedTemplateKeys,[\s\S]*\}\)/,
  );

  assert.match(
    utilsSource,
    /derivedTemplateMetadata: resolveDerivedTemplateMetadata\(\s*matchedSuggestionMicroSkillKey,\s*\)/,
  );
  assert.match(
    utilsSource,
    /verification\.decision === "accepted"\s*\?\s*resolveDerivedTemplateMetadata\(verification\.suggested_micro_skill_key\)/,
  );
  assert.match(
    utilsSource,
    /verification\.decision === "overridden"\s*\?\s*resolveDerivedTemplateMetadata\(verification\.verified_micro_skill_key\)/,
  );
  assert.match(
    utilsSource,
    /allowsAccepted:[\s\S]*matchedSuggestionMicroSkillKey/,
  );
  assert.match(
    utilsSource,
    /reason: "manual_sample"/,
  );
  assert.match(
    utilsSource,
    /reason: "missing_micro_skill"/,
  );

  assert.match(
    suggestedIssuesPanelSource,
    /Derived template metadata/,
  );
  assert.match(
    suggestedIssuesPanelSource,
    /getDerivedTemplateMetadataMessage/,
  );
  assert.match(
    suggestedIssuesPanelSource,
    /props\.model\.sourceType === "lesson_submission"/,
  );
  assert.match(
    suggestedIssuesPanelSource,
    /Read-only derived template route:/,
  );
  assert.doesNotMatch(
    suggestedIssuesPanelSource,
    /<select[\s\S]{0,1200}name="verified_template_key"/,
  );
  assert.doesNotMatch(
    suggestedIssuesPanelSource,
    /<input[\s\S]{0,1200}name="verified_template_key"/,
  );

  assert.match(
    actionsSource,
    /Template override options are not available in this bounded slice\./,
  );
  assert.match(
    actionsSource,
    /Accepted verification is only available when existing shared suggestion truth already carries a canonical micro-skill\./,
  );
}

function main() {
  testDerivedTemplateMetadataSourceGuardrails();
  console.log("writing-engine-review-work-derived-template-metadata-regression: ok");
}

main();
