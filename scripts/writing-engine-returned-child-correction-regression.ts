import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const targetedWritingPracticeStatusPath =
  "docs/implementation/targeted-writing-practice-status.md";
const appShellPath = "components/app-shell.tsx";
const structuredLessonResponsePath = "components/structured-lesson-response.tsx";
const lessonResponsesPath = "lib/lessons/responses.ts";
const learnActionsPath = "app/learn/actions.ts";
const taskPagePath = "app/learn/modules/[moduleId]/tasks/[taskId]/page.tsx";
const reviewDetailPagePath = "app/courses/review/[submissionId]/page.tsx";
const reviewCompletionActionsPath =
  "app/courses/review/actions/review-completion-actions.ts";
const candidateMappingActionsPath =
  "app/courses/review/actions/candidate-mapping-actions.ts";
const catalogReviewCaseActionsPath =
  "app/courses/review/actions/catalog-review-case-actions.ts";
const returnedCorrectionRouteHelpersPath =
  "app/courses/review/actions/returned-correction-route-helpers.ts";
const unifiedSpellingReviewTablePath =
  "app/courses/review/unified-spelling-review-table.tsx";
const unifiedSpellingReviewItemsPath =
  "lib/writing-engine/persistence/unified-spelling-review-items.ts";

const targetedWritingPracticeStatus = readFileSync(
  targetedWritingPracticeStatusPath,
  "utf8",
);
const appShell = readFileSync(appShellPath, "utf8");
const structuredLessonResponse = readFileSync(structuredLessonResponsePath, "utf8");
const lessonResponses = readFileSync(lessonResponsesPath, "utf8");
const learnActions = readFileSync(learnActionsPath, "utf8");
const taskPage = readFileSync(taskPagePath, "utf8");
const reviewDetailPage = readFileSync(reviewDetailPagePath, "utf8");
const reviewCompletionActions = readFileSync(reviewCompletionActionsPath, "utf8");
const candidateMappingActions = readFileSync(candidateMappingActionsPath, "utf8");
const catalogReviewCaseActions = readFileSync(catalogReviewCaseActionsPath, "utf8");
const returnedCorrectionRouteHelpers = readFileSync(
  returnedCorrectionRouteHelpersPath,
  "utf8",
);
const unifiedSpellingReviewTable = readFileSync(unifiedSpellingReviewTablePath, "utf8");
const unifiedSpellingReviewItems = readFileSync(unifiedSpellingReviewItemsPath, "utf8");

assert.match(
  targetedWritingPracticeStatus,
  /PCRM-D[\s\S]*implemented[\s\S]*evidence-only[\s\S]*resolver-invisible/,
  "Status docs must mark PCRM-D as implemented, evidence-only, and resolver-invisible.",
);
assert.match(
  targetedWritingPracticeStatus,
  /Parent-Added Missed Word Correction Repair[\s\S]*implemented and QA-passed[\s\S]*parent-review -> child-retry -> final-classification ->[\s\S]*learning-evidence/,
  "Status docs must record the parent-added missed-word repair as implemented inside the MVP retry/evidence loop.",
);
assert.match(
  targetedWritingPracticeStatus,
  /no schema changes or migrations[\s\S]*no resolver behavior changes[\s\S]*no PCRM recommendation resolver visibility[\s\S]*no canonical adoption action[\s\S]*no `micro_skill_catalog` mutation/,
  "Status docs must preserve the Slice 1 stop conditions before implementation work.",
);
assert.doesNotMatch(
  targetedWritingPracticeStatus,
  /admin recommendation curation remains the next bounded runtime slice/,
  "Status docs must not describe PCRM-D admin curation as the next runtime slice.",
);

assert.match(
  appShell,
  /title: "Admin"[\s\S]*Catalog Review[\s\S]*href: "\/admin\/catalog-review"[\s\S]*Canonical Recommendations[\s\S]*href: "\/admin\/canonical-recommendations"/,
  "Parent navigation must expose convenience links to the existing admin review surfaces.",
);
assert.doesNotMatch(
  appShell,
  /requireAdminUser|createServiceRoleClient|admin role/,
  "App shell admin links must remain navigation only and must not implement authorization.",
);

