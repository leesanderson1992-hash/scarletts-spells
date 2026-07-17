import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { getChildLearningReflections, upsertChildLearningReflection } from "../lib/adle/morphology/reflections";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function requireLocal(url: string): void {
  const hostname = new URL(url).hostname;
  if (hostname !== "127.0.0.1" && hostname !== "localhost") throw new Error("Refusing to run atomic persistence regression outside local Supabase.");
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !anonKey) throw new Error("Missing local Supabase URL, anon key, or service role key.");
  requireLocal(url);
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `adle-ui-g-${suffix}@example.test`;
  const password = `Local-${suffix}!`;
  const { data: authData, error: authError } = await client.auth.admin.createUser({ email, password, email_confirm: true });
  if (authError || !authData.user) throw new Error(`seed auth user: ${authError?.message}`);
  const parentUserId = authData.user.id;
  let childId: string | null = null;
  let otherUserId: string | null = null;

  try {
    const { data: child, error: childError } = await client.from("children").insert({ parent_user_id: parentUserId, first_name: "ADLE UI-G Atomic" }).select("id").single();
    if (childError || !child) throw new Error(`seed child: ${childError?.message}`);
    childId = (child as { id: string }).id;
    const lessonWordOrder = ["unfair", "unkind", "unlock", "untidy"];
    const { data: words, error: wordsError } = await client.from("canonical_teaching_dictionary_words").select("id, display_word").in("display_word", lessonWordOrder).eq("row_status", "active");
    if (wordsError) throw new Error(`load words: ${wordsError.message}`);
    assert((words ?? []).length === 4, "four pilot lesson words exist locally");
    const wordRows = (words as Array<{ id: string; display_word: string }>).sort((left, right) => lessonWordOrder.indexOf(left.display_word) - lessonWordOrder.indexOf(right.display_word));

    const makePayload = (date: string) => {
      const header = { childId, parentUserId, assignmentDate: date, title: "ADLE Daily Plan", status: "pending", targetWords: wordRows.map((word) => word.display_word), reviewWords: [], assignmentGenerationSource: "adle_composer_v1" };
      const bindings = ["intro-root", "intro-words", "guided-strip-unhappy", "guided-meaning-unfair", "guided-meaning-unkind", "guided-meaning-unlock", "guided-meaning-untidy", "guided-build-untidy", "controlled-unfair", "controlled-unkind", "controlled-unlock", "controlled-untidy", "dictation-unfair", "dictation-unkind", "dictation-unlock", "dictation-untidy"];
      const items = bindings.map((binding, index) => {
        const sectionKey = index < 2 ? "lesson_intro" : index < 8 ? "guided_practice" : index < 12 ? "lesson_production" : "lesson_dictation";
        const word = index < 8 ? null : wordRows[index < 12 ? index - 8 : index - 12];
        return { childId, parentUserId, domainModule: "spelling", itemType: sectionKey === "lesson_intro" ? "adle_lesson_intro" : sectionKey === "guided_practice" ? "adle_guided_practice" : sectionKey === "lesson_production" ? "adle_lesson_production" : "adle_lesson_dictation", sourceType: "adle_composer", sourceEntityId: `adle:${childId}:${date}:${index + 1}`, templateKey: sectionKey === "lesson_intro" ? (index === 0 ? "MICRO_READ_ONLY_INTRO" : "LESSON_WORDS_INTRO") : sectionKey === "guided_practice" ? "MOR_MEANING_MATCH" : sectionKey === "lesson_production" ? "CONTROLLED_SPELLING" : "DICTATION_NO_IMAGE", targetWord: word?.display_word ?? null, position: index + 1, status: "ready", promptData: { pilotActivityId: binding }, metadata: { planDate: date, sectionKey, provenance: "atomic_regression", microSkillKey: "D4_MOR_PREFIXES_UN", canonicalWordId: word?.id ?? null, expectedEvidenceKind: sectionKey === "guided_practice" ? "guided_task" : "first_exposure_word", adleLearningItemRef: null, composerPolicyVersion: "regression", schedulePolicyVersion: "regression" } };
      });
      const intakes = wordRows.map((word) => ({ learningItemId: `regression:${date}:${word.id}`, childId, canonicalWordId: word.id, microSkillKey: "D4_MOR_PREFIXES_UN", itemStatus: "pending", sourceKind: "stretch_selection", sourceRef: `atomic-regression:${childId}:${date}:${word.display_word}`, sourceAttemptText: null, reteachPriority: false, ejectedOn: null, intakeOn: date, rowStatus: "active" }));
      return { header, items, intakes };
    };
    const call = (date: string, payload: ReturnType<typeof makePayload>) => client.rpc("persist_adle_composed_daily_plan_v1", { p_parent_user_id: parentUserId, p_child_id: childId, p_plan_date: date, p_header: payload.header, p_items: payload.items, p_intakes: payload.intakes });
    const countRows = async (date: string) => {
      const { data: headers, error } = await client.from("daily_assignments").select("id").eq("child_id", childId).eq("assignment_date", date).eq("title", "ADLE Daily Plan");
      if (error) throw error;
      const headerIds = (headers ?? []).map((row) => (row as { id: string }).id);
      const { count: itemCount, error: itemError } = await client.from("assignment_items").select("id", { count: "exact", head: true }).in("daily_assignment_id", headerIds.length > 0 ? headerIds : ["00000000-0000-0000-0000-000000000000"]);
      if (itemError) throw itemError;
      return { headerCount: headerIds.length, itemCount: itemCount ?? 0 };
    };
    const completionPayload = async (assignmentId: string, date: string) => {
      const sourceRef = `lesson:${childId}:${date}:D4_MOR_PREFIXES_UN`;
      const { data: itemRows, error: itemRowsError } = await client.from("assignment_items").select("id, template_key, target_word, metadata").eq("daily_assignment_id", assignmentId).order("position");
      if (itemRowsError) throw itemRowsError;
      const { data: learningRows, error: learningRowsError } = await client.from("adle_learning_items").select("id, canonical_word_id, item_status, source_kind, source_ref, source_attempt_text, reteach_priority, ejected_on, intake_on, row_status").eq("child_id", childId).eq("micro_skill_key", "D4_MOR_PREFIXES_UN").eq("row_status", "active");
      if (learningRowsError) throw learningRowsError;
      const { data: policy, error: policyError } = await client.from("adle_review_policy_versions").select("schedule_policy_version").eq("is_active", true).single();
      if (policyError || !policy) throw new Error(`load active policy: ${policyError?.message}`);
      const bundleId = randomUUID();
      const nextDueOn = new Date(`${date}T12:00:00Z`); nextDueOn.setUTCDate(nextDueOn.getUTCDate() + 1);
      const attempts = (itemRows ?? []).filter((row) => ["guided_practice", "lesson_production", "lesson_dictation"].includes(String((row as { metadata: Record<string, unknown> }).metadata.sectionKey))).map((row) => {
        const typed = row as { id: string; template_key: string; target_word: string | null; metadata: Record<string, unknown> };
        const sectionKey = String(typed.metadata.sectionKey);
        const attemptKind = sectionKey === "guided_practice" ? "guided_practice" : sectionKey === "lesson_production" ? "lesson_production" : "lesson_dictation";
        const targetWord = typed.target_word;
        return { childId, parentUserId, dailyAssignmentId: assignmentId, assignmentItemId: typed.id, canonicalWordId: typed.metadata.canonicalWordId ?? null, microSkillKey: "D4_MOR_PREFIXES_UN", sectionKey, templateKey: typed.template_key, targetWord, attemptText: attemptKind === "lesson_dictation" ? `It uses ${targetWord} in a sentence.` : attemptKind === "guided_practice" ? "" : targetWord, isCorrect: attemptKind === "guided_practice" ? null : true, attemptKind, evidenceClass: attemptKind === "guided_practice" ? "guided_practice_attempt" : "first_exposure_lesson_attempt", sourceRef: attemptKind === "guided_practice" ? `${sourceRef}:guided:${typed.id}` : sourceRef };
      });
      const learningByWord = new Map((learningRows ?? []).map((row) => [(row as { canonical_word_id: string }).canonical_word_id, row as Record<string, unknown>]));
      const itemTransitions = wordRows.map((word) => {
        const row = learningByWord.get(word.id)!;
        return { learningItemId: row.id, childId, canonicalWordId: word.id, microSkillKey: "D4_MOR_PREFIXES_UN", itemStatus: "awaiting_review_outcome", sourceKind: row.source_kind, sourceRef: row.source_ref, sourceAttemptText: row.source_attempt_text, reteachPriority: row.reteach_priority, ejectedOn: row.ejected_on, intakeOn: row.intake_on, rowStatus: row.row_status };
      });
      const scheduleWords = wordRows.map((word) => ({ childId, canonicalWordId: word.id, bundleId, membershipStatus: "scheduled", catchUpStage: 0, nextRetestDueOn: null, failedReviewOn: null, preRetirementCheckDueOn: null, last28DayReviewOn: null, reteachCycleCount: 0, taughtOn: date, rowStatus: "active" }));
      const taughtEvents = wordRows.map((word) => ({ childId, canonicalWordId: word.id, eventKind: "taught", occurredOn: date, sourceRef, rowStatus: "active", attemptText: word.display_word }));
      return { p_parent_user_id: parentUserId, p_child_id: childId, p_assignment_id: assignmentId, p_plan_date: date, p_micro_skill_key: "D4_MOR_PREFIXES_UN", p_source_ref: sourceRef, p_assignment_item_ids: (itemRows ?? []).map((row) => (row as { id: string }).id), p_attempts: attempts, p_lesson: { bundle: { bundleId, childId, sourceRef, intervalIndex: 0, nextDueOn: nextDueOn.toISOString().slice(0, 10), schedulePolicyVersion: (policy as { schedule_policy_version: string }).schedule_policy_version, bundleStatus: "active", rowStatus: "active" }, scheduleWords, taughtEvents, itemTransitions }, p_reflection: { childId, parentUserId, assignmentId, microSkillKey: "D4_MOR_PREFIXES_UN", contentVersion: "atomic-completion-regression-v1", promptKey: "word-lab-un-observation-v1", promptText: "What did you notice about what un- does in these words?", reflectionText: "un- can mean not or reverse an action" } };
    };
    const complete = (payload: Awaited<ReturnType<typeof completionPayload>>) => client.rpc("complete_adle_word_lab_v1", payload);

    const successDate = "2099-01-01";
    const successPayload = makePayload(successDate);
    const first = await call(successDate, successPayload);
    assert(!first.error && typeof first.data === "string", "atomic RPC returns assignment id");
    assert(JSON.stringify(await countRows(successDate)) === JSON.stringify({ headerCount: 1, itemCount: 16 }), "success writes one header and 16 items");
    const assignmentId = first.data as string;
    const reflectionInput = { childId, parentUserId, assignmentId, microSkillKey: "D4_MOR_PREFIXES_UN", contentVersion: "reflection-regression-v1", promptKey: "word-lab-un-observation-v1", promptText: "What did you notice about what un- does in these words?", reflectionText: "un- can mean not" };
    await upsertChildLearningReflection(client, reflectionInput);
    await upsertChildLearningReflection(client, { ...reflectionInput, reflectionText: "un- can mean not or reverse an action" });
    const { data: privateNotes, error: privateNotesError } = await client.from("adle_child_learning_reflections").select("reflection_text").eq("daily_assignment_id", assignmentId);
    if (privateNotesError) throw privateNotesError;
    assert(privateNotes?.length === 1 && (privateNotes[0] as { reflection_text: string }).reflection_text.includes("reverse"), "private reflection upsert is idempotent and keeps the latest draft");
    const { count: assessmentCount, error: assessmentError } = await client.from("adle_assignment_attempt_events").select("id", { count: "exact", head: true }).eq("daily_assignment_id", assignmentId);
    if (assessmentError) throw assessmentError;
    assert((assessmentCount ?? 0) === 0, "private reflection creates no assessment attempt event");
    const parentClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const parentLogin = await parentClient.auth.signInWithPassword({ email, password });
    if (parentLogin.error) throw parentLogin.error;
    assert((await getChildLearningReflections(parentClient, { parentUserId, childId, limit: 10 })).length === 1, "owning parent can read the child's private reflection");
    const otherEmail = `adle-ui-g-other-${suffix}@example.test`;
    const otherPassword = `Other-${suffix}!`;
    const { data: otherAuth, error: otherAuthError } = await client.auth.admin.createUser({ email: otherEmail, password: otherPassword, email_confirm: true });
    if (otherAuthError || !otherAuth.user) throw new Error(`seed other auth user: ${otherAuthError?.message}`);
    otherUserId = otherAuth.user.id;
    const otherClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const otherLogin = await otherClient.auth.signInWithPassword({ email: otherEmail, password: otherPassword });
    if (otherLogin.error) throw otherLogin.error;
    assert((await getChildLearningReflections(otherClient, { parentUserId, childId, limit: 10 })).length === 0, "another authenticated parent cannot read the private reflection");
    const completion = await completionPayload(assignmentId, successDate);
    const completed = await complete(completion);
    assert(!completed.error && (completed.data as { status: string }).status === "completed", "atomic Word Lab completion succeeds");
    const completedAgain = await complete(completion);
    assert(!completedAgain.error && (completedAgain.data as { status: string }).status === "already_completed", "completed resubmission verifies and returns idempotent success");
    const { data: completionItems } = await client.from("assignment_items").select("status").eq("daily_assignment_id", assignmentId);
    const { data: completionAttempts } = await client.from("adle_assignment_attempt_events").select("attempt_kind, attempt_text").eq("daily_assignment_id", assignmentId);
    const { data: completionTaught } = await client.from("adle_taught_word_history").select("id").eq("child_id", childId).eq("source_ref", completion.p_source_ref).eq("row_status", "active");
    const { data: completionSchedule } = await client.from("adle_review_schedule_words").select("id").eq("child_id", childId).eq("row_status", "active");
    assert(completionItems?.length === 16 && completionItems.every((row) => (row as { status: string }).status === "completed"), "all 16 assignment items complete atomically");
    assert(completionAttempts?.length === 14 && completionAttempts.filter((row) => (row as { attempt_kind: string }).attempt_kind === "guided_practice").length === 6 && completionAttempts.filter((row) => (row as { attempt_kind: string }).attempt_kind === "lesson_dictation").every((row) => String((row as { attempt_text: string }).attempt_text).includes(" ")), "14 attempts retain the 6/4/4 contract and raw dictation sentences");
    assert(completionTaught?.length === 4 && completionSchedule?.length === 4, "completion creates four taught and four schedule rows without duplicates");
    const duplicate = await call(successDate, successPayload);
    assert(duplicate.error !== null, "duplicate invocation is refused");
    assert(JSON.stringify(await countRows(successDate)) === JSON.stringify({ headerCount: 1, itemCount: 16 }), "duplicate invocation writes nothing");

    const itemFailureDate = "2099-01-02";
    const itemFailure = makePayload(itemFailureDate);
    itemFailure.items[15].position = 99;
    assert((await call(itemFailureDate, itemFailure)).error !== null, "invalid final item forces rollback");
    assert(JSON.stringify(await countRows(itemFailureDate)) === JSON.stringify({ headerCount: 0, itemCount: 0 }), "item failure rolls back header and prior items");

    const intakeFailureDate = "2099-01-03";
    const intakeFailure = makePayload(intakeFailureDate);
    intakeFailure.intakes[3].canonicalWordId = "not-a-uuid";
    assert((await call(intakeFailureDate, intakeFailure)).error !== null, "invalid final intake forces rollback");
    assert(JSON.stringify(await countRows(intakeFailureDate)) === JSON.stringify({ headerCount: 0, itemCount: 0 }), "intake failure rolls back header and items");

    const concurrentDate = "2099-01-04";
    const concurrentPayload = makePayload(concurrentDate);
    const concurrent = await Promise.all([call(concurrentDate, concurrentPayload), call(concurrentDate, concurrentPayload)]);
    assert(concurrent.filter((result) => result.error === null).length === 1 && concurrent.filter((result) => result.error !== null).length === 1, "concurrent invocation has one winner");
    assert(JSON.stringify(await countRows(concurrentDate)) === JSON.stringify({ headerCount: 1, itemCount: 16 }), "concurrent invocation persists one complete plan");

    const rollbackDate = "2099-01-05";
    const rollbackPlan = makePayload(rollbackDate);
    const rollbackPlanResult = await call(rollbackDate, rollbackPlan);
    assert(!rollbackPlanResult.error && typeof rollbackPlanResult.data === "string", "rollback fixture plan exists");
    const rollbackCompletion = await completionPayload(rollbackPlanResult.data as string, rollbackDate);
    rollbackCompletion.p_lesson.itemTransitions[3].learningItemId = randomUUID();
    assert((await complete(rollbackCompletion)).error !== null, "forced late learning transition failure rejects completion");
    const { data: rollbackHeader } = await client.from("daily_assignments").select("status").eq("id", rollbackPlanResult.data as string).single();
    const { count: rollbackAttempts } = await client.from("adle_assignment_attempt_events").select("id", { count: "exact", head: true }).eq("daily_assignment_id", rollbackPlanResult.data as string);
    const { count: rollbackTaught } = await client.from("adle_taught_word_history").select("id", { count: "exact", head: true }).eq("source_ref", rollbackCompletion.p_source_ref);
    assert((rollbackHeader as { status: string }).status === "pending" && (rollbackAttempts ?? 0) === 0 && (rollbackTaught ?? 0) === 0, "late failure rolls back every completion write");

    console.log("ADLE D4_MOR atomic persistence regression passed");
  } finally {
    if (childId) await client.from("children").delete().eq("id", childId);
    if (otherUserId) await client.auth.admin.deleteUser(otherUserId);
    await client.auth.admin.deleteUser(parentUserId);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