assert.match(
  lessonResponses,
  /attempted_correction\?: string \| null;/,
  "Returned writing issue payload must preserve child retry attempt text.",
);
assert.match(
  lessonResponses,
  /typeof rawIssue\.attempted_correction === "string"[\s\S]*rawIssue\.attempted_correction[\s\S]*: null/,
  "Returned writing issue parser must hydrate attempted_correction from draft metadata.",
);

assert.match(
  structuredLessonResponse,
  /const returnedIssueInlineKeys = useMemo\([\s\S]*question_text[\s\S]*question_textarea[\s\S]*comprehension_quiz_group[\s\S]*`\$\{block\.block_id\}::\$\{question\.question_id\}`/,
  "Structured child UI must know which returned issues can render inline beside lesson fields.",
);
assert.match(
  structuredLessonResponse,
  /const unmatchedReturnedIssues = useMemo\([\s\S]*!issue\.source_field_key[\s\S]*!returnedIssueInlineKeys\.has\(issue\.source_field_key\)/,
  "Returned issues without a source_field_key match must be collected for fallback rendering.",
);
assert.match(
  structuredLessonResponse,
  /function renderUnmatchedReturnedIssueFeedback\(\)[\s\S]*Fix these spellings[\s\S]*unmatchedReturnedIssues\.map/,
  "Structured child UI must render a fallback returned-issues panel.",
);
assert.match(
  structuredLessonResponse,
  /name=\{`returned_issue_attempt:\$\{issue\.issue_id\}`\}[\s\S]*defaultValue=\{issue\.attempted_correction \?\? ""\}/,
  "Spelling-like returned issues must include a dedicated retry input that reloads saved draft attempt text.",
);
assert.match(
  structuredLessonResponse,
  /issue\.allow_confidence \? \([\s\S]*returned_issue_attempt:[\s\S]*How did this feel\?/,
  "Retry input and easy/medium/hard reflection must remain scoped to spelling-like returned issues.",
);
assert.doesNotMatch(
  structuredLessonResponse,
  /needed_help|could_not_fix/,
  "This pass must not expose needed_help or could_not_fix in the child UI.",
);

assert.match(
  learnActions,
  /const attemptedCorrectionValue = formData\.get\(`returned_issue_attempt:\$\{issue\.issue_id\}`\)/,
  "Returned issue form parsing must read the dedicated retry input.",
);
assert.match(
  learnActions,
  /attemptedCorrectionValue\.trim\(\)\.slice\(0, 500\)[\s\S]*attempted_correction: attemptedCorrection/,
  "Returned issue form parsing must bound and persist retry text into draft metadata.",
);
assert.match(
  learnActions,
  /if \(issue\.attempted_correction\?\.trim\(\)\) \{[\s\S]*return issue\.attempted_correction\.trim\(\);[\s\S]*\}/,
  "Correction-attempt inserts must prefer the dedicated retry input over full-field fallback text.",
);
assert.match(
  learnActions,
  /\.from\("writing_issue_correction_attempts"\)[\s\S]*\.insert\(attemptRows\)/,
  "Returned child resubmission must continue to write durable correction attempts.",
);
assert.match(
  learnActions,
  /draftPayloadWithReturnedIssueInputs[\s\S]*__writing_issue_feedback: returnedWritingIssues[\s\S]*draft_payload: draftPayloadWithReturnedIssueInputs/,
  "Explicit Save draft must preserve returned issue retry/reflection metadata when submitted through the full form.",
);

assert.match(
  taskPage,
  /returnedIssueFeedback=\{returnedWritingIssues\}/,
  "Structured lesson child page must continue to pass returned issue feedback into the structured response component.",
);
assert.doesNotMatch(
  taskPage,
  /manual_writing_sample|sample_/,
  "Returned-child structured correction pass must not broaden into manual writing sample routing.",
);

assert.match(
  reviewCompletionActions,
  /async function materializeReturnedSpellingIssuesFromCandidates/,
  "Review Work send-back must own the bridge from raw spelling candidates to returned child feedback.",
);
assert.match(
  reviewCompletionActions,
  /loadUnifiedSpellingReviewItemsForSubmission[\s\S]*summarizeUnifiedSpellingReviewCompletion/,
  "Review Work approval must load unified spelling review items and summarize completion state.",
);
assert.match(
  reviewCompletionActions,
  /if \(!unifiedCompletionSummary\.canComplete\) \{[\s\S]*blockingReasons\[0\]/,
  "Review Work approval must reject unresolved unified spelling review items server-side.",
);
assert.match(
  reviewCompletionActions,
  /if \(!input\.structuredPayloadType\) \{[\s\S]*return false;[\s\S]*\}/,
  "Candidate materialization must stay scoped to structured lesson/test returns.",
);
assert.match(
  reviewCompletionActions,
  /\.from\("misspelling_instances"\)[\s\S]*\.from\("writing_issues"\)\.insert\(rowsToInsert\)/,
  "Send-back must materialize eligible raw misspelling candidates into durable writing_issues.",
);
assert.match(
  reviewCompletionActions,
  /source_misspelling_instance_id: misspelling\.id/,
  "Materialized returned writing issues must preserve source_misspelling_instance_id linkage.",
);
assert.match(
  reviewCompletionActions,
  /!\(misspelling\.is_false_positive \?\? false\)[\s\S]*!isSuppressedFalsePositivePair[\s\S]*!durableMisspellingIds\.has\(misspelling\.id\)[\s\S]*!verifiedMisspellingIds\.has\(misspelling\.id\)[\s\S]*\(!suggestion \|\| suggestion\.suggestion_status === "pending"\)/,
  "Materialization must exclude false-positive, already durable, verified, and non-pending suggestion candidates.",
);
assert.doesNotMatch(
  reviewCompletionActions,
  /eligibleMisspellings = misspellings\.filter[\s\S]*!isParentAuthoredMisspellingRow\(misspelling\)/,
  "Parent-authored missed words must remain eligible for returned-child correction materialization.",
);
assert.match(
  reviewCompletionActions,
  /const isParentAddedMissedWord = isParentAuthoredMisspellingRow\(misspelling\)/,
  "Materialized rows must detect parent-authored missed-word provenance.",
);
assert.match(
  reviewCompletionActions,
  /const rowsToInsert = eligibleMisspellings\.map\([\s\S]*const isParentAddedMissedWord = isParentAuthoredMisspellingRow\(misspelling\)[\s\S]*micro_skill_key:[\s\S]*getTrimmedOrNull\(suggestion\?\.suggested_micro_skill_key\) \?\? "unknown"/,
  "Parent-added missed words must materialize into durable writing_issues and may use unknown micro_skill_key for send-back.",
);
assert.match(
  reviewCompletionActions,
  /source_kind: isParentAddedMissedWord[\s\S]*"parent_authored_missed_word"[\s\S]*parent_authored_missed_word: isParentAddedMissedWord/,
  "Materialized parent-added missed words must preserve parent-authored provenance metadata.",
);
assert.match(
  reviewCompletionActions,
  /\.from\("writing_issues"\)[\s\S]*\.select\("source_misspelling_instance_id"\)[\s\S]*const durableMisspellingIds = new Set/,
  "Materialization must dedupe against all linked writing_issues, including finalised rows.",
);
assert.match(
  reviewCompletionActions,
  /const materializedCandidateIssues =[\s\S]*materializeReturnedSpellingIssuesFromCandidates[\s\S]*if \(materializedCandidateIssues\) \{[\s\S]*refreshedLinkedWritingIssues/,
  "Send-back must refetch durable writing_issues after candidate materialization before building __writing_issue_feedback.",
);
assert.match(
  reviewCompletionActions,
  /__field_feedback: safeFieldFeedback,[\s\S]*__writing_issue_feedback: returnedIssuePayload/,
  "Returned draft payload must preserve field feedback while attaching returned writing issue feedback.",
);
assert.match(
  reviewCompletionActions,
  /const \{ error: returnedDraftUpsertError \} = await supabase[\s\S]*\.from\("task_submission_drafts"\)[\s\S]*draft_payload: mergedDraftPayload[\s\S]*if \(returnedDraftUpsertError\) \{[\s\S]*We couldn't prepare the returned draft for the child just yet\./,
  "Send-back must fail loudly if returned child draft feedback cannot be written.",
);
assert.ok(
  reviewCompletionActions.indexOf("const { error: returnedDraftUpsertError }") <
    reviewCompletionActions.indexOf('parent_review_status: "returned"'),
  "Returned draft feedback must be written before marking the submission returned.",
);
assert.match(
  reviewCompletionActions,
  /returnedIssuePayload: ReturnedWritingIssueDraftPayload\[\] = hydratedIssuesToSendBack\.map\([\s\S]*issue_id: issue\.id[\s\S]*observed_text: issue\.observed_text[\s\S]*approved_replacement: issue\.approved_replacement[\s\S]*allow_confidence:[\s\S]*Boolean\(issue\.source_misspelling_instance_id\)/,
  "Durable parent-added missed-word issues with source misspelling lineage must appear in __writing_issue_feedback with retry confidence enabled.",
);
assert.match(
  reviewCompletionActions,
  /finalise_writing_issue_classification_and_learning_item[\s\S]*p_writing_issue_id: writingIssueId[\s\S]*p_final_classification/,
  "Returned child corrections must final-classify through the existing learning-item RPC path.",
);
assert.match(
  reviewCompletionActions,
  /finalClassificationNeedsAssignableRoute[\s\S]*micro_skill_key[\s\S]*micro_skill_catalog[\s\S]*Choose an active assignable skill route before saving this learning outcome[\s\S]*finalise_writing_issue_classification_and_learning_item/,
  "Learning-gap final classification must verify an active assignable durable route before calling the finalisation RPC.",
);
assert.doesNotMatch(
  reviewCompletionActions,
  /Durable issue preserved, but no assignable learning item was created yet/,
  "Learning-gap finalisation must not report success after the RPC blocks learning-item creation.",
);
assert.doesNotMatch(
  reviewCompletionActions,
  /\.from\("task_submission_payloads"\)\s*\n\s*\.(update|upsert|insert)\(/,
  "Review Work send-back must not mutate durable submitted payload evidence.",
);

assert.match(
  unifiedSpellingReviewItems,
  /export async function loadUnifiedSpellingReviewItemsForSubmission/,
  "Review Work detail must use the unified spelling review read helper.",
);
assert.match(
  unifiedSpellingReviewItems,
  /\.from\("writing_issue_correction_attempts"\)[\s\S]*\.eq\("task_submission_id", input\.submissionId\)/,
  "Unified read helper must start returned corrections from correction attempts on the current resubmission.",
);
assert.match(
  unifiedSpellingReviewItems,
  /function isLikelyFullAnswerText[\s\S]*function getRetryDisplayText[\s\S]*latestChildAttempt: childAttemptDisplay/,
  "Unified read helper must keep likely full-answer historical attempts out of the compact Retry column.",
);
assert.match(
  unifiedSpellingReviewItems,
  /historical_full_answer_attempt: historicalFullAnswerAttempt/,
  "Unified read helper must preserve historical full-answer attempt text for Details/provenance.",
);
assert.doesNotMatch(
  unifiedSpellingReviewItems,
  /suppressedRegeneratedCandidatesByPairKey|returnedPairKeys/,
  "Unified read helper must not use the old global pair-only suppression indexes.",
);
assert.match(
  unifiedSpellingReviewItems,
  /\.from\("task_submissions"\)[\s\S]*\.eq\("task_id", currentSubmissionRow\.task_id\)[\s\S]*\.eq\("parent_user_id", input\.parentUserId\)[\s\S]*\.eq\("child_id", input\.childId\)/,
  "Same-pair returned ownership handling must be scoped to the same task, parent, and child.",
);
assert.match(
  unifiedSpellingReviewItems,
  /const returnedOwnedBySameThreadPair =[\s\S]*!parentAuthored[\s\S]*sameThreadReturnedOwnedWritingIssue !== null/,
  "Unified read helper must only apply same-pair returned ownership to non-parent rows loaded from returned thread history.",
);
assert.match(
  unifiedSpellingReviewItems,
  /consumedReturnedOwnershipIssueIds\.add\(returnedOwnedWritingIssue\.id\)/,
  "Unified read helper must consume returned ownership so repeated same-pair instances remain visible.",
);
assert.match(
  unifiedSpellingReviewItems,
  /\.from\("writing_issues"\)[\s\S]*\.in\("id", returnedWritingIssueIds\)/,
  "Unified read helper must follow attempts back to original writing_issues.",
);
assert.match(
  unifiedSpellingReviewItems,
  /source_kind[\s\S]*parent_authored_missed_word[\s\S]*parentAuthored/,
  "Unified read helper must preserve parent-authored missed-word provenance.",
);
assert.doesNotMatch(
  unifiedSpellingReviewItems,
  /\.from\("writing_issues"\)\s*\n\s*\.(insert|upsert)\(/,
  "Unified read helper must not duplicate writing_issues onto the new submission.",
);
assert.doesNotMatch(
  unifiedSpellingReviewItems,
  /\.from\("task_submission_payloads"\)/,
  "Unified read helper must not read or mutate durable submitted payload rows.",
);

assert.match(
  reviewDetailPage,
  /loadUnifiedSpellingReviewItemsForSubmission\([\s\S]*submissionId: submission\.id[\s\S]*parentUserId: user\.id[\s\S]*childId: submission\.child_id/,
  "Review Work detail must load unified spelling review items for the current pending resubmission.",
);
assert.match(
  reviewDetailPage,
  /<UnifiedSpellingReviewTable[\s\S]*rows=\{unifiedSpellingReviewItems\}/,
  "Review Work detail must render spelling review rows through the unified compact table.",
);
assert.match(
  reviewDetailPage,
  /hasReturnedCorrectionResponse[\s\S]*row\.source === "returned_correction"[\s\S]*row\.state === "child_responded"/,
  "Review Work detail must detect returned child-response rows before choosing the UI phase.",
);
assert.match(
  reviewDetailPage,
  /getReviewWorkflowPhase\(\{[\s\S]*parentReviewStatus: submission\.parent_review_status,[\s\S]*unifiedSpellingReviewItems,[\s\S]*\}\)/,
  "Review Work detail must choose phase from submission status plus unified returned-correction rows.",
);
assert.match(
  unifiedSpellingReviewTable,
  /Word[\s\S]*Correction[\s\S]*Retry[\s\S]*Src[\s\S]*Status[\s\S]*Reason[\s\S]*Learning route[\s\S]*Actions/,
  "Unified compact table must put Reason before Learning route in the returned-correction column order.",
);
assert.doesNotMatch(
  unifiedSpellingReviewTable,
  /<th[^>]*>Details<\/th>/,
  "Unified compact table must not render Details as a separate column.",
);
assert.match(
  unifiedSpellingReviewTable,
  /aria-expanded=\{detailsOpen\}[\s\S]*aria-controls=\{detailsId\}[\s\S]*\{detailsOpen \? "Hide details" : "Details"\}/,
  "Unified compact table must render a compact Details toggle in the Word cell.",
);
assert.match(
  unifiedSpellingReviewTable,
  /<tr className="border-t border-\[var\(--border\)\] bg-\[rgba\(255,247,220,0\.18\)\]">[\s\S]*colSpan=\{showRouteColumns \? 8 : showActionsColumn \? 6 : 5\}[\s\S]*routeText\(row\)/,
  "Unified compact table must render expanded Details across the active compact columns.",
);
assert.match(
  unifiedSpellingReviewTable,
  /historicalFullAnswerAttempt[\s\S]*Child response\/context/,
  "Unified compact table must show historical full-answer attempt text only inside Details context.",
);
assert.match(
  unifiedSpellingReviewTable,
  /Context: \{detailContextText\}[\s\S]*Misspelling instance:[\s\S]*Correction attempt:[\s\S]*Original issue:/,
  "Unified compact table Details must show source context and ids to disambiguate repeated spelling instances.",
);
assert.doesNotMatch(
  unifiedSpellingReviewTable,
  /<td className="max-w-\[11rem\][\s\S]*<details/,
  "Unified compact table must not expand the Details body inside the Word cell.",
);
assert.match(
  unifiedSpellingReviewTable,
  /label: "P·R"[\s\S]*Parent-added returned correction[\s\S]*label: "R"[\s\S]*Returned correction[\s\S]*label: "P"[\s\S]*Parent-added missed word[\s\S]*label: "E"[\s\S]*Engine suggestion/,
  "Unified compact table must use tiny source markers with accessible labels.",
);
assert.match(
  unifiedSpellingReviewTable,
  /Learning route family[\s\S]*Learning route cluster[\s\S]*Learning route skill/,
  "Unified compact table must use learning-route family, cluster, and skill filtering controls.",
);
assert.match(
  unifiedSpellingReviewTable,
  /<option value="">Choose learning route<\/option>[\s\S]*<option value=\{NO_MATCHING_SKILL_VALUE\}>No matching skill<\/option>/,
  "No matching skill must appear as a UI-only Family selector option.",
);
assert.match(
  unifiedSpellingReviewTable,
  /const initialSkillOption = findOption\(options, initialSkill \?\? null\);[\s\S]*const firstFamily = initialSkillOption\?\.skillFamilyKey \?\? "";[\s\S]*useState\(firstFamily\)/,
  "Resolved engine/verified skill suggestions must initialize the Family selector rather than showing the placeholder.",
);
assert.match(
  unifiedSpellingReviewTable,
  /const firstCluster =[\s\S]*initialSkillOption\?\.skillFamilyKey === familyKey[\s\S]*initialSkillOption\.skillClusterKey \?\? ""[\s\S]*useState\(firstCluster\)/,
  "Resolved engine/verified skill suggestions must initialize the Cluster selector.",
);
assert.match(
  unifiedSpellingReviewTable,
  /const \[microSkillKey, setMicroSkillKey\] = useState\(initialSkill \?\? ""\)/,
  "Resolved engine/verified skill suggestions must initialize the Micro-skill selector.",
);
assert.match(
  unifiedSpellingReviewTable,
  /<option value="">Choose cluster<\/option>/,
  "Skill cluster placeholder must be parent-facing.",
);
assert.match(
  unifiedSpellingReviewTable,
  /\{row\.source === "returned_correction" \? "Unknown" : "Choose skill"\}/,
  "Micro-skill placeholder must be Choose skill for current rows and Unknown for returned rows.",
);
assert.doesNotMatch(
  unifiedSpellingReviewTable,
  /aria-label=\{`Micro-skill[\s\S]*<option value=\{NO_MATCHING_SKILL_VALUE\}>No matching skill<\/option>/,
  "No matching skill must not remain in the Micro-skill selector.",
);
assert.match(
  unifiedSpellingReviewTable,
  /const noMatchingSkillSelected = familyKey === NO_MATCHING_SKILL_VALUE/,
  "No matching skill selection must be tracked at Family level.",
);
assert.match(
  unifiedSpellingReviewTable,
  /const canSendToAdmin =[\s\S]*routeIsOpen && noMatchingSkillSelected[\s\S]*captureSpellingCatalogReviewCase/,
  "No matching skill must route through catalog review without persisting a sentinel micro_skill_key.",
);
assert.match(
  unifiedSpellingReviewTable,
  /const dependentSkillDisabled = skillDisabled \|\| noMatchingSkillSelected[\s\S]*disabled=\{dependentSkillDisabled \|\| clusters\.length === 0\}[\s\S]*disabled=\{dependentSkillDisabled\}/,
  "Choosing No matching skill must disable dependent Cluster and Micro-skill controls.",
);
assert.doesNotMatch(
  unifiedSpellingReviewTable,
  /name="micro_skill_key" value=\{NO_MATCHING_SKILL_VALUE\}/,
  "No matching skill sentinel must not be submitted as a micro_skill_key.",
);
assert.match(
  unifiedSpellingReviewTable,
  /if \(row\.state === "child_responded"\) \{[\s\S]*return "Tried";[\s\S]*if \(row\.categorisationStatus === "unsupported_returned_correction_route"\) \{[\s\S]*return "Blocked";/,
  "Status labels must show unclassified returned attempts as Tried and reserve Blocked for deferred routes.",
);
assert.match(
  unifiedSpellingReviewTable,
  /function IconActionButton[\s\S]*helpText: string;[\s\S]*ariaLabel: string;[\s\S]*aria-label=\{ariaLabel\}[\s\S]*title=\{helpText\}[\s\S]*<span className="sr-only">\{helpText\}<\/span>/,
  "Compact icon actions must share one helper with native title help and accessible labels.",
);
assert.doesNotMatch(
  unifiedSpellingReviewTable,
  /group-hover:block group-focus:block/,
  "Icon action help must not render a second custom tooltip alongside the native title tooltip.",
);
assert.match(
  unifiedSpellingReviewTable,
  /<IconActionButton[\s\S]*icon="✓"[\s\S]*helpText="Confirm suggested skill"[\s\S]*ariaLabel=\{`Confirm suggested skill/,
  "Confirm icon must expose reliable hover/help and accessible text.",
);
assert.match(
  unifiedSpellingReviewTable,
  /<IconActionButton[\s\S]*icon="✕"[\s\S]*helpText="Reject as not an issue"[\s\S]*ariaLabel=\{`Reject/,
  "Reject icon must expose reliable hover/help and accessible text.",
);
assert.match(
  unifiedSpellingReviewTable,
  /<IconActionButton[\s\S]*icon="!"[\s\S]*helpText="Apply selected skill instead of engine suggestion"[\s\S]*ariaLabel=\{`Apply selected skill instead of engine suggestion/,
  "Override icon must expose reliable hover/help and accessible text.",
);
assert.match(
  unifiedSpellingReviewTable,
  /<IconActionButton[\s\S]*icon="!"[\s\S]*helpText="Use this skill and send for admin review"[\s\S]*ariaLabel=\{`Use this skill/,
  "Parent-local route evidence icon must expose reliable hover/help and accessible text.",
);
assert.match(
  unifiedSpellingReviewTable,
  /<IconActionButton[\s\S]*icon="⚑"[\s\S]*helpText="No matching skill: send to admin review"[\s\S]*ariaLabel=\{`No matching skill/,
  "Admin flag icon must expose reliable hover/help and accessible text.",
);
assert.match(
  unifiedSpellingReviewTable,
  /<IconActionButton[\s\S]*icon="↑"[\s\S]*helpText="Save locally and send for admin review"[\s\S]*<IconActionButton[\s\S]*icon="↩"[\s\S]*helpText="Revert parent-local skill route to pending"/,
  "Parent-local promote and revert icons must expose reliable hover/help and accessible text.",
);
assert.match(
  unifiedSpellingReviewTable,
  /name="writing_issue_id"[\s\S]*value=\{row\.sourceIds\.originalWritingIssueId \?\? ""\}/,
  "Returned correction final classification must target the original writing_issue.id.",
);
assert.match(
  unifiedSpellingReviewTable,
  /action=\{finaliseWritingIssueClassification\}/,
  "Unified compact table must use the existing final-classification action.",
);
assert.match(
  unifiedSpellingReviewTable,
  /const selectedOutcomeNeedsRoute = isLearningRelevantOutcome\(selectedOutcome\)[\s\S]*const returnedRouteIsOpen =[\s\S]*selectedOutcomeNeedsRoute[\s\S]*categorisation_needed[\s\S]*not_applicable[\s\S]*const routeIsOpen = currentRouteIsOpen \|\| returnedRouteIsOpen/,
  "Returned correction skill routing must open from pending learning-gap intent without finalising the issue first.",
);
assert.match(
  unifiedSpellingReviewTable,
  /captureSubmissionSpellingCandidateMapping[\s\S]*name="original_writing_issue_id"[\s\S]*value=\{row\.sourceIds\.originalWritingIssueId \?\? ""\}[\s\S]*name="correction_attempt_id"[\s\S]*name="final_classification"/,
  "Returned correction skill assignment must submit original writing_issue.id, correction attempt id, and pending final classification.",
);
assert.match(
  unifiedSpellingReviewTable,
  /captureSpellingCatalogReviewCase[\s\S]*name="original_writing_issue_id"[\s\S]*value=\{row\.sourceIds\.originalWritingIssueId \?\? ""\}[\s\S]*name="correction_attempt_id"[\s\S]*name="final_classification"/,
  "Returned correction admin handoff must submit original writing_issue.id, correction attempt id, and pending final classification.",
);
assert.doesNotMatch(
  unifiedSpellingReviewTable,
  /row\.source !== "returned_correction" &&\s*\n\s*row\.sourceIds\.candidateMappingId/,
  "Returned correction rows with candidate mappings may use the existing parent-local promotion action.",
);

assert.match(
  returnedCorrectionRouteHelpers,
  /ROUTABLE_RETURNED_CLASSIFICATIONS[\s\S]*fragile_knowledge[\s\S]*concept_gap[\s\S]*transfer_failure/,
  "Returned route helper must only route final classifications that represent learning issues.",
);
assert.match(
  returnedCorrectionRouteHelpers,
  /const routeFinalClassification =[\s\S]*issue\.final_classification \?\? input\.finalClassificationOverride[\s\S]*!ROUTABLE_RETURNED_CLASSIFICATIONS\.has\(routeFinalClassification\)/,
  "Returned route helper must accept durable or pending learning-gap route intent.",
);
assert.match(
  returnedCorrectionRouteHelpers,
  /final_classification: routeFinalClassification,[\s\S]*final_classification_source:[\s\S]*pending_parent_route_intent/,
  "Returned route metadata must distinguish pending parent route intent from durable issue final classification.",
);
assert.match(
  returnedCorrectionRouteHelpers,
  /\.from\("writing_issues"\)[\s\S]*\.eq\("id", input\.originalWritingIssueId\)[\s\S]*\.eq\("parent_user_id", input\.parentUserId\)[\s\S]*\.eq\("child_id", input\.childId\)/,
  "Returned route helper must validate original writing_issue ownership.",
);
assert.match(
  returnedCorrectionRouteHelpers,
  /\.from\("misspelling_instances"\)[\s\S]*\.eq\("id", issue\.source_misspelling_instance_id\)[\s\S]*\.eq\("parent_user_id", input\.parentUserId\)[\s\S]*\.eq\("child_id", input\.childId\)/,
  "Returned route helper must validate original source misspelling lineage.",
);
assert.match(
  returnedCorrectionRouteHelpers,
  /\.from\("writing_issue_correction_attempts"\)[\s\S]*\.eq\("writing_issue_id", issue\.id\)[\s\S]*\.eq\("task_submission_id", input\.currentTaskSubmissionId\)/,
  "Returned route helper must anchor returned routing to the current correction attempt.",
);
assert.match(
  returnedCorrectionRouteHelpers,
  /source_route: "returned_correction"[\s\S]*original_writing_issue_id: issue\.id[\s\S]*correction_attempt_id: attempt\.id/,
  "Returned route records must carry returned-correction provenance metadata.",
);
assert.doesNotMatch(
  returnedCorrectionRouteHelpers,
  /sourceProvenance = "returned_correction"|source_provenance: "returned_correction"/,
  "Returned routing must not invent a new source_provenance enum without a migration.",
);
assert.match(
  candidateMappingActions,
  /const originalWritingIssueId = formData\.get\("original_writing_issue_id"\)/,
  "Candidate capture action must accept returned rows by original writing_issue.id.",
);
assert.match(
  candidateMappingActions,
  /captureReturnedCorrectionCandidateMapping[\s\S]*loadReturnedCorrectionRouteContext[\s\S]*insertPending/,
  "Candidate capture action must bridge returned corrections into parent-local candidate mappings.",
);
assert.match(
  candidateMappingActions,
  /\.eq\("source_misspelling_instance_id", routeContext\.misspelling\.id\)[\s\S]*\.in\("candidate_status", \["pending_parent_promotion", "parent_local_promoted"\][\s\S]*sourceMisspellingInstanceId: routeContext\.misspelling\.id[\s\S]*sourceProvenance: routeContext\.sourceProvenance[\s\S]*action_source: "review_work_returned_correction_candidate_capture"/,
  "Returned candidate mappings must use original misspelling lineage with returned provenance metadata.",
);
assert.doesNotMatch(
  candidateMappingActions,
  /\.eq\("task_submission_id", input\.submission\.id\)[\s\S]*\.eq\("source_misspelling_instance_id", routeContext\.misspelling\.id\)/,
  "Returned candidate mapping idempotency must be scoped by source misspelling across active mappings, not only the current returned submission.",
);
assert.doesNotMatch(
  candidateMappingActions,
  /\.from\("writing_issues"\)\s*\n\s*\.(insert|upsert)\(/,
  "Returned candidate capture must not duplicate writing_issues.",
);
assert.match(
  catalogReviewCaseActions,
  /const originalWritingIssueId = formData\.get\("original_writing_issue_id"\)/,
  "Catalog review action must accept returned rows by original writing_issue.id.",
);
assert.match(
  catalogReviewCaseActions,
  /captureReturnedCorrectionCatalogReviewCase[\s\S]*loadReturnedCorrectionRouteContext[\s\S]*spelling_catalog_review_cases/,
  "Catalog review action must bridge returned corrections into admin/catalog cases.",
);
assert.match(
  catalogReviewCaseActions,
  /action_source: "review_work_returned_correction_no_matching_skill"[\s\S]*source_misspelling_instance_id: routeContext\.misspelling\.id[\s\S]*source_provenance: routeContext\.sourceProvenance/,
  "Returned catalog review cases must use original misspelling lineage with returned provenance metadata.",
);
assert.doesNotMatch(
  catalogReviewCaseActions,
  /\.from\("writing_issues"\)\s*\n\s*\.(insert|upsert)\(/,
  "Returned catalog review must not duplicate writing_issues.",
);

console.log("writing-engine-returned-child-correction-regression: ok");
